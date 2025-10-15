#!/usr/bin/env ts-node

import { artifacts, ethers, run } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../constants';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { decodeJobMetadata } = require('../../test/utils/jobMetadata');

enum Role {
  Agent,
  Validator,
  Platform,
}

interface DemoEnvironment {
  owner: ethers.Signer;
  nationA: ethers.Signer;
  nationB: ethers.Signer;
  agentAlice: ethers.Signer;
  agentBob: ethers.Signer;
  validatorCharlie: ethers.Signer;
  validatorDora: ethers.Signer;
  validatorEvan: ethers.Signer;
  moderator: ethers.Signer;
  token: ethers.Contract;
  stake: ethers.Contract;
  validation: ethers.Contract;
  registry: ethers.Contract;
  dispute: ethers.Contract;
  reputation: ethers.Contract;
  identity: ethers.Contract;
  certificate: ethers.Contract;
  feePool: ethers.Contract;
}

const JOB_STATE_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Created',
  2: 'Applied',
  3: 'Submitted',
  4: 'Completed',
  5: 'Disputed',
  6: 'Finalized',
  7: 'Cancelled',
};

function formatTokens(value: bigint): string {
  return `${ethers.formatUnits(value, AGIALPHA_DECIMALS)} AGIα`;
}

function logSection(title: string): void {
  const line = '-'.repeat(title.length + 4);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function logStep(step: string): void {
  console.log(`\n➡️  ${step}`);
}

async function mintInitialBalances(
  token: ethers.Contract,
  recipients: ethers.Signer[],
  amount: bigint
): Promise<void> {
  for (const signer of recipients) {
    await token.mint(await signer.getAddress(), amount);
  }
}

async function configureToken(): Promise<ethers.Contract> {
  const [deployer] = await ethers.getSigners();
  let artifact;
  try {
    artifact = await artifacts.readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
  } catch (error) {
    console.log('⏳ compiling contracts for demo readiness…');
    await run('compile');
    artifact = await artifacts.readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
  }

  await ethers.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);

  const ownerSlotValue = ethers.zeroPadValue(await deployer.getAddress(), 32);
  const ownerSlot = ethers.toBeHex(5, 32);
  await ethers.provider.send('hardhat_setStorageAt', [
    AGIALPHA,
    ownerSlot,
    ownerSlotValue,
  ]);

  return await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );
}

async function deployEnvironment(): Promise<DemoEnvironment> {
  logSection('Bootstrapping AGI Jobs v2 grand demo environment');

  const [
    owner,
    nationA,
    nationB,
    agentAlice,
    agentBob,
    validatorCharlie,
    validatorDora,
    validatorEvan,
    moderator,
  ] = await ethers.getSigners();

  const token = await configureToken();
  const mintAmount = ethers.parseUnits('2000', AGIALPHA_DECIMALS);
  await mintInitialBalances(token, [
    nationA,
    nationB,
    agentAlice,
    agentBob,
    validatorCharlie,
    validatorDora,
    validatorEvan,
  ], mintAmount);

  logStep('Deploying core contracts');
  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await owner.getAddress()
  );

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());

  const Identity = await ethers.getContractFactory(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
  );
  const identity = await Identity.deploy();

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    0,
    0,
    []
  );

  const Certificate = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const certificate = await Certificate.deploy('AGI Jobs Credential', 'AGICERT');

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await certificate.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    await owner.getAddress()
  );

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    ethers.ZeroAddress,
    await owner.getAddress()
  );

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );

  logStep('Wiring governance relationships and module cross-links');
  await certificate
    .connect(owner)
    .setJobRegistry(await registry.getAddress());
  await certificate
    .connect(owner)
    .setStakeManager(await stake.getAddress());

  await stake.connect(owner).setFeePool(await feePool.getAddress());
  await stake
    .connect(owner)
    .setModules(await registry.getAddress(), await dispute.getAddress());
  await stake
    .connect(owner)
    .setValidationModule(await validation.getAddress());

  await validation
    .connect(owner)
    .setJobRegistry(await registry.getAddress());
  await validation
    .connect(owner)
    .setIdentityRegistry(await identity.getAddress());
  await validation
    .connect(owner)
    .setReputationEngine(await reputation.getAddress());

  await registry
    .connect(owner)
    .setModules(
      await validation.getAddress(),
      await stake.getAddress(),
      await reputation.getAddress(),
      await dispute.getAddress(),
      await certificate.getAddress(),
      await feePool.getAddress(),
      []
    );
  await registry
    .connect(owner)
    .setIdentityRegistry(await identity.getAddress());
  await registry
    .connect(owner)
    .setValidatorRewardPct(20);

  await reputation.connect(owner).setCaller(await registry.getAddress(), true);

  await dispute.connect(owner).setStakeManager(await stake.getAddress());

  logStep('Configuring policy parameters for rapid local simulation');
  await validation.connect(owner).setCommitRevealWindows(60, 60);
  await validation.connect(owner).setValidatorsPerJob(3);
  await validation
    .connect(owner)
    .setValidatorPool([
      await validatorCharlie.getAddress(),
      await validatorDora.getAddress(),
      await validatorEvan.getAddress(),
    ]);
  await validation.connect(owner).setRevealQuorum(0, 2);
  await validation.connect(owner).setNonRevealPenalty(100, 1);

  await feePool.connect(owner).setBurnPct(5);
  await certificate
    .connect(owner)
    .setBaseURI('ipfs://agi-jobs/demo/certificates/');

  logStep('Seeding IdentityRegistry with emergency allowlists');
  for (const signer of [agentAlice, agentBob]) {
    await identity.connect(owner).addAdditionalAgent(await signer.getAddress());
    await identity
      .connect(owner)
      .setAgentType(await signer.getAddress(), 1); // mark as AI agents
  }
  for (const signer of [validatorCharlie, validatorDora, validatorEvan]) {
    await identity
      .connect(owner)
      .addAdditionalValidator(await signer.getAddress());
  }

  logStep('Initial token approvals and staking for actors');
  const stakeAmount = ethers.parseUnits('10', AGIALPHA_DECIMALS);
  for (const [signer, role] of [
    [agentAlice, Role.Agent],
    [agentBob, Role.Agent],
    [validatorCharlie, Role.Validator],
    [validatorDora, Role.Validator],
    [validatorEvan, Role.Validator],
  ] as Array<[ethers.Signer, Role]>) {
    await token
      .connect(signer)
      .approve(await stake.getAddress(), stakeAmount);
    await stake.connect(signer).depositStake(role, stakeAmount);
  }

  return {
    owner,
    nationA,
    nationB,
    agentAlice,
    agentBob,
    validatorCharlie,
    validatorDora,
    validatorEvan,
    moderator,
    token,
    stake,
    validation,
    registry,
    dispute,
    reputation,
    identity,
    certificate,
    feePool,
  };
}

async function logJobSummary(
  registry: ethers.Contract,
  jobId: bigint,
  context: string
): Promise<void> {
  const job = await registry.jobs(jobId);
  const metadata = decodeJobMetadata(job.packedMetadata);
  console.log(
    `\n📦 Job ${jobId} summary (${context}):\n  State: ${JOB_STATE_LABELS[metadata.state] ?? metadata.state}\n  Success flag: ${metadata.success}\n  Burn confirmed: ${metadata.burnConfirmed}\n  Reward: ${formatTokens(job.reward)}\n  Employer: ${job.employer}\n  Agent: ${job.agent}`
  );
}

async function showBalances(
  label: string,
  token: ethers.Contract,
  participants: Array<{ name: string; address: string }>
): Promise<void> {
  console.log(`\n💰 ${label}`);
  for (const participant of participants) {
    const balance = await token.balanceOf(participant.address);
    console.log(`  ${participant.name}: ${formatTokens(balance)}`);
  }
}

async function runHappyPath(env: DemoEnvironment): Promise<void> {
  logSection('Scenario 1 – Cooperative intergovernmental AI labour success');

  const {
    nationA,
    agentAlice,
    validatorCharlie,
    validatorDora,
    validatorEvan,
    token,
    registry,
    validation,
    stake,
  } = env;

  const reward = ethers.parseUnits('250', AGIALPHA_DECIMALS);
  const feePct = await registry.feePct();
  const fee = (reward * BigInt(feePct)) / 100n;
  const employerAddr = await nationA.getAddress();

  logStep('Nation A approves escrow and posts a climate-coordination job');
  await token
    .connect(nationA)
    .approve(await stake.getAddress(), reward + fee);
  const specHash = ethers.id('ipfs://specs/climate-task');
  const deadline = BigInt((await time.latest()) + 3600);
  await registry
    .connect(nationA)
    .createJob(reward, deadline, specHash, 'ipfs://jobs/climate');
  const jobId = await registry.nextJobId();
  await logJobSummary(registry, jobId, 'after posting');

  logStep('Alice stakes identity and applies through the emergency allowlist');
  await registry.connect(agentAlice).applyForJob(jobId, 'alice', []);
  await logJobSummary(registry, jobId, 'after agent assignment');

  logStep('Alice submits validated deliverables with provable IPFS evidence');
  const resultUri = 'ipfs://results/climate-success';
  const resultHash = ethers.id(resultUri);
  await registry
    .connect(agentAlice)
    .submit(jobId, resultHash, resultUri, 'alice', []);
  await logJobSummary(registry, jobId, 'after submission');

  logStep(
    'Nation A records burn proof and primes the validation committee selection'
  );
  const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn:climate:success'));
  await registry
    .connect(nationA)
    .submitBurnReceipt(jobId, burnTxHash, 0, 0);
  await registry
    .connect(nationA)
    .confirmEmployerBurn(jobId, burnTxHash);

  await validation.connect(nationA).selectValidators(jobId, 0);
  let round = await validation.rounds(jobId);
  if (!round.validators || round.validators.length === 0) {
    await time.increase(1);
    await validation.connect(nationA).selectValidators(jobId, 0);
    round = await validation.rounds(jobId);
  }

  const nonce = await validation.jobNonce(jobId);
  const validators = [validatorCharlie, validatorDora, validatorEvan];
  const approvals = [true, true, true];
  const salts = validators.map(() => ethers.randomBytes(32));

  logStep('Validators commit to their assessments under commit–reveal secrecy');
  for (let i = 0; i < validators.length; i++) {
    const commit = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [jobId, nonce, approvals[i], burnTxHash, salts[i], specHash]
      )
    );
    await validation
      .connect(validators[i])
      .commitValidation(jobId, commit, 'validator', []);
  }

  const now = BigInt(await time.latest());
  const waitCommit = round.commitDeadline - now + 1n;
  if (waitCommit > 0n) {
    await time.increase(Number(waitCommit));
  }

  logStep('Validators reveal unanimous approval, meeting the quorum instantly');
  for (let i = 0; i < validators.length; i++) {
    await validation
      .connect(validators[i])
      .revealValidation(jobId, approvals[i], burnTxHash, salts[i], 'validator', []);
  }

  const nowAfterReveal = BigInt(await time.latest());
  const waitForFinalize = round.revealDeadline - nowAfterReveal + 1n;
  if (waitForFinalize > 0n) {
    await time.increase(Number(waitForFinalize));
  }

  await validation.finalize(jobId);
  await logJobSummary(registry, jobId, 'after validator finalize');

  logStep('Nation A finalizes payment, rewarding Alice and the validator cohort');
  await registry.connect(nationA).finalize(jobId);
  await logJobSummary(registry, jobId, 'after treasury settlement');

  const participants = [
    { name: 'Nation A', address: employerAddr },
    { name: 'Alice (agent)', address: await agentAlice.getAddress() },
    { name: 'Charlie (validator)', address: await validatorCharlie.getAddress() },
    { name: 'Dora (validator)', address: await validatorDora.getAddress() },
    { name: 'Evan (validator)', address: await validatorEvan.getAddress() },
  ];
  await showBalances('Post-job token balances', token, participants);

  const nftBalance = await env.certificate.balanceOf(
    await agentAlice.getAddress()
  );
  console.log(`\n🏅 Alice now holds ${nftBalance} certificate NFT(s).`);
}

async function runDisputeScenario(env: DemoEnvironment): Promise<void> {
  logSection('Scenario 2 – Cross-border dispute resolved by owner governance');

  const {
    nationB,
    agentBob,
    validatorCharlie,
    validatorDora,
    validatorEvan,
    validation,
    registry,
    dispute,
    token,
    stake,
    owner,
    moderator,
  } = env;

  const reward = ethers.parseUnits('180', AGIALPHA_DECIMALS);
  const feePct = await registry.feePct();
  const fee = (reward * BigInt(feePct)) / 100n;

  logStep('Nation B funds a frontier language translation initiative');
  await token
    .connect(nationB)
    .approve(await stake.getAddress(), reward + fee);
  const specHash = ethers.id('ipfs://specs/translation-task');
  const deadline = BigInt((await time.latest()) + 3600);
  await registry
    .connect(nationB)
    .createJob(reward, deadline, specHash, 'ipfs://jobs/translation');
  const jobId = await registry.nextJobId();
  await logJobSummary(registry, jobId, 'after posting');

  logStep('Bob applies, contributes work, and submits contested deliverables');
  await registry.connect(agentBob).applyForJob(jobId, 'bob', []);
  await registry
    .connect(agentBob)
    .submit(jobId, ethers.id('ipfs://results/draft'), 'ipfs://results/draft', 'bob', []);

  const burnTxHash = ethers.keccak256(
    ethers.toUtf8Bytes('burn:translation:checkpoint')
  );
  await registry
    .connect(nationB)
    .submitBurnReceipt(jobId, burnTxHash, 0, 0);
  await registry
    .connect(nationB)
    .confirmEmployerBurn(jobId, burnTxHash);

  await validation.connect(nationB).selectValidators(jobId, 0);
  let round = await validation.rounds(jobId);
  if (!round.validators || round.validators.length === 0) {
    await time.increase(1);
    await validation.connect(nationB).selectValidators(jobId, 0);
    round = await validation.rounds(jobId);
  }
  const nonce = await validation.jobNonce(jobId);

  logStep(
    'Validators disagree; one plans to approve, another to reject, one will abstain'
  );
  const validatorSet = [validatorCharlie, validatorDora, validatorEvan];
  const approvals = [true, false, false];
  const salts = validatorSet.map(() => ethers.randomBytes(32));
  for (let i = 0; i < validatorSet.length; i++) {
    const commit = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [jobId, nonce, approvals[i], burnTxHash, salts[i], specHash]
      )
    );
    await validation
      .connect(validatorSet[i])
      .commitValidation(jobId, commit, 'validator', []);
  }

  const now = BigInt(await time.latest());
  const waitCommit = round.commitDeadline - now + 1n;
  if (waitCommit > 0n) {
    await time.increase(Number(waitCommit));
  }

  logStep('Partial reveals occur – one validator abstains, triggering penalties');
  await validation
    .connect(validatorCharlie)
    .revealValidation(jobId, true, burnTxHash, salts[0], 'validator', []);
  await validation
    .connect(validatorDora)
    .revealValidation(jobId, false, burnTxHash, salts[1], 'validator', []);
  // validatorEvan intentionally withholds reveal

  const nowAfterReveal = BigInt(await time.latest());
  const waitFinalize = round.revealDeadline - nowAfterReveal + 1n;
  if (waitFinalize > 0n) {
    await time.increase(Number(waitFinalize));
  }

  await validation.finalize(jobId);
  await logJobSummary(registry, jobId, 'after partial quorum');

  logStep(
    'Bob leverages dispute rights; governance moderates and sides with the agent'
  );
  await dispute.connect(owner).setDisputeFee(0);
  await registry
    .connect(agentBob)
    ['raiseDispute(uint256,bytes32)'](jobId, ethers.id('ipfs://evidence/bob'));
  await dispute.connect(owner).setDisputeWindow(0);
  await dispute.connect(owner).setModerator(await owner.getAddress(), 1);
  await dispute
    .connect(owner)
    .setModerator(await moderator.getAddress(), 1);

  const typeHash = ethers.id(
    'ResolveDispute(uint256 jobId,bool employerWins,address module,uint256 chainId)'
  );
  const network = await ethers.provider.getNetwork();
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256', 'bool', 'address', 'uint256'],
      [typeHash, jobId, false, await dispute.getAddress(), network.chainId]
    )
  );
  const sigOwner = await owner.signMessage(ethers.getBytes(structHash));
  const sigModerator = await moderator.signMessage(ethers.getBytes(structHash));
  await dispute
    .connect(moderator)
    .resolveWithSignatures(jobId, false, [sigOwner, sigModerator]);

  logStep('Nation B finalizes, distributing escrow and validator rewards post-dispute');
  await registry.connect(nationB).finalize(jobId);
  await logJobSummary(registry, jobId, 'after dispute resolution');

  const participants = [
    { name: 'Nation B', address: await nationB.getAddress() },
    { name: 'Bob (agent)', address: await agentBob.getAddress() },
    { name: 'Charlie (validator)', address: await validatorCharlie.getAddress() },
    { name: 'Dora (validator)', address: await validatorDora.getAddress() },
    { name: 'Evan (validator)', address: await validatorEvan.getAddress() },
  ];
  await showBalances('Post-dispute token balances', token, participants);
}

async function main(): Promise<void> {
  const env = await deployEnvironment();
  await showBalances('Initial treasury state', env.token, [
    { name: 'Nation A', address: await env.nationA.getAddress() },
    { name: 'Nation B', address: await env.nationB.getAddress() },
    { name: 'Alice (agent)', address: await env.agentAlice.getAddress() },
    { name: 'Bob (agent)', address: await env.agentBob.getAddress() },
    { name: 'Charlie (validator)', address: await env.validatorCharlie.getAddress() },
    { name: 'Dora (validator)', address: await env.validatorDora.getAddress() },
    { name: 'Evan (validator)', address: await env.validatorEvan.getAddress() },
  ]);

  await runHappyPath(env);
  await runDisputeScenario(env);

  logSection('Demo complete – AGI Jobs v2 sovereignty market simulation finished');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
