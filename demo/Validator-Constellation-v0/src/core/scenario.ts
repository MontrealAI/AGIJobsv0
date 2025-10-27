import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ValidatorConstellationDemo } from './constellation';
import { EnsLeaf } from './ens';
import {
  AgentAction,
  DemoOrchestrationReport,
  DomainConfig,
  GovernanceParameters,
  Hex,
  JobResult,
  NodeIdentity,
  PauseRecord,
  ValidatorIdentity,
  VoteValue,
} from './types';
import {
  demoJobBatch,
  defaultDomains,
  defaultGovernance,
  DEFAULT_BEACON_ENTROPY,
  DEFAULT_ONCHAIN_ENTROPY,
  DEFAULT_SENTINEL_GRACE_RATIO,
  DEFAULT_VERIFIER_KEY,
  demoLeaves,
} from './fixtures';
import { ReportContext } from './reporting';

interface ScenarioValidatorConfig {
  ens: string;
  address: Hex;
  stake: string | number | bigint;
}

interface ScenarioAgentConfig {
  ens: string;
  address: Hex;
  domainId: string;
  budget: string | number | bigint;
}

interface ScenarioNodeConfig {
  ens: string;
  address: Hex;
}

interface ScenarioDomainConfig {
  id: string;
  humanName: string;
  budgetLimit: string | number | bigint;
  unsafeOpcodes?: string[];
}

interface ScenarioJobConfig {
  domainId?: string;
  round?: number;
  truthfulVote?: VoteValue;
  committeeSignature?: string | number | bigint;
  count?: number;
  results?: JobResult[];
}

interface ScenarioOverrides {
  voteByEns?: Record<string, VoteValue>;
  voteByAddress?: Record<string, VoteValue>;
  nonRevealValidators?: string[];
}

interface BudgetOverrunAnomaly {
  kind: 'budget-overrun';
  agentEns: string;
  amount: string | number | bigint;
  budgetOverride?: string | number | bigint;
  domainId?: string;
  description?: string;
}

interface UnsafeOpcodeAnomaly {
  kind: 'unsafe-opcode';
  agentEns: string;
  opcode: string;
  amount?: string | number | bigint;
  domainId?: string;
  description?: string;
  target?: string;
}

export type ScenarioAnomaly = BudgetOverrunAnomaly | UnsafeOpcodeAnomaly;

interface ScenarioOwnerActions {
  updateEntropy?: Partial<{ onChainEntropy: string | number | bigint; recentBeacon: string | number | bigint }>;
  updateZkKey?: Hex;
  updateSentinel?: { budgetGraceRatio?: number };
  updateGovernance?: Partial<GovernanceParameters>;
  updateDomainSafety?: Array<{ domainId: string; humanName?: string; budgetLimit?: string | number | bigint; unsafeOpcodes?: string[] }>;
  pauseDomains?: Array<{ domainId: string; reason: string; triggeredBy?: string }>;
  resumeDomains?: Array<{ domainId: string; triggeredBy?: string }>;
  setAgentBudgets?: Array<{ ens: string; budget: string | number | bigint }>;
}

export interface ScenarioConfig {
  name?: string;
  description?: string;
  baseSetup?: {
    governance?: Partial<GovernanceParameters>;
    sentinelGraceRatio?: number;
    verifyingKey?: Hex;
    onChainEntropy?: Hex;
    recentBeacon?: Hex;
  };
  domains?: ScenarioDomainConfig[];
  validators: ScenarioValidatorConfig[];
  agents?: ScenarioAgentConfig[];
  nodes?: ScenarioNodeConfig[];
  ensRegistry?: Array<{ ens: string; address: Hex }>;
  job?: ScenarioJobConfig;
  overrides?: ScenarioOverrides;
  anomalies?: ScenarioAnomaly[];
  ownerActions?: ScenarioOwnerActions;
  context?: Record<string, unknown>;
}

interface ScenarioPlan {
  round: number;
  truthfulVote: VoteValue;
  jobBatch: JobResult[];
  committeeSignature: Hex;
  voteOverrides?: Record<string, VoteValue>;
  nonRevealValidators?: Hex[];
  anomalies?: AgentAction[];
}

interface ScenarioContextBase {
  verifyingKey: Hex;
  entropyBefore: { onChainEntropy: Hex; recentBeacon: Hex };
  entropyAfter: { onChainEntropy: Hex; recentBeacon: Hex };
  governance: GovernanceParameters;
  sentinelGraceRatio: number;
  maintenance?: { pause?: PauseRecord; resume?: PauseRecord };
  scenarioName?: string;
  ownerNotes?: Record<string, unknown>;
  jobSample?: JobResult[];
  updatedSafety?: DomainConfig;
  primaryDomainId: string;
  nodesRegistered: NodeIdentity[];
}

export interface PreparedScenario {
  demo: ValidatorConstellationDemo;
  plan: ScenarioPlan;
  context: ScenarioContextBase;
}

export interface ExecutedScenario {
  demo: ValidatorConstellationDemo;
  report: DemoOrchestrationReport;
  context: ReportContext;
}

const HEX_PATTERN = /^0x[0-9a-fA-F]+$/;

function parseBigint(value: string | number | bigint, field: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`invalid numeric value for ${field}`);
    }
    return BigInt(Math.trunc(value));
  }
  const sanitized = value.replace(/_/g, '').trim();
  if (sanitized.length === 0) {
    throw new Error(`empty numeric value for ${field}`);
  }
  if (sanitized.startsWith('0x') || sanitized.startsWith('0X')) {
    return BigInt(sanitized);
  }
  return BigInt(sanitized);
}

function ensureHex(value: string, field: string): Hex {
  if (!HEX_PATTERN.test(value)) {
    throw new Error(`expected hex string for ${field}`);
  }
  return value as Hex;
}

function normalizeHexInput(value: string | number | bigint, field: string, expectedBytes?: number): Hex {
  if (typeof value === 'string') {
    return ensureHex(value, field);
  }
  const bigintValue = typeof value === 'bigint' ? value : BigInt(value);
  let hex = bigintValue.toString(16);
  if (expectedBytes) {
    hex = hex.padStart(expectedBytes * 2, '0');
  } else if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return ensureHex(`0x${hex}`, field);
}

function normalizeEns(name: string): string {
  return name.trim().toLowerCase();
}

function dedupeLeaves(leaves: EnsLeaf[]): EnsLeaf[] {
  const map = new Map<string, EnsLeaf>();
  for (const leaf of leaves) {
    const normalized = normalizeEns(leaf.ensName);
    if (map.has(normalized)) {
      const existing = map.get(normalized)!;
      if (existing.owner !== leaf.owner) {
        throw new Error(`conflicting ENS ownership for ${leaf.ensName}`);
      }
      continue;
    }
    map.set(normalized, leaf);
  }
  return Array.from(map.values());
}

function resolveVoteOverrides(
  overrides: ScenarioOverrides | undefined,
  validators: Map<string, ValidatorIdentity>,
): Record<string, VoteValue> | undefined {
  if (!overrides) {
    return undefined;
  }
  const mapping: Record<string, VoteValue> = {};
  if (overrides.voteByEns) {
    for (const [ens, vote] of Object.entries(overrides.voteByEns)) {
      const validator = validators.get(normalizeEns(ens));
      if (!validator) {
        throw new Error(`override references unknown validator ENS ${ens}`);
      }
      mapping[validator.address] = vote;
    }
  }
  if (overrides.voteByAddress) {
    for (const [address, vote] of Object.entries(overrides.voteByAddress)) {
      mapping[ensureHex(address, 'vote override address')] = vote;
    }
  }
  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function resolveNonReveal(
  overrides: ScenarioOverrides | undefined,
  validators: Map<string, ValidatorIdentity>,
): Hex[] | undefined {
  if (!overrides?.nonRevealValidators) {
    return undefined;
  }
  const resolved: Hex[] = [];
  for (const entry of overrides.nonRevealValidators) {
    if (HEX_PATTERN.test(entry)) {
      resolved.push(entry as Hex);
      continue;
    }
    const validator = validators.get(normalizeEns(entry));
    if (!validator) {
      throw new Error(`non-reveal entry references unknown validator ${entry}`);
    }
    resolved.push(validator.address);
  }
  return resolved.length > 0 ? resolved : undefined;
}

function buildAnomalies(
  anomalies: ScenarioAnomaly[] | undefined,
  agents: Map<string, ReturnType<ValidatorConstellationDemo['registerAgent']>>,
): AgentAction[] | undefined {
  if (!anomalies || anomalies.length === 0) {
    return undefined;
  }
  const actions: AgentAction[] = [];
  for (const anomaly of anomalies) {
    const agent = agents.get(normalizeEns(anomaly.agentEns));
    if (!agent) {
      throw new Error(`anomaly references unknown agent ${anomaly.agentEns}`);
    }
    if (anomaly.kind === 'budget-overrun') {
      const budget =
        anomaly.budgetOverride !== undefined
          ? parseBigint(anomaly.budgetOverride, `budget override for ${anomaly.agentEns}`)
          : agent.budget;
      const overspend = parseBigint(anomaly.amount, `overspend amount for ${anomaly.agentEns}`);
      actions.push({
        agent: { ...agent, budget },
        domainId: anomaly.domainId ?? agent.domainId,
        type: 'TRANSFER',
        amountSpent: overspend,
        description: anomaly.description ?? 'config-driven budget overrun',
      });
      continue;
    }
    const spend =
      anomaly.amount !== undefined ? parseBigint(anomaly.amount, `opcode spend for ${anomaly.agentEns}`) : 0n;
    actions.push({
      agent: { ...agent },
      domainId: anomaly.domainId ?? agent.domainId,
      type: 'CALL',
      amountSpent: spend,
      description: anomaly.description ?? `opcode ${anomaly.opcode} invocation`,
      opcode: anomaly.opcode,
      target: anomaly.target,
    });
  }
  return actions;
}

function materializeDomains(config?: ScenarioDomainConfig[]): DomainConfig[] {
  if (!config || config.length === 0) {
    return defaultDomains();
  }
  return config.map((domain) => ({
    id: domain.id,
    humanName: domain.humanName,
    budgetLimit: parseBigint(domain.budgetLimit, `budget for ${domain.id}`),
    unsafeOpcodes: new Set(domain.unsafeOpcodes ?? []),
  }));
}

function mergeGovernance(partial?: Partial<GovernanceParameters>): GovernanceParameters {
  const base = defaultGovernance();
  if (!partial) {
    return base;
  }
  const merged: GovernanceParameters = { ...base };
  for (const [key, value] of Object.entries(partial)) {
    const castKey = key as keyof GovernanceParameters;
    if (value !== undefined) {
      merged[castKey] = value as number;
    }
  }
  return merged;
}

function collectLeaves(config: ScenarioConfig): EnsLeaf[] {
  const leaves: EnsLeaf[] = [];
  for (const leaf of config.ensRegistry ?? []) {
    leaves.push({ ensName: leaf.ens, owner: normalizeHexInput(leaf.address, `ensRegistry:${leaf.ens}`, 20) });
  }
  const participants = [
    ...(config.validators ?? []).map((validator) => ({ ens: validator.ens, owner: validator.address })),
    ...(config.agents ?? []).map((agent) => ({ ens: agent.ens, owner: agent.address })),
    ...(config.nodes ?? []).map((node) => ({ ens: node.ens, owner: node.address })),
  ];
  if (participants.length === 0) {
    leaves.push(...demoLeaves());
  } else {
    for (const participant of participants) {
      leaves.push({
        ensName: participant.ens,
        owner: normalizeHexInput(participant.owner, `participant:${participant.ens}`, 20),
      });
    }
  }
  return dedupeLeaves(leaves);
}

export function loadScenarioConfig(filePath: string): ScenarioConfig {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`scenario config not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const ext = path.extname(resolved).toLowerCase();
  const parsed = ext === '.yaml' || ext === '.yml' ? yaml.load(raw) : JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('scenario config must be an object');
  }
  return parsed as ScenarioConfig;
}

export function prepareScenario(config: ScenarioConfig): PreparedScenario {
  if (!config.validators || config.validators.length === 0) {
    throw new Error('scenario must specify at least one validator');
  }
  const ensLeaves = collectLeaves(config);
  const domains = materializeDomains(config.domains);
  const governance = mergeGovernance(config.baseSetup?.governance);
  const sentinelGrace =
    config.baseSetup?.sentinelGraceRatio !== undefined
      ? config.baseSetup.sentinelGraceRatio
      : DEFAULT_SENTINEL_GRACE_RATIO;
  const verifyingKey = normalizeHexInput(
    config.baseSetup?.verifyingKey ?? DEFAULT_VERIFIER_KEY,
    'baseSetup.verifyingKey',
  );
  const entropySources = {
    onChainEntropy: normalizeHexInput(
      config.baseSetup?.onChainEntropy ?? DEFAULT_ONCHAIN_ENTROPY,
      'baseSetup.onChainEntropy',
    ),
    recentBeacon: normalizeHexInput(
      config.baseSetup?.recentBeacon ?? DEFAULT_BEACON_ENTROPY,
      'baseSetup.recentBeacon',
    ),
  };

  const setup = {
    domains,
    governance,
    ensLeaves,
    verifyingKey,
    onChainEntropy: entropySources.onChainEntropy,
    recentBeacon: entropySources.recentBeacon,
    sentinelGraceRatio: sentinelGrace,
  };
  const demo = new ValidatorConstellationDemo(setup);

  const validatorMap = new Map<string, ValidatorIdentity>();
  for (const validator of config.validators) {
    const identity = demo.registerValidator(
      validator.ens,
      normalizeHexInput(validator.address, validator.ens, 20),
      parseBigint(validator.stake, `${validator.ens} stake`),
    );
    validatorMap.set(normalizeEns(identity.ensName), identity);
  }
  if (demo.listValidators().length < governance.committeeSize) {
    throw new Error('scenario does not register enough validators to satisfy committee size');
  }

  const agentMap = new Map<string, ReturnType<ValidatorConstellationDemo['registerAgent']>>();
  for (const agent of config.agents ?? []) {
    const identity = demo.registerAgent(
      agent.ens,
      normalizeHexInput(agent.address, agent.ens, 20),
      agent.domainId,
      parseBigint(agent.budget, `${agent.ens} budget`),
    );
    agentMap.set(normalizeEns(identity.ensName), identity);
  }

  const registeredNodes: NodeIdentity[] = [];
  for (const node of config.nodes ?? []) {
    registeredNodes.push(demo.registerNode(node.ens, normalizeHexInput(node.address, node.ens, 20)));
  }

  const maintenanceRecords = new Map<string, { pause?: PauseRecord; resume?: PauseRecord }>();
  const domainSafetyUpdates = new Map<string, DomainConfig>();

  const baseEntropy = demo.getEntropySources();

  const ownerActions = config.ownerActions;
  if (ownerActions?.updateGovernance) {
    for (const [key, value] of Object.entries(ownerActions.updateGovernance)) {
      if (value !== undefined) {
        demo.updateGovernanceParameter(key as keyof GovernanceParameters, value);
      }
    }
  }

  if (ownerActions?.updateSentinel?.budgetGraceRatio !== undefined) {
    demo.updateSentinelConfig({ budgetGraceRatio: ownerActions.updateSentinel.budgetGraceRatio });
  }

  if (ownerActions?.updateDomainSafety) {
    for (const update of ownerActions.updateDomainSafety) {
      const patched: { humanName?: string; budgetLimit?: bigint; unsafeOpcodes?: Iterable<string> } = {};
      if (update.humanName !== undefined) {
        patched.humanName = update.humanName;
      }
      if (update.budgetLimit !== undefined) {
        patched.budgetLimit = parseBigint(update.budgetLimit, `${update.domainId} budget update`);
      }
      if (update.unsafeOpcodes) {
        patched.unsafeOpcodes = update.unsafeOpcodes;
      }
      const updated = demo.updateDomainSafety(update.domainId, patched);
      domainSafetyUpdates.set(update.domainId, updated);
    }
  }

  if (ownerActions?.setAgentBudgets) {
    for (const change of ownerActions.setAgentBudgets) {
      const updated = demo.setAgentBudget(change.ens, parseBigint(change.budget, `${change.ens} budget override`));
      agentMap.set(normalizeEns(updated.ensName), updated);
    }
  }

  if (ownerActions?.pauseDomains) {
    for (const pause of ownerActions.pauseDomains) {
      const record = demo.pauseDomain(pause.domainId, pause.reason, pause.triggeredBy ?? 'governance:scenario');
      const existing = maintenanceRecords.get(pause.domainId) ?? {};
      existing.pause = record;
      maintenanceRecords.set(pause.domainId, existing);
    }
  }

  if (ownerActions?.resumeDomains) {
    for (const resume of ownerActions.resumeDomains) {
      const record = demo.resumeDomain(resume.domainId, resume.triggeredBy ?? 'governance:scenario');
      const existing = maintenanceRecords.get(resume.domainId) ?? {};
      existing.resume = record;
      maintenanceRecords.set(resume.domainId, existing);
    }
  }

  if (ownerActions?.updateEntropy) {
    const updates: { onChainEntropy?: Hex; recentBeacon?: Hex } = {};
    if (ownerActions.updateEntropy.onChainEntropy !== undefined) {
      updates.onChainEntropy = normalizeHexInput(
        ownerActions.updateEntropy.onChainEntropy,
        'updateEntropy.onChainEntropy',
      );
    }
    if (ownerActions.updateEntropy.recentBeacon !== undefined) {
      updates.recentBeacon = normalizeHexInput(ownerActions.updateEntropy.recentBeacon, 'updateEntropy.recentBeacon');
    }
    demo.updateEntropySources(updates);
  }

  if (ownerActions?.updateZkKey) {
    demo.updateZkVerifyingKey(normalizeHexInput(ownerActions.updateZkKey, 'ownerActions.updateZkKey'));
  }

  const jobConfig = config.job ?? {};
  const jobDomainId = jobConfig.domainId ?? domains[0]?.id ?? 'default-domain';
  const round = jobConfig.round ?? 1;
  const truthfulVote: VoteValue = jobConfig.truthfulVote ?? 'APPROVE';
  const committeeSignature = normalizeHexInput(
    jobConfig.committeeSignature ?? '0x777788889999aaaabbbbccccddddeeeeffff0000111122223333444455556666',
    'committee signature',
  );
  const jobBatch = jobConfig.results ?? demoJobBatch(jobDomainId, jobConfig.count ?? 1000);

  const anomalies = buildAnomalies(config.anomalies, agentMap);
  const voteOverrides = resolveVoteOverrides(config.overrides, validatorMap);
  const nonRevealValidators = resolveNonReveal(config.overrides, validatorMap);

  const context: ScenarioContextBase = {
    verifyingKey: demo.getZkVerifyingKey(),
    entropyBefore: baseEntropy,
    entropyAfter: demo.getEntropySources(),
    governance: demo.getGovernance(),
    sentinelGraceRatio: demo.getSentinelBudgetGraceRatio(),
    maintenance: maintenanceRecords.get(jobDomainId),
    scenarioName: config.name ?? 'Validator Constellation Scenario',
    ownerNotes: {
      description: config.description,
      context: config.context,
      overrides: config.overrides,
    },
    jobSample: jobBatch.slice(0, Math.min(8, jobBatch.length)),
    updatedSafety: domainSafetyUpdates.get(jobDomainId),
    primaryDomainId: jobDomainId,
    nodesRegistered: registeredNodes,
  };

  const plan: ScenarioPlan = {
    round,
    truthfulVote,
    jobBatch,
    committeeSignature,
    voteOverrides,
    nonRevealValidators,
    anomalies,
  };

  return { demo, plan, context };
}

export function executeScenario(prepared: PreparedScenario): ExecutedScenario {
  const { demo, plan, context } = prepared;
  const report = demo.runValidationRound({
    round: plan.round,
    truthfulVote: plan.truthfulVote,
    jobBatch: plan.jobBatch,
    committeeSignature: plan.committeeSignature,
    voteOverrides: plan.voteOverrides,
    nonRevealValidators: plan.nonRevealValidators,
    anomalies: plan.anomalies,
  });

  const primaryDomain = demo.getDomainState(context.primaryDomainId);
  const reportContext: ReportContext = {
    verifyingKey: demo.getZkVerifyingKey(),
    entropyBefore: context.entropyBefore,
    entropyAfter: demo.getEntropySources(),
    governance: demo.getGovernance(),
    sentinelGraceRatio: demo.getSentinelBudgetGraceRatio(),
    nodesRegistered: context.nodesRegistered,
    primaryDomain,
    updatedSafety: context.updatedSafety,
    maintenance: context.maintenance,
    scenarioName: context.scenarioName,
    ownerNotes: context.ownerNotes,
    jobSample: context.jobSample,
  };

  return { demo, report, context: reportContext };
}
