import { ethers, artifacts, network } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import fs from 'fs';
import path from 'path';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../constants';

async function main() {
  const steps = Number(process.env.FUZZ_STEPS || 6_000_000);
  const logPath = path.join(process.cwd(), 'fuzz-bugs.log');
  const bugs: string[] = [];

  const [owner, employer, agent] = await ethers.getSigners();

  const artifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  const token = await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );

  const mintAmount = ethers.parseUnits('1000000', AGIALPHA_DECIMALS);
  await token.mint(employer.address, mintAmount);
  await token.mint(agent.address, mintAmount);

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    0,
    100,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );
  await stake.setMinStake(1);

  const Validation = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const validation = await Validation.deploy();

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address
  );

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    owner.address
  );
  await dispute.setDisputeFee(0);
  await dispute.setDisputeWindow(0);

  const Policy = await ethers.getContractFactory(
    'contracts/v2/TaxPolicy.sol:TaxPolicy'
  );
  const policy = await Policy.deploy(
    'ipfs://policy',
    'All taxes on participants; contract and owner exempt'
  );

  await registry.setTaxPolicy(await policy.getAddress());
  await policy.acknowledge();
  await policy.connect(employer).acknowledge();
  await policy.connect(agent).acknowledge();

  await validation.setJobRegistry(await registry.getAddress());
  await registry.setDisputeModule(await dispute.getAddress());
  await registry.setFeePct(0);
  await registry.setValidatorRewardPct(0);
  await registry.setJobParameters(0, 0);
  await stake.setJobRegistry(await registry.getAddress());
  await stake.setValidationModule(await validation.getAddress());
  await stake.setDisputeModule(await dispute.getAddress());

  let nextSpec = 0;
  const jobs: bigint[] = [];

  async function randomStake() {
    const amount = ethers.parseUnits(
      (1 + Math.floor(Math.random() * 10)).toString(),
      AGIALPHA_DECIMALS
    );
    await token.connect(agent).approve(await stake.getAddress(), amount);
    await stake.connect(agent).depositStake(0, amount);
  }

  async function randomJob() {
    const reward = ethers.parseUnits(
      (1 + Math.floor(Math.random() * 100)).toString(),
      AGIALPHA_DECIMALS
    );
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec' + nextSpec++);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    jobs.push(BigInt(jobs.length + 1));
  }

  async function randomDispute() {
    if (jobs.length === 0) return;
    const jobId = jobs[Math.floor(Math.random() * jobs.length)];
    const raiser = Math.random() < 0.5 ? agent : employer;
    await registry.connect(raiser).raiseDispute(jobId, ethers.id('evidence'));
  }

  for (let i = 0; i < steps; i++) {
    const action = Math.floor(Math.random() * 3);
    try {
      if (action === 0) await randomStake();
      else if (action === 1) await randomJob();
      else await randomDispute();
    } catch (err: any) {
      bugs.push(`step ${i} action ${action}: ${err.message}`);
    }
  }

  if (bugs.length) {
    fs.appendFileSync(logPath, bugs.join('\n') + '\n');
    console.log(`bugs recorded: ${bugs.length}`);
  } else {
    console.log('no bugs found');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
