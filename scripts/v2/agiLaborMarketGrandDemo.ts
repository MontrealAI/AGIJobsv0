#!/usr/bin/env ts-node

import { artifacts, ethers, run } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../constants';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { decodeJobMetadata } = require('../../test/utils/jobMetadata');

type SectionKind = 'setup' | 'scenario' | 'telemetry' | 'wrapup';

interface TokenAmount {
  raw: string;
  formatted: string;
}

interface BalanceEntry {
  name: string;
  address: string;
  balance: TokenAmount;
  role?: string;
}

interface BalanceSnapshot {
  id: string;
  label: string;
  entries: BalanceEntry[];
  notes?: string;
}

interface StepEvent {
  label: string;
  details?: string;
  metrics?: Record<string, string>;
}

interface StepRecord {
  title: string;
  events: StepEvent[];
}

interface SectionRecord {
  id: string;
  title: string;
  kind: SectionKind;
  summary?: string;
  outcome?: string;
  steps: StepRecord[];
  snapshots: BalanceSnapshot[];
}

interface ActorProfile {
  id: string;
  name: string;
  role: string;
  address: string;
}

interface ActorState extends ActorProfile {
  liquid?: TokenAmount;
  staked?: TokenAmount;
  locked?: TokenAmount;
  reputation?: string;
  certificates?: string[];
}

interface MintedCertificateRecord {
  jobId: string;
  owner: string;
  uri?: string;
}

interface DemoTelemetry {
  totalJobs: number;
  totalBurned: TokenAmount;
  feePct: string;
  validatorRewardPct: string;
  feePoolPending: TokenAmount;
  totalAgentStake: TokenAmount;
  totalValidatorStake: TokenAmount;
  agentPortfolios: ActorState[];
  validatorPortfolios: ActorState[];
  certificates: MintedCertificateRecord[];
}

interface DemoReportData {
  metadata: {
    generatedAt: string;
    network: {
      chainId: number;
      name: string;
    };
  };
  token: {
    symbol: string;
    decimals: number;
    initialSupply: TokenAmount;
  };
  owner: {
    address: string;
  };
  actors: ActorProfile[];
  sections: SectionRecord[];
  telemetry: DemoTelemetry | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 120);
}

function toTokenAmount(value: bigint): TokenAmount {
  return {
    raw: value.toString(),
    formatted: formatTokens(value),
  };
}

class GrandDemoReport {
  private data: DemoReportData;
  private currentSection: SectionRecord | null = null;
  private currentStep: StepRecord | null = null;

  constructor() {
    this.data = {
      metadata: {
        generatedAt: new Date().toISOString(),
        network: { chainId: 0, name: 'unknown' },
      },
      token: {
        symbol: 'AGIα',
        decimals: AGIALPHA_DECIMALS,
        initialSupply: toTokenAmount(0n),
      },
      owner: { address: ethers.ZeroAddress },
      actors: [],
      sections: [],
      telemetry: null,
    };
  }

  public setNetwork(chainId: number, name: string): void {
    this.data.metadata.network = { chainId, name };
  }

  public setTokenSupply(initialSupply: bigint): void {
    this.data.token.initialSupply = toTokenAmount(initialSupply);
  }

  public setOwner(address: string): void {
    this.data.owner.address = address;
  }

  public setActors(actors: ActorProfile[]): void {
    this.data.actors = actors;
  }

  private findActorId(address: string): string {
    const match = this.data.actors.find(
      (actor) => actor.address.toLowerCase() === address.toLowerCase()
    );
    return match?.id ?? slugify(address);
  }

  public resolveActorId(address: string): string {
    return this.findActorId(address);
  }

  private detectKind(title: string): SectionKind {
    const lower = title.toLowerCase();
    if (lower.startsWith('scenario')) return 'scenario';
    if (lower.includes('telemetry')) return 'telemetry';
    if (lower.includes('demo complete')) return 'wrapup';
    return 'setup';
  }

  public beginSection(title: string): void {
    const section: SectionRecord = {
      id: slugify(title) || `section-${this.data.sections.length + 1}`,
      title,
      kind: this.detectKind(title),
      steps: [],
      snapshots: [],
    };
    this.data.sections.push(section);
    this.currentSection = section;
    this.currentStep = null;
  }

  public recordStep(title: string): void {
    if (!this.currentSection) {
      this.beginSection('Grand demo timeline');
    }
    const step: StepRecord = { title, events: [] };
    this.currentSection.steps.push(step);
    this.currentStep = step;
  }

  public addEvent(label: string, details?: string, metrics?: Record<string, string>): void {
    if (!this.currentStep) {
      this.recordStep(label);
    }
    this.currentStep!.events.push({ label, details, metrics });
  }

  public attachSnapshot(snapshot: BalanceSnapshot): void {
    if (!this.currentSection) {
      this.beginSection(snapshot.label);
    }
    this.currentSection.snapshots.push(snapshot);
  }

  public setSectionOutcome(outcome: string): void {
    if (this.currentSection) {
      this.currentSection.outcome = outcome;
    }
  }

  public setTelemetry(telemetry: DemoTelemetry): void {
    this.data.telemetry = telemetry;
  }

  public toJSON(): DemoReportData {
    return this.data;
  }

  public async maybeWriteFromArgs(argv: string[]): Promise<void> {
    const reportPath = this.parseReportPath(argv);
    if (!reportPath) {
      return;
    }
    const dir = path.dirname(reportPath);
    await mkdir(dir, { recursive: true });
    await writeFile(reportPath, JSON.stringify(this.data, null, 2));
    console.log(`\n📝 Grand demo report written to ${reportPath}`);
  }

  private parseReportPath(argv: string[]): string | null {
    for (const arg of argv) {
      if (arg.startsWith('--report=')) {
        const value = arg.slice('--report='.length).trim();
        return value ? path.resolve(value) : null;
      }
    }
    const flagIndex = argv.indexOf('--report');
    if (flagIndex >= 0) {
      const candidate = argv[flagIndex + 1];
      if (!candidate) {
        throw new Error('Missing value for --report argument');
      }
      return path.resolve(candidate);
    }
    const envPath =
      process.env.AGI_JOBS_DEMO_REPORT || process.env.AGIJOBS_DEMO_REPORT;
    return envPath ? path.resolve(envPath) : null;
  }
}

let activeReport: GrandDemoReport | null = null;

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
  activeReport?.beginSection(title);
}

function logStep(step: string): void {
  console.log(`\n➡️  ${step}`);
  activeReport?.recordStep(step);
}

function recordEvent(
  label: string,
  details?: string,
  metrics?: Record<string, string>
): void {
  activeReport?.addEvent(label, details, metrics);
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
      if (!`${error}`.includes('ValidatorsAlreadySelected')) {
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

interface PortfolioRecord {
  name: string;
  address: string;
  liquid: TokenAmount;
  staked: TokenAmount;
  locked: TokenAmount;
  reputation: string;
  certificates?: string[];
}

async function logAgentPortfolios(
  env: DemoEnvironment,
  minted: MintedCertificate[]
): Promise<PortfolioRecord[]> {
  console.log('\n🤖 Agent portfolios');
  const agents: Array<{ name: string; signer: ethers.Signer }> = [
    { name: 'Alice (agent)', signer: env.agentAlice },
    { name: 'Bob (agent)', signer: env.agentBob },
  ];

  const result: PortfolioRecord[] = [];
  for (const agent of agents) {
    const address = await agent.signer.getAddress();
    const liquidRaw = await env.token.balanceOf(address);
    const stakedRaw = await env.stake.stakes(address, Role.Agent);
    const lockedRaw = await env.stake.lockedStakes(address);
    const reputation = await env.reputation.reputationOf(address);
    const ownedCertificates = minted.filter((entry) =>
      addressesEqual(entry.owner, address)
    );

    console.log(`  ${agent.name} (${address})`);
    console.log(`    Liquid balance: ${formatTokens(liquidRaw)}`);
    console.log(`    Active agent stake: ${formatTokens(stakedRaw)}`);
    console.log(`    Locked stake: ${formatTokens(lockedRaw)}`);
    console.log(`    Reputation score: ${reputation.toString()}`);

    let certificates: string[] | undefined;
    if (ownedCertificates.length === 0) {
      console.log('    Certificates: none yet — future completions will mint AGI credentials.');
    } else {
      const descriptors = ownedCertificates.map((entry) => {
        const uriSuffix = entry.uri ? ` ← ${entry.uri}` : '';
        return `#${entry.jobId.toString()}${uriSuffix}`;
      });
      certificates = descriptors;
      console.log(`    Certificates: ${descriptors.join(', ')}`);
    }

    result.push({
      name: agent.name,
      address,
      liquid: toTokenAmount(liquidRaw),
      staked: toTokenAmount(stakedRaw),
      locked: toTokenAmount(lockedRaw),
      reputation: reputation.toString(),
      certificates,
    });
  }

  return result;
}

async function logValidatorCouncil(
  env: DemoEnvironment
): Promise<PortfolioRecord[]> {
  console.log('\n🛡️ Validator council status');
  const validators: Array<{ name: string; signer: ethers.Signer }> = [
    { name: 'Charlie (validator)', signer: env.validatorCharlie },
    { name: 'Dora (validator)', signer: env.validatorDora },
    { name: 'Evan (validator)', signer: env.validatorEvan },
  ];

  const result: PortfolioRecord[] = [];
  for (const validator of validators) {
    const address = await validator.signer.getAddress();
    const liquidRaw = await env.token.balanceOf(address);
    const stakedRaw = await env.stake.stakes(address, Role.Validator);
    const lockedRaw = await env.stake.lockedStakes(address);
    const reputation = await env.reputation.reputationOf(address);

    console.log(`  ${validator.name} (${address})`);
    console.log(`    Liquid balance: ${formatTokens(liquidRaw)}`);
    console.log(`    Validator stake: ${formatTokens(stakedRaw)}`);
    console.log(`    Locked stake: ${formatTokens(lockedRaw)}`);
    console.log(`    Reputation score: ${reputation.toString()}`);

    result.push({
      name: validator.name,
      address,
      liquid: toTokenAmount(liquidRaw),
      staked: toTokenAmount(stakedRaw),
      locked: toTokenAmount(lockedRaw),
      reputation: reputation.toString(),
    });
  }

  return result;
}

async function summarizeMarketState(env: DemoEnvironment): Promise<void> {
  logSection('Sovereign labour market telemetry dashboard');
  logStep('Aggregating sovereign telemetry for the owner command center');

  const highestJobId = await env.registry.nextJobId();
  const minted = await gatherCertificates(env.certificate, highestJobId);
  const totalJobs = highestJobId;
  console.log(`\n📈 Jobs orchestrated in this session: ${totalJobs.toString()}`);
  recordEvent('Jobs orchestrated', 'Total engagements mediated during the demo session.', {
    totalJobs: totalJobs.toString(),
  });

  const finalSupply = await env.token.totalSupply();
  const burned = env.initialSupply > finalSupply ? env.initialSupply - finalSupply : 0n;
  console.log(`\n🔥 Total AGIα burned: ${formatTokens(burned)}`);
  console.log(`   Circulating supply now: ${formatTokens(finalSupply)}`);
  recordEvent('Supply shift', 'Net AGIα burn recorded against circulating supply.', {
    burned: formatTokens(burned),
    finalSupply: formatTokens(finalSupply),
  });

  const feePct = await env.registry.feePct();
  const validatorRewardPct = await env.registry.validatorRewardPct();
  const pendingFees = await env.feePool.pendingFees();
  console.log(`\n🏛️ Protocol fee setting: ${feePct}%`);
  console.log(`   Validator reward split: ${validatorRewardPct}%`);
  console.log(`   FeePool pending distribution: ${formatTokens(pendingFees)}`);
  recordEvent('Protocol economics', 'Fee levers and pending distributions surfaced for governance.', {
    feePct: `${feePct}%`,
    validatorRewardPct: `${validatorRewardPct}%`,
    pendingFees: formatTokens(pendingFees),
  });

  const totalAgentStake = await env.stake.totalStakes(Role.Agent);
  const totalValidatorStake = await env.stake.totalStakes(Role.Validator);
  console.log(`\n🔐 Aggregate capital committed:`);
  console.log(`   Agents: ${formatTokens(totalAgentStake)}`);
  console.log(`   Validators: ${formatTokens(totalValidatorStake)}`);
  recordEvent('Capital committed', 'Stake and slashing collateral currently protecting the market.', {
    agents: formatTokens(totalAgentStake),
    validators: formatTokens(totalValidatorStake),
  });

  const agentPortfolios = await logAgentPortfolios(env, minted);
  const validatorPortfolios = await logValidatorCouncil(env);

  if (minted.length === 0) {
    console.log('\n🎓 Certificates minted: none yet');
    recordEvent('Credentials minted', 'No AGI Jobs credentials minted in this session yet.');
  } else {
    console.log('\n🎓 Certificates minted:');
    for (const entry of minted) {
      const uriSuffix = entry.uri ? ` ← ${entry.uri}` : '';
      console.log(`  Job #${entry.jobId.toString()} → ${entry.owner}${uriSuffix}`);
    }
    recordEvent('Credentials minted', 'Credential NFTs issued to trusted agents after sovereign verification.', {
      certificates: minted
        .map((entry) => `#${entry.jobId.toString()} → ${entry.owner}`)
        .join(', '),
    });
  }

  activeReport?.setTelemetry({
    totalJobs: Number(totalJobs),
    totalBurned: toTokenAmount(burned),
    feePct: feePct.toString(),
    validatorRewardPct: validatorRewardPct.toString(),
    feePoolPending: toTokenAmount(pendingFees),
    totalAgentStake: toTokenAmount(totalAgentStake),
    totalValidatorStake: toTokenAmount(totalValidatorStake),
    agentPortfolios: agentPortfolios.map((portfolio) => ({
      id: activeReport?.resolveActorId(portfolio.address) ?? slugify(portfolio.address),
      name: portfolio.name,
      role: 'Agent',
      address: portfolio.address,
      liquid: portfolio.liquid,
      staked: portfolio.staked,
      locked: portfolio.locked,
      reputation: portfolio.reputation,
      certificates: portfolio.certificates,
    })),
    validatorPortfolios: validatorPortfolios.map((portfolio) => ({
      id: activeReport?.resolveActorId(portfolio.address) ?? slugify(portfolio.address),
      name: portfolio.name,
      role: 'Validator',
      address: portfolio.address,
      liquid: portfolio.liquid,
      staked: portfolio.staked,
      locked: portfolio.locked,
      reputation: portfolio.reputation,
    })),
    certificates: minted.map((entry) => ({
      jobId: entry.jobId.toString(),
      owner: entry.owner,
      uri: entry.uri,
    })),
  });
  activeReport?.setSectionOutcome(
    'Telemetry captured – download the structured JSON report for archival or UI replay.'
  );
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
  const initialSupply = await token.totalSupply();

  logStep('Deploying core contracts');
  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
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

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await manualDeployContract(
    'ReputationEngine',
    Reputation,
    owner,
    [await stake.getAddress()]
  );

  const Identity = await ethers.getContractFactory(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
  );
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

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
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

  const Certificate = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const certificate = await manualDeployContract(
    'CertificateNFT',
    Certificate,
    owner,
    ['AGI Jobs Credential', 'AGICERT']
  );

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
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

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await manualDeployContract(
    'DisputeModule',
    Dispute,
    owner,
    [await registry.getAddress(), 0n, 0n, ethers.ZeroAddress, await owner.getAddress()]
  );

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
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

interface JobSummaryRecord {
  jobId: string;
  context: string;
  stateLabel: string;
  success: boolean;
  burnConfirmed: boolean;
  reward: TokenAmount;
  employer: string;
  agent: string;
}

async function logJobSummary(
  registry: ethers.Contract,
  jobId: bigint,
  context: string
): Promise<JobSummaryRecord> {
  const job = await registry.jobs(jobId);
  const metadata = decodeJobMetadata(job.packedMetadata);
  const stateLabel = JOB_STATE_LABELS[metadata.state] ?? `${metadata.state}`;
  console.log(
    `\n📦 Job ${jobId} summary (${context}):\n  State: ${stateLabel}\n  Success flag: ${metadata.success}\n  Burn confirmed: ${metadata.burnConfirmed}\n  Reward: ${formatTokens(job.reward)}\n  Employer: ${job.employer}\n  Agent: ${job.agent}`
  );
  return {
    jobId: jobId.toString(),
    context,
    stateLabel,
    success: Boolean(metadata.success),
    burnConfirmed: Boolean(metadata.burnConfirmed),
    reward: toTokenAmount(job.reward),
    employer: job.employer,
    agent: job.agent,
  };
}

async function showBalances(
  label: string,
  token: ethers.Contract,
  participants: Array<{ name: string; address: string; role?: string }>
): Promise<BalanceSnapshot> {
  console.log(`\n💰 ${label}`);
  const entries: BalanceEntry[] = [];
  for (const participant of participants) {
    const balance = await token.balanceOf(participant.address);
    console.log(`  ${participant.name}: ${formatTokens(balance)}`);
    entries.push({
      name: participant.name,
      address: participant.address,
      role: participant.role,
      balance: toTokenAmount(balance),
    });
  }
  const snapshot: BalanceSnapshot = {
    id: slugify(label) || `snapshot-${Date.now()}`,
    label,
    entries,
  };
  activeReport?.attachSnapshot(snapshot);
  return snapshot;
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
  const createdSummary = await logJobSummary(
    registry,
    jobId,
    'after posting'
  );
  recordEvent(
    'Escrow funded and job created',
    'Nation A locks 250 AGIα with a 5% protocol fee and publishes a coordinated climate action brief.',
    {
      reward: createdSummary.reward.formatted,
      protocolFee: formatTokens(fee),
      jobId: createdSummary.jobId,
      employer: createdSummary.employer,
    }
  );

  logStep('Alice stakes identity and applies through the emergency allowlist');
  await registry.connect(agentAlice).applyForJob(jobId, 'alice', []);
  const assignedSummary = await logJobSummary(
    registry,
    jobId,
    'after agent assignment'
  );
  recordEvent('Agent onboarded instantly', 'Alice claims the mission slot via the sovereign emergency queue.', {
    agent: assignedSummary.agent,
    jobState: assignedSummary.stateLabel,
  });

  logStep('Alice submits validated deliverables with provable IPFS evidence');
  const resultUri = 'ipfs://results/climate-success';
  const resultHash = ethers.id(resultUri);
  await registry
    .connect(agentAlice)
    .submit(jobId, resultHash, resultUri, 'alice', []);
  const submissionSummary = await logJobSummary(
    registry,
    jobId,
    'after submission'
  );
  recordEvent(
    'Deliverables anchored on-chain',
    'Alice ships verifiable climate intelligence with pinned IPFS evidence and cryptographic result hashes.',
    {
      jobState: submissionSummary.stateLabel,
      resultUri,
    }
  );

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
  recordEvent(
    'Treasury burn attested',
    'Nation A registers their burn receipt, proving escrow deflation before rewards flow.',
    {
      burnHash: burnTxHash,
    }
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
  recordEvent(
    'Validator council commits',
    'Three sovereign validators seal their votes, guaranteeing Sybil-resistant due process.',
    {
      quorum: validators.length.toString(),
      commitDeadline: new Date(Number(round.commitDeadline) * 1000).toISOString(),
    }
  );

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
  recordEvent(
    'All validators approve',
    'Commit–reveal finality completes with unanimous alignment, clearing settlement without delay.',
    {
      revealDeadline: new Date(Number(round.revealDeadline) * 1000).toISOString(),
    }
  );

  const nowAfterReveal = BigInt(await time.latest());
  const waitForFinalize = round.revealDeadline - nowAfterReveal + 1n;
  if (waitForFinalize > 0n) {
    await time.increase(Number(waitForFinalize));
  }

  await validation.finalize(jobId);
  const finalizedSummary = await logJobSummary(
    registry,
    jobId,
    'after validator finalize'
  );
  recordEvent('Validation round finalized', 'Consensus recorded on-chain with success flag true.', {
    success: String(finalizedSummary.success),
    state: finalizedSummary.stateLabel,
  });

  logStep('Nation A finalizes payment, rewarding Alice and the validator cohort');
  await registry.connect(nationA).finalize(jobId);
  const settlementSummary = await logJobSummary(
    registry,
    jobId,
    'after treasury settlement'
  );
  recordEvent(
    'Escrow distributed',
    'The employer triggers sovereign settlement – Alice receives the treasury reward and validators earn protocol fees.',
    {
      success: String(settlementSummary.success),
    }
  );

  const participants = [
    { name: 'Nation A', address: employerAddr, role: 'Employer nation' },
    { name: 'Alice (agent)', address: await agentAlice.getAddress(), role: 'Agent' },
    { name: 'Charlie (validator)', address: await validatorCharlie.getAddress(), role: 'Validator' },
    { name: 'Dora (validator)', address: await validatorDora.getAddress(), role: 'Validator' },
    { name: 'Evan (validator)', address: await validatorEvan.getAddress(), role: 'Validator' },
  ];
  const settlementSnapshot = await showBalances(
    'Post-job token balances',
    token,
    participants
  );
  recordEvent('Treasury telemetry', 'Post-settlement balances illustrate value flow across nations, agents, and validators.', {
    agentBalance: settlementSnapshot.entries[1]?.balance.formatted ?? '',
    employerBalance: settlementSnapshot.entries[0]?.balance.formatted ?? '',
  });

  const nftBalance = await env.certificate.balanceOf(
    await agentAlice.getAddress()
  );
  console.log(`\n🏅 Alice now holds ${nftBalance} certificate NFT(s).`);
  recordEvent(
    'Credential minted',
    'Completion mints an AGI Jobs credential NFT for Alice – portable proof of sovereign-grade delivery.',
    {
      certificates: nftBalance.toString(),
    }
  );
  activeReport?.setSectionOutcome(
    'Climate coalition mission finalized with unanimous validator approval and credential issuance.'
  );
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
  const createdSummary = await logJobSummary(
    registry,
    jobId,
    'after posting'
  );
  recordEvent(
    'Nation B launches translation bid',
    'A multilingual diplomacy mission is posted with validator fees primed for oversight.',
    {
      reward: createdSummary.reward.formatted,
      jobId: createdSummary.jobId,
    }
  );

  logStep('Bob applies, contributes work, and submits contested deliverables');
  await registry.connect(agentBob).applyForJob(jobId, 'bob', []);
  await registry
    .connect(agentBob)
    .submit(jobId, ethers.id('ipfs://results/draft'), 'ipfs://results/draft', 'bob', []);
  const submissionSummary = await logJobSummary(
    registry,
    jobId,
    'after agent submission'
  );
  recordEvent('Agent Bob delivers', 'Bob provides translation drafts yet signals the need for moderator attention.', {
    jobState: submissionSummary.stateLabel,
    agent: submissionSummary.agent,
  });

  const burnTxHash = ethers.keccak256(
    ethers.toUtf8Bytes('burn:translation:checkpoint')
  );
  await registry
    .connect(nationB)
    .submitBurnReceipt(jobId, burnTxHash, 0, 0);
  await registry
    .connect(nationB)
    .confirmEmployerBurn(jobId, burnTxHash);
  recordEvent(
    'Employer records burn checkpoint',
    'Nation B attests to partial budget burn before dispute escalates.',
    {
      burnHash: burnTxHash,
    }
  );

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
  recordEvent(
    'Split validator commits',
    'Validator council telegraphs contention – one support vote, one dissent, one undecided.',
    {
      commitDeadline: new Date(Number(round.commitDeadline) * 1000).toISOString(),
    }
  );

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
  recordEvent(
    'Reveal quorum missed',
    'Only two validators reveal – the abstaining validator will be penalised under slashing policy.',
    {
      revealed: '2',
    }
  );

  const nowAfterReveal = BigInt(await time.latest());
  const waitFinalize = round.revealDeadline - nowAfterReveal + 1n;
  if (waitFinalize > 0n) {
    await time.increase(Number(waitFinalize));
  }

  await validation.finalize(jobId);
  const contestedSummary = await logJobSummary(
    registry,
    jobId,
    'after partial quorum'
  );
  recordEvent('Validation flags dispute', 'The module records a failed quorum, routing governance authority to the owner.', {
    state: contestedSummary.stateLabel,
  });

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
  recordEvent(
    'Owner configures emergency council',
    'The sovereign owner waives dispute fees, sets zero windows, and fast-tracks moderator appointments.',
    {
      owner: await owner.getAddress(),
      moderator: await moderator.getAddress(),
    }
  );

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
  recordEvent(
    'Dispute resolved for the agent',
    'Owner + moderator multisig resolves in favour of Bob, restoring escrow with sovereign accountability.',
    {
      employerWins: 'false',
    }
  );

  logStep('Nation B finalizes, distributing escrow and validator rewards post-dispute');
  await registry.connect(nationB).finalize(jobId);
  const resolutionSummary = await logJobSummary(
    registry,
    jobId,
    'after dispute resolution'
  );
  recordEvent(
    'Escrow finalised post-dispute',
    'Nation B honours the dispute verdict; Bob is paid and the abstaining validator forfeits rewards.',
    {
      success: String(resolutionSummary.success),
    }
  );

  const participants = [
    { name: 'Nation B', address: await nationB.getAddress(), role: 'Employer nation' },
    { name: 'Bob (agent)', address: await agentBob.getAddress(), role: 'Agent' },
    { name: 'Charlie (validator)', address: await validatorCharlie.getAddress(), role: 'Validator' },
    { name: 'Dora (validator)', address: await validatorDora.getAddress(), role: 'Validator' },
    { name: 'Evan (validator)', address: await validatorEvan.getAddress(), role: 'Validator' },
  ];
  const disputeSnapshot = await showBalances(
    'Post-dispute token balances',
    token,
    participants
  );
  recordEvent(
    'Post-dispute balances',
    'Liquidity snapshot exhibits Bob’s win and the abstaining validator’s slashed position.',
    {
      agentBalance: disputeSnapshot.entries[1]?.balance.formatted ?? '',
      slashedValidator: disputeSnapshot.entries[4]?.balance.formatted ?? '',
    }
  );
  activeReport?.setSectionOutcome(
    'Owner-controlled dispute resolution restored agent rewards while enforcing validator accountability.'
  );
}

async function main(): Promise<void> {
  activeReport = new GrandDemoReport();
  const env = await deployEnvironment();
  const network = await ethers.provider.getNetwork();
  activeReport.setNetwork(Number(network.chainId), network.name ?? 'hardhat');
  activeReport.setTokenSupply(env.initialSupply);
  const ownerAddress = await env.owner.getAddress();
  activeReport.setOwner(ownerAddress);
  const actorDirectory: ActorProfile[] = [
    { id: 'owner', name: 'Sovereign Operator', role: 'Owner', address: ownerAddress },
    {
      id: 'nation-a',
      name: 'Nation A – Climate Coalition',
      role: 'Employer Nation',
      address: await env.nationA.getAddress(),
    },
    {
      id: 'nation-b',
      name: 'Nation B – Linguistic Alliance',
      role: 'Employer Nation',
      address: await env.nationB.getAddress(),
    },
    {
      id: 'alice',
      name: 'Alice – Climate Response Agent',
      role: 'Agent',
      address: await env.agentAlice.getAddress(),
    },
    {
      id: 'bob',
      name: 'Bob – Translation Agent',
      role: 'Agent',
      address: await env.agentBob.getAddress(),
    },
    {
      id: 'charlie',
      name: 'Charlie – Validator',
      role: 'Validator',
      address: await env.validatorCharlie.getAddress(),
    },
    {
      id: 'dora',
      name: 'Dora – Validator',
      role: 'Validator',
      address: await env.validatorDora.getAddress(),
    },
    {
      id: 'evan',
      name: 'Evan – Validator',
      role: 'Validator',
      address: await env.validatorEvan.getAddress(),
    },
    {
      id: 'moderator',
      name: 'Global Moderator',
      role: 'Moderator',
      address: await env.moderator.getAddress(),
    },
  ];
  activeReport.setActors(actorDirectory);

  await showBalances('Initial treasury state', env.token, [
    { name: 'Owner treasury', address: ownerAddress, role: 'Owner' },
    { name: 'Nation A', address: actorDirectory[1].address, role: 'Employer nation' },
    { name: 'Nation B', address: actorDirectory[2].address, role: 'Employer nation' },
    { name: 'Alice (agent)', address: actorDirectory[3].address, role: 'Agent' },
    { name: 'Bob (agent)', address: actorDirectory[4].address, role: 'Agent' },
    { name: 'Charlie (validator)', address: actorDirectory[5].address, role: 'Validator' },
    { name: 'Dora (validator)', address: actorDirectory[6].address, role: 'Validator' },
    { name: 'Evan (validator)', address: actorDirectory[7].address, role: 'Validator' },
    { name: 'Moderator reserve', address: actorDirectory[8].address, role: 'Moderator' },
  ]);

  await runHappyPath(env);
  await runDisputeScenario(env);
  await summarizeMarketState(env);

  logSection('Demo complete – AGI Jobs v2 sovereignty market simulation finished');
  activeReport?.setSectionOutcome('Demonstration complete – the JSON transcript captures the full market simulation.');
  await activeReport?.maybeWriteFromArgs(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
