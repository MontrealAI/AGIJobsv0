#!/usr/bin/env ts-node

import { strict as assert } from 'node:assert';

import type { InterfaceAbi } from 'ethers';
import { ethers } from 'hardhat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

type TimelineKind =
  | 'section'
  | 'step'
  | 'summary'
  | 'owner-action'
  | 'insight'
  | 'job-summary'
  | 'metric'
  | 'balance';

type InsightCategory =
  | 'Owner'
  | 'Agents'
  | 'Validators'
  | 'Economy'
  | 'Disputes'
  | 'Thermodynamics';

interface TimelineEntry {
  kind: TimelineKind;
  label: string;
  at: string;
  scenario?: string;
  meta?: Record<string, unknown>;
}

interface DemoInsight {
  category: InsightCategory;
  title: string;
  detail: string;
  at: string;
  meta?: Record<string, unknown>;
  timelineIndex?: number;
}

interface OwnerActionRecord {
  label: string;
  contract: string;
  method: string;
  parameters?: Record<string, unknown>;
  at: string;
}

interface ScenarioExport {
  title: string;
  jobId: string;
  timelineIndices: number[];
}

interface AlphaMetric {
  label: string;
  energy: number;
  entropy: number;
  temperature: number;
  freeEnergy: number;
  hamiltonian: number;
  divergence: number;
  stackelbergLead: number;
  antifragility: number;
  cooperationProbability: number;
}

interface OwnerSnapshot {
  feePct: number;
  validatorRewardPct: number;
  commitWindowSeconds: number;
  revealWindowSeconds: number;
  minStake: string;
  maxStakePerAddress: string;
  minStakeRaw: string;
  maxStakePerAddressRaw: string;
  nonRevealPenaltyBps: number;
  nonRevealBanBlocks: number;
  registryPauser: string;
  stakePauser: string;
  validationPauser: string;
  commitWindowFormatted: string;
  revealWindowFormatted: string;
}

interface OwnerControlSnapshot {
  ownerAddress: string;
  guardianAddress: string;
  baseline: OwnerSnapshot;
  upgraded: OwnerSnapshot;
  restored: OwnerSnapshot;
  drillCompletedAt: string;
}

interface MarketSummary {
  totalJobs: string;
  pendingFees: string;
  finalSupply: string;
  totalAgentStake: string;
  totalValidatorStake: string;
  mintedCertificates: MintedCertificate[];
  agentPortfolios: AgentPortfolioEntry[];
  validatorCouncil: ValidatorPortfolioEntry[];
  hamiltonianTelemetry: AlphaMetric[];
}

interface DemoExportPayload {
  generatedAt: string;
  network: string;
  actors: ActorProfile[];
  ownerActions: OwnerActionRecord[];
  timeline: TimelineEntry[];
  scenarios: ScenarioExport[];
  market: MarketSummary;
  ownerControl: OwnerControlSnapshot;
  insights: DemoInsight[];
  automation: AutomationPlaybook;
}

enum Role {
  Agent,
  Validator,
  Platform,
}

interface ActorProfile {
  key: string;
  name: string;
  role: 'Owner' | 'Nation' | 'Agent' | 'Validator' | 'Moderator' | 'Protocol';
  address: string;
}

interface AgentPortfolioEntry {
  name: string;
  address: string;
  liquid: string;
  staked: string;
  locked: string;
  reputation: string;
  certificates: Array<{ jobId: string; uri?: string }>;
}

interface ValidatorPortfolioEntry {
  name: string;
  address: string;
  liquid: string;
  staked: string;
  locked: string;
  reputation: string;
}

interface AutomationDirective {
  id: string;
  title: string;
  summary: string;
  priority: 'critical' | 'high' | 'normal';
}

interface AutomationPlaybook {
  headline: string;
  missionSummary: string;
  resilienceScore: number;
  unstoppableScore: number;
  autopilot: {
    ownerDirectives: AutomationDirective[];
    agentOpportunities: AutomationDirective[];
    validatorSignals: AutomationDirective[];
    treasuryAlerts: AutomationDirective[];
  };
  telemetry: {
    totalJobs: string;
    mintedCertificates: number;
    totalBurned: string;
    finalSupply: string;
  };
  verification: {
    requiredChecks: string[];
    docs: string[];
    recommendedCommands: string[];
    lastUpdated: string;
  };
  commands: {
    replayDemo: string;
    exportTranscript: string;
    launchControlRoom: string;
    ownerDashboard: string;
  };
}

interface DemoEnvironment {
  owner: ethers.Signer;
  guardian: ethers.Signer;
  planetaryCoalition: ethers.Signer;
  orbitalAlliance: ethers.Signer;
  strategistLyra: ethers.Signer;
  architectOrion: ethers.Signer;
  validatorHelios: ethers.Signer;
  validatorKara: ethers.Signer;
  validatorNova: ethers.Signer;
  token: ethers.Contract;
  stake: ethers.Contract;
  validation: ethers.Contract;
  registry: ethers.Contract;
  dispute: ethers.Contract;
  reputation: ethers.Contract;
  identity: ethers.Contract;
  certificate: ethers.Contract;
  feePool: ethers.Contract;
  actors: ActorProfile[];
}

interface MintedCertificate {
  jobId: string;
  owner: string;
  uri?: string;
}

const timeline: TimelineEntry[] = [];
const ownerActions: OwnerActionRecord[] = [];
const scenarios: ScenarioExport[] = [];
const insights: DemoInsight[] = [];
let activeScenario: string | undefined;

const cliArgs = process.argv.slice(2);
let exportPath: string | undefined;
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--export' && cliArgs[i + 1]) {
    exportPath = cliArgs[i + 1];
    i++;
  } else if (cliArgs[i].startsWith('--export=')) {
    exportPath = cliArgs[i].split('=')[1];
  }
}
if (!exportPath && process.env.AGI_JOBS_DEMO_EXPORT) {
  exportPath = process.env.AGI_JOBS_DEMO_EXPORT;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        sanitizeValue(val),
      ])
    );
  }
  return value;
}

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }
  return sanitizeValue(meta) as Record<string, unknown>;
}

function recordTimeline(kind: TimelineKind, label: string, meta?: Record<string, unknown>): number {
  const entry: TimelineEntry = {
    kind,
    label,
    at: nowIso(),
    scenario: activeScenario,
    meta: sanitizeMeta(meta),
  };
  timeline.push(entry);
  return timeline.length - 1;
}

function logSection(title: string): void {
  console.log(`\n\n=== ${title} ===`);
  recordTimeline('section', title);
}

function logStep(message: string): void {
  console.log(`\n➡️  ${message}`);
  recordTimeline('step', message);
}

function recordOwnerAction(
  label: string,
  contract: string,
  method: string,
  parameters?: Record<string, unknown>
): void {
  const sanitized = sanitizeMeta(parameters);
  ownerActions.push({
    label,
    contract,
    method,
    parameters: sanitized,
    at: nowIso(),
  });
  recordTimeline('owner-action', label, {
    contract,
    method,
    parameters: sanitized,
  });
}

function recordInsight(
  category: InsightCategory,
  title: string,
  detail: string,
  meta?: Record<string, unknown>
): number {
  const sanitizedMeta = sanitizeMeta(meta);
  const timelineIndex = recordTimeline('insight', title, {
    category,
    detail,
    meta: sanitizedMeta,
  });
  insights.push({
    category,
    title,
    detail,
    at: timeline[timelineIndex].at,
    meta: sanitizedMeta,
    timelineIndex,
  });
  return timelineIndex;
}

function registerScenario(title: string, jobId: bigint): void {
  const timelineIndices = timeline
    .map((entry, index) => ({ entry, index }))
    .filter((item) => item.entry.scenario === title)
    .map((item) => item.index);
  scenarios.push({ title, jobId: jobId.toString(), timelineIndices });
}

function formatTokens(value: bigint): string {
  const divisor = 10n ** BigInt(AGIALPHA_DECIMALS);
  const integer = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(AGIALPHA_DECIMALS, '0').replace(/0+$/, '');
  return fractionStr.length > 0 ? `${integer}.${fractionStr}` : integer.toString();
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)}m`;
  }
  return `${(seconds / 3600).toFixed(2)}h`;
}

function calculateMetric(
  label: string,
  energy: number,
  entropy: number,
  temperature: number,
  velocity: number,
  inertia: number,
  utility: number,
  divergenceTarget: number,
  divergenceObserved: number,
  volatility: number,
  maxGain: number,
  discountFactor: number,
  stake: number
): AlphaMetric {
  const freeEnergy = energy - temperature * entropy;
  const hamiltonian = velocity * inertia - utility;
  const divergence = Math.abs(divergenceTarget - divergenceObserved);
  const stackelbergLead = 0.75 * maxGain;
  const antifragility = utility - freeEnergy - 0.5 * volatility;
  const cooperationProbability = Math.min(0.999, Math.max(0.01, discountFactor * (1 + stake)));
  recordTimeline('metric', `${label} Hamiltonian telemetry`, {
    energy,
    entropy,
    temperature,
    freeEnergy,
    hamiltonian,
    divergence,
    stackelbergLead,
    antifragility,
    cooperationProbability,
  });
  recordInsight(
    'Thermodynamics',
    `${label} equilibrium`,
    `Free energy ${freeEnergy.toFixed(3)} with Hamiltonian ${hamiltonian.toFixed(3)} → divergence ${divergence.toFixed(4)}.`,
    {
      energy,
      entropy,
      temperature,
      velocity,
      inertia,
      utility,
    }
  );
  return {
    label,
    energy,
    entropy,
    temperature,
    freeEnergy,
    hamiltonian,
    divergence,
    stackelbergLead,
    antifragility,
    cooperationProbability,
  };
}

function createFactory(
  artifact: { abi: unknown; bytecode: string },
  signer: ethers.Signer
): ethers.ContractFactory {
  return new ethers.ContractFactory(
    artifact.abi as InterfaceAbi,
    artifact.bytecode,
    signer
  );
}

async function deployPrebuiltContract(
  label: string,
  factory: ethers.ContractFactory,
  args: readonly unknown[]
): Promise<ethers.Contract> {
  const contract = await factory.deploy(...args);
  const deploymentTx = contract.deploymentTransaction();
  if (deploymentTx) {
    await deploymentTx.wait();
  } else {
    await contract.waitForDeployment();
  }
  const address = await contract.getAddress();
  console.log(`   ${label} deployed at ${address}`);
  recordTimeline('summary', `${label} deployed`, {
    address,
    args: args.map((value) => (typeof value === 'bigint' ? value.toString() : value)),
  });
  return contract;
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
  return await ethers.getContractAt(agialphaToken.abi as InterfaceAbi, AGIALPHA);
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
      minted.push({ jobId: jobId.toString(), owner, uri });
    } catch (error) {
      // ignore missing tokens
    }
  }
  return minted;
}

async function logAgentPortfolios(
  env: DemoEnvironment,
  minted: MintedCertificate[]
): Promise<AgentPortfolioEntry[]> {
  console.log('\n🤖 Agent portfolios');
  const agents: Array<{ name: string; signer: ethers.Signer }> = [
    { name: 'Lyra (Strategist)', signer: env.strategistLyra },
    { name: 'Orion (Architect)', signer: env.architectOrion },
  ];
  const entries: AgentPortfolioEntry[] = [];
  for (const agent of agents) {
    const address = await agent.signer.getAddress();
    const liquid = await env.token.balanceOf(address);
    const staked = await env.stake.stakes(address, Role.Agent);
    const locked = await env.stake.lockedStakes(address);
    const reputation = await env.reputation.reputationOf(address);
    const certificates = minted
      .filter((item) => addressesEqual(item.owner, address))
      .map((item) => ({ jobId: item.jobId.toString(), uri: item.uri }));
    console.log(`  ${agent.name} (${address})`);
    console.log(`    Liquid balance: ${formatTokens(liquid)}`);
    console.log(`    Active stake: ${formatTokens(staked)}`);
    console.log(`    Locked stake: ${formatTokens(locked)}`);
    console.log(`    Reputation: ${reputation}`);
    entries.push({
      name: agent.name,
      address,
      liquid: formatTokens(liquid),
      staked: formatTokens(staked),
      locked: formatTokens(locked),
      reputation: reputation.toString(),
      certificates,
    });
  }
  recordTimeline('summary', 'Agent portfolios captured', { agents: entries });
  return entries;
}

async function logValidatorCouncil(env: DemoEnvironment): Promise<ValidatorPortfolioEntry[]> {
  console.log('\n🛡️ Validator telemetry');
  const validators: Array<{ name: string; signer: ethers.Signer }> = [
    { name: 'Helios (Validator)', signer: env.validatorHelios },
    { name: 'Kara (Validator)', signer: env.validatorKara },
    { name: 'Nova (Validator)', signer: env.validatorNova },
  ];
  const entries: ValidatorPortfolioEntry[] = [];
  for (const validator of validators) {
    const address = await validator.signer.getAddress();
    const liquid = await env.token.balanceOf(address);
    const staked = await env.stake.stakes(address, Role.Validator);
    const locked = await env.stake.lockedStakes(address);
    const reputation = await env.reputation.reputationOf(address);
    console.log(`  ${validator.name} (${address})`);
    console.log(`    Liquid: ${formatTokens(liquid)}`);
    console.log(`    Staked: ${formatTokens(staked)}`);
    console.log(`    Locked: ${formatTokens(locked)}`);
    console.log(`    Reputation: ${reputation}`);
    entries.push({
      name: validator.name,
      address,
      liquid: formatTokens(liquid),
      staked: formatTokens(staked),
      locked: formatTokens(locked),
      reputation: reputation.toString(),
    });
  }
  recordTimeline('summary', 'Validator council telemetry', { validators: entries });
  return entries;
}

async function showBalances(
  label: string,
  token: ethers.Contract,
  participants: Array<{ name: string; address: string }>
): Promise<void> {
  console.log(`\n💰 ${label}`);
  const snapshot: Array<{ name: string; address: string; balance: string }> = [];
  for (const participant of participants) {
    const balance = await token.balanceOf(participant.address);
    console.log(`  ${participant.name}: ${formatTokens(balance)}`);
    snapshot.push({
      name: participant.name,
      address: participant.address,
      balance: formatTokens(balance),
    });
  }
  recordTimeline('balance', label, { participants: snapshot });
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

function expectJobProgress(
  jobId: bigint,
  metadata: { state?: number; success?: boolean; burnConfirmed?: boolean },
  expectations: { context: string; state?: number; success?: boolean; burnConfirmed?: boolean }
): void {
  if (expectations.state !== undefined) {
    assert.notStrictEqual(
      metadata.state,
      undefined,
      `Job ${jobId} (${expectations.context}) missing state metadata`
    );
    assert.strictEqual(
      metadata.state,
      expectations.state,
      `Job ${jobId} expected state ${JOB_STATE_LABELS[expectations.state] ?? expectations.state} during ${expectations.context}`
    );
  }
  if (expectations.success !== undefined) {
    assert.notStrictEqual(
      metadata.success,
      undefined,
      `Job ${jobId} (${expectations.context}) missing success metadata`
    );
    assert.strictEqual(
      metadata.success,
      expectations.success,
      `Job ${jobId} expected success=${expectations.success} during ${expectations.context}`
    );
  }
  if (expectations.burnConfirmed !== undefined) {
    assert.notStrictEqual(
      metadata.burnConfirmed,
      undefined,
      `Job ${jobId} (${expectations.context}) missing burn metadata`
    );
    assert.strictEqual(
      metadata.burnConfirmed,
      expectations.burnConfirmed,
      `Job ${jobId} expected burnConfirmed=${expectations.burnConfirmed} during ${expectations.context}`
    );
  }
}

async function logJobSummary(
  registry: ethers.Contract,
  jobId: bigint,
  context: string
): Promise<{ state?: number; success?: boolean; burnConfirmed?: boolean }> {
  const job = await registry.jobs(jobId);
  const metadata = decodeJobMetadata(job.packedMetadata) as {
    state?: number;
    success?: boolean;
    burnConfirmed?: boolean;
  };
  console.log(
    `\n📦 Job ${jobId} summary (${context}):\n  State: ${JOB_STATE_LABELS[metadata.state ?? 0]}\n  Success: ${metadata.success}\n  Burn confirmed: ${metadata.burnConfirmed}\n  Reward: ${formatTokens(job.reward)}\n  Employer: ${job.employer}\n  Agent: ${job.agent}`
  );
  recordTimeline('job-summary', `Job ${jobId} (${context})`, {
    jobId: jobId.toString(),
    context,
    state: JOB_STATE_LABELS[metadata.state ?? 0],
    success: metadata.success,
    burnConfirmed: metadata.burnConfirmed,
    reward: formatTokens(job.reward),
    employer: job.employer,
    agent: job.agent,
  });
  return metadata;
}

function isValidatorsAlreadySelectedError(error: unknown): boolean {
  const message = `${error}`;
  if (message.includes('ValidatorsAlreadySelected')) {
    return true;
  }
  const candidate =
    (error as { data?: unknown })?.data ??
    (error as { error?: { data?: unknown } })?.error?.data;
  const nested =
    typeof candidate === 'object' && candidate
      ? (candidate as { data?: unknown }).data
      : undefined;
  const payload =
    typeof nested === 'string'
      ? nested
      : typeof candidate === 'string'
        ? candidate
        : undefined;
  return typeof payload === 'string' && payload.startsWith('0x7c5a2649');
}

async function ensureValidatorsSelected(
  validation: ethers.Contract,
  caller: ethers.Signer,
  jobId: bigint
) {
  const attempt = async () => {
    try {
      const tx = await validation.connect(caller).selectValidators(jobId, 0);
      await tx.wait();
    } catch (error) {
      if (!isValidatorsAlreadySelectedError(error)) {
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

async function deployEnvironment(): Promise<DemoEnvironment> {
  logSection('Bootstrapping Solving α-AGI Governance laboratory');
  const [
    owner,
    guardian,
    planetaryCoalition,
    orbitalAlliance,
    strategistLyra,
    architectOrion,
    validatorHelios,
    validatorKara,
    validatorNova,
  ] = await ethers.getSigners();

  const actors: ActorProfile[] = [
    { key: 'owner', name: 'Alpha Governance Owner', role: 'Owner', address: await owner.getAddress() },
    { key: 'guardian', name: 'Guardian Council', role: 'Moderator', address: await guardian.getAddress() },
    { key: 'coalition', name: 'Planetary Coalition', role: 'Nation', address: await planetaryCoalition.getAddress() },
    { key: 'alliance', name: 'Orbital Alliance', role: 'Nation', address: await orbitalAlliance.getAddress() },
    { key: 'lyra', name: 'Lyra (Strategist Agent)', role: 'Agent', address: await strategistLyra.getAddress() },
    { key: 'orion', name: 'Orion (Constitution Architect)', role: 'Agent', address: await architectOrion.getAddress() },
    { key: 'helios', name: 'Helios (Validator)', role: 'Validator', address: await validatorHelios.getAddress() },
    { key: 'kara', name: 'Kara (Validator)', role: 'Validator', address: await validatorKara.getAddress() },
    { key: 'nova', name: 'Nova (Validator)', role: 'Validator', address: await validatorNova.getAddress() },
  ];
  recordTimeline('summary', 'Actor roster initialised', { actors });

  const token = await configureToken();
  const mintAmount = ethers.parseUnits('3200', AGIALPHA_DECIMALS);
  await mintInitialBalances(token, [
    planetaryCoalition,
    orbitalAlliance,
    strategistLyra,
    architectOrion,
    validatorHelios,
    validatorKara,
    validatorNova,
  ], mintAmount);

  logStep('Deploying governance primitives');
  const Stake = createFactory(stakeManagerArtifact, owner);
  const stake = await deployPrebuiltContract('StakeManager', Stake, [
    0n,
    0n,
    0n,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await owner.getAddress(),
  ]);
  const stakeAddress = await stake.getAddress();
  await token.connect(owner).mint(stakeAddress, 0n);

  const Reputation = createFactory(reputationEngineArtifact, owner);
  const reputation = await deployPrebuiltContract('ReputationEngine', Reputation, [
    await stake.getAddress(),
  ]);

  const Identity = createFactory(identityRegistryArtifact, owner);
  const identity = await deployPrebuiltContract('IdentityRegistry', Identity, [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash,
  ]);

  const Validation = createFactory(validationModuleArtifact, owner);
  const validation = await deployPrebuiltContract('ValidationModule', Validation, [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0n,
    0n,
    0n,
    0n,
    [],
  ]);

  const Certificate = createFactory(certificateNftArtifact, owner);
  const certificate = await deployPrebuiltContract('CertificateNFT', Certificate, [
    'AGI Governance Credential',
    'AGIGOV',
  ]);

  const Registry = createFactory(jobRegistryArtifact, owner);
  const registry = await deployPrebuiltContract('JobRegistry', Registry, [
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
  ]);

  const Dispute = createFactory(disputeModuleArtifact, owner);
  const dispute = await deployPrebuiltContract('DisputeModule', Dispute, [
    await registry.getAddress(),
    0n,
    0n,
    ethers.ZeroAddress,
    await owner.getAddress(),
  ]);

  const FeePool = createFactory(feePoolArtifact, owner);
  const feePool = await deployPrebuiltContract('FeePool', FeePool, [
    stakeAddress,
    0n,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
  ]);

  logStep('Wiring module lattice for owner supremacy');
  await certificate.connect(owner).setJobRegistry(await registry.getAddress());
  recordOwnerAction('Credential registry linked', `CertificateNFT@${await certificate.getAddress()}`, 'setJobRegistry', {
    registry: await registry.getAddress(),
  });
  await certificate.connect(owner).setStakeManager(stakeAddress);
  recordOwnerAction('Credential stake linkage enabled', `CertificateNFT@${await certificate.getAddress()}`, 'setStakeManager', {
    stake: stakeAddress,
  });

  await stake.connect(owner).setFeePool(await feePool.getAddress());
  recordOwnerAction('Stake fee pool configured', `StakeManager@${stakeAddress}`, 'setFeePool', {
    feePool: await feePool.getAddress(),
  });
  await stake.connect(owner).setModules(await registry.getAddress(), await dispute.getAddress());
  recordOwnerAction('Stake modules assigned', `StakeManager@${stakeAddress}`, 'setModules', {
    registry: await registry.getAddress(),
    dispute: await dispute.getAddress(),
  });
  await stake.connect(owner).setValidationModule(await validation.getAddress());
  recordOwnerAction('Stake validation module linked', `StakeManager@${stakeAddress}`, 'setValidationModule', {
    validation: await validation.getAddress(),
  });

  await validation.connect(owner).setJobRegistry(await registry.getAddress());
  recordOwnerAction('Validation registry linked', `ValidationModule@${await validation.getAddress()}`, 'setJobRegistry', {
    registry: await registry.getAddress(),
  });
  await validation.connect(owner).setIdentityRegistry(await identity.getAddress());
  recordOwnerAction('Validation identity bridge wired', `ValidationModule@${await validation.getAddress()}`, 'setIdentityRegistry', {
    identity: await identity.getAddress(),
  });
  await validation.connect(owner).setReputationEngine(await reputation.getAddress());
  recordOwnerAction('Validation reputation wired', `ValidationModule@${await validation.getAddress()}`, 'setReputationEngine', {
    reputation: await reputation.getAddress(),
  });
  await validation.connect(owner).setStakeManager(stakeAddress);
  recordOwnerAction('Validation stake wired', `ValidationModule@${await validation.getAddress()}`, 'setStakeManager', {
    stake: stakeAddress,
  });
  await reputation.connect(owner).setCaller(await registry.getAddress(), true);
  recordOwnerAction('Registry authorised to update reputation', `ReputationEngine@${await reputation.getAddress()}`, 'setCaller', {
    caller: await registry.getAddress(),
    allowed: true,
  });
  await reputation.connect(owner).setCaller(await validation.getAddress(), true);
  recordOwnerAction('Validation authorised to update reputation', `ReputationEngine@${await reputation.getAddress()}`, 'setCaller', {
    caller: await validation.getAddress(),
    allowed: true,
  });

  await registry
    .connect(owner)
    .setModules(
      await validation.getAddress(),
      stakeAddress,
      await reputation.getAddress(),
      await dispute.getAddress(),
      await certificate.getAddress(),
      await feePool.getAddress(),
      []
    );
  recordOwnerAction('Registry modules wired', `JobRegistry@${await registry.getAddress()}`, 'setModules', {
    validation: await validation.getAddress(),
    stake: stakeAddress,
    reputation: await reputation.getAddress(),
    dispute: await dispute.getAddress(),
    certificate: await certificate.getAddress(),
    feePool: await feePool.getAddress(),
  });
  await registry.connect(owner).setIdentityRegistry(await identity.getAddress());
  recordOwnerAction('Registry identity wired', `JobRegistry@${await registry.getAddress()}`, 'setIdentityRegistry', {
    identity: await identity.getAddress(),
  });
  await registry.connect(owner).setDisputeModule(await dispute.getAddress());
  recordOwnerAction('Registry dispute wired', `JobRegistry@${await registry.getAddress()}`, 'setDisputeModule', {
    dispute: await dispute.getAddress(),
  });
  await registry.connect(owner).setFeePct(4);
  recordOwnerAction('Platform fee set', `JobRegistry@${await registry.getAddress()}`, 'setFeePct', {
    feePct: 4,
  });

  await dispute.connect(owner).setStakeManager(stakeAddress);
  recordOwnerAction('Dispute stake wired', `DisputeModule@${await dispute.getAddress()}`, 'setStakeManager', {
    stake: stakeAddress,
  });
  await dispute.connect(owner).setJobRegistry(await registry.getAddress());
  recordOwnerAction('Dispute registry wired', `DisputeModule@${await dispute.getAddress()}`, 'setJobRegistry', {
    registry: await registry.getAddress(),
  });
  const guardianAddress = await guardian.getAddress();
  await dispute.connect(owner).setModerator(guardianAddress, 1n);
  recordOwnerAction('Guardian council set as moderators', `DisputeModule@${await dispute.getAddress()}`, 'setModerator', {
    moderator: guardianAddress,
    weight: 1,
  });

  logStep('Authorising strategic agents and validator council identities');
  const strategistAddress = await strategistLyra.getAddress();
  const architectAddress = await architectOrion.getAddress();
  const heliosAddress = await validatorHelios.getAddress();
  const karaAddress = await validatorKara.getAddress();
  const novaAddress = await validatorNova.getAddress();
  await identity.connect(owner).addAdditionalAgent(strategistAddress);
  recordOwnerAction('Strategist agent authorised', `IdentityRegistry@${await identity.getAddress()}`, 'addAdditionalAgent', {
    agent: strategistAddress,
  });
  await identity.connect(owner).addAdditionalAgent(architectAddress);
  recordOwnerAction('Architect agent authorised', `IdentityRegistry@${await identity.getAddress()}`, 'addAdditionalAgent', {
    agent: architectAddress,
  });
  await identity.connect(owner).addAdditionalValidator(heliosAddress);
  recordOwnerAction('Validator Helios authorised', `IdentityRegistry@${await identity.getAddress()}`, 'addAdditionalValidator', {
    validator: heliosAddress,
  });
  await identity.connect(owner).addAdditionalValidator(karaAddress);
  recordOwnerAction('Validator Kara authorised', `IdentityRegistry@${await identity.getAddress()}`, 'addAdditionalValidator', {
    validator: karaAddress,
  });
  await identity.connect(owner).addAdditionalValidator(novaAddress);
  recordOwnerAction('Validator Nova authorised', `IdentityRegistry@${await identity.getAddress()}`, 'addAdditionalValidator', {
    validator: novaAddress,
  });

  await validation
    .connect(owner)
    .setValidatorPool([heliosAddress, karaAddress, novaAddress]);
  recordOwnerAction('Validator pool seeded', `ValidationModule@${await validation.getAddress()}`, 'setValidatorPool', {
    validators: [heliosAddress, karaAddress, novaAddress],
  });

  logStep('Provisioning initial stake commitments for agents and validators');
  const agentStakeAmount = ethers.parseUnits('420', AGIALPHA_DECIMALS);
  const validatorStakeAmount = ethers.parseUnits('360', AGIALPHA_DECIMALS);
  const stakingSnapshot: Array<{ name: string; address: string; role: string; amount: string }> = [];
  const stakingPlan: Array<{ signer: ethers.Signer; role: Role; amount: bigint; name: string }> = [
    { signer: strategistLyra, role: Role.Agent, amount: agentStakeAmount, name: 'Lyra (Strategist Agent)' },
    { signer: architectOrion, role: Role.Agent, amount: agentStakeAmount, name: 'Orion (Constitution Architect)' },
    { signer: validatorHelios, role: Role.Validator, amount: validatorStakeAmount, name: 'Helios (Validator)' },
    { signer: validatorKara, role: Role.Validator, amount: validatorStakeAmount, name: 'Kara (Validator)' },
    { signer: validatorNova, role: Role.Validator, amount: validatorStakeAmount, name: 'Nova (Validator)' },
  ];
  for (const plan of stakingPlan) {
    const actorAddress = await plan.signer.getAddress();
    await token.connect(plan.signer).approve(stakeAddress, plan.amount);
    await stake.connect(plan.signer).depositStake(plan.role, plan.amount);
    stakingSnapshot.push({
      name: plan.name,
      address: actorAddress,
      role: plan.role === Role.Agent ? 'Agent' : 'Validator',
      amount: formatTokens(plan.amount),
    });
  }
  recordTimeline('summary', 'Initial staking commitments executed', { participants: stakingSnapshot });

  return {
    owner,
    guardian,
    planetaryCoalition,
    orbitalAlliance,
    strategistLyra,
    architectOrion,
    validatorHelios,
    validatorKara,
    validatorNova,
    token,
    stake,
    validation,
    registry,
    dispute,
    reputation,
    identity,
    certificate,
    feePool,
    actors,
  };
}

async function snapshotOwner(env: DemoEnvironment): Promise<OwnerSnapshot> {
  const [
    feePct,
    validatorRewardPct,
    commitWindow,
    revealWindow,
    minStakeRaw,
    maxStakeRaw,
    nonRevealPenalty,
    nonRevealBanBlocks,
    registryPauser,
    stakePauser,
    validationPauser,
  ] = await Promise.all([
    env.registry.feePct(),
    env.stake.validatorRewardPct(),
    env.validation.commitWindow(),
    env.validation.revealWindow(),
    env.stake.minStake(),
    env.stake.maxStakePerAddress(),
    env.validation.nonRevealPenaltyBps(),
    env.validation.nonRevealBanBlocks(),
    env.registry.pauser(),
    env.stake.pauser(),
    env.validation.pauser(),
  ]);
  const commitWindowSeconds = Number(commitWindow);
  const revealWindowSeconds = Number(revealWindow);
  const nonRevealBanBlocksNumber = Number(nonRevealBanBlocks);
  return {
    feePct: Number(feePct),
    validatorRewardPct: Number(validatorRewardPct),
    commitWindowSeconds,
    revealWindowSeconds,
    minStake: formatTokens(minStakeRaw),
    maxStakePerAddress: formatTokens(maxStakeRaw),
    minStakeRaw: minStakeRaw.toString(),
    maxStakePerAddressRaw: maxStakeRaw.toString(),
    nonRevealPenaltyBps: Number(nonRevealPenalty),
    nonRevealBanBlocks: nonRevealBanBlocksNumber,
    registryPauser,
    stakePauser,
    validationPauser,
    commitWindowFormatted: formatSeconds(commitWindowSeconds),
    revealWindowFormatted: formatSeconds(revealWindowSeconds),
  };
}

async function exerciseOwnerControls(env: DemoEnvironment): Promise<OwnerControlSnapshot> {
  logSection('Owner command lattice rehearsal');
  const baseline = await snapshotOwner(env);

  logStep('Owner increases validator reward share and stake thresholds');
  await env.stake
    .connect(env.owner)
    .setValidatorRewardPct(BigInt(baseline.validatorRewardPct + 5));
  recordOwnerAction('Validator reward boosted', `StakeManager@${await env.stake.getAddress()}`, 'setValidatorRewardPct', {
    pct: baseline.validatorRewardPct + 5,
  });
  await env.stake.connect(env.owner).setMinStake(ethers.parseUnits('360', AGIALPHA_DECIMALS));
  recordOwnerAction('Minimum stake raised', `StakeManager@${await env.stake.getAddress()}`, 'setMinStake', {
    min: formatTokens(ethers.parseUnits('360', AGIALPHA_DECIMALS)),
  });
  logStep('Owner extends commit/reveal windows and increases non-reveal penalties');
  try {
    const newCommitWindow = baseline.commitWindowSeconds + 1800;
    await env.validation.connect(env.owner).setCommitWindow(newCommitWindow);
    recordOwnerAction('Commit window extended', `ValidationModule@${await env.validation.getAddress()}`, 'setCommitWindow', {
      windowSeconds: newCommitWindow,
    });
    const newRevealWindow = baseline.revealWindowSeconds + 1200;
    await env.validation.connect(env.owner).setRevealWindow(newRevealWindow);
    recordOwnerAction('Reveal window extended', `ValidationModule@${await env.validation.getAddress()}`, 'setRevealWindow', {
      windowSeconds: newRevealWindow,
    });
    const newPenalty = baseline.nonRevealPenaltyBps + 150;
    await env.validation
      .connect(env.owner)
      .setNonRevealPenalty(newPenalty, baseline.nonRevealBanBlocks);
    recordOwnerAction('Non-reveal penalty intensified', `ValidationModule@${await env.validation.getAddress()}`, 'setNonRevealPenalty', {
      penaltyBps: newPenalty,
      banBlocks: baseline.nonRevealBanBlocks,
    });
  } catch (error) {
    console.error('Owner control adjustment failed', {
      commitWindow: baseline.commitWindowSeconds,
      revealWindow: baseline.revealWindowSeconds,
      penalty: baseline.nonRevealPenaltyBps,
    });
    throw error;
  }

  logStep('Owner delegates pause authority to guardian council for rehearsal');
  await env.registry.connect(env.owner).setPauser(await env.guardian.getAddress());
  await env.stake.connect(env.owner).setPauser(await env.guardian.getAddress());
  await env.validation.connect(env.owner).setPauser(await env.guardian.getAddress());
  recordOwnerAction('Pauser control delegated to guardian', 'GuardianCouncil', 'setPauser', {
    registry: await env.guardian.getAddress(),
  });

  logStep('Guardian council executes coordinated pause across all modules');
  await env.registry.connect(env.guardian).pause();
  await env.stake.connect(env.guardian).pause();
  await env.validation.connect(env.guardian).pause();
  recordOwnerAction('Guardian council executed global pause', 'GuardianCouncil', 'pause');
  await env.registry.connect(env.guardian).unpause();
  await env.stake.connect(env.guardian).unpause();
  await env.validation.connect(env.guardian).unpause();
  recordOwnerAction('Guardian council restored modules', 'GuardianCouncil', 'unpause');

  const upgraded = await snapshotOwner(env);

  logStep('Owner resumes direct control after the drill');
  await env.registry.connect(env.owner).setPauser(await env.owner.getAddress());
  await env.stake.connect(env.owner).setPauser(await env.owner.getAddress());
  await env.validation.connect(env.owner).setPauser(await env.owner.getAddress());
  recordOwnerAction('Owner reclaimed pauser control', 'Owner', 'setPauser', {
    owner: await env.owner.getAddress(),
  });

  await env.stake
    .connect(env.owner)
    .setValidatorRewardPct(BigInt(baseline.validatorRewardPct));
  await env.stake.connect(env.owner).setMinStake(BigInt(baseline.minStakeRaw));
  await env.validation
    .connect(env.owner)
    .setCommitWindow(baseline.commitWindowSeconds);
  await env.validation
    .connect(env.owner)
    .setRevealWindow(baseline.revealWindowSeconds);
  await env.validation
    .connect(env.owner)
    .setNonRevealPenalty(baseline.nonRevealPenaltyBps, baseline.nonRevealBanBlocks);
  recordOwnerAction('Owner restored baseline configuration', 'Owner', 'restore', baseline);

  const restored = await snapshotOwner(env);

  return {
    ownerAddress: await env.owner.getAddress(),
    guardianAddress: await env.guardian.getAddress(),
    baseline,
    upgraded,
    restored,
    drillCompletedAt: nowIso(),
  };
}

async function runConstitutionScenario(env: DemoEnvironment, metrics: AlphaMetric[]): Promise<void> {
  const scenarioTitle = 'Scenario 1 – Planetary constitution harmonisation';
  activeScenario = scenarioTitle;
  logSection(scenarioTitle);

  const reward = ethers.parseUnits('280', AGIALPHA_DECIMALS);
  const feePct = await env.registry.feePct();
  const fee = (reward * BigInt(feePct)) / 100n;

  await env.token
    .connect(env.planetaryCoalition)
    .approve(await env.stake.getAddress(), reward + fee);
  const specHash = ethers.id('ipfs://specs/constitution-alpha');
  const deadline = BigInt((await time.latest()) + 7200);
  await env.registry
    .connect(env.planetaryCoalition)
    .createJob(reward, deadline, specHash, 'ipfs://missions/constitution');
  const jobId = await env.registry.nextJobId();
  const createdMetadata = await logJobSummary(env.registry, jobId, 'after creation');
  expectJobProgress(jobId, createdMetadata, {
    context: 'after creation',
    state: 1,
    success: false,
    burnConfirmed: false,
  });

  await env.registry.connect(env.strategistLyra).applyForJob(jobId, 'lyra', []);
  await env.registry
    .connect(env.strategistLyra)
    .submit(jobId, ethers.id('ipfs://results/constitution-alpha'), 'ipfs://results/constitution-alpha', 'lyra', []);

  const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn:constitution:alpha'));
  await env.registry
    .connect(env.planetaryCoalition)
    .submitBurnReceipt(jobId, burnTxHash, 0, 0);
  await env.registry
    .connect(env.planetaryCoalition)
    .confirmEmployerBurn(jobId, burnTxHash);

  const round = await ensureValidatorsSelected(env.validation, env.planetaryCoalition, jobId);
  const nonce = await env.validation.jobNonce(jobId);
  const validators = [env.validatorHelios, env.validatorKara, env.validatorNova];
  const approvals = [true, true, true];
  const salts = validators.map(() => ethers.randomBytes(32));
  for (let i = 0; i < validators.length; i++) {
    const commit = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [jobId, nonce, approvals[i], burnTxHash, salts[i], specHash]
      )
    );
    await env.validation
      .connect(validators[i])
      .commitValidation(jobId, commit, 'validator', []);
  }

  const waitCommit = round.commitDeadline - BigInt(await time.latest()) + 1n;
  if (waitCommit > 0n) {
    await time.increase(Number(waitCommit));
  }

  for (let i = 0; i < validators.length; i++) {
    await env.validation
      .connect(validators[i])
      .revealValidation(jobId, approvals[i], burnTxHash, salts[i], 'validator', []);
  }

  const waitFinalize = round.revealDeadline - BigInt(await time.latest()) + 1n;
  if (waitFinalize > 0n) {
    await time.increase(Number(waitFinalize));
  }

  await env.validation.finalize(jobId);
  const finalMetadata = await logJobSummary(env.registry, jobId, 'after validation');
  expectJobProgress(jobId, finalMetadata, {
    context: 'after validation',
    state: 4,
    success: true,
    burnConfirmed: true,
  });

  await env.registry.connect(env.planetaryCoalition).finalize(jobId);
  const settledMetadata = await logJobSummary(env.registry, jobId, 'after settlement');
  expectJobProgress(jobId, settledMetadata, {
    context: 'after settlement',
    state: 6,
    success: true,
    burnConfirmed: true,
  });

  registerScenario(scenarioTitle, jobId);
  metrics.push(
    calculateMetric('Constitution harmonisation', 0.82, 0.33, 0.58, 0.72, 0.64, 0.91, 0.002, 0.0013, 0.14, 1.2, 0.94, 0.85)
  );
  activeScenario = undefined;
}

async function runAdversarialScenario(env: DemoEnvironment, metrics: AlphaMetric[]): Promise<void> {
  const scenarioTitle = 'Scenario 2 – Orbital emergency doctrine dispute';
  activeScenario = scenarioTitle;
  logSection(scenarioTitle);

  const reward = ethers.parseUnits('190', AGIALPHA_DECIMALS);
  const feePct = await env.registry.feePct();
  const fee = (reward * BigInt(feePct)) / 100n;

  await env.token
    .connect(env.orbitalAlliance)
    .approve(await env.stake.getAddress(), reward + fee);
  const specHash = ethers.id('ipfs://specs/orbital-doctrine');
  const deadline = BigInt((await time.latest()) + 5400);
  await env.registry
    .connect(env.orbitalAlliance)
    .createJob(reward, deadline, specHash, 'ipfs://missions/orbital-doctrine');
  const jobId = await env.registry.nextJobId();
  const createdMetadata = await logJobSummary(env.registry, jobId, 'after creation');
  expectJobProgress(jobId, createdMetadata, {
    context: 'after creation',
    state: 1,
    success: false,
    burnConfirmed: false,
  });

  await env.registry.connect(env.architectOrion).applyForJob(jobId, 'orion', []);
  await env.registry
    .connect(env.architectOrion)
    .submit(jobId, ethers.id('ipfs://results/orbital-doctrine'), 'ipfs://results/orbital-doctrine', 'orion', []);

  const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn:orbital:doctrine'));
  await env.registry
    .connect(env.orbitalAlliance)
    .submitBurnReceipt(jobId, burnTxHash, 0, 0);
  await env.registry
    .connect(env.orbitalAlliance)
    .confirmEmployerBurn(jobId, burnTxHash);

  const round = await ensureValidatorsSelected(env.validation, env.orbitalAlliance, jobId);
  const nonce = await env.validation.jobNonce(jobId);
  const validators = [env.validatorHelios, env.validatorKara, env.validatorNova];
  const approvals = [true, false, false];
  const salts = validators.map(() => ethers.randomBytes(32));
  for (let i = 0; i < validators.length; i++) {
    const commit = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [jobId, nonce, approvals[i], burnTxHash, salts[i], specHash]
      )
    );
    await env.validation
      .connect(validators[i])
      .commitValidation(jobId, commit, 'validator', []);
  }

  const waitCommit = round.commitDeadline - BigInt(await time.latest()) + 1n;
  if (waitCommit > 0n) {
    await time.increase(Number(waitCommit));
  }

  await env.validation
    .connect(env.validatorHelios)
    .revealValidation(jobId, true, burnTxHash, salts[0], 'validator', []);
  await env.validation
    .connect(env.validatorKara)
    .revealValidation(jobId, false, burnTxHash, salts[1], 'validator', []);

  const waitFinalize = round.revealDeadline - BigInt(await time.latest()) + 1n;
  if (waitFinalize > 0n) {
    await time.increase(Number(waitFinalize));
  }

  await env.validation.finalize(jobId);
  const disputedMetadata = await logJobSummary(env.registry, jobId, 'after validation deadlock');
  expectJobProgress(jobId, disputedMetadata, {
    context: 'after validation deadlock',
    state: 5,
    success: false,
    burnConfirmed: true,
  });

  await env.dispute.connect(env.owner).setDisputeFee(0);
  recordOwnerAction('Dispute fee waived for emergency doctrine', `DisputeModule@${await env.dispute.getAddress()}`, 'setDisputeFee', {
    fee: 0,
  });
  await env.registry
    .connect(env.architectOrion)
    ['raiseDispute(uint256,bytes32)'](jobId, ethers.id('ipfs://evidence/orbital-doctrine'));
  await env.dispute.connect(env.owner).setDisputeWindow(0);
  recordOwnerAction('Dispute window accelerated', `DisputeModule@${await env.dispute.getAddress()}`, 'setDisputeWindow', {
    window: 0,
  });
  await env.dispute.connect(env.guardian).resolve(jobId, true);
  recordInsight(
    'Disputes',
    'Guardian council arbitration',
    'Guardian council – doctrine approved after resilience audit',
    {
      jobId: jobId.toString(),
      ruling: 'Employer upheld',
      resolver: await env.guardian.getAddress(),
    }
  );
  await env.registry.connect(env.orbitalAlliance).finalize(jobId);
  const settledMetadata = await logJobSummary(env.registry, jobId, 'after guardian resolution');
  expectJobProgress(jobId, settledMetadata, {
    context: 'after guardian resolution',
    state: 6,
    success: false,
    burnConfirmed: true,
  });

  registerScenario(scenarioTitle, jobId);
  metrics.push(
    calculateMetric('Orbital doctrine dispute', 0.77, 0.41, 0.62, 0.68, 0.71, 0.79, 0.0045, 0.0017, 0.22, 1.4, 0.9, 0.82)
  );
  activeScenario = undefined;
}

async function captureMarketSummary(env: DemoEnvironment, metrics: AlphaMetric[]): Promise<MarketSummary> {
  logSection('Mission telemetry and Hamiltonian summary');
  const highestJobId = (await env.registry.nextJobId()) - 1n;
  const minted = await gatherCertificates(env.certificate, highestJobId);
  const agentPortfolios = await logAgentPortfolios(env, minted);
  const validatorCouncil = await logValidatorCouncil(env);
  const pendingFees = await env.feePool.pendingFees();
  const finalSupply = await env.token.totalSupply();
  const totalAgentStake = await env.stake.totalStake(Role.Agent);
  const totalValidatorStake = await env.stake.totalStake(Role.Validator);

  return {
    totalJobs: highestJobId.toString(),
    pendingFees: formatTokens(pendingFees),
    finalSupply: formatTokens(finalSupply),
    totalAgentStake: formatTokens(totalAgentStake),
    totalValidatorStake: formatTokens(totalValidatorStake),
    mintedCertificates: minted,
    agentPortfolios,
    validatorCouncil,
    hamiltonianTelemetry: metrics,
  };
}

function buildAutomationPlaybook(summary: MarketSummary): AutomationPlaybook {
  return {
    headline: 'Alpha governance cockpit',
    missionSummary: 'Two sovereign-scale governance missions executed with thermodynamic telemetry and owner supremacy.',
    resilienceScore: 0.98,
    unstoppableScore: 0.99,
    autopilot: {
      ownerDirectives: [
        {
          id: 'owner-hamiltonian-audit',
          title: 'Hamiltonian audit',
          summary: 'Review divergence metrics < 0.002 across both scenarios to verify Pareto alignment.',
          priority: 'critical',
        },
      ],
      agentOpportunities: [
        {
          id: 'agent-coop-expansion',
          title: 'Deploy cooperative alpha-field',
          summary: 'Leverage high cooperation probability to spawn regional policy missions with identical script.',
          priority: 'high',
        },
      ],
      validatorSignals: [
        {
          id: 'validator-pause-drill',
          title: 'Schedule next pause drill',
          summary: 'Guardian council validated delegated pause; repeat monthly to keep muscle memory fresh.',
          priority: 'normal',
        },
      ],
      treasuryAlerts: [
        {
          id: 'treasury-fee-routing',
          title: 'Treasury routing check',
          summary: 'Owner restored fee configuration; verify pending fee balance matches mission telemetry.',
          priority: 'high',
        },
      ],
    },
    telemetry: {
      totalJobs: summary.totalJobs,
      mintedCertificates: summary.mintedCertificates.length,
      totalBurned: formatTokens(0n),
      finalSupply: summary.finalSupply,
    },
    verification: {
      requiredChecks: [
        'CI v2 summary gate',
        'Hardhat integration: solvingAlphaGovernance',
        'Hamiltonian tracker report',
      ],
      docs: [
        'docs/thermodynamics-operations.md',
        'docs/owner-control-atlas.md',
      ],
      recommendedCommands: [
        'npm run owner:dashboard -- --network hardhat',
        'npm run hamiltonian:report -- --engine <RewardEngineMB>',
      ],
      lastUpdated: nowIso(),
    },
    commands: {
      replayDemo: 'npx hardhat run --no-compile scripts/v2/agiGovernanceGrandDemo.ts --network hardhat',
      exportTranscript: 'AGI_JOBS_DEMO_EXPORT=demo/agi-governance/ui/export/latest.json npm run demo:agi-governance:export',
      launchControlRoom: 'npm run demo:agi-governance:control-room',
      ownerDashboard: 'npm run owner:dashboard -- --network hardhat',
    },
  };
}

function writeExport(payload: DemoExportPayload): void {
  if (!exportPath) {
    return;
  }
  const resolved = resolve(process.cwd(), exportPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\n📦 Transcript exported → ${resolved}`);
}

async function main(): Promise<void> {
  const env = await deployEnvironment();
  await showBalances('Initial treasury snapshot', env.token, env.actors.map((actor) => ({ name: actor.name, address: actor.address })));

  const ownerControl = await exerciseOwnerControls(env);

  const metrics: AlphaMetric[] = [];
  await runConstitutionScenario(env, metrics);
  await runAdversarialScenario(env, metrics);

  const market = await captureMarketSummary(env, metrics);
  const automation = buildAutomationPlaybook(market);

  const payload: DemoExportPayload = {
    generatedAt: nowIso(),
    network: 'hardhat',
    actors: env.actors,
    ownerActions,
    timeline,
    scenarios,
    market,
    ownerControl,
    insights,
    automation,
  };

  writeExport(payload);
  console.log('\n✅ Solving α-AGI Governance grand demo complete.');
  console.log(`   Timeline entries: ${timeline.length}`);
  console.log(`   Owner actions recorded: ${ownerActions.length}`);
  console.log(`   Hamiltonian metrics: ${metrics.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
