#!/usr/bin/env ts-node

import type { InterfaceAbi } from 'ethers';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../constants';
import agialphaToken from './lib/agialphaToken.json';
import stakeManagerArtifact from './lib/prebuilt/StakeManager.json';
import reputationEngineArtifact from './lib/prebuilt/ReputationEngine.json';
import identityRegistryArtifact from './lib/prebuilt/IdentityRegistry.json';
import validationModuleArtifact from './lib/prebuilt/ValidationModule.json';
import certificateNftArtifact from './lib/prebuilt/CertificateNFT.json';
import jobRegistryArtifact from './lib/prebuilt/JobRegistry.json';
import disputeModuleArtifact from './lib/prebuilt/DisputeModule.json';
import feePoolArtifact from './lib/prebuilt/FeePool.json';

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
  initialSupply: bigint;
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

function formatSeconds(seconds: bigint): string {
  return `${seconds.toString()}s`;
}

function createFactory(
  artifact: { abi: InterfaceAbi; bytecode: string },
  signer: ethers.Signer
): ethers.ContractFactory {
  return new ethers.ContractFactory(
    artifact.abi as InterfaceAbi,
    artifact.bytecode,
    signer
  );
}

async function manualDeployContract(
  label: string,
  factory: ethers.ContractFactory,
  signer: ethers.Signer,
  args: readonly unknown[]
): Promise<ethers.Contract> {
  const encodedArgs = factory.interface.encodeDeploy(args);
  const bytecode = factory.bytecode as string;
  if (!bytecode || bytecode === '0x') {
    throw new Error(`Missing bytecode for ${label}`);
  }
  const tx = await signer.sendTransaction({
    data: `${bytecode}${encodedArgs.slice(2)}`,
  });
  const receipt = await tx.wait();
  console.log(`   ${label} deployed at ${receipt.contractAddress}`);
  return factory.attach(receipt.contractAddress);
}

async function ensureValidatorsSelected(
  validation: ethers.Contract,
  caller: ethers.Signer,
  jobId: bigint
) {
  const attempt = async () => {
    try {
      await validation.connect(caller).selectValidators(jobId, 0);
    } catch (error) {
      const message = `${error}`;
      const rawData =
        (error as { data?: string })?.data ??
        (error as { error?: { data?: string } })?.error?.data ??
        (error as { error?: { error?: { data?: string } } })?.error?.error?.data ??
        '';
      const alreadySelectedSignature = '0x7c5a2649';
      const alreadyHandled =
        message.includes('ValidatorsAlreadySelected') ||
        (typeof rawData === 'string' && rawData.startsWith(alreadySelectedSignature));
      if (!alreadyHandled) {
        throw error;
      }
    }
    return await validation.rounds(jobId);
  };

  let round = await attempt();
  if (!round.validators || round.validators.length === 0) {
    await time.increase(1);
    round = await attempt();
  }
  return round;
}

interface MintedCertificate {
  jobId: bigint;
  owner: string;
  uri?: string;
}

function addressesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

async function gatherCertificates(
  certificate: ethers.Contract,
  highestJobId: bigint
): Promise<MintedCertificate[]> {
  const minted: MintedCertificate[] = [];
  for (let jobId = 1n; jobId <= highestJobId; jobId++) {
    try {
      const owner = await certificate.ownerOf(jobId);
      let uri: string | undefined;
      try {
        uri = await certificate.tokenURI(jobId);
      } catch (error) {
        console.warn(`⚠️  tokenURI unavailable for job ${jobId}:`, error);
      }
      minted.push({ jobId, owner, uri });
    } catch (error) {
      // Job either not created yet or no certificate minted. Ignore silently.
    }
  }
  return minted;
}

async function logAgentPortfolios(
  env: DemoEnvironment,
  minted: MintedCertificate[]
): Promise<void> {
  console.log('\n🤖 Agent portfolios');
  const agents: Array<{ name: string; signer: ethers.Signer }> = [
    { name: 'Alice (agent)', signer: env.agentAlice },
    { name: 'Bob (agent)', signer: env.agentBob },
  ];

  for (const agent of agents) {
    const address = await agent.signer.getAddress();
    const liquid = await env.token.balanceOf(address);
    const staked = await env.stake.stakes(address, Role.Agent);
    const locked = await env.stake.lockedStakes(address);
    const reputation = await env.reputation.reputationOf(address);
    const ownedCertificates = minted.filter((entry) =>
      addressesEqual(entry.owner, address)
    );

    console.log(`  ${agent.name} (${address})`);
    console.log(`    Liquid balance: ${formatTokens(liquid)}`);
    console.log(`    Active agent stake: ${formatTokens(staked)}`);
    console.log(`    Locked stake: ${formatTokens(locked)}`);
    console.log(`    Reputation score: ${reputation.toString()}`);

    if (ownedCertificates.length === 0) {
      console.log('    Certificates: none yet — future completions will mint AGI credentials.');
    } else {
      const descriptors = ownedCertificates.map((entry) => {
        const uriSuffix = entry.uri ? ` ← ${entry.uri}` : '';
        return `#${entry.jobId.toString()}${uriSuffix}`;
      });
      console.log(`    Certificates: ${descriptors.join(', ')}`);
    }
  }
}

async function logValidatorCouncil(env: DemoEnvironment): Promise<void> {
  console.log('\n🛡️ Validator council status');
  const validators: Array<{ name: string; signer: ethers.Signer }> = [
    { name: 'Charlie (validator)', signer: env.validatorCharlie },
    { name: 'Dora (validator)', signer: env.validatorDora },
    { name: 'Evan (validator)', signer: env.validatorEvan },
  ];

  for (const validator of validators) {
    const address = await validator.signer.getAddress();
    const liquid = await env.token.balanceOf(address);
    const staked = await env.stake.stakes(address, Role.Validator);
    const locked = await env.stake.lockedStakes(address);
    const reputation = await env.reputation.reputationOf(address);

    console.log(`  ${validator.name} (${address})`);
    console.log(`    Liquid balance: ${formatTokens(liquid)}`);
    console.log(`    Validator stake: ${formatTokens(staked)}`);
    console.log(`    Locked stake: ${formatTokens(locked)}`);
    console.log(`    Reputation score: ${reputation.toString()}`);
  }
}

async function summarizeMarketState(env: DemoEnvironment): Promise<void> {
  logSection('Sovereign labour market telemetry dashboard');

  const highestJobId = await env.registry.nextJobId();
  const minted = await gatherCertificates(env.certificate, highestJobId);
  const totalJobs = highestJobId;
  console.log(`\n📈 Jobs orchestrated in this session: ${totalJobs.toString()}`);

  const finalSupply = await env.token.totalSupply();
  const burned = env.initialSupply > finalSupply ? env.initialSupply - finalSupply : 0n;
  console.log(`\n🔥 Total AGIα burned: ${formatTokens(burned)}`);
  console.log(`   Circulating supply now: ${formatTokens(finalSupply)}`);

  const feePct = await env.registry.feePct();
  const validatorRewardPct = await env.registry.validatorRewardPct();
  const pendingFees = await env.feePool.pendingFees();
  console.log(`\n🏛️ Protocol fee setting: ${feePct}%`);
  console.log(`   Validator reward split: ${validatorRewardPct}%`);
  console.log(`   FeePool pending distribution: ${formatTokens(pendingFees)}`);

  const totalAgentStake = await env.stake.totalStakes(Role.Agent);
  const totalValidatorStake = await env.stake.totalStakes(Role.Validator);
  console.log(`\n🔐 Aggregate capital committed:`);
  console.log(`   Agents: ${formatTokens(totalAgentStake)}`);
  console.log(`   Validators: ${formatTokens(totalValidatorStake)}`);

  await logAgentPortfolios(env, minted);
  await logValidatorCouncil(env);

  if (minted.length === 0) {
    console.log('\n🎓 Certificates minted: none yet');
  } else {
    console.log('\n🎓 Certificates minted:');
    for (const entry of minted) {
      const uriSuffix = entry.uri ? ` ← ${entry.uri}` : '';
      console.log(`  Job #${entry.jobId.toString()} → ${entry.owner}${uriSuffix}`);
    }
  }
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

  await ethers.provider.send('hardhat_setCode', [
    AGIALPHA,
    agialphaToken.runtime,
  ]);

  const ownerSlotValue = ethers.zeroPadValue(await deployer.getAddress(), 32);
  const ownerSlot = ethers.toBeHex(5, 32);
  await ethers.provider.send('hardhat_setStorageAt', [
    AGIALPHA,
    ownerSlot,
    ownerSlotValue,
  ]);

  return await ethers.getContractAt(
    agialphaToken.abi as InterfaceAbi,
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
  const initialSupply = await token.totalSupply();

  logStep('Deploying core contracts');
  const Stake = createFactory(stakeManagerArtifact, owner);
  console.log(
    `   StakeManager constructor verified (${Stake.interface.deploy.inputs.length} parameters)`
  );
  const stakeArgs = [
    0n,
    0n,
    0n,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await owner.getAddress(),
  ] as const;
  const stake = await manualDeployContract(
    'StakeManager',
    Stake,
    owner,
    [...stakeArgs]
  );
  await token.connect(owner).mint(await stake.getAddress(), 0n);

  const Reputation = createFactory(reputationEngineArtifact, owner);
  const reputation = await manualDeployContract(
    'ReputationEngine',
    Reputation,
    owner,
    [await stake.getAddress()]
  );

  const Identity = createFactory(identityRegistryArtifact, owner);
  const identity = await manualDeployContract(
    'IdentityRegistry',
    Identity,
    owner,
    [
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await reputation.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]
  );

  const Validation = createFactory(validationModuleArtifact, owner);
  const validation = await manualDeployContract(
    'ValidationModule',
    Validation,
    owner,
    [
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0n,
      0n,
      0n,
      0n,
      [],
    ]
  );

  const Certificate = createFactory(certificateNftArtifact, owner);
  const certificate = await manualDeployContract(
    'CertificateNFT',
    Certificate,
    owner,
    ['AGI Jobs Credential', 'AGICERT']
  );

  const Registry = createFactory(jobRegistryArtifact, owner);
  const registry = await manualDeployContract(
    'JobRegistry',
    Registry,
    owner,
    [
      await validation.getAddress(),
      await stake.getAddress(),
      await reputation.getAddress(),
      ethers.ZeroAddress,
      await certificate.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0n,
      0n,
      [],
      await owner.getAddress(),
    ]
  );

  const Dispute = createFactory(disputeModuleArtifact, owner);
  const dispute = await manualDeployContract(
    'DisputeModule',
    Dispute,
    owner,
    [await registry.getAddress(), 0n, 0n, ethers.ZeroAddress, await owner.getAddress()]
  );

  const FeePool = createFactory(feePoolArtifact, owner);
  const feePool = await manualDeployContract(
    'FeePool',
    FeePool,
    owner,
    [await stake.getAddress(), 0n, ethers.ZeroAddress, ethers.ZeroAddress]
  );
  await token.connect(owner).mint(await feePool.getAddress(), 0n);

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
  await stake.connect(owner).setBurnPct(0);
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
  await validation
    .connect(owner)
    .setStakeManager(await stake.getAddress());

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
  await reputation.connect(owner).setCaller(await validation.getAddress(), true);

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
    initialSupply,
  };
}

async function ownerCommandCenterDrill(env: DemoEnvironment): Promise<void> {
  logSection('Owner mission control – unstoppable command authority demonstration');

  const { owner, moderator, registry, stake, validation, feePool } = env;

  logStep('Owner calibrates market economics and validator incentives');
  const previousFeePct = await registry.feePct();
  const previousValidatorReward = await registry.validatorRewardPct();
  const previousBurnPct = await feePool.burnPct();

  await registry.connect(owner).setFeePct(6);
  await registry.connect(owner).setValidatorRewardPct(25);
  await feePool.connect(owner).setBurnPct(6);

  console.log(
    `   Fee percentage adjusted: ${previousFeePct}% → ${(
      await registry.feePct()
    ).toString()}%`
  );
  console.log(
    `   Validator reward share: ${previousValidatorReward}% → ${(
      await registry.validatorRewardPct()
    ).toString()}%`
  );
  console.log(
    `   Fee burn rate: ${previousBurnPct}% → ${(
      await feePool.burnPct()
    ).toString()}%`
  );

  logStep('Owner updates validation committee cadence and accountability levers');
  const originalCommitWindow = await validation.commitWindow();
  const originalRevealWindow = await validation.revealWindow();
  const upgradedCommitWindow = originalCommitWindow + 30n;
  const upgradedRevealWindow = originalRevealWindow + 30n;
  await validation
    .connect(owner)
    .setCommitRevealWindows(upgradedCommitWindow, upgradedRevealWindow);
  await validation.connect(owner).setRevealQuorum(50, 2);
  await validation.connect(owner).setNonRevealPenalty(150, 12);

  console.log(
    `   Commit window extended: ${formatSeconds(originalCommitWindow)} → ${formatSeconds(
      await validation.commitWindow()
    )}`
  );
  console.log(
    `   Reveal window extended: ${formatSeconds(originalRevealWindow)} → ${formatSeconds(
      await validation.revealWindow()
    )}`
  );
  console.log(
    `   Reveal quorum now ${(
      await validation.revealQuorumPct()
    ).toString()}% with minimum ${(
      await validation.minRevealValidators()
    ).toString()} validators`
  );
  console.log(
    `   Non-reveal penalty now ${(
      await validation.nonRevealPenaltyBps()
    ).toString()} bps with ${(
      await validation.nonRevealBanBlocks()
    ).toString()} block ban`
  );

  logStep('Owner delegates emergency pauser powers and performs a live drill');
  const moderatorAddress = await moderator.getAddress();
  await registry.connect(owner).setPauser(moderatorAddress);
  await stake.connect(owner).setPauser(moderatorAddress);
  await validation.connect(owner).setPauser(moderatorAddress);

  await registry.connect(owner).pause();
  await stake.connect(owner).pause();
  await validation.connect(owner).pause();
  console.log(
    `   Owner pause drill → registry:${await registry.paused()} stake:${await stake.paused()} validation:${await validation.paused()}`
  );

  await registry.connect(owner).unpause();
  await stake.connect(owner).unpause();
  await validation.connect(owner).unpause();

  await registry.connect(moderator).pause();
  await stake.connect(moderator).pause();
  await validation.connect(moderator).pause();
  console.log(
    `   Moderator pause drill → registry:${await registry.paused()} stake:${await stake.paused()} validation:${await validation.paused()}`
  );

  await registry.connect(moderator).unpause();
  await stake.connect(moderator).unpause();
  await validation.connect(moderator).unpause();

  console.log('   Emergency controls verified and reset to active state.');

  await validation.connect(owner).setCommitRevealWindows(60, 60);
  console.log(
    `   Commit/reveal cadence restored for the upcoming scenarios: ${formatSeconds(
      await validation.commitWindow()
    )} / ${formatSeconds(await validation.revealWindow())}`
  );
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

  console.log(
    `   StakeManager burn requirement: ${(await stake.burnPct()).toString()}%`
  );
  let round = await ensureValidatorsSelected(validation, nationA, jobId);

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

  let round = await ensureValidatorsSelected(validation, nationB, jobId);
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

  await ownerCommandCenterDrill(env);

  await runHappyPath(env);
  await runDisputeScenario(env);
  await summarizeMarketState(env);

  logSection('Demo complete – AGI Jobs v2 sovereignty market simulation finished');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
