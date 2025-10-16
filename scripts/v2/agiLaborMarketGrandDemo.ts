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
  | 'job-summary'
  | 'balance'
  | 'owner-action'
  | 'summary'
  | 'insight';

interface TimelineEntry {
  kind: TimelineKind;
  label: string;
  at: string;
  scenario?: string;
  meta?: Record<string, unknown>;
}

type InsightCategory = 'Owner' | 'Agents' | 'Validators' | 'Economy' | 'Disputes';

interface DemoInsight {
  category: InsightCategory;
  title: string;
  detail: string;
  at: string;
  meta?: Record<string, unknown>;
  timelineIndex?: number;
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

interface ScenarioExport {
  title: string;
  jobId: string;
  timelineIndices: number[];
}

interface PortfolioCertificate {
  jobId: string;
  uri?: string;
}

interface AgentPortfolioEntry {
  name: string;
  address: string;
  liquid: string;
  staked: string;
  locked: string;
  reputation: string;
  certificates: PortfolioCertificate[];
}

interface ValidatorPortfolioEntry {
  name: string;
  address: string;
  liquid: string;
  staked: string;
  locked: string;
  reputation: string;
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
  agentPortfolios: AgentPortfolioEntry[];
  validatorCouncil: ValidatorPortfolioEntry[];
}

interface PauseStatus {
  registry: boolean;
  stake: boolean;
  validation: boolean;
}

interface JobMetadataView {
  state?: number;
  success?: boolean;
  burnConfirmed?: boolean;
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
  drillCompletedAt: string;
}

type DirectivePriority = 'critical' | 'high' | 'normal';

interface AutomationDirective {
  id: string;
  title: string;
  summary: string;
  priority: DirectivePriority;
  recommendedAction?: string;
  metrics?: Record<string, string>;
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
    totalAgentStake: string;
    totalValidatorStake: string;
    pendingFees: string;
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

const timeline: TimelineEntry[] = [];
const ownerActions: OwnerActionRecord[] = [];
const scenarios: ScenarioExport[] = [];
let activeScenario: string | undefined;
const insights: DemoInsight[] = [];

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

function sanitizeMeta(
  meta?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }
  return sanitizeValue(meta) as Record<string, unknown>;
}

function toAddressKey(value: string): string {
  return value.toLowerCase();
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
  const entry: DemoInsight = {
    category,
    title,
    detail,
    at: timeline[timelineIndex].at,
    meta: sanitizedMeta,
    timelineIndex,
  };
  insights.push(entry);
  return timelineIndex;
}

function registerScenario(title: string, jobId: bigint): void {
  const timelineIndices = timeline
    .map((entry, index) => ({ entry, index }))
    .filter((item) => item.entry.scenario === title)
    .map((item) => item.index);
  scenarios.push({ title, jobId: jobId.toString(), timelineIndices });
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

function expectJobProgress(
  jobId: bigint,
  metadata: JobMetadataView,
  expectations: {
    context: string;
    state?: number;
    success?: boolean;
    burnConfirmed?: boolean;
  }
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
): Promise<AgentPortfolioEntry[]> {
  console.log('\n🤖 Agent portfolios');
  const entries: AgentPortfolioEntry[] = [];
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
  return entries;
}

async function logValidatorCouncil(
  env: DemoEnvironment
): Promise<ValidatorPortfolioEntry[]> {
  console.log('\n🛡️ Validator council status');
  const validatorsSummary: ValidatorPortfolioEntry[] = [];
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
  return validatorsSummary;
}

async function summarizeMarketState(
  env: DemoEnvironment
): Promise<MarketSummary> {
  logSection('Sovereign labour market telemetry dashboard');

  const highestJobId = await env.registry.nextJobId();
  const minted = await gatherCertificates(env.certificate, highestJobId);
  const totalJobs = highestJobId;
  console.log(`\n📈 Jobs orchestrated in this session: ${totalJobs.toString()}`);
  assert.strictEqual(
    minted.length,
    Number(totalJobs),
    'Each orchestrated job should mint a credential NFT in the demo run'
  );
  const [aliceAddress, bobAddress] = await Promise.all([
    env.agentAlice.getAddress(),
    env.agentBob.getAddress(),
  ]);
  assert.ok(
    minted.some(
      (entry) => entry.jobId === 1n && addressesEqual(entry.owner, aliceAddress)
    ),
    'Alice credential should be present in the minted certificate ledger'
  );
  assert.ok(
    minted.some(
      (entry) => entry.jobId === 2n && addressesEqual(entry.owner, bobAddress)
    ),
    'Bob credential should be present in the minted certificate ledger'
  );

  const finalSupply = await env.token.totalSupply();
  const burned = env.initialSupply > finalSupply ? env.initialSupply - finalSupply : 0n;
  assert.ok(
    finalSupply <= env.initialSupply,
    'Final supply should never exceed the initial minted supply'
  );
  assert.strictEqual(
    env.initialSupply - burned,
    finalSupply,
    'Burn accounting should reconcile initial and final supply'
  );
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

  const agentPortfolios = await logAgentPortfolios(env, minted);
  const validatorCouncil = await logValidatorCouncil(env);

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
    agentPortfolios,
    validatorCouncil,
  };

  recordTimeline('summary', 'Market telemetry dashboard', {
    ...summary,
    mintedCertificates: summary.mintedCertificates.map((entry) => ({
      jobId: entry.jobId.toString(),
      owner: entry.owner,
      uri: entry.uri,
    })),
    agentPortfolios: summary.agentPortfolios,
    validatorCouncil: summary.validatorCouncil,
  });
  recordInsight(
    'Economy',
    'Market telemetry verified end-to-end',
    'Fee pool balances, burn accounting, and credential issuance matched the sovereign market invariants.',
    {
      totalJobs: summary.totalJobs,
      totalBurned: summary.totalBurned,
      pendingFees: summary.pendingFees,
    }
  );
  return summary;
}

function computeResilienceScore(context: {
  ownerControl: OwnerControlSnapshot;
  mintedCertificates: number;
  scenarios: ScenarioExport[];
  ownerActionCount: number;
  insights: DemoInsight[];
}): { resilienceScore: number; unstoppableScore: number } {
  let score = 40;
  const { ownerControl } = context;
  const ownerDrill = ownerControl.pauseDrill.owner;
  const moderatorDrill = ownerControl.pauseDrill.moderator;
  if (ownerDrill.registry && ownerDrill.stake && ownerDrill.validation) {
    score += 18;
  }
  if (moderatorDrill.registry && moderatorDrill.stake && moderatorDrill.validation) {
    score += 12;
  }
  if (context.mintedCertificates >= 2) {
    score += 10;
  }
  if (context.scenarios.length >= 2) {
    score += 6;
  }
  if (context.ownerActionCount >= 40) {
    score += 6;
  }
  if (context.insights.some((entry) => entry.category === 'Disputes')) {
    score += 8;
  }
  if (context.insights.some((entry) => entry.category === 'Economy')) {
    score += 4;
  }
  const resilienceScore = Math.min(100, score);
  const unstoppableScore = Math.min(100, resilienceScore + 4);
  return { resilienceScore, unstoppableScore };
}

function buildAutomationPlan(
  env: DemoEnvironment,
  market: MarketSummary,
  ownerControl: OwnerControlSnapshot,
  context: { scenarios: ScenarioExport[]; ownerActions: OwnerActionRecord[]; insights: DemoInsight[]; timeline: TimelineEntry[] }
): AutomationPlaybook {
  const mintedCount = market.mintedCertificates.length;
  const { resilienceScore, unstoppableScore } = computeResilienceScore({
    ownerControl,
    mintedCertificates: mintedCount,
    scenarios: context.scenarios,
    ownerActionCount: context.ownerActions.length,
    insights: context.insights,
  });

  const actorNameByAddress = new Map(
    env.actors.map((actor) => [toAddressKey(actor.address), actor.name])
  );

  const ownerDirectives: AutomationDirective[] = [
    {
      id: 'branch-protection',
      title: 'Lock CI v2 branch protection',
      summary:
        'Run the branch protection verifier so every pull request is blocked unless the CI summary gate and its upstream jobs succeed.',
      priority: 'critical',
      recommendedAction: 'npm run ci:verify-branch-protection -- --branch main',
      metrics: {
        requiredContexts:
          'Lint & static checks · Tests · Foundry · Coverage thresholds · CI summary',
      },
    },
    {
      id: 'mission-drill',
      title: 'Replay sovereign mission control drill',
      summary:
        'Re-run the Hardhat automation to reconfirm fee, burn, quorum, and pause powers any time parameters change or new validators onboard.',
      priority: 'high',
      recommendedAction: 'npm run demo:agi-labor-market:control-room',
      metrics: {
        lastDrill: ownerControl.drillCompletedAt,
        delegatedPauser: ownerControl.upgraded.registryPauser,
      },
    },
    {
      id: 'owner-dashboard',
      title: 'Refresh owner telemetry dashboard',
      summary:
        'Publish the owner dashboard so stakeholders see the same unstoppable controls showcased in this run.',
      priority: 'normal',
      recommendedAction: 'npm run owner:dashboard',
      metrics: {
        burnPct: `${ownerControl.restored.burnPct}%`,
        validatorReward: `${ownerControl.restored.validatorRewardPct}%`,
      },
    },
  ];

  const agentOpportunities: AutomationDirective[] =
    market.mintedCertificates.length === 0
      ? [
          {
            id: 'replay-demo',
            title: 'Replay scenarios to mint credentials',
            summary:
              'Run the export to mint cooperative and disputed credentials so agents can showcase verifiable work.',
            priority: 'high',
            recommendedAction: 'npm run demo:agi-labor-market:export',
          },
        ]
      : market.mintedCertificates.map((certificate) => {
          const holder =
            actorNameByAddress.get(toAddressKey(certificate.owner)) ||
            certificate.owner;
          return {
            id: `certificate-${certificate.jobId.toString()}`,
            title: `Credential #${certificate.jobId.toString()} in circulation`,
            summary: `${holder} can reuse this credential to unlock premium sovereign mandates and accelerated onboarding.`,
            priority: 'normal',
            metrics: {
              holder,
              reference: certificate.uri ?? 'on-chain metadata',
            },
          };
        });

  const validatorSignals: AutomationDirective[] = [
    {
      id: 'non-reveal-penalty',
      title: 'Enforce non-reveal discipline',
      summary:
        'Validators that skip reveals are automatically slashed and banned; keep the penalty active before onboarding larger councils.',
      priority: 'high',
      recommendedAction: 'npm run owner:pulse',
      metrics: {
        penalty: `${ownerControl.restored.nonRevealPenaltyBps} bps`,
        banDuration: `${ownerControl.restored.nonRevealBanBlocks} blocks`,
      },
    },
    {
      id: 'validator-reputation',
      title: 'Review validator reputation and liquidity',
      summary:
        'Monitor validator liquidity and locked stake to keep dispute resolution credible and unstoppable.',
      priority: 'normal',
      metrics: {
        councilSize: market.validatorCouncil.length.toString(),
        totalValidatorStake: market.totalValidatorStake,
      },
    },
  ];

  const treasuryAlerts: AutomationDirective[] = [
    {
      id: 'fee-distribution',
      title: 'Distribute pending protocol fees',
      summary:
        'Route pending fees to the treasury and validator pool so burn accounting and validator incentives stay perfectly balanced.',
      priority: 'high',
      recommendedAction: 'npm run owner:dashboard',
      metrics: {
        pendingFees: market.pendingFees,
        burnRate: `${ownerControl.restored.burnPct}%`,
      },
    },
    {
      id: 'stake-depth',
      title: 'Safeguard stake depth',
      summary:
        'Keep agent and validator capital above the baseline so the unstoppable labour market retains immediate settlement capacity.',
      priority: 'normal',
      metrics: {
        agentStake: market.totalAgentStake,
        validatorStake: market.totalValidatorStake,
      },
    },
  ];

  const automation: AutomationPlaybook = {
    headline: 'Autonomous labour market mission control is online',
    missionSummary:
      'The sovereign AGI labour market proved it can be paused, tuned, disputed, and relaunched instantly — even non-technical owners command it through scripted drills and a live control room.',
    resilienceScore,
    unstoppableScore,
    autopilot: {
      ownerDirectives,
      agentOpportunities,
      validatorSignals,
      treasuryAlerts,
    },
    telemetry: {
      totalJobs: market.totalJobs,
      mintedCertificates: mintedCount,
      totalBurned: market.totalBurned,
      finalSupply: market.finalSupply,
      totalAgentStake: market.totalAgentStake,
      totalValidatorStake: market.totalValidatorStake,
      pendingFees: market.pendingFees,
    },
    verification: {
      requiredChecks: [
        'ci (v2) / Lint & static checks',
        'ci (v2) / Tests',
        'ci (v2) / Foundry',
        'ci (v2) / Coverage thresholds',
        'ci (v2) / CI summary',
      ],
      docs: [
        'docs/v2-ci-operations.md',
        'docs/ci-v2-branch-protection-checklist.md',
        'demo/agi-labor-market-grand-demo/README.md',
      ],
      recommendedCommands: [
        'npm run ci:verify-branch-protection -- --branch main',
        'npm run demo:agi-labor-market:export',
        'npm run demo:agi-labor-market:control-room',
      ],
      lastUpdated: nowIso(),
    },
    commands: {
      replayDemo: 'npm run demo:agi-labor-market',
      exportTranscript: 'npm run demo:agi-labor-market:export',
      launchControlRoom: 'npm run demo:agi-labor-market:control-room',
      ownerDashboard: 'npm run owner:dashboard',
    },
  };

  recordTimeline('summary', 'Autonomous mission control plan generated', {
    resilienceScore,
    unstoppableScore,
    directives: {
      owner: ownerDirectives.length,
      agents: agentOpportunities.length,
      validators: validatorSignals.length,
      treasury: treasuryAlerts.length,
    },
  });
  recordInsight(
    'Owner',
    'Autonomous control plan ready for execution',
    'A machine-readable playbook now prescribes owner commands, validator discipline, treasury distribution, and CI guardrails.',
    {
      resilienceScore,
      unstoppableScore,
    }
  );

  return automation;
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
  recordInsight(
    'Economy',
    'Actors funded with sovereign AGIα liquidity',
    `Seeded ${formatTokens(
      mintAmount
    )} to every employer, agent, and validator so the labour market simulation mirrors production runway balances.`,
    {
      perActor: formatTokens(mintAmount),
      participants: [
        nationAAddress,
        nationBAddress,
        aliceAddress,
        bobAddress,
        charlieAddress,
        doraAddress,
        evanAddress,
      ],
    }
  );

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
  assert.strictEqual(
    Number(await registry.feePct()),
    upgradedFeePct,
    'Registry fee pct should reflect owner command'
  );
  recordOwnerAction('Protocol fee temporarily increased', `JobRegistry@${registryAddress}`, 'setFeePct', {
    previous: previousFeePct,
    pct: upgradedFeePct,
  });
  await registry.connect(owner).setValidatorRewardPct(upgradedValidatorReward);
  assert.strictEqual(
    Number(await registry.validatorRewardPct()),
    upgradedValidatorReward,
    'Validator reward pct should update immediately'
  );
  recordOwnerAction('Validator rewards boosted', `JobRegistry@${registryAddress}`, 'setValidatorRewardPct', {
    previous: previousValidatorReward,
    pct: upgradedValidatorReward,
  });
  await feePool.connect(owner).setBurnPct(upgradedBurnPct);
  assert.strictEqual(
    Number(await feePool.burnPct()),
    upgradedBurnPct,
    'Fee pool burn pct should update immediately'
  );
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
  assert.strictEqual(
    await validation.commitWindow(),
    upgradedCommitWindow,
    'Commit window should match owner configuration'
  );
  assert.strictEqual(
    await validation.revealWindow(),
    upgradedRevealWindow,
    'Reveal window should match owner configuration'
  );
  recordOwnerAction('Commit/reveal windows extended', `ValidationModule@${validationAddress}`, 'setCommitRevealWindows', {
    previousCommitWindow: formatSeconds(originalCommitWindow),
    previousRevealWindow: formatSeconds(originalRevealWindow),
    commitWindow: formatSeconds(upgradedCommitWindow),
    revealWindow: formatSeconds(upgradedRevealWindow),
  });
  await validation
    .connect(owner)
    .setRevealQuorum(upgradedRevealQuorumPct, upgradedMinRevealers);
  assert.strictEqual(
    Number(await validation.revealQuorumPct()),
    upgradedRevealQuorumPct,
    'Reveal quorum pct should reflect owner update'
  );
  assert.strictEqual(
    Number(await validation.minRevealValidators()),
    upgradedMinRevealers,
    'Minimum revealers should reflect owner update'
  );
  recordOwnerAction('Reveal quorum tightened', `ValidationModule@${validationAddress}`, 'setRevealQuorum', {
    previousPct: originalRevealQuorumPct,
    previousMinRevealers: originalMinRevealers,
    pct: upgradedRevealQuorumPct,
    minRevealers: upgradedMinRevealers,
  });
  await validation
    .connect(owner)
    .setNonRevealPenalty(upgradedNonRevealPenaltyBps, upgradedNonRevealBanBlocks);
  assert.strictEqual(
    Number(await validation.nonRevealPenaltyBps()),
    upgradedNonRevealPenaltyBps,
    'Non-reveal penalty basis points should reflect owner update'
  );
  assert.strictEqual(
    Number(await validation.nonRevealBanBlocks()),
    upgradedNonRevealBanBlocks,
    'Non-reveal ban duration should reflect owner update'
  );
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
  assert.strictEqual(
    await registry.pauser(),
    moderatorAddress,
    'Moderator should gain registry pause authority'
  );
  recordOwnerAction('Registry pauser delegated', `JobRegistry@${registryAddress}`, 'setPauser', {
    newPauser: moderatorAddress,
  });
  await stake.connect(owner).setPauser(moderatorAddress);
  assert.strictEqual(
    await stake.pauser(),
    moderatorAddress,
    'Moderator should gain stake pause authority'
  );
  recordOwnerAction('Stake manager pauser delegated', `StakeManager@${stakeAddress}`, 'setPauser', {
    newPauser: moderatorAddress,
  });
  await validation.connect(owner).setPauser(moderatorAddress);
  assert.strictEqual(
    await validation.pauser(),
    moderatorAddress,
    'Moderator should gain validation pause authority'
  );
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
  assert.deepStrictEqual(
    ownerPauseStatus,
    { registry: true, stake: true, validation: true },
    'Owner should be able to pause all modules'
  );
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
  assert.strictEqual(await registry.paused(), false, 'Registry should resume after owner drill');
  assert.strictEqual(await stake.paused(), false, 'Stake manager should resume after owner drill');
  assert.strictEqual(await validation.paused(), false, 'Validation should resume after owner drill');

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
  assert.deepStrictEqual(
    moderatorPauseStatus,
    { registry: true, stake: true, validation: true },
    'Delegated moderator should be able to pause all modules'
  );
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
  assert.strictEqual(await registry.paused(), false, 'Registry should resume after moderator drill');
  assert.strictEqual(await stake.paused(), false, 'Stake manager should resume after moderator drill');
  assert.strictEqual(await validation.paused(), false, 'Validation should resume after moderator drill');

  console.log('   Emergency controls verified and reset to active state.');

  const upgraded = await readOwnerControlParameters(
    registry,
    validation,
    feePool,
    stake
  );
  assert.strictEqual(upgraded.feePct, upgradedFeePct, 'Upgraded fee pct should be recorded');
  assert.strictEqual(
    upgraded.validatorRewardPct,
    upgradedValidatorReward,
    'Upgraded validator reward should be recorded'
  );
  assert.strictEqual(upgraded.burnPct, upgradedBurnPct, 'Upgraded burn pct should be recorded');
  assert.strictEqual(
    upgraded.commitWindowSeconds,
    Number(upgradedCommitWindow),
    'Upgraded commit window should be recorded'
  );
  assert.strictEqual(
    upgraded.revealWindowSeconds,
    Number(upgradedRevealWindow),
    'Upgraded reveal window should be recorded'
  );
  assert.strictEqual(
    upgraded.revealQuorumPct,
    upgradedRevealQuorumPct,
    'Upgraded reveal quorum should be recorded'
  );
  assert.strictEqual(
    upgraded.minRevealers,
    upgradedMinRevealers,
    'Upgraded minimum revealers should be recorded'
  );
  assert.strictEqual(
    upgraded.nonRevealPenaltyBps,
    upgradedNonRevealPenaltyBps,
    'Upgraded non-reveal penalty should be recorded'
  );
  assert.strictEqual(
    upgraded.nonRevealBanBlocks,
    upgradedNonRevealBanBlocks,
    'Upgraded non-reveal ban blocks should be recorded'
  );
  assert.strictEqual(
    upgraded.registryPauser,
    moderatorAddress,
    'Moderator should remain delegated during upgraded state'
  );
  assert.strictEqual(
    upgraded.stakePauser,
    moderatorAddress,
    'Moderator should control stake manager during upgraded state'
  );
  assert.strictEqual(
    upgraded.validationPauser,
    moderatorAddress,
    'Moderator should control validation during upgraded state'
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
  assert.strictEqual(restored.feePct, previousFeePct, 'Fee pct should return to baseline');
  assert.strictEqual(
    restored.validatorRewardPct,
    previousValidatorReward,
    'Validator reward should return to baseline'
  );
  assert.strictEqual(restored.burnPct, previousBurnPct, 'Burn pct should return to baseline');
  assert.strictEqual(
    restored.commitWindowSeconds,
    baseline.commitWindowSeconds,
    'Commit window should return to baseline'
  );
  assert.strictEqual(
    restored.revealWindowSeconds,
    baseline.revealWindowSeconds,
    'Reveal window should return to baseline'
  );
  assert.strictEqual(
    restored.revealQuorumPct,
    baseline.revealQuorumPct,
    'Reveal quorum should return to baseline'
  );
  assert.strictEqual(
    restored.minRevealers,
    baseline.minRevealers,
    'Minimum revealers should return to baseline'
  );
  assert.strictEqual(
    restored.nonRevealPenaltyBps,
    baseline.nonRevealPenaltyBps,
    'Non-reveal penalty should return to baseline'
  );
  assert.strictEqual(
    restored.nonRevealBanBlocks,
    baseline.nonRevealBanBlocks,
    'Non-reveal ban duration should return to baseline'
  );
  assert.strictEqual(restored.registryPauser, ownerAddress, 'Owner should reclaim registry pause power');
  assert.strictEqual(restored.stakePauser, ownerAddress, 'Owner should reclaim stake pause power');
  assert.strictEqual(restored.validationPauser, ownerAddress, 'Owner should reclaim validation pause power');
  recordTimeline('summary', 'Owner mission control baseline restored', {
    ...restored,
    commitWindow: restored.commitWindowFormatted,
    revealWindow: restored.revealWindowFormatted,
  });
  recordInsight(
    'Owner',
    'Owner executed full-spectrum command drill',
    'Protocol fees, validator incentives, burn cadence, and emergency pause delegates were adjusted, rehearsed, and restored without incident.',
    {
      upgradedFeePct,
      upgradedValidatorReward,
      upgradedBurnPct,
      delegatedPauser: moderatorAddress,
    }
  );

  console.log(
    `   Commit/reveal cadence restored for the upcoming scenarios: ${restored.commitWindowFormatted} / ${restored.revealWindowFormatted}`
  );

  const drillCompletedAt = nowIso();
  recordTimeline('summary', 'Owner command drill sealed', {
    drillCompletedAt,
    delegatedPauser: moderatorAddress,
  });

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
    drillCompletedAt,
  };
}

async function logJobSummary(
  registry: ethers.Contract,
  jobId: bigint,
  context: string
): Promise<JobMetadataView> {
  const job = await registry.jobs(jobId);
  const metadata = decodeJobMetadata(job.packedMetadata) as JobMetadataView;
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
  return metadata;
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
    certificate,
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
  const createdMetadata = await logJobSummary(registry, jobId, 'after posting');
  expectJobProgress(jobId, createdMetadata, {
    context: 'after posting',
    state: 1,
    success: false,
    burnConfirmed: false,
  });

  logStep('Alice stakes identity and applies through the emergency allowlist');
  await registry.connect(agentAlice).applyForJob(jobId, 'alice', []);
  const appliedMetadata = await logJobSummary(
    registry,
    jobId,
    'after agent assignment'
  );
  expectJobProgress(jobId, appliedMetadata, {
    context: 'after agent assignment',
    state: 2,
    success: false,
    burnConfirmed: false,
  });

  logStep('Alice submits validated deliverables with provable IPFS evidence');
  const resultUri = 'ipfs://results/climate-success';
  const resultHash = ethers.id(resultUri);
  await registry
    .connect(agentAlice)
    .submit(jobId, resultHash, resultUri, 'alice', []);
  const submittedMetadata = await logJobSummary(
    registry,
    jobId,
    'after submission'
  );
  expectJobProgress(jobId, submittedMetadata, {
    context: 'after submission',
    state: 3,
    success: false,
    burnConfirmed: false,
  });

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
  const completedMetadata = await logJobSummary(
    registry,
    jobId,
    'after validator finalize'
  );
  expectJobProgress(jobId, completedMetadata, {
    context: 'after validator finalize',
    state: 4,
    success: true,
    burnConfirmed: true,
  });

  logStep('Nation A finalizes payment, rewarding Alice and the validator cohort');
  await registry.connect(nationA).finalize(jobId);
  const finalizedMetadata = await logJobSummary(
    registry,
    jobId,
    'after treasury settlement'
  );
  expectJobProgress(jobId, finalizedMetadata, {
    context: 'after treasury settlement',
    state: 6,
    success: true,
    burnConfirmed: true,
  });
  const certificateOwner = await certificate.ownerOf(jobId);
  const aliceAddress = await agentAlice.getAddress();
  assert.ok(
    addressesEqual(certificateOwner, aliceAddress),
    'Alice should receive the credential NFT for the cooperative scenario'
  );

  const participants = [
    { name: 'Nation A', address: employerAddr },
    { name: 'Alice (agent)', address: await agentAlice.getAddress() },
    { name: 'Charlie (validator)', address: await validatorCharlie.getAddress() },
    { name: 'Dora (validator)', address: await validatorDora.getAddress() },
    { name: 'Evan (validator)', address: await validatorEvan.getAddress() },
  ];
  await showBalances('Post-job token balances', token, participants);

  const nftBalance = await certificate.balanceOf(await agentAlice.getAddress());
  assert.strictEqual(
    nftBalance,
    1n,
    'Alice should hold a single credential NFT after the cooperative scenario'
  );
  console.log(`\n🏅 Alice now holds ${nftBalance} certificate NFT(s).`);
  registerScenario(scenarioTitle, jobId);
  recordInsight(
    'Agents',
    'Cooperative climate coalition completed flawlessly',
    'Nation A, Alice, and the validator council finalized the coordination mandate with unanimous approval and credential issuance.',
    {
      jobId: jobId.toString(),
      reward: formatTokens(reward),
      validators: validators.length,
    }
  );
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
    certificate,
  } = env;

  const reward = ethers.parseUnits('180', AGIALPHA_DECIMALS);
  const feePct = await registry.feePct();
  const fee = (reward * BigInt(feePct)) / 100n;
  const disputeAddress = await dispute.getAddress();
  const ownerAddress = await owner.getAddress();
  const moderatorAddress = await moderator.getAddress();

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
  const createdMetadata = await logJobSummary(registry, jobId, 'after posting');
  expectJobProgress(jobId, createdMetadata, {
    context: 'after posting',
    state: 1,
    success: false,
    burnConfirmed: false,
  });

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
  const disputedMetadata = await logJobSummary(
    registry,
    jobId,
    'after partial quorum'
  );
  expectJobProgress(jobId, disputedMetadata, {
    context: 'after partial quorum',
    state: 5,
    success: false,
    burnConfirmed: true,
  });

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
  const finalizedMetadata = await logJobSummary(
    registry,
    jobId,
    'after dispute resolution'
  );
  expectJobProgress(jobId, finalizedMetadata, {
    context: 'after dispute resolution',
    state: 6,
    success: true,
    burnConfirmed: true,
  });
  const certificateOwner = await certificate.ownerOf(jobId);
  const bobAddress = await agentBob.getAddress();
  assert.ok(
    addressesEqual(certificateOwner, bobAddress),
    'Bob should receive the credential NFT after dispute resolution'
  );
  assert.strictEqual(
    await certificate.balanceOf(bobAddress),
    1n,
    'Bob should hold a single credential NFT after dispute resolution'
  );

  const participants = [
    { name: 'Nation B', address: await nationB.getAddress() },
    { name: 'Bob (agent)', address: await agentBob.getAddress() },
    { name: 'Charlie (validator)', address: await validatorCharlie.getAddress() },
    { name: 'Dora (validator)', address: await validatorDora.getAddress() },
    { name: 'Evan (validator)', address: await validatorEvan.getAddress() },
  ];
  await showBalances('Post-dispute token balances', token, participants);
  registerScenario(scenarioTitle, jobId);
  recordInsight(
    'Disputes',
    'Dispute resolution rewarded Bob and disciplined validators',
    'Owner governance waived dispute fees, moderators co-signed the verdict, and the validator who withheld their reveal was slashed while Bob still graduated.',
    {
      jobId: jobId.toString(),
      reward: formatTokens(reward),
      revealers: approvals.filter(Boolean).length,
      nonRevealPenaltyBps: await validation.nonRevealPenaltyBps(),
    }
  );
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

  const ownerControl = await ownerCommandCenterDrill(env);

  await runHappyPath(env);
  await runDisputeScenario(env);
  const market = await summarizeMarketState(env);
  const automation = buildAutomationPlan(env, market, ownerControl, {
    scenarios,
    ownerActions,
    insights,
    timeline,
  });

  logSection('Demo complete – AGI Jobs v2 sovereignty market simulation finished');

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
      insights: insights.map((entry) => ({
        ...entry,
        meta: entry.meta,
      })),
      automation,
    };
    writeFileSync(resolved, JSON.stringify(payload, null, 2));
    console.log(`\n🗂️  Demo transcript exported to ${resolved}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
