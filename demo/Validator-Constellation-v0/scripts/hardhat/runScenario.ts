import { ethers } from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';

type ScenarioConfig = {
  validatorRoot: string;
  validatorAlphaRoot: string;
  agentRoot: string;
  agentAlphaRoot: string;
  validators: Array<{
    address: string;
    ensName: string;
    ensNode: string;
    proof: string[];
    isAlpha: boolean;
  }>;
  agents: Array<{
    address: string;
    ensName: string;
    ensNode: string;
    proof: string[];
    isAlpha: boolean;
  }>;
  sentinels: Array<{ reporter: string }>;
  domain: string;
};

function loadConfig(): ScenarioConfig {
  const env = process.env.CONSTELLATION_SCENARIO;
  if (!env) {
    throw new Error('Scenario configuration not provided');
  }
  return JSON.parse(env) as ScenarioConfig;
}

async function saveReport(data: unknown): Promise<void> {
  const reportsDir = path.join(__dirname, '..', '..', 'reports');
  await fs.promises.mkdir(reportsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(reportsDir, `scenario-${timestamp}.json`);
  await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
  console.log(`Scenario report saved to ${file}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const [owner] = await ethers.getSigners();

  const Constellation = await ethers.getContractFactory('ValidatorConstellationDemo');
  const Attestor = await ethers.getContractFactory('DemoZkAttestor');
  const Sentinel = await ethers.getContractFactory('SentinelGuardian');

  const constellation = await Constellation.deploy(owner.address);
  await constellation.waitForDeployment();
  const attestor = await Attestor.deploy(owner.address, ethers.keccak256(ethers.toUtf8Bytes('constellation')));
  await attestor.waitForDeployment();
  const sentinel = await Sentinel.deploy(await constellation.getAddress(), owner.address);
  await sentinel.waitForDeployment();

  await (await constellation.setAttestor(await attestor.getAddress())).wait();
  await (await constellation.setSentinel(await sentinel.getAddress())).wait();
  await (
    await constellation.setEnsRoots(
      config.validatorRoot,
      config.validatorAlphaRoot,
      config.agentRoot,
      config.agentAlphaRoot
    )
  ).wait();

  for (const { address, ensName, ensNode, proof, isAlpha } of config.validators) {
    await (
      await constellation.registerValidator(address, ensName, ensNode, proof, isAlpha)
    ).wait();
  }

  for (const agent of config.agents) {
    const valid = await constellation.verifyAgent(agent.address, agent.ensNode, agent.proof, agent.isAlpha);
    if (!valid) {
      throw new Error(`agent proof rejected for ${agent.ensName}`);
    }
    const invalidProof = agent.proof.length
      ? agent.proof.map(() => '0x'.concat('00'.repeat(32)))
      : ['0x'.concat('00'.repeat(32))];
    const invalid = await constellation.verifyAgent(agent.address, agent.ensNode, invalidProof, agent.isAlpha);
    if (invalid) {
      throw new Error('invalid agent proof should fail');
    }
  }

  const validatorSignerMap = new Map<string, Awaited<ReturnType<typeof ethers.getSigners>>[number]>();
  for (const signer of await ethers.getSigners()) {
    validatorSignerMap.set(await signer.getAddress(), signer);
  }

  for (const validator of config.validators) {
    const signer = validatorSignerMap.get(validator.address);
    if (!signer) {
      throw new Error(`missing signer for ${validator.address}`);
    }
    await (
      await constellation.connect(signer).depositStake({ value: ethers.parseEther('5') })
    ).wait();
  }

  for (const sentinelConfig of config.sentinels) {
    await (await sentinel.setReporter(sentinelConfig.reporter, true)).wait();
  }

  const jobsRoot = ethers.keccak256(ethers.toUtf8Bytes('validator-constellation-jobs-root'));
  const jobCount = 1000;

  const roundTx = await constellation.startRound(config.domain as unknown as string, jobsRoot, jobCount);
  const roundReceipt = await roundTx.wait();
  const roundEvent = roundReceipt?.logs?.find((log) => log.fragment?.name === 'RoundStarted');
  const roundId = Number(roundEvent?.args?.roundId ?? 1n);
  const committee = await constellation.getCommittee(roundId);

  const commits: Array<{ validator: string; salt: string; choice: number }> = [];
  for (let i = 0; i < committee.length; i += 1) {
    const validator = committee[i];
    const signer = validatorSignerMap.get(validator);
    if (!signer) {
      throw new Error(`committee signer missing ${validator}`);
    }
    const choice = i === committee.length - 1 ? 2 : 1; // last member rejects to test slashing
    const saltBytes = ethers.randomBytes(32);
    const salt = ethers.hexlify(saltBytes);
    const commitment = ethers.keccak256(ethers.solidityPacked(['uint8', 'bytes32'], [choice, salt]));
    await (
      await constellation
        .connect(signer)
        .commitVote(roundId, commitment)
    ).wait();
    commits.push({ validator, salt, choice });
  }

  const roundInfo = await constellation.getRound(roundId);
  const currentBlock = await ethers.provider.getBlockNumber();
  if (BigInt(currentBlock) <= roundInfo.commitDeadline) {
    const diff = Number(roundInfo.commitDeadline - BigInt(currentBlock) + 1n);
    await ethers.provider.send('hardhat_mine', [ethers.toQuantity(diff)]);
  }

  for (const commit of commits) {
    const signer = validatorSignerMap.get(commit.validator)!;
    await (
      await constellation
        .connect(signer)
        .revealVote(roundId, commit.choice === 1 ? 1 : 2, commit.salt)
    ).wait();
  }

  const afterReveal = await ethers.provider.getBlockNumber();
  if (BigInt(afterReveal) <= roundInfo.revealDeadline) {
    const diff = Number(roundInfo.revealDeadline - BigInt(afterReveal) + 1n);
    await ethers.provider.send('hardhat_mine', [ethers.toQuantity(diff)]);
  }

  const publicSignals = ethers.AbiCoder.defaultAbiCoder().encode(['uint8', 'uint256'], [1, jobCount]);
  const proof = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256', 'bytes', 'bytes32'],
      [jobsRoot, jobCount, publicSignals, await attestor.verifierKey()]
    )
  );

  await (
    await constellation.finalizeRound(
      roundId,
      1,
      proof,
      publicSignals
    )
  ).wait();

  const slashFilter = constellation.filters.ValidatorSlashed();
  const slashEvents = await constellation.queryFilter(slashFilter, 0, 'latest');

  const reporter = validatorSignerMap.get(config.validators[0].address)!;
  await (
    await sentinel
      .connect(reporter)
      .recordAlert(
        config.domain as unknown as string,
        'budget-overrun',
        3,
        ethers.AbiCoder.defaultAbiCoder().encode(['string', 'uint256'], ['overspend', 1200])
      )
  ).wait();

  const domainStatus = await constellation.domainConfigs(config.domain as unknown as string);
  await (await constellation.resumeDomain(config.domain as unknown as string)).wait();

  await saveReport({
    roundId: roundId.toString(),
    committee,
    slashEvents: slashEvents.map((event) => ({
      validator: event.args.validator,
      penalty: event.args.penalty.toString(),
      reason: event.args.reason,
    })),
    domainPaused: domainStatus.paused,
  });

  console.log('Constellation scenario executed successfully');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
