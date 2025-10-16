#!/usr/bin/env ts-node

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
  | 'job-summary'
  | 'balance'
  | 'owner-action'
  | 'summary';

interface TimelineEntry {
  kind: TimelineKind;
  label: string;
  at: string;
  scenario?: string;
  meta?: Record<string, unknown>;
}

interface ActorProfile {
  key: string;
  name: string;
  role:
    | 'Owner'
    | 'Nation'
    | 'Agent'
    | 'Validator'
    | 'Moderator'
    | 'Protocol';
  address: string;
}

interface OwnerActionRecord {
  label: string;
  contract: string;
  method: string;
  parameters?: Record<string, unknown>;
  at: string;
}

type HighlightCategory = 'owner' | 'agent' | 'validator' | 'market';

interface ActorReference {
  name: string;
  address: string;
  role: ActorProfile['role'];
}

interface ScenarioPayout {
  participant: ActorReference;
  delta: string;
  direction: 'credit' | 'debit';
}

interface ScenarioMetric {
  label: string;
  value: string;
}

interface ScenarioExport {
  title: string;
  jobId: string;
  timelineIndices: number[];
  employer: ActorReference;
  agent: ActorReference;
  reward: string;
  feePct: number;
  disputeRaised: boolean;
  resolvedBy: string;
  highlights: string[];
  payouts: ScenarioPayout[];
  metrics: ScenarioMetric[];
}

interface EmpowermentHighlight {
  title: string;
  body: string;
  category: HighlightCategory;
}

interface ScorecardEntry {
  label: string;
  value: string;
  explanation: string;
}

interface EmpowermentOverview {
  scoreboard: ScorecardEntry[];
  highlights: EmpowermentHighlight[];
  ownerConfidence: {
    status: 'owner-in-command' | 'action-needed';
    summary: string;
    checks: string[];
  };
  quickStart: string[];
}

interface MarketSummary {
  totalJobs: string;
  totalBurned: string;
  finalSupply: string;
  feePct: number;
  validatorRewardPct: number;
  pendingFees: string;
  totalAgentStake: string;
  totalValidatorStake: string;
  mintedCertificates: MintedCertificate[];
}

interface PauseStatus {
  registry: boolean;
  stake: boolean;
  validation: boolean;
}

interface OwnerControlParameters {
  feePct: number;
  validatorRewardPct: number;
  burnPct: number;
  commitWindowSeconds: number;
  revealWindowSeconds: number;
  commitWindowFormatted: string;
  revealWindowFormatted: string;
  revealQuorumPct: number;
  minRevealers: number;
  nonRevealPenaltyBps: number;
  nonRevealBanBlocks: number;
  registryPauser: string;
  stakePauser: string;
  validationPauser: string;
}

interface ModuleAddresses {
  registry: string;
  stake: string;
  validation: string;
  feePool: string;
  dispute: string;
  certificate: string;
  reputation: string;
  identity: string;
}

interface OwnerControlSnapshot {
  ownerAddress: string;
  moderatorAddress: string;
  modules: ModuleAddresses;
  baseline: OwnerControlParameters;
  upgraded: OwnerControlParameters;
  restored: OwnerControlParameters;
  pauseDrill: {
    owner: PauseStatus;
    moderator: PauseStatus;
  };
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
  empowerment: EmpowermentOverview;
}

enum Role {
  Agent,
  Validator,
  Platform,
}

const timeline: TimelineEntry[] = [];
const ownerActions: OwnerActionRecord[] = [];
const scenarios: ScenarioExport[] = [];
let activeScenario: string | undefined;
let totalAgentPayouts = 0n;
let totalValidatorPayouts = 0n;
let validatorsPenalized = 0;
let disputesResolved = 0;

interface ParticipantDescriptor {
  name: string;
  address: string;
  role: ActorProfile['role'];
}

type BalanceSnapshot = Record<string, bigint>;

interface BalanceDeltaRecord {
  participant: ActorReference;
  delta: bigint;
  formatted: string;
  direction: 'credit' | 'debit';
}

const cliArgs = process.argv.slice(2);
let exportPath: string | undefined;
for (let i = 0; i < cliArgs.length; i++) {
  const arg = cliArgs[i];
  if (arg === '--export') {
    exportPath = cliArgs[i + 1];
    i++;
  } else if (arg.startsWith('--export=')) {
    exportPath = arg.split('=')[1];
  }
}
if (!exportPath && process.env.AGI_JOBS_DEMO_EXPORT) {
  exportPath = process.env.AGI_JOBS_DEMO_EXPORT;
}

function nowIso(): string {
  return new Date().toISOString();
}

function recordTimeline(
  kind: TimelineKind,
  label: string,
  meta?: Record<string, unknown>
): number {
  const entry: TimelineEntry = {
    kind,
    label,
    at: nowIso(),
    scenario: activeScenario,
    meta,
  };
  timeline.push(entry);
  return timeline.length - 1;
}

function recordOwnerAction(
  label: string,
  contract: string,
  method: string,
  parameters?: Record<string, unknown>
): void {
  ownerActions.push({
    label,
    contract,
    method,
    parameters,
    at: nowIso(),
  });
  recordTimeline('owner-action', label, {
    contract,
    method,
    parameters,
  });
}

function registerScenario(
  title: string,
  jobId: bigint,
  details: Omit<ScenarioExport, 'title' | 'jobId' | 'timelineIndices'>
): void {
  const timelineIndices = timeline
    .map((entry, index) => ({ entry, index }))
    .filter((item) => item.entry.scenario === title)
    .map((item) => item.index);
  scenarios.push({
    title,
    jobId: jobId.toString(),
    timelineIndices,
    ...details,
  });
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
  actors: ActorProfile[];
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
  recordTimeline('section', title);
  if (title.startsWith('Scenario')) {
    activeScenario = title;
  } else {
    activeScenario = undefined;
  }
}

function logStep(step: string): void {
  console.log(`\n➡️  ${step}`);
  recordTimeline('step', step);
}

function formatSeconds(seconds: bigint): string {
  return `${seconds.toString()}s`;
}

function formatSignedTokens(delta: bigint): string {
  if (delta === 0n) {
    return '±0 AGIα';
  }
  const prefix = delta > 0n ? '+' : '−';
  const magnitude = delta > 0n ? delta : -delta;
  return `${prefix}${ethers.formatUnits(magnitude, AGIALPHA_DECIMALS)} AGIα`;
}

async function captureBalanceSnapshot(
  token: ethers.Contract,
  participants: ParticipantDescriptor[]
): Promise<BalanceSnapshot> {
  const snapshot: BalanceSnapshot = {};
  for (const participant of participants) {
    const balance = await token.balanceOf(participant.address);
    snapshot[participant.address.toLowerCase()] = balance;
  }
  return snapshot;
}

function computeBalanceDeltas(
  before: BalanceSnapshot,
  after: BalanceSnapshot,
  participants: ParticipantDescriptor[]
): BalanceDeltaRecord[] {
  return participants.map((participant) => {
    const key = participant.address.toLowerCase();
    const previous = before[key] ?? 0n;
    const next = after[key] ?? 0n;
    const delta = next - previous;
    const direction: 'credit' | 'debit' = delta >= 0n ? 'credit' : 'debit';
    const formatted = formatSignedTokens(delta);
    return {
      participant: {
        name: participant.name,
        address: participant.address,
        role: participant.role,
      },
      delta,
      formatted,
      direction,
    };
  });
}

function findDeltaByAddress(
  deltas: BalanceDeltaRecord[],
  address: string
): BalanceDeltaRecord | undefined {
  return deltas.find(
    (entry) => entry.participant.address.toLowerCase() === address.toLowerCase()
  );
}

function sumPositiveByRole(
  deltas: BalanceDeltaRecord[],
  role: ActorProfile['role']
): bigint {
  return deltas
    .filter((entry) => entry.participant.role === role && entry.delta > 0n)
    .reduce((acc, entry) => acc + entry.delta, 0n);
}

function countNegativeByRole(
  deltas: BalanceDeltaRecord[],
  role: ActorProfile['role']
): number {
  return deltas.filter(
    (entry) => entry.participant.role === role && entry.delta < 0n
  ).length;
}

function ownerParametersEqual(
  a: OwnerControlParameters,
  b: OwnerControlParameters,
  ownerAddress: string
): boolean {
  const ownerLower = ownerAddress.toLowerCase();
  const pauserMatches = (expected: string, actual: string) => {
    if (expected.toLowerCase() === actual.toLowerCase()) {
      return true;
    }
    if (expected === ethers.ZeroAddress) {
      return actual.toLowerCase() === ownerLower;
    }
    return false;
  };
  return (
    a.feePct === b.feePct &&
    a.validatorRewardPct === b.validatorRewardPct &&
    a.burnPct === b.burnPct &&
    a.commitWindowSeconds === b.commitWindowSeconds &&
    a.revealWindowSeconds === b.revealWindowSeconds &&
    a.revealQuorumPct === b.revealQuorumPct &&
    a.minRevealers === b.minRevealers &&
    a.nonRevealPenaltyBps === b.nonRevealPenaltyBps &&
    a.nonRevealBanBlocks === b.nonRevealBanBlocks &&
    pauserMatches(a.registryPauser, b.registryPauser) &&
    pauserMatches(a.stakePauser, b.stakePauser) &&
    pauserMatches(a.validationPauser, b.validationPauser)
  );
}

async function readOwnerControlParameters(
  registry: ethers.Contract,
  validation: ethers.Contract,
  feePool: ethers.Contract,
  stake: ethers.Contract
): Promise<OwnerControlParameters> {
  const [
    feePct,
    validatorRewardPct,
    burnPct,
    commitWindow,
    revealWindow,
    revealQuorumPct,
    minRevealValidators,
    nonRevealPenaltyBps,
    nonRevealBanBlocks,
    registryPauser,
    stakePauser,
    validationPauser,
  ] = await Promise.all([
    registry.feePct(),
    registry.validatorRewardPct(),
    feePool.burnPct(),
    validation.commitWindow(),
    validation.revealWindow(),
    validation.revealQuorumPct(),
    validation.minRevealValidators(),
    validation.nonRevealPenaltyBps(),
    validation.nonRevealBanBlocks(),
    registry.pauser(),
    stake.pauser(),
    validation.pauser(),
  ]);

  return {
    feePct: Number(feePct),
    validatorRewardPct: Number(validatorRewardPct),
    burnPct: Number(burnPct),
    commitWindowSeconds: Number(commitWindow),
    revealWindowSeconds: Number(revealWindow),
    commitWindowFormatted: formatSeconds(commitWindow),
    revealWindowFormatted: formatSeconds(revealWindow),
    revealQuorumPct: Number(revealQuorumPct),
    minRevealers: Number(minRevealValidators),
    nonRevealPenaltyBps: Number(nonRevealPenaltyBps),
    nonRevealBanBlocks: Number(nonRevealBanBlocks),
    registryPauser,
    stakePauser,
    validationPauser,
  };
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
  const sanitizedArgs = args.map((value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
  recordTimeline('summary', `${label} deployed`, {
    address,
    args: sanitizedArgs,
  });
  return contract;
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
  const entries: Array<Record<string, unknown>> = [];
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

    entries.push({
      name: agent.name,
      address,
      liquid: formatTokens(liquid),
      staked: formatTokens(staked),
      locked: formatTokens(locked),
      reputation: reputation.toString(),
      certificates: ownedCertificates.map((entry) => ({
        jobId: entry.jobId.toString(),
        uri: entry.uri,
      })),
    });
  }
  recordTimeline('summary', 'Agent portfolios', { agents: entries });
}

async function logValidatorCouncil(env: DemoEnvironment): Promise<void> {
  console.log('\n🛡️ Validator council status');
  const validatorsSummary: Array<Record<string, unknown>> = [];
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

    validatorsSummary.push({
      name: validator.name,
      address,
      liquid: formatTokens(liquid),
      staked: formatTokens(staked),
      locked: formatTokens(locked),
      reputation: reputation.toString(),
    });
  }
  recordTimeline('summary', 'Validator council status', {
    validators: validatorsSummary,
  });
}

async function summarizeMarketState(
  env: DemoEnvironment
): Promise<MarketSummary> {
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

  const summary: MarketSummary = {
    totalJobs: totalJobs.toString(),
    totalBurned: formatTokens(burned),
    finalSupply: formatTokens(finalSupply),
    feePct: Number(feePct),
    validatorRewardPct: Number(validatorRewardPct),
    pendingFees: formatTokens(pendingFees),
    totalAgentStake: formatTokens(totalAgentStake),
    totalValidatorStake: formatTokens(totalValidatorStake),
    mintedCertificates: minted,
  };

  recordTimeline('summary', 'Market telemetry dashboard', {
    ...summary,
    mintedCertificates: summary.mintedCertificates.map((entry) => ({
      jobId: entry.jobId.toString(),
      owner: entry.owner,
      uri: entry.uri,
    })),
  });
  return summary;
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

  const ownerAddress = await owner.getAddress();
  const nationAAddress = await nationA.getAddress();
  const nationBAddress = await nationB.getAddress();
  const aliceAddress = await agentAlice.getAddress();
  const bobAddress = await agentBob.getAddress();
  const charlieAddress = await validatorCharlie.getAddress();
  const doraAddress = await validatorDora.getAddress();
  const evanAddress = await validatorEvan.getAddress();
  const moderatorAddress = await moderator.getAddress();

  const actors: ActorProfile[] = [
    {
      key: 'owner',
      name: 'AGI Jobs Sovereign Orchestrator',
      role: 'Owner',
      address: ownerAddress,
    },
    {
      key: 'nation-a',
      name: 'Nation A (Employer)',
      role: 'Nation',
      address: nationAAddress,
    },
    {
      key: 'nation-b',
      name: 'Nation B (Employer)',
      role: 'Nation',
      address: nationBAddress,
    },
    {
      key: 'alice',
      name: 'Alice (AI Agent)',
      role: 'Agent',
      address: aliceAddress,
    },
    {
      key: 'bob',
      name: 'Bob (AI Agent)',
      role: 'Agent',
      address: bobAddress,
    },
    {
      key: 'charlie',
      name: 'Charlie (Validator)',
      role: 'Validator',
      address: charlieAddress,
    },
    {
      key: 'dora',
      name: 'Dora (Validator)',
      role: 'Validator',
      address: doraAddress,
    },
    {
      key: 'evan',
      name: 'Evan (Validator)',
      role: 'Validator',
      address: evanAddress,
    },
    {
      key: 'moderator',
      name: 'Global Moderator Council',
      role: 'Moderator',
      address: moderatorAddress,
    },
  ];

  recordTimeline('summary', 'Demo actor roster initialised', {
    actors,
  });

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
  recordTimeline('summary', 'Initial AGIα liquidity minted to actors', {
    amount: formatTokens(mintAmount),
    recipients: [
      nationAAddress,
      nationBAddress,
      aliceAddress,
      bobAddress,
      charlieAddress,
      doraAddress,
      evanAddress,
    ],
  });

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
  const stake = await deployPrebuiltContract(
    'StakeManager',
    Stake,
    [...stakeArgs]
  );
  const stakeAddress = await stake.getAddress();
  await token.connect(owner).mint(stakeAddress, 0n);

  const Reputation = createFactory(reputationEngineArtifact, owner);
  const reputation = await deployPrebuiltContract(
    'ReputationEngine',
    Reputation,
    [await stake.getAddress()]
  );

  const Identity = createFactory(identityRegistryArtifact, owner);
  const identity = await deployPrebuiltContract(
    'IdentityRegistry',
    Identity,
    [
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await reputation.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]
  );

  const Validation = createFactory(validationModuleArtifact, owner);
  const validation = await deployPrebuiltContract(
    'ValidationModule',
    Validation,
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
  const certificate = await deployPrebuiltContract(
    'CertificateNFT',
    Certificate,
    ['AGI Jobs Credential', 'AGICERT']
  );

  const Registry = createFactory(jobRegistryArtifact, owner);
  const registry = await deployPrebuiltContract(
    'JobRegistry',
    Registry,
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
  const dispute = await deployPrebuiltContract(
    'DisputeModule',
    Dispute,
    [await registry.getAddress(), 0n, 0n, ethers.ZeroAddress, await owner.getAddress()]
  );

  const FeePool = createFactory(feePoolArtifact, owner);
  const feePool = await deployPrebuiltContract(
    'FeePool',
    FeePool,
    [stakeAddress, 0n, ethers.ZeroAddress, ethers.ZeroAddress]
  );
  const reputationAddress = await reputation.getAddress();
  const identityAddress = await identity.getAddress();
  const validationAddress = await validation.getAddress();
  const certificateAddress = await certificate.getAddress();
  const registryAddress = await registry.getAddress();
  const disputeAddress = await dispute.getAddress();
  const feePoolAddress = await feePool.getAddress();

  await token.connect(owner).mint(feePoolAddress, 0n);

  logStep('Wiring governance relationships and module cross-links');
  await certificate.connect(owner).setJobRegistry(registryAddress);
  recordOwnerAction('Linked certificate to job registry', `CertificateNFT@${certificateAddress}`, 'setJobRegistry', {
    registry: registryAddress,
  });
  await certificate.connect(owner).setStakeManager(stakeAddress);
  recordOwnerAction('Linked certificate to stake manager', `CertificateNFT@${certificateAddress}`, 'setStakeManager', {
    stake: stakeAddress,
  });

  await stake.connect(owner).setFeePool(await feePool.getAddress());
  await stake
    .connect(owner)
    .setModules(await registry.getAddress(), await dispute.getAddress());
  await stake.connect(owner).setBurnPct(0);
  await stake
    .connect(owner)
    .setValidationModule(await validation.getAddress());
  await stake.connect(owner).setFeePool(feePoolAddress);
  recordOwnerAction('Connected stake manager fee pool', `StakeManager@${stakeAddress}`, 'setFeePool', {
    feePool: feePoolAddress,
  });
  await stake.connect(owner).setModules(registryAddress, disputeAddress);
  recordOwnerAction('Connected stake modules', `StakeManager@${stakeAddress}`, 'setModules', {
    registry: registryAddress,
    dispute: disputeAddress,
  });
  await stake.connect(owner).setValidationModule(validationAddress);
  recordOwnerAction('Linked stake to validation module', `StakeManager@${stakeAddress}`, 'setValidationModule', {
    validation: validationAddress,
  });

  await validation.connect(owner).setJobRegistry(registryAddress);
  recordOwnerAction('Validation module registry link', `ValidationModule@${validationAddress}`, 'setJobRegistry', {
    registry: registryAddress,
  });
  await validation.connect(owner).setIdentityRegistry(identityAddress);
  recordOwnerAction('Validation module identity link', `ValidationModule@${validationAddress}`, 'setIdentityRegistry', {
    identity: identityAddress,
  });
  await validation.connect(owner).setReputationEngine(reputationAddress);
  recordOwnerAction('Validation module reputation link', `ValidationModule@${validationAddress}`, 'setReputationEngine', {
    reputation: reputationAddress,
  });
  await validation.connect(owner).setStakeManager(stakeAddress);
  recordOwnerAction('Validation module stake link', `ValidationModule@${validationAddress}`, 'setStakeManager', {
    stake: stakeAddress,
  });

  await registry
    .connect(owner)
    .setModules(
      validationAddress,
      stakeAddress,
      reputationAddress,
      disputeAddress,
      certificateAddress,
      feePoolAddress,
      []
    );
  recordOwnerAction('Registry module wiring finalised', `JobRegistry@${registryAddress}`, 'setModules', {
    validation: validationAddress,
    stake: stakeAddress,
    reputation: reputationAddress,
    dispute: disputeAddress,
    certificate: certificateAddress,
    feePool: feePoolAddress,
  });
  await registry.connect(owner).setIdentityRegistry(identityAddress);
  recordOwnerAction('Registry identity registry set', `JobRegistry@${registryAddress}`, 'setIdentityRegistry', {
    identity: identityAddress,
  });
  await registry.connect(owner).setValidatorRewardPct(20);
  recordOwnerAction('Validator reward percentage configured', `JobRegistry@${registryAddress}`, 'setValidatorRewardPct', {
    pct: 20,
  });

  await reputation.connect(owner).setCaller(registryAddress, true);
  recordOwnerAction('Registry authorised to update reputation', `ReputationEngine@${reputationAddress}`, 'setCaller', {
    caller: registryAddress,
    allowed: true,
  });
  await reputation.connect(owner).setCaller(validationAddress, true);
  recordOwnerAction('Validation authorised to update reputation', `ReputationEngine@${reputationAddress}`, 'setCaller', {
    caller: validationAddress,
    allowed: true,
  });

  await dispute.connect(owner).setStakeManager(stakeAddress);
  recordOwnerAction('Dispute module stake link', `DisputeModule@${disputeAddress}`, 'setStakeManager', {
    stake: stakeAddress,
  });

  logStep('Configuring policy parameters for rapid local simulation');
  await validation.connect(owner).setCommitRevealWindows(60, 60);
  recordOwnerAction('Commit/reveal windows tuned', `ValidationModule@${validationAddress}`, 'setCommitRevealWindows', {
    commitWindow: 60,
    revealWindow: 60,
  });
  await validation.connect(owner).setValidatorsPerJob(3);
  recordOwnerAction('Validator quorum set', `ValidationModule@${validationAddress}`, 'setValidatorsPerJob', {
    count: 3,
  });
  await validation
    .connect(owner)
    .setValidatorPool([
      charlieAddress,
      doraAddress,
      evanAddress,
    ]);
  recordOwnerAction('Validator pool curated', `ValidationModule@${validationAddress}`, 'setValidatorPool', {
    validators: [charlieAddress, doraAddress, evanAddress],
  });
  await validation.connect(owner).setRevealQuorum(0, 2);
  recordOwnerAction('Reveal quorum configured', `ValidationModule@${validationAddress}`, 'setRevealQuorum', {
    minYesVotes: 0,
    minRevealers: 2,
  });
  await validation.connect(owner).setNonRevealPenalty(100, 1);
  recordOwnerAction('Non-reveal penalty set', `ValidationModule@${validationAddress}`, 'setNonRevealPenalty', {
    penaltyBps: 100,
    penaltyDivisor: 1,
  });

  await feePool.connect(owner).setBurnPct(5);
  recordOwnerAction('Fee pool burn percentage adjusted', `FeePool@${feePoolAddress}`, 'setBurnPct', {
    burnPct: 5,
  });
  await certificate
    .connect(owner)
    .setBaseURI('ipfs://agi-jobs/demo/certificates/');
  recordOwnerAction('Certificate base URI set', `CertificateNFT@${certificateAddress}`, 'setBaseURI', {
    baseURI: 'ipfs://agi-jobs/demo/certificates/',
  });

  logStep('Seeding IdentityRegistry with emergency allowlists');
  for (const signer of [agentAlice, agentBob]) {
    const address = await signer.getAddress();
    await identity.connect(owner).addAdditionalAgent(address);
    recordOwnerAction('Emergency AI agent allowlisted', `IdentityRegistry@${identityAddress}`, 'addAdditionalAgent', {
      agent: address,
    });
    await identity.connect(owner).setAgentType(address, 1); // mark as AI agents
    recordOwnerAction('Agent type annotated', `IdentityRegistry@${identityAddress}`, 'setAgentType', {
      agent: address,
      agentType: 1,
    });
  }
  for (const signer of [validatorCharlie, validatorDora, validatorEvan]) {
    const address = await signer.getAddress();
    await identity.connect(owner).addAdditionalValidator(address);
    recordOwnerAction('Validator council seat granted', `IdentityRegistry@${identityAddress}`, 'addAdditionalValidator', {
      validator: address,
    });
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
    actors,
  };
}

async function ownerCommandCenterDrill(
  env: DemoEnvironment
): Promise<OwnerControlSnapshot> {
  logSection('Owner mission control – unstoppable command authority demonstration');

  const {
    owner,
    moderator,
    registry,
    stake,
    validation,
    feePool,
    dispute,
    certificate,
    reputation,
    identity,
  } = env;
  const [
    registryAddress,
    stakeAddress,
    validationAddress,
    feePoolAddress,
    disputeAddress,
    certificateAddress,
    reputationAddress,
    identityAddress,
    ownerAddress,
    moderatorAddress,
  ] = await Promise.all([
    registry.getAddress(),
    stake.getAddress(),
    validation.getAddress(),
    feePool.getAddress(),
    dispute.getAddress(),
    certificate.getAddress(),
    reputation.getAddress(),
    identity.getAddress(),
    owner.getAddress(),
    moderator.getAddress(),
  ]);

  const baseline = await readOwnerControlParameters(
    registry,
    validation,
    feePool,
    stake
  );

  const previousFeePct = baseline.feePct;
  const previousValidatorReward = baseline.validatorRewardPct;
  const previousBurnPct = baseline.burnPct;
  const originalCommitWindow = BigInt(baseline.commitWindowSeconds);
  const originalRevealWindow = BigInt(baseline.revealWindowSeconds);
  const originalRevealQuorumPct = baseline.revealQuorumPct;
  const originalMinRevealers = baseline.minRevealers;
  const originalNonRevealPenaltyBps = baseline.nonRevealPenaltyBps;
  const originalNonRevealBanBlocks = baseline.nonRevealBanBlocks;

  const upgradedFeePct = previousFeePct + 4;
  const upgradedValidatorReward = previousValidatorReward + 5;
  const upgradedBurnPct = previousBurnPct + 1;
  const upgradedCommitWindow = originalCommitWindow + 30n;
  const upgradedRevealWindow = originalRevealWindow + 30n;
  const upgradedRevealQuorumPct = Math.max(50, originalRevealQuorumPct);
  const upgradedMinRevealers = Math.max(2, originalMinRevealers);
  const upgradedNonRevealPenaltyBps = Math.max(150, originalNonRevealPenaltyBps);
  const upgradedNonRevealBanBlocks = Math.max(12, originalNonRevealBanBlocks);

  logStep('Owner calibrates market economics and validator incentives');
  await registry.connect(owner).setFeePct(upgradedFeePct);
  recordOwnerAction('Protocol fee temporarily increased', `JobRegistry@${registryAddress}`, 'setFeePct', {
    previous: previousFeePct,
    pct: upgradedFeePct,
  });
  await registry.connect(owner).setValidatorRewardPct(upgradedValidatorReward);
  recordOwnerAction('Validator rewards boosted', `JobRegistry@${registryAddress}`, 'setValidatorRewardPct', {
    previous: previousValidatorReward,
    pct: upgradedValidatorReward,
  });
  await feePool.connect(owner).setBurnPct(upgradedBurnPct);
  recordOwnerAction('Fee pool burn widened', `FeePool@${feePoolAddress}`, 'setBurnPct', {
    previous: previousBurnPct,
    burnPct: upgradedBurnPct,
  });
  console.log(
    `   Fee percentage adjusted: ${previousFeePct}% → ${Number(await registry.feePct())}%`
  );
  console.log(
    `   Validator reward share: ${previousValidatorReward}% → ${Number(
      await registry.validatorRewardPct()
    )}%`
  );
  console.log(
    `   Fee burn rate: ${previousBurnPct}% → ${Number(await feePool.burnPct())}%`
  );

  logStep('Owner updates validation committee cadence and accountability levers');
  await validation
    .connect(owner)
    .setCommitRevealWindows(upgradedCommitWindow, upgradedRevealWindow);
  recordOwnerAction('Commit/reveal windows extended', `ValidationModule@${validationAddress}`, 'setCommitRevealWindows', {
    previousCommitWindow: formatSeconds(originalCommitWindow),
    previousRevealWindow: formatSeconds(originalRevealWindow),
    commitWindow: formatSeconds(upgradedCommitWindow),
    revealWindow: formatSeconds(upgradedRevealWindow),
  });
  await validation
    .connect(owner)
    .setRevealQuorum(upgradedRevealQuorumPct, upgradedMinRevealers);
  recordOwnerAction('Reveal quorum tightened', `ValidationModule@${validationAddress}`, 'setRevealQuorum', {
    previousPct: originalRevealQuorumPct,
    previousMinRevealers: originalMinRevealers,
    pct: upgradedRevealQuorumPct,
    minRevealers: upgradedMinRevealers,
  });
  await validation
    .connect(owner)
    .setNonRevealPenalty(upgradedNonRevealPenaltyBps, upgradedNonRevealBanBlocks);
  recordOwnerAction('Non-reveal penalty escalated', `ValidationModule@${validationAddress}`, 'setNonRevealPenalty', {
    previousBps: originalNonRevealPenaltyBps,
    previousBanBlocks: originalNonRevealBanBlocks,
    bps: upgradedNonRevealPenaltyBps,
    banBlocks: upgradedNonRevealBanBlocks,
  });

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
    `   Reveal quorum now ${Number(await validation.revealQuorumPct())}% with minimum ${Number(
      await validation.minRevealValidators()
    )} validators`
  );
  console.log(
    `   Non-reveal penalty now ${Number(await validation.nonRevealPenaltyBps())} bps with ${Number(
      await validation.nonRevealBanBlocks()
    )} block ban`
  );

  logStep('Owner delegates emergency pauser powers and performs a live drill');
  await registry.connect(owner).setPauser(moderatorAddress);
  recordOwnerAction('Registry pauser delegated', `JobRegistry@${registryAddress}`, 'setPauser', {
    newPauser: moderatorAddress,
  });
  await stake.connect(owner).setPauser(moderatorAddress);
  recordOwnerAction('Stake manager pauser delegated', `StakeManager@${stakeAddress}`, 'setPauser', {
    newPauser: moderatorAddress,
  });
  await validation.connect(owner).setPauser(moderatorAddress);
  recordOwnerAction('Validation module pauser delegated', `ValidationModule@${validationAddress}`, 'setPauser', {
    newPauser: moderatorAddress,
  });

  await registry.connect(owner).pause();
  recordOwnerAction('Registry paused for drill', `JobRegistry@${registryAddress}`, 'pause', { by: ownerAddress });
  await stake.connect(owner).pause();
  recordOwnerAction('Stake manager paused for drill', `StakeManager@${stakeAddress}`, 'pause', {
    by: ownerAddress,
  });
  await validation.connect(owner).pause();
  recordOwnerAction('Validation module paused for drill', `ValidationModule@${validationAddress}`, 'pause', {
    by: ownerAddress,
  });
  const ownerPauseStatus: PauseStatus = {
    registry: await registry.paused(),
    stake: await stake.paused(),
    validation: await validation.paused(),
  };
  console.log(
    `   Owner pause drill → registry:${ownerPauseStatus.registry} stake:${ownerPauseStatus.stake} validation:${ownerPauseStatus.validation}`
  );

  await registry.connect(owner).unpause();
  recordOwnerAction('Registry unpaused after drill', `JobRegistry@${registryAddress}`, 'unpause', { by: ownerAddress });
  await stake.connect(owner).unpause();
  recordOwnerAction('Stake manager unpaused after drill', `StakeManager@${stakeAddress}`, 'unpause', {
    by: ownerAddress,
  });
  await validation.connect(owner).unpause();
  recordOwnerAction('Validation module unpaused after drill', `ValidationModule@${validationAddress}`, 'unpause', {
    by: ownerAddress,
  });

  await registry.connect(moderator).pause();
  recordOwnerAction('Registry paused by delegated moderator', `JobRegistry@${registryAddress}`, 'pause', {
    by: moderatorAddress,
  });
  await stake.connect(moderator).pause();
  recordOwnerAction('Stake manager paused by delegated moderator', `StakeManager@${stakeAddress}`, 'pause', {
    by: moderatorAddress,
  });
  await validation.connect(moderator).pause();
  recordOwnerAction('Validation module paused by delegated moderator', `ValidationModule@${validationAddress}`, 'pause', {
    by: moderatorAddress,
  });
  const moderatorPauseStatus: PauseStatus = {
    registry: await registry.paused(),
    stake: await stake.paused(),
    validation: await validation.paused(),
  };
  console.log(
    `   Moderator pause drill → registry:${moderatorPauseStatus.registry} stake:${moderatorPauseStatus.stake} validation:${moderatorPauseStatus.validation}`
  );

  await registry.connect(moderator).unpause();
  recordOwnerAction('Registry unpaused by delegated moderator', `JobRegistry@${registryAddress}`, 'unpause', {
    by: moderatorAddress,
  });
  await stake.connect(moderator).unpause();
  recordOwnerAction('Stake manager unpaused by delegated moderator', `StakeManager@${stakeAddress}`, 'unpause', {
    by: moderatorAddress,
  });
  await validation.connect(moderator).unpause();
  recordOwnerAction('Validation module unpaused by delegated moderator', `ValidationModule@${validationAddress}`, 'unpause', {
    by: moderatorAddress,
  });

  console.log('   Emergency controls verified and reset to active state.');

  const upgraded = await readOwnerControlParameters(
    registry,
    validation,
    feePool,
    stake
  );

  logStep('Owner restores baseline configuration to prepare live scenarios');
  await registry.connect(owner).setFeePct(previousFeePct);
  recordOwnerAction('Protocol fee restored', `JobRegistry@${registryAddress}`, 'setFeePct', {
    pct: previousFeePct,
  });
  await registry.connect(owner).setValidatorRewardPct(previousValidatorReward);
  recordOwnerAction('Validator reward restored', `JobRegistry@${registryAddress}`, 'setValidatorRewardPct', {
    pct: previousValidatorReward,
  });
  await feePool.connect(owner).setBurnPct(previousBurnPct);
  recordOwnerAction('Fee pool burn restored', `FeePool@${feePoolAddress}`, 'setBurnPct', {
    burnPct: previousBurnPct,
  });
  await validation
    .connect(owner)
    .setCommitRevealWindows(originalCommitWindow, originalRevealWindow);
  recordOwnerAction('Commit/reveal cadence restored', `ValidationModule@${validationAddress}`, 'setCommitRevealWindows', {
    commitWindow: formatSeconds(originalCommitWindow),
    revealWindow: formatSeconds(originalRevealWindow),
  });
  await validation
    .connect(owner)
    .setRevealQuorum(originalRevealQuorumPct, originalMinRevealers);
  recordOwnerAction('Reveal quorum restored', `ValidationModule@${validationAddress}`, 'setRevealQuorum', {
    pct: originalRevealQuorumPct,
    minRevealers: originalMinRevealers,
  });
  await validation
    .connect(owner)
    .setNonRevealPenalty(originalNonRevealPenaltyBps, originalNonRevealBanBlocks);
  recordOwnerAction('Non-reveal penalty restored', `ValidationModule@${validationAddress}`, 'setNonRevealPenalty', {
    bps: originalNonRevealPenaltyBps,
    banBlocks: originalNonRevealBanBlocks,
  });
  await registry.connect(owner).setPauser(ownerAddress);
  recordOwnerAction('Registry pauser returned to owner', `JobRegistry@${registryAddress}`, 'setPauser', {
    newPauser: ownerAddress,
  });
  await stake.connect(owner).setPauser(ownerAddress);
  recordOwnerAction('Stake manager pauser returned to owner', `StakeManager@${stakeAddress}`, 'setPauser', {
    newPauser: ownerAddress,
  });
  await validation.connect(owner).setPauser(ownerAddress);
  recordOwnerAction('Validation module pauser returned to owner', `ValidationModule@${validationAddress}`, 'setPauser', {
    newPauser: ownerAddress,
  });

  const restored = await readOwnerControlParameters(
    registry,
    validation,
    feePool,
    stake
  );
  recordTimeline('summary', 'Owner mission control baseline restored', {
    ...restored,
    commitWindow: restored.commitWindowFormatted,
    revealWindow: restored.revealWindowFormatted,
  });

  console.log(
    `   Commit/reveal cadence restored for the upcoming scenarios: ${restored.commitWindowFormatted} / ${restored.revealWindowFormatted}`
  );

  return {
    ownerAddress,
    moderatorAddress,
    modules: {
      registry: registryAddress,
      stake: stakeAddress,
      validation: validationAddress,
      feePool: feePoolAddress,
      dispute: disputeAddress,
      certificate: certificateAddress,
      reputation: reputationAddress,
      identity: identityAddress,
    },
    baseline,
    upgraded,
    restored,
    pauseDrill: {
      owner: ownerPauseStatus,
      moderator: moderatorPauseStatus,
    },
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
  recordTimeline('job-summary', `Job ${jobId} (${context})`, {
    jobId: jobId.toString(),
    context,
    state: JOB_STATE_LABELS[metadata.state] ?? metadata.state,
    success: metadata.success,
    burnConfirmed: metadata.burnConfirmed,
    reward: formatTokens(job.reward),
    employer: job.employer,
    agent: job.agent,
  });
}

async function showBalances(
  label: string,
  token: ethers.Contract,
  participants: Array<{ name: string; address: string; role?: ActorProfile['role'] }>
): Promise<void> {
  console.log(`\n💰 ${label}`);
  const snapshot: Array<{
    name: string;
    address: string;
    role?: ActorProfile['role'];
    balance: string;
  }> = [];
  for (const participant of participants) {
    const balance = await token.balanceOf(participant.address);
    console.log(`  ${participant.name}: ${formatTokens(balance)}`);
    snapshot.push({
      name: participant.name,
      address: participant.address,
      role: participant.role,
      balance: formatTokens(balance),
    });
  }
  recordTimeline('balance', label, { participants: snapshot });
}

async function runHappyPath(env: DemoEnvironment): Promise<void> {
  const scenarioTitle = 'Scenario 1 – Cooperative intergovernmental AI labour success';
  logSection(scenarioTitle);

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
  const agentAddress = await agentAlice.getAddress();
  const charlieAddress = await validatorCharlie.getAddress();
  const doraAddress = await validatorDora.getAddress();
  const evanAddress = await validatorEvan.getAddress();

  const scenarioParticipants: ParticipantDescriptor[] = [
    { name: 'Nation A (Employer)', address: employerAddr, role: 'Nation' },
    { name: 'Alice (AI Agent)', address: agentAddress, role: 'Agent' },
    { name: 'Charlie (Validator)', address: charlieAddress, role: 'Validator' },
    { name: 'Dora (Validator)', address: doraAddress, role: 'Validator' },
    { name: 'Evan (Validator)', address: evanAddress, role: 'Validator' },
  ];
  const balancesBefore = await captureBalanceSnapshot(token, scenarioParticipants);
  const supplyBefore = await token.totalSupply();

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

  await showBalances('Post-job token balances', token, scenarioParticipants);

  const balancesAfter = await captureBalanceSnapshot(token, scenarioParticipants);
  const supplyAfter = await token.totalSupply();
  const burned = supplyBefore > supplyAfter ? supplyBefore - supplyAfter : 0n;
  const deltas = computeBalanceDeltas(
    balancesBefore,
    balancesAfter,
    scenarioParticipants
  );
  const agentDelta = findDeltaByAddress(deltas, agentAddress)?.delta ?? 0n;
  const employerDelta = findDeltaByAddress(deltas, employerAddr)?.delta ?? 0n;
  const validatorCredits = sumPositiveByRole(deltas, 'Validator');
  const validatorDebits = countNegativeByRole(deltas, 'Validator');
  if (agentDelta > 0n) {
    totalAgentPayouts += agentDelta;
  }
  if (validatorCredits > 0n) {
    totalValidatorPayouts += validatorCredits;
  }
  validatorsPenalized += validatorDebits;

  const payouts: ScenarioPayout[] = deltas.map((entry) => ({
    participant: entry.participant,
    delta: entry.formatted,
    direction: entry.direction,
  }));

  const nftBalance = await env.certificate.balanceOf(agentAddress);
  console.log(`\n🏅 Alice now holds ${nftBalance} certificate NFT(s).`);
  registerScenario(scenarioTitle, jobId, {
    employer: {
      name: 'Nation A (Employer)',
      address: employerAddr,
      role: 'Nation',
    },
    agent: {
      name: 'Alice (AI Agent)',
      address: agentAddress,
      role: 'Agent',
    },
    reward: formatTokens(reward),
    feePct: Number(feePct),
    disputeRaised: false,
    resolvedBy: 'Validator council consensus',
    highlights: [
      'Three validators revealed in lockstep, clearing payment without governance escalation.',
      'Employer-confirmed burn proof executed before settlement, protecting the protocol treasury.',
      'Agent graduation minted a credential NFT immediately upon finalization.',
    ],
    payouts,
    metrics: [
      { label: 'Agent payout', value: formatSignedTokens(agentDelta) },
      {
        label: 'Employer spend',
        value: formatSignedTokens(employerDelta),
      },
      {
        label: 'Validator rewards',
        value: formatSignedTokens(validatorCredits),
      },
      { label: 'Protocol fee', value: formatTokens(fee) },
      { label: 'Tokens burned', value: formatTokens(burned) },
    ],
  });
}

async function runDisputeScenario(env: DemoEnvironment): Promise<void> {
  const scenarioTitle = 'Scenario 2 – Cross-border dispute resolved by owner governance';
  logSection(scenarioTitle);

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
  const disputeAddress = await dispute.getAddress();
  const ownerAddress = await owner.getAddress();
  const moderatorAddress = await moderator.getAddress();
  const employerAddress = await nationB.getAddress();
  const agentAddress = await agentBob.getAddress();
  const charlieAddress = await validatorCharlie.getAddress();
  const doraAddress = await validatorDora.getAddress();
  const evanAddress = await validatorEvan.getAddress();

  const scenarioParticipants: ParticipantDescriptor[] = [
    { name: 'Nation B (Employer)', address: employerAddress, role: 'Nation' },
    { name: 'Bob (AI Agent)', address: agentAddress, role: 'Agent' },
    { name: 'Charlie (Validator)', address: charlieAddress, role: 'Validator' },
    { name: 'Dora (Validator)', address: doraAddress, role: 'Validator' },
    { name: 'Evan (Validator)', address: evanAddress, role: 'Validator' },
  ];
  const balancesBefore = await captureBalanceSnapshot(token, scenarioParticipants);
  const supplyBefore = await token.totalSupply();

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
  recordOwnerAction('Dispute fee waived for demonstration', `DisputeModule@${disputeAddress}`, 'setDisputeFee', {
    fee: 0,
  });
  await registry
    .connect(agentBob)
    ['raiseDispute(uint256,bytes32)'](jobId, ethers.id('ipfs://evidence/bob'));
  await dispute.connect(owner).setDisputeWindow(0);
  recordOwnerAction('Dispute window accelerated', `DisputeModule@${disputeAddress}`, 'setDisputeWindow', {
    window: 0,
  });
  await dispute.connect(owner).setModerator(ownerAddress, 1);
  recordOwnerAction('Owner enrolled as dispute moderator', `DisputeModule@${disputeAddress}`, 'setModerator', {
    moderator: ownerAddress,
    enabled: 1,
  });
  await dispute.connect(owner).setModerator(moderatorAddress, 1);
  recordOwnerAction('External moderator empowered', `DisputeModule@${disputeAddress}`, 'setModerator', {
    moderator: moderatorAddress,
    enabled: 1,
  });

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

  await showBalances('Post-dispute token balances', token, scenarioParticipants);

  const balancesAfter = await captureBalanceSnapshot(token, scenarioParticipants);
  const supplyAfter = await token.totalSupply();
  const burned = supplyBefore > supplyAfter ? supplyBefore - supplyAfter : 0n;
  const deltas = computeBalanceDeltas(
    balancesBefore,
    balancesAfter,
    scenarioParticipants
  );
  const agentDelta = findDeltaByAddress(deltas, agentAddress)?.delta ?? 0n;
  const employerDelta = findDeltaByAddress(deltas, employerAddress)?.delta ?? 0n;
  const validatorCredits = sumPositiveByRole(deltas, 'Validator');
  const validatorDebits = countNegativeByRole(deltas, 'Validator');
  if (agentDelta > 0n) {
    totalAgentPayouts += agentDelta;
  }
  if (validatorCredits > 0n) {
    totalValidatorPayouts += validatorCredits;
  }
  validatorsPenalized += validatorDebits;
  disputesResolved += 1;

  const payouts: ScenarioPayout[] = deltas.map((entry) => ({
    participant: entry.participant,
    delta: entry.formatted,
    direction: entry.direction,
  }));

  registerScenario(scenarioTitle, jobId, {
    employer: {
      name: 'Nation B (Employer)',
      address: employerAddress,
      role: 'Nation',
    },
    agent: {
      name: 'Bob (AI Agent)',
      address: agentAddress,
      role: 'Agent',
    },
    reward: formatTokens(reward),
    feePct: Number(feePct),
    disputeRaised: true,
    resolvedBy: 'Owner + moderator dispute council',
    highlights: [
      'Validators split votes; a non-revealing validator triggered automatic penalty logic.',
      'Agent exercised dispute rights and prevailed through multi-signature governance.',
      'Owner and delegated moderator executed signature-based resolution without halting the market.',
    ],
    payouts,
    metrics: [
      { label: 'Agent payout', value: formatSignedTokens(agentDelta) },
      {
        label: 'Employer spend',
        value: formatSignedTokens(employerDelta),
      },
      {
        label: 'Validator rewards',
        value: formatSignedTokens(validatorCredits),
      },
      {
        label: 'Validators penalized',
        value: validatorDebits > 0 ? `${validatorDebits}` : '0',
      },
      { label: 'Protocol fee', value: formatTokens(fee) },
      { label: 'Tokens burned', value: formatTokens(burned) },
    ],
  });
}

async function main(): Promise<void> {
  const env = await deployEnvironment();
  await showBalances('Initial treasury state', env.token, [
    { name: 'Nation A', address: await env.nationA.getAddress(), role: 'Nation' },
    { name: 'Nation B', address: await env.nationB.getAddress(), role: 'Nation' },
    { name: 'Alice (agent)', address: await env.agentAlice.getAddress(), role: 'Agent' },
    { name: 'Bob (agent)', address: await env.agentBob.getAddress(), role: 'Agent' },
    {
      name: 'Charlie (validator)',
      address: await env.validatorCharlie.getAddress(),
      role: 'Validator',
    },
    {
      name: 'Dora (validator)',
      address: await env.validatorDora.getAddress(),
      role: 'Validator',
    },
    {
      name: 'Evan (validator)',
      address: await env.validatorEvan.getAddress(),
      role: 'Validator',
    },
  ]);

  const ownerControl = await ownerCommandCenterDrill(env);

  await runHappyPath(env);
  await runDisputeScenario(env);
  const market = await summarizeMarketState(env);

  logSection('Demo complete – AGI Jobs v2 sovereignty market simulation finished');

  const totalValueSettled = totalAgentPayouts + totalValidatorPayouts;
  const ownerDrillOk =
    ownerControl.pauseDrill.owner.registry &&
    ownerControl.pauseDrill.owner.stake &&
    ownerControl.pauseDrill.owner.validation;
  const moderatorDrillOk =
    ownerControl.pauseDrill.moderator.registry &&
    ownerControl.pauseDrill.moderator.stake &&
    ownerControl.pauseDrill.moderator.validation;
  const baselineRestored = ownerParametersEqual(
    ownerControl.baseline,
    ownerControl.restored,
    ownerControl.ownerAddress
  );
  const pauserRestored =
    ownerControl.restored.registryPauser.toLowerCase() ===
      ownerControl.ownerAddress.toLowerCase() &&
    ownerControl.restored.stakePauser.toLowerCase() ===
      ownerControl.ownerAddress.toLowerCase() &&
    ownerControl.restored.validationPauser.toLowerCase() ===
      ownerControl.ownerAddress.toLowerCase();

  const ownerConfidenceChecks: string[] = [
    ownerDrillOk
      ? 'Owner drill: every core module paused and resumed under direct control.'
      : 'Owner drill incomplete: rerun pause checks before production.',
    moderatorDrillOk
      ? 'Delegated moderator drill succeeded, proving emergency delegation works.'
      : 'Delegated moderator drill incomplete: validate moderator credentials.',
    baselineRestored
      ? 'Baseline parameters restored to their pre-drill configuration.'
      : 'Baseline parameters drifted: review mission-control restore sequence.',
    pauserRestored
      ? 'Owner reclaimed pauser roles across registry, stake, and validation modules.'
      : 'Owner pauser roles not restored: rotate keys before mainnet.',
  ];
  const ownerConfidenceStatus =
    ownerDrillOk && moderatorDrillOk && baselineRestored && pauserRestored
      ? 'owner-in-command'
      : 'action-needed';
  const ownerConfidenceSummary =
    ownerConfidenceStatus === 'owner-in-command'
      ? 'Owner sovereignty rehearsed end-to-end. Emergency drills, parameter tuning, and restoration all completed successfully.'
      : 'Investigate the highlighted checks before promoting this configuration. The operator must regain full command authority.';

  const scoreboard: ScorecardEntry[] = [
    {
      label: 'Jobs orchestrated',
      value: market.totalJobs,
      explanation: 'Production contracts executed full job lifecycles on Hardhat.',
    },
    {
      label: 'Value settled',
      value: formatTokens(totalValueSettled),
      explanation: 'Agent and validator rewards transferred through escrow + fee mechanics.',
    },
    {
      label: 'Owner commands executed',
      value: ownerActions.length.toString(),
      explanation: 'Configuration, pause, and dispute instructions issued during the drill.',
    },
    {
      label: 'Certificates minted',
      value: market.mintedCertificates.length.toString(),
      explanation: 'Credential NFTs minted for agents that completed work.',
    },
    {
      label: 'Disputes resolved',
      value: disputesResolved.toString(),
      explanation: 'Jobs escalated to governance and settled via signed resolutions.',
    },
    {
      label: 'Validator accountability events',
      value: validatorsPenalized.toString(),
      explanation: 'Validators with penalties or withheld reveals during the simulation.',
    },
  ];

  const highlights: EmpowermentHighlight[] = [
    {
      title: 'Owner mission control',
      body: 'Fees, validator incentives, and emergency pausers were tuned live, delegated, and restored without downtime.',
      category: 'owner',
    },
    {
      title: 'Agent prosperity',
      body: `${formatTokens(totalAgentPayouts)} delivered to AI agents alongside certificate credentials.`,
      category: 'agent',
    },
    {
      title: 'Validator discipline',
      body: validatorsPenalized
        ? `${validatorsPenalized} validator penalty event(s) enforced automatically under the non-reveal policy.`
        : 'Validators met quorum without penalties in this run.',
      category: 'validator',
    },
    {
      title: 'Governance resilience',
      body: disputesResolved
        ? `${disputesResolved} dispute scenario(s) resolved via owner + moderator signatures, proving unstoppable arbitration.`
        : 'No disputes escalated this run — governance panel remains on standby.',
      category: 'market',
    },
  ];

  const quickStart: string[] = [
    'Install dependencies once with `npm install`.',
    'Run `npm run demo:agi-labor-market:dashboard` to execute the Hardhat simulation and launch the dashboard.',
    'Open the printed http://localhost:4173 URL to explore the sovereign control room.',
    'Use the Owner Command Snapshot to rehearse configuration changes before pushing to mainnet.',
  ];

  const empowerment: EmpowermentOverview = {
    scoreboard,
    highlights,
    ownerConfidence: {
      status: ownerConfidenceStatus,
      summary: ownerConfidenceSummary,
      checks: ownerConfidenceChecks,
    },
    quickStart,
  };

  if (exportPath) {
    const resolved = resolve(exportPath);
    mkdirSync(dirname(resolved), { recursive: true });
    const network = await ethers.provider.getNetwork();
    const payload: DemoExportPayload = {
      generatedAt: nowIso(),
      network: `${network.name ?? 'hardhat'} (chainId ${network.chainId})`,
      actors: env.actors,
      ownerActions,
      timeline,
      scenarios,
      market: {
        ...market,
        mintedCertificates: market.mintedCertificates.map((entry) => ({
          jobId: entry.jobId.toString(),
          owner: entry.owner,
          uri: entry.uri,
        })),
      },
      ownerControl,
      empowerment,
    };
    writeFileSync(resolved, JSON.stringify(payload, null, 2));
    console.log(`\n🗂️  Demo transcript exported to ${resolved}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
