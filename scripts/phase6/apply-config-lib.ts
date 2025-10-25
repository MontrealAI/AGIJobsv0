import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Contract } from 'ethers';
import { keccak256, toUtf8Bytes } from 'ethers';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export interface DecentralizedInfraEntry {
  name: string;
  role: string;
  status: string;
  endpoint?: string;
}

export interface InfrastructureEntry {
  layer: string;
  name: string;
  role: string;
  status: string;
  endpoint?: string;
  uri?: string;
}

export interface GlobalCredentialAnchorInput {
  name: string;
  did: string;
  role: string;
  policyURI?: string;
}

export interface GlobalCredentialIssuerInput {
  name: string;
  did: string;
  attestationType: string;
  registry: string;
  domains: string[];
}

export interface GlobalCredentialPolicyInput {
  name: string;
  description: string;
  uri: string;
}

export interface GlobalCredentialsInput {
  trustAnchors: GlobalCredentialAnchorInput[];
  issuers: GlobalCredentialIssuerInput[];
  policies: GlobalCredentialPolicyInput[];
  revocationRegistry: string;
}

export interface DomainCredentialRequirementInput {
  name: string;
  requirement: string;
  credentialType: string;
  format: string;
  issuers: string[];
  verifiers: string[];
  registry: string;
  evidence: string;
  notes?: string;
}

export interface DomainMetadata {
  domain: string;
  l2: string;
  sentinel: string;
  resilienceIndex: number;
  uptime: string;
  valueFlowMonthlyUSD: number;
  valueFlowDisplay?: string;
  [key: string]: unknown;
}

export type GlobalConfigInput = {
  manifestURI: string;
  iotOracleRouter?: string;
  defaultL2Gateway?: string;
  didRegistry?: string;
  treasuryBridge?: string;
  l2SyncCadence?: number;
  systemPause?: string;
  escalationBridge?: string;
  decentralizedInfra?: DecentralizedInfraEntry[];
  credentials?: GlobalCredentialsInput;
};

export type DomainConfigInput = {
  slug: string;
  lifecycle?: 'active' | 'sunset' | 'experimental';
  name: string;
  manifestURI: string;
  subgraph: string;
  validationModule: string;
  oracle?: string;
  l2Gateway?: string;
  executionRouter?: string;
  heartbeatSeconds?: number;
  active?: boolean;
  operations?: DomainOperationsInput;
  telemetry?: DomainTelemetryInput;
  skillTags?: string[];
  capabilities?: Record<string, number>;
  priority?: number;
  metadata?: DomainMetadata;
  infrastructure?: InfrastructureEntry[];
  infrastructureControl?: DomainInfrastructureControlInput;
  sunsetPlan?: SunsetPlanInput;
  credentials?: DomainCredentialRequirementInput[];
};

export type SunsetPlanInput = {
  reason?: string;
  retirementBlock?: number;
  handoffDomains?: string[];
  notes?: string;
};

export type DomainOperationsInput = {
  maxActiveJobs: number;
  maxQueueDepth: number;
  minStake: string | number;
  treasuryShareBps: number;
  circuitBreakerBps: number;
  requiresHumanValidation?: boolean;
};

export type DomainTelemetryInput = {
  resilienceBps: number;
  automationBps: number;
  complianceBps: number;
  settlementLatencySeconds: number;
  usesL2Settlement: boolean;
  sentinelOracle?: string;
  settlementAsset?: string;
  metricsDigest: string;
  manifestHash: string;
};

export type GlobalGuardsInput = {
  treasuryBufferBps: number;
  circuitBreakerBps: number;
  anomalyGracePeriod: number;
  autoPauseEnabled: boolean;
  oversightCouncil?: string;
};

export type GlobalTelemetryInput = {
  manifestHash: string;
  metricsDigest: string;
  resilienceFloorBps: number;
  automationFloorBps: number;
  oversightWeightBps: number;
};

export type DomainInfrastructureControlInput = {
  agentOps?: string;
  dataPipeline?: string;
  credentialVerifier?: string;
  fallbackOperator?: string;
  controlPlaneURI: string;
  autopilotEnabled?: boolean;
  autopilotCadence?: number;
};

export type GlobalInfrastructureInput = {
  meshCoordinator?: string;
  dataLake?: string;
  identityBridge?: string;
  topologyURI: string;
  autopilotCadence?: number;
  enforceDecentralizedInfra?: boolean;
};

export type Phase6Config = {
  global: GlobalConfigInput & {
    guards?: GlobalGuardsInput;
    telemetry?: GlobalTelemetryInput;
    infrastructure?: GlobalInfrastructureInput;
  };
  domains: DomainConfigInput[];
};

export type GlobalConfigStruct = {
  iotOracleRouter: string;
  defaultL2Gateway: string;
  didRegistry: string;
  treasuryBridge: string;
  l2SyncCadence: bigint;
  manifestURI: string;
};

export type DomainStruct = {
  slug: string;
  name: string;
  metadataURI: string;
  validationModule: string;
  dataOracle: string;
  l2Gateway: string;
  subgraphEndpoint: string;
  executionRouter: string;
  heartbeatSeconds: bigint;
  active: boolean;
};

export type ChainDomain = DomainStruct & {
  id: string;
};

export type DomainOperationsStruct = {
  maxActiveJobs: bigint;
  maxQueueDepth: bigint;
  minStake: bigint;
  treasuryShareBps: number;
  circuitBreakerBps: number;
  requiresHumanValidation: boolean;
};

export type DomainTelemetryStruct = {
  resilienceBps: number;
  automationBps: number;
  complianceBps: number;
  settlementLatencySeconds: number;
  usesL2Settlement: boolean;
  sentinelOracle: string;
  settlementAsset: string;
  metricsDigest: string;
  manifestHash: string;
};

export type DomainInfrastructureStruct = {
  agentOps: string;
  dataPipeline: string;
  credentialVerifier: string;
  fallbackOperator: string;
  controlPlaneURI: string;
  autopilotCadence: bigint;
  autopilotEnabled: boolean;
};

export type GlobalGuardsStruct = {
  treasuryBufferBps: number;
  circuitBreakerBps: number;
  anomalyGracePeriod: number;
  autoPauseEnabled: boolean;
  oversightCouncil: string;
};

export type GlobalTelemetryStruct = {
  manifestHash: string;
  metricsDigest: string;
  resilienceFloorBps: number;
  automationFloorBps: number;
  oversightWeightBps: number;
};

export type GlobalInfrastructureStruct = {
  meshCoordinator: string;
  dataLake: string;
  identityBridge: string;
  topologyURI: string;
  autopilotCadence: bigint;
  enforceDecentralizedInfra: boolean;
};

export type Phase6State = {
  global: GlobalConfigStruct;
  systemPause: string;
  escalationBridge: string;
  domains: ChainDomain[];
  domainOperations: Record<string, DomainOperationsStruct>;
  globalGuards: GlobalGuardsStruct;
  domainTelemetry: Record<string, DomainTelemetryStruct>;
  globalTelemetry: GlobalTelemetryStruct;
  domainInfrastructure: Record<string, DomainInfrastructureStruct>;
  globalInfrastructure: GlobalInfrastructureStruct;
};

export type GlobalPlan = {
  action: 'setGlobalConfig';
  config: GlobalConfigStruct;
  diffs: string[];
};

export type AddressPlan = {
  action: 'setSystemPause' | 'setEscalationBridge';
  target: string;
};

export type DomainPlan = {
  action: 'registerDomain' | 'updateDomain' | 'removeDomain';
  id: string;
  slug: string;
  config?: DomainStruct;
  diffs: string[];
  lifecycle: 'active' | 'sunset' | 'experimental';
  sunsetPlan?: SunsetPlanInput | null;
};

export type DomainOperationsPlan = {
  action: 'setDomainOperations';
  id: string;
  slug: string;
  config: DomainOperationsStruct;
  diffs: string[];
};

export type DomainTelemetryPlan = {
  action: 'setDomainTelemetry';
  id: string;
  slug: string;
  config: DomainTelemetryStruct;
  diffs: string[];
};

export type GlobalGuardsPlan = {
  action: 'setGlobalGuards';
  config: GlobalGuardsStruct;
  diffs: string[];
};

export type DomainInfrastructurePlan = {
  action: 'setDomainInfrastructure';
  id: string;
  slug: string;
  config: DomainInfrastructureStruct;
  diffs: string[];
};

export type GlobalInfrastructurePlan = {
  action: 'setGlobalInfrastructure';
  config: GlobalInfrastructureStruct;
  diffs: string[];
};

export type Phase6Plan = {
  global?: GlobalPlan;
  systemPause?: AddressPlan;
  escalationBridge?: AddressPlan;
  domains: DomainPlan[];
  domainOperations: DomainOperationsPlan[];
  domainInfrastructure: DomainInfrastructurePlan[];
  globalGuards?: GlobalGuardsPlan;
  domainTelemetry: DomainTelemetryPlan[];
  globalTelemetry?: {
    action: 'setGlobalTelemetry';
    config: GlobalTelemetryStruct;
    diffs: string[];
  };
  globalInfrastructure?: GlobalInfrastructurePlan;
  warnings: string[];
};

export type Phase6PlanSummary = {
  generatedAt: string;
  manager: string;
  governance: string;
  specVersion: string;
  network: { name: string; chainId?: number | null };
  configPath?: string;
  dryRun: boolean;
  filters: {
    skipGlobal: boolean;
    skipSystemPause: boolean;
    skipEscalation: boolean;
    onlyDomains: string[];
  };
  warnings: string[];
  counts: {
    total: number;
    global: number;
    domains: number;
    domainOperations: number;
    domainTelemetry: number;
    domainInfrastructure: number;
  };
  actions: {
    global?: { diffs: string[]; config: Record<string, unknown> };
    globalGuards?: { diffs: string[]; config: Record<string, unknown> };
    globalTelemetry?: { diffs: string[]; config: Record<string, unknown> };
    globalInfrastructure?: { diffs: string[]; config: Record<string, unknown> };
    systemPause?: { target: string };
    escalationBridge?: { target: string };
    domains: Array<{
      action: DomainPlan['action'];
      slug: string;
      id: string;
      diffs: string[];
      lifecycle: DomainPlan['lifecycle'];
      sunsetPlan?: Record<string, unknown> | null;
      config?: Record<string, unknown>;
    }>;
    domainOperations: Array<{
      slug: string;
      diffs: string[];
      config: Record<string, unknown>;
    }>;
    domainTelemetry: Array<{
      slug: string;
      diffs: string[];
      config: Record<string, unknown>;
    }>;
    domainInfrastructure: Array<{
      slug: string;
      diffs: string[];
      config: Record<string, unknown>;
    }>;
  };
};

export function domainIdFromSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  return keccak256(toUtf8Bytes(normalized));
}

export function normalizeDomainView(view: any): ChainDomain {
  const config = view?.config ?? view?.[1] ?? view;
  const idRaw = view?.id ?? view?.[0];
  const slug = String(config?.slug ?? '');
  return {
    id: typeof idRaw === 'string' ? idRaw : String(idRaw ?? domainIdFromSlug(slug)),
    slug,
    name: String(config?.name ?? ''),
    metadataURI: String(config?.metadataURI ?? ''),
    validationModule: String(config?.validationModule ?? ZERO_ADDRESS),
    dataOracle: String(config?.dataOracle ?? ZERO_ADDRESS),
    l2Gateway: String(config?.l2Gateway ?? ZERO_ADDRESS),
    subgraphEndpoint: String(config?.subgraphEndpoint ?? ''),
    executionRouter: String(config?.executionRouter ?? ZERO_ADDRESS),
    heartbeatSeconds: BigInt(config?.heartbeatSeconds ?? 0),
    active: Boolean(config?.active ?? false),
  };
}

function normalizeDomainOperations(raw: any): DomainOperationsStruct {
  return {
    maxActiveJobs: BigInt(raw?.maxActiveJobs ?? raw?.[0] ?? 0),
    maxQueueDepth: BigInt(raw?.maxQueueDepth ?? raw?.[1] ?? 0),
    minStake: BigInt(raw?.minStake ?? raw?.[2] ?? 0),
    treasuryShareBps: Number(raw?.treasuryShareBps ?? raw?.[3] ?? 0),
    circuitBreakerBps: Number(raw?.circuitBreakerBps ?? raw?.[4] ?? 0),
    requiresHumanValidation: Boolean(raw?.requiresHumanValidation ?? raw?.[5] ?? false),
  };
}

function normalizeGlobalGuards(raw: any): GlobalGuardsStruct {
  return {
    treasuryBufferBps: Number(raw?.treasuryBufferBps ?? raw?.[0] ?? 0),
    circuitBreakerBps: Number(raw?.circuitBreakerBps ?? raw?.[1] ?? 0),
    anomalyGracePeriod: Number(raw?.anomalyGracePeriod ?? raw?.[2] ?? 0),
    autoPauseEnabled: Boolean(raw?.autoPauseEnabled ?? raw?.[3] ?? false),
    oversightCouncil: String(raw?.oversightCouncil ?? raw?.[4] ?? ZERO_ADDRESS),
  };
}

function normalizeDomainTelemetry(raw: any): DomainTelemetryStruct {
  return {
    resilienceBps: Number(raw?.resilienceBps ?? raw?.[0] ?? 0),
    automationBps: Number(raw?.automationBps ?? raw?.[1] ?? 0),
    complianceBps: Number(raw?.complianceBps ?? raw?.[2] ?? 0),
    settlementLatencySeconds: Number(raw?.settlementLatencySeconds ?? raw?.[3] ?? 0),
    usesL2Settlement: Boolean(raw?.usesL2Settlement ?? raw?.[4] ?? false),
    sentinelOracle: String(raw?.sentinelOracle ?? raw?.[5] ?? ZERO_ADDRESS),
    settlementAsset: String(raw?.settlementAsset ?? raw?.[6] ?? ZERO_ADDRESS),
    metricsDigest: String(raw?.metricsDigest ?? raw?.[7] ?? '').toLowerCase(),
    manifestHash: String(raw?.manifestHash ?? raw?.[8] ?? '').toLowerCase(),
  };
}

function normalizeGlobalTelemetry(raw: any): GlobalTelemetryStruct {
  return {
    manifestHash: String(raw?.manifestHash ?? raw?.[0] ?? '').toLowerCase(),
    metricsDigest: String(raw?.metricsDigest ?? raw?.[1] ?? '').toLowerCase(),
    resilienceFloorBps: Number(raw?.resilienceFloorBps ?? raw?.[2] ?? 0),
    automationFloorBps: Number(raw?.automationFloorBps ?? raw?.[3] ?? 0),
    oversightWeightBps: Number(raw?.oversightWeightBps ?? raw?.[4] ?? 0),
  };
}

function normalizeDomainInfrastructure(raw: any): DomainInfrastructureStruct {
  return {
    agentOps: String(raw?.agentOps ?? raw?.[0] ?? ZERO_ADDRESS),
    dataPipeline: String(raw?.dataPipeline ?? raw?.[1] ?? ZERO_ADDRESS),
    credentialVerifier: String(raw?.credentialVerifier ?? raw?.[2] ?? ZERO_ADDRESS),
    fallbackOperator: String(raw?.fallbackOperator ?? raw?.[3] ?? ZERO_ADDRESS),
    controlPlaneURI: String(raw?.controlPlaneURI ?? raw?.[4] ?? ''),
    autopilotCadence: BigInt(raw?.autopilotCadence ?? raw?.[5] ?? 0),
    autopilotEnabled: Boolean(raw?.autopilotEnabled ?? raw?.[6] ?? false),
  };
}

function normalizeGlobalInfrastructure(raw: any): GlobalInfrastructureStruct {
  return {
    meshCoordinator: String(raw?.meshCoordinator ?? raw?.[0] ?? ZERO_ADDRESS),
    dataLake: String(raw?.dataLake ?? raw?.[1] ?? ZERO_ADDRESS),
    identityBridge: String(raw?.identityBridge ?? raw?.[2] ?? ZERO_ADDRESS),
    topologyURI: String(raw?.topologyURI ?? raw?.[3] ?? ''),
    autopilotCadence: BigInt(raw?.autopilotCadence ?? raw?.[4] ?? 0),
    enforceDecentralizedInfra: Boolean(raw?.enforceDecentralizedInfra ?? raw?.[5] ?? false),
  };
}

function eqAddress(a?: string | null, b?: string | null): boolean {
  const norm = (value?: string | null) => (value ? value.toLowerCase() : ZERO_ADDRESS);
  return norm(a) === norm(b);
}

function asBigInt(value?: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return 0n;
}

function buildDomainStruct(input: DomainConfigInput, currentActive?: boolean): DomainStruct {
  return {
    slug: input.slug,
    name: input.name,
    metadataURI: input.manifestURI,
    validationModule: input.validationModule,
    dataOracle: input.oracle ?? ZERO_ADDRESS,
    l2Gateway: input.l2Gateway ?? ZERO_ADDRESS,
    subgraphEndpoint: input.subgraph,
    executionRouter: input.executionRouter ?? ZERO_ADDRESS,
    heartbeatSeconds: BigInt(Math.trunc(input.heartbeatSeconds ?? 120)),
    active: input.active ?? currentActive ?? true,
  };
}

function buildDomainOperationsStruct(
  input: DomainOperationsInput,
  previous?: DomainOperationsStruct,
): DomainOperationsStruct {
  const minStakeRaw = input.minStake;
  const minStakeBigInt =
    typeof minStakeRaw === 'string'
      ? BigInt(minStakeRaw)
      : BigInt(Math.trunc(Number(minStakeRaw)));
  return {
    maxActiveJobs: BigInt(Math.trunc(input.maxActiveJobs)),
    maxQueueDepth: BigInt(Math.trunc(input.maxQueueDepth)),
    minStake: minStakeBigInt,
    treasuryShareBps: Math.trunc(input.treasuryShareBps),
    circuitBreakerBps: Math.trunc(input.circuitBreakerBps),
    requiresHumanValidation: Boolean(
      input.requiresHumanValidation ?? previous?.requiresHumanValidation ?? false,
    ),
  };
}

function buildDomainTelemetryStruct(
  input: DomainTelemetryInput,
  previous?: DomainTelemetryStruct,
): DomainTelemetryStruct {
  return {
    resilienceBps: Math.trunc(input.resilienceBps ?? previous?.resilienceBps ?? 0),
    automationBps: Math.trunc(input.automationBps ?? previous?.automationBps ?? 0),
    complianceBps: Math.trunc(input.complianceBps ?? previous?.complianceBps ?? 0),
    settlementLatencySeconds: Math.trunc(
      input.settlementLatencySeconds ?? previous?.settlementLatencySeconds ?? 0,
    ),
    usesL2Settlement: Boolean(input.usesL2Settlement ?? previous?.usesL2Settlement ?? false),
    sentinelOracle: (input.sentinelOracle ?? previous?.sentinelOracle ?? ZERO_ADDRESS).toLowerCase(),
    settlementAsset: (input.settlementAsset ?? previous?.settlementAsset ?? ZERO_ADDRESS).toLowerCase(),
    metricsDigest: (input.metricsDigest ?? previous?.metricsDigest ?? '').toLowerCase(),
    manifestHash: (input.manifestHash ?? previous?.manifestHash ?? '').toLowerCase(),
  };
}

function buildDomainInfrastructureStruct(
  input: DomainInfrastructureControlInput,
  previous?: DomainInfrastructureStruct,
): DomainInfrastructureStruct {
  const controlPlaneURI = input.controlPlaneURI?.trim() || previous?.controlPlaneURI || '';
  const autopilotCadence = BigInt(
    Math.trunc(input.autopilotCadence ?? Number(previous?.autopilotCadence ?? 0n)),
  );
  return {
    agentOps: (input.agentOps ?? previous?.agentOps ?? ZERO_ADDRESS).toLowerCase(),
    dataPipeline: (input.dataPipeline ?? previous?.dataPipeline ?? ZERO_ADDRESS).toLowerCase(),
    credentialVerifier: (
      input.credentialVerifier ?? previous?.credentialVerifier ?? ZERO_ADDRESS
    ).toLowerCase(),
    fallbackOperator: (
      input.fallbackOperator ?? previous?.fallbackOperator ?? ZERO_ADDRESS
    ).toLowerCase(),
    controlPlaneURI,
    autopilotCadence,
    autopilotEnabled: Boolean(input.autopilotEnabled ?? previous?.autopilotEnabled ?? false),
  };
}

function buildGlobalInfrastructureStruct(
  input: GlobalInfrastructureInput,
  previous?: GlobalInfrastructureStruct,
): GlobalInfrastructureStruct {
  const topologyURI = input.topologyURI?.trim() || previous?.topologyURI || '';
  const cadence = BigInt(
    Math.trunc(input.autopilotCadence ?? Number(previous?.autopilotCadence ?? 0n)),
  );
  return {
    meshCoordinator: (input.meshCoordinator ?? previous?.meshCoordinator ?? ZERO_ADDRESS).toLowerCase(),
    dataLake: (input.dataLake ?? previous?.dataLake ?? ZERO_ADDRESS).toLowerCase(),
    identityBridge: (input.identityBridge ?? previous?.identityBridge ?? ZERO_ADDRESS).toLowerCase(),
    topologyURI,
    autopilotCadence: cadence,
    enforceDecentralizedInfra: Boolean(
      input.enforceDecentralizedInfra ?? previous?.enforceDecentralizedInfra ?? false,
    ),
  };
}

function diffDomainOperations(
  current: DomainOperationsStruct | undefined,
  target: DomainOperationsStruct,
): string[] {
  const diffs: string[] = [];
  if (!current) {
    return [
      'maxActiveJobs',
      'maxQueueDepth',
      'minStake',
      'treasuryShareBps',
      'circuitBreakerBps',
      'requiresHumanValidation',
    ];
  }
  if (current.maxActiveJobs !== target.maxActiveJobs) diffs.push('maxActiveJobs');
  if (current.maxQueueDepth !== target.maxQueueDepth) diffs.push('maxQueueDepth');
  if (current.minStake !== target.minStake) diffs.push('minStake');
  if (current.treasuryShareBps !== target.treasuryShareBps) diffs.push('treasuryShareBps');
  if (current.circuitBreakerBps !== target.circuitBreakerBps) diffs.push('circuitBreakerBps');
  if (current.requiresHumanValidation !== target.requiresHumanValidation)
    diffs.push('requiresHumanValidation');
  return diffs;
}

function diffDomainTelemetry(
  current: DomainTelemetryStruct | undefined,
  target: DomainTelemetryStruct,
): string[] {
  if (!current) {
    return [
      'resilienceBps',
      'automationBps',
      'complianceBps',
      'settlementLatencySeconds',
      'usesL2Settlement',
      'sentinelOracle',
      'settlementAsset',
      'metricsDigest',
      'manifestHash',
    ];
  }
  const diffs: string[] = [];
  if (current.resilienceBps !== target.resilienceBps) diffs.push('resilienceBps');
  if (current.automationBps !== target.automationBps) diffs.push('automationBps');
  if (current.complianceBps !== target.complianceBps) diffs.push('complianceBps');
  if (current.settlementLatencySeconds !== target.settlementLatencySeconds)
    diffs.push('settlementLatencySeconds');
  if (current.usesL2Settlement !== target.usesL2Settlement) diffs.push('usesL2Settlement');
  if (current.sentinelOracle.toLowerCase() !== target.sentinelOracle.toLowerCase())
    diffs.push('sentinelOracle');
  if (current.settlementAsset.toLowerCase() !== target.settlementAsset.toLowerCase())
    diffs.push('settlementAsset');
  if (current.metricsDigest.toLowerCase() !== target.metricsDigest.toLowerCase())
    diffs.push('metricsDigest');
  if (current.manifestHash.toLowerCase() !== target.manifestHash.toLowerCase())
    diffs.push('manifestHash');
  return diffs;
}

function diffDomainInfrastructure(
  current: DomainInfrastructureStruct | undefined,
  target: DomainInfrastructureStruct,
): string[] {
  const fields = [
    'agentOps',
    'dataPipeline',
    'credentialVerifier',
    'fallbackOperator',
    'controlPlaneURI',
    'autopilotCadence',
    'autopilotEnabled',
  ] as const;
  if (!current) {
    return [...fields];
  }
  const diffs: string[] = [];
  if (!eqAddress(current.agentOps, target.agentOps)) diffs.push('agentOps');
  if (!eqAddress(current.dataPipeline, target.dataPipeline)) diffs.push('dataPipeline');
  if (!eqAddress(current.credentialVerifier, target.credentialVerifier))
    diffs.push('credentialVerifier');
  if (!eqAddress(current.fallbackOperator, target.fallbackOperator))
    diffs.push('fallbackOperator');
  if ((current.controlPlaneURI || '').trim() !== (target.controlPlaneURI || '').trim())
    diffs.push('controlPlaneURI');
  if (current.autopilotCadence !== target.autopilotCadence) diffs.push('autopilotCadence');
  if (current.autopilotEnabled !== target.autopilotEnabled) diffs.push('autopilotEnabled');
  return diffs;
}

function diffGlobalInfrastructure(
  current: GlobalInfrastructureStruct | undefined,
  target: GlobalInfrastructureStruct,
): string[] {
  const diffs: string[] = [];
  if (!current) {
    return [
      'meshCoordinator',
      'dataLake',
      'identityBridge',
      'topologyURI',
      'autopilotCadence',
      'enforceDecentralizedInfra',
    ];
  }
  if (!eqAddress(current.meshCoordinator, target.meshCoordinator)) diffs.push('meshCoordinator');
  if (!eqAddress(current.dataLake, target.dataLake)) diffs.push('dataLake');
  if (!eqAddress(current.identityBridge, target.identityBridge)) diffs.push('identityBridge');
  if ((current.topologyURI || '').trim() !== (target.topologyURI || '').trim())
    diffs.push('topologyURI');
  if (current.autopilotCadence !== target.autopilotCadence) diffs.push('autopilotCadence');
  if (current.enforceDecentralizedInfra !== target.enforceDecentralizedInfra)
    diffs.push('enforceDecentralizedInfra');
  return diffs;
}

function diffGlobalGuards(
  current: GlobalGuardsStruct,
  target: GlobalGuardsStruct,
): string[] {
  const diffs: string[] = [];
  if (current.treasuryBufferBps !== target.treasuryBufferBps) diffs.push('treasuryBufferBps');
  if (current.circuitBreakerBps !== target.circuitBreakerBps) diffs.push('circuitBreakerBps');
  if (current.anomalyGracePeriod !== target.anomalyGracePeriod) diffs.push('anomalyGracePeriod');
  if (current.autoPauseEnabled !== target.autoPauseEnabled) diffs.push('autoPauseEnabled');
  if (current.oversightCouncil.toLowerCase() !== target.oversightCouncil.toLowerCase())
    diffs.push('oversightCouncil');
  return diffs;
}

function buildGlobalTelemetryStruct(
  input: GlobalTelemetryInput,
  previous?: GlobalTelemetryStruct,
): GlobalTelemetryStruct {
  return {
    manifestHash: (input.manifestHash ?? previous?.manifestHash ?? '').toLowerCase(),
    metricsDigest: (input.metricsDigest ?? previous?.metricsDigest ?? '').toLowerCase(),
    resilienceFloorBps: Math.trunc(input.resilienceFloorBps ?? previous?.resilienceFloorBps ?? 0),
    automationFloorBps: Math.trunc(input.automationFloorBps ?? previous?.automationFloorBps ?? 0),
    oversightWeightBps: Math.trunc(input.oversightWeightBps ?? previous?.oversightWeightBps ?? 0),
  };
}

function diffGlobalTelemetry(
  current: GlobalTelemetryStruct,
  target: GlobalTelemetryStruct,
): string[] {
  const diffs: string[] = [];
  if (current.manifestHash.toLowerCase() !== target.manifestHash.toLowerCase()) diffs.push('manifestHash');
  if (current.metricsDigest.toLowerCase() !== target.metricsDigest.toLowerCase()) diffs.push('metricsDigest');
  if (current.resilienceFloorBps !== target.resilienceFloorBps) diffs.push('resilienceFloorBps');
  if (current.automationFloorBps !== target.automationFloorBps) diffs.push('automationFloorBps');
  if (current.oversightWeightBps !== target.oversightWeightBps) diffs.push('oversightWeightBps');
  return diffs;
}

function buildGlobalGuardsStruct(
  input: GlobalGuardsInput,
  previous?: GlobalGuardsStruct,
): GlobalGuardsStruct {
  return {
    treasuryBufferBps: Math.trunc(input.treasuryBufferBps ?? previous?.treasuryBufferBps ?? 0),
    circuitBreakerBps: Math.trunc(input.circuitBreakerBps ?? previous?.circuitBreakerBps ?? 0),
    anomalyGracePeriod: Math.trunc(input.anomalyGracePeriod ?? previous?.anomalyGracePeriod ?? 0),
    autoPauseEnabled: Boolean(input.autoPauseEnabled ?? previous?.autoPauseEnabled ?? false),
    oversightCouncil: input.oversightCouncil ?? previous?.oversightCouncil ?? ZERO_ADDRESS,
  };
}

export function planPhase6Changes(current: Phase6State, desired: Phase6Config): Phase6Plan {
  const warnings: string[] = [];
  const domains: DomainPlan[] = [];
  const domainOperationsPlans: DomainOperationsPlan[] = [];
  const domainTelemetryPlans: DomainTelemetryPlan[] = [];
  const domainInfrastructurePlans: DomainInfrastructurePlan[] = [];
  const touchedOperations = new Set<string>();
  const touchedTelemetry = new Set<string>();
  const touchedInfrastructure = new Set<string>();

  const manifestURI = desired.global.manifestURI?.trim();
  if (!manifestURI) {
    throw new Error('Global manifestURI is required in the configuration.');
  }

  const targetGlobal: GlobalConfigStruct = {
    iotOracleRouter: desired.global.iotOracleRouter ?? ZERO_ADDRESS,
    defaultL2Gateway: desired.global.defaultL2Gateway ?? ZERO_ADDRESS,
    didRegistry: desired.global.didRegistry ?? ZERO_ADDRESS,
    treasuryBridge: desired.global.treasuryBridge ?? ZERO_ADDRESS,
    l2SyncCadence: BigInt(Math.trunc(desired.global.l2SyncCadence ?? Number(current.global.l2SyncCadence ?? 0n))),
    manifestURI,
  };

  const globalDiffs: string[] = [];
  if (!eqAddress(current.global.iotOracleRouter, targetGlobal.iotOracleRouter)) {
    globalDiffs.push('iotOracleRouter');
  }
  if (!eqAddress(current.global.defaultL2Gateway, targetGlobal.defaultL2Gateway)) {
    globalDiffs.push('defaultL2Gateway');
  }
  if (!eqAddress(current.global.didRegistry, targetGlobal.didRegistry)) {
    globalDiffs.push('didRegistry');
  }
  if (!eqAddress(current.global.treasuryBridge, targetGlobal.treasuryBridge)) {
    globalDiffs.push('treasuryBridge');
  }
  if (current.global.l2SyncCadence !== targetGlobal.l2SyncCadence) {
    globalDiffs.push('l2SyncCadence');
  }
  if ((current.global.manifestURI ?? '').trim() !== targetGlobal.manifestURI) {
    globalDiffs.push('manifestURI');
  }

  const plan: Phase6Plan = {
    domains,
    domainOperations: domainOperationsPlans,
    domainInfrastructure: domainInfrastructurePlans,
    domainTelemetry: domainTelemetryPlans,
    warnings,
  };

  if (globalDiffs.length > 0) {
    plan.global = {
      action: 'setGlobalConfig',
      config: targetGlobal,
      diffs: globalDiffs,
    };
  }

  const targetGuardsInput = desired.global.guards;
  const currentGuards = current.globalGuards;
  if (targetGuardsInput) {
    const targetGuards = buildGlobalGuardsStruct(targetGuardsInput, currentGuards);
    const guardDiffs = diffGlobalGuards(currentGuards, targetGuards);
    if (guardDiffs.length > 0) {
      plan.globalGuards = {
        action: 'setGlobalGuards',
        config: targetGuards,
        diffs: guardDiffs,
      };
    }
  } else if (
    currentGuards.treasuryBufferBps !== 0 ||
    currentGuards.circuitBreakerBps !== 0 ||
    currentGuards.anomalyGracePeriod !== 0 ||
    currentGuards.autoPauseEnabled ||
    currentGuards.oversightCouncil.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
  ) {
    warnings.push('Configuration omits global.guards; existing guard rails remain unchanged.');
  }

  const targetGlobalTelemetryInput = desired.global.telemetry;
  if (targetGlobalTelemetryInput) {
    const targetTelemetry = buildGlobalTelemetryStruct(
      targetGlobalTelemetryInput,
      current.globalTelemetry,
    );
    const telemetryDiffs = diffGlobalTelemetry(current.globalTelemetry, targetTelemetry);
    if (telemetryDiffs.length > 0) {
      plan.globalTelemetry = {
        action: 'setGlobalTelemetry',
        config: targetTelemetry,
        diffs: telemetryDiffs,
      };
    }
  } else {
    warnings.push('Configuration omits global.telemetry; existing on-chain telemetry retained.');
  }

  const targetGlobalInfrastructureInput = desired.global.infrastructure;
  if (targetGlobalInfrastructureInput) {
    const targetInfrastructure = buildGlobalInfrastructureStruct(
      targetGlobalInfrastructureInput,
      current.globalInfrastructure,
    );
    const infraDiffs = diffGlobalInfrastructure(current.globalInfrastructure, targetInfrastructure);
    if (infraDiffs.length > 0) {
      plan.globalInfrastructure = {
        action: 'setGlobalInfrastructure',
        config: targetInfrastructure,
        diffs: infraDiffs,
      };
    }
  } else if ((current.globalInfrastructure.topologyURI ?? '').trim() !== '') {
    warnings.push('Configuration omits global.infrastructure; existing mesh topology retained.');
  }

  const desiredPause = desired.global.systemPause;
  if (desiredPause) {
    if (!eqAddress(current.systemPause, desiredPause)) {
      plan.systemPause = {
        action: 'setSystemPause',
        target: desiredPause,
      };
    }
  } else {
    warnings.push('Configuration omits global.systemPause; owner review recommended.');
  }

  const desiredEscalation = desired.global.escalationBridge;
  if (desiredEscalation) {
    if (!eqAddress(current.escalationBridge, desiredEscalation)) {
      plan.escalationBridge = {
        action: 'setEscalationBridge',
        target: desiredEscalation,
      };
    }
  } else {
    warnings.push('Configuration omits global.escalationBridge; owner review recommended.');
  }

  const currentMap = new Map<string, ChainDomain>();
  for (const domain of current.domains) {
    currentMap.set(domain.slug.toLowerCase(), domain);
  }

  const desiredSlugs = new Set<string>();

  for (const input of desired.domains) {
    const slug = input.slug.trim();
    if (!slug) {
      warnings.push('Encountered domain with empty slug in configuration.');
      continue;
    }
    const key = slug.toLowerCase();
    desiredSlugs.add(key);
    const existing = currentMap.get(key);
    const existingOps = current.domainOperations[key];
    const existingInfra = current.domainInfrastructure[key];
    const lifecycleRaw = String(input.lifecycle ?? 'active').toLowerCase();
    const lifecycle: DomainPlan['lifecycle'] =
      lifecycleRaw === 'sunset' || lifecycleRaw === 'experimental' ? (lifecycleRaw as DomainPlan['lifecycle']) : 'active';
    if (!existing && lifecycle === 'sunset') {
      warnings.push(`Domain ${slug} marked sunset in config but not found on-chain; skipping.`);
      touchedOperations.add(key);
      touchedTelemetry.add(key);
      touchedInfrastructure.add(key);
      continue;
    }
    const struct = buildDomainStruct(input, existing?.active);
    if (!existing) {
      domains.push({
        action: 'registerDomain',
        id: domainIdFromSlug(slug),
        slug,
        config: struct,
        diffs: ['slug', 'metadataURI', 'validationModule', 'subgraphEndpoint', 'heartbeatSeconds'],
        lifecycle,
        sunsetPlan: lifecycle === 'sunset' ? cloneSunsetPlan(input.sunsetPlan) : null,
      });
      if (input.telemetry) {
        const telemetryTarget = buildDomainTelemetryStruct(input.telemetry);
        domainTelemetryPlans.push({
          action: 'setDomainTelemetry',
          id: domainIdFromSlug(slug),
          slug,
          config: telemetryTarget,
          diffs: [
            'resilienceBps',
            'automationBps',
            'complianceBps',
            'settlementLatencySeconds',
            'usesL2Settlement',
            'sentinelOracle',
            'settlementAsset',
            'metricsDigest',
            'manifestHash',
          ],
        });
        touchedTelemetry.add(key);
      }
      if (input.infrastructureControl) {
        const infraTarget = buildDomainInfrastructureStruct(input.infrastructureControl);
        domainInfrastructurePlans.push({
          action: 'setDomainInfrastructure',
          id: domainIdFromSlug(slug),
          slug,
          config: infraTarget,
          diffs: [
            'agentOps',
            'dataPipeline',
            'credentialVerifier',
            'fallbackOperator',
            'controlPlaneURI',
            'autopilotCadence',
            'autopilotEnabled',
          ],
        });
        touchedInfrastructure.add(key);
      }
      continue;
    }

    if (lifecycle === 'sunset') {
      domains.push({
        action: 'removeDomain',
        id: existing.id,
        slug,
        config: existing,
        diffs: ['lifecycle'],
        lifecycle: 'sunset',
        sunsetPlan: cloneSunsetPlan(input.sunsetPlan),
      });
      touchedOperations.add(key);
      touchedTelemetry.add(key);
      touchedInfrastructure.add(key);
      continue;
    }

    const diffs: string[] = [];
    if (existing.name !== struct.name) diffs.push('name');
    if (existing.metadataURI !== struct.metadataURI) diffs.push('metadataURI');
    if (!eqAddress(existing.validationModule, struct.validationModule)) diffs.push('validationModule');
    if (!eqAddress(existing.dataOracle, struct.dataOracle)) diffs.push('dataOracle');
    if (!eqAddress(existing.l2Gateway, struct.l2Gateway)) diffs.push('l2Gateway');
    if (existing.subgraphEndpoint !== struct.subgraphEndpoint) diffs.push('subgraphEndpoint');
    if (!eqAddress(existing.executionRouter, struct.executionRouter)) diffs.push('executionRouter');
    if (existing.heartbeatSeconds !== struct.heartbeatSeconds) diffs.push('heartbeatSeconds');
    if (existing.active !== struct.active) diffs.push('active');

    if (diffs.length > 0) {
      domains.push({
        action: 'updateDomain',
        id: existing.id,
        slug,
        config: struct,
        diffs,
        lifecycle,
        sunsetPlan: lifecycle === 'sunset' ? cloneSunsetPlan(input.sunsetPlan) : null,
      });
    }

    if (input.operations) {
      const targetOps = buildDomainOperationsStruct(input.operations, existingOps);
      const opDiffs = diffDomainOperations(existingOps, targetOps);
      if (opDiffs.length > 0) {
        domainOperationsPlans.push({
          action: 'setDomainOperations',
          id: existing.id,
          slug,
          config: targetOps,
          diffs: opDiffs,
        });
        touchedOperations.add(key);
      }
    } else {
      warnings.push(`Domain ${slug} missing operations config; retaining on-chain values.`);
    }

    if (input.telemetry) {
      const existingTelemetry = current.domainTelemetry[key];
      const targetTelemetry = buildDomainTelemetryStruct(input.telemetry, existingTelemetry);
      const telemetryDiffs = diffDomainTelemetry(existingTelemetry, targetTelemetry);
      if (telemetryDiffs.length > 0) {
        domainTelemetryPlans.push({
          action: 'setDomainTelemetry',
          id: existing.id,
          slug,
          config: targetTelemetry,
          diffs: telemetryDiffs,
        });
        touchedTelemetry.add(key);
      }
    } else if (!touchedTelemetry.has(key)) {
      warnings.push(`Domain ${slug} missing telemetry config; retaining on-chain metrics.`);
    }

    if (input.infrastructureControl) {
      const targetInfra = buildDomainInfrastructureStruct(
        input.infrastructureControl,
        existingInfra,
      );
      const infraDiffs = diffDomainInfrastructure(existingInfra, targetInfra);
      if (infraDiffs.length > 0) {
        domainInfrastructurePlans.push({
          action: 'setDomainInfrastructure',
          id: existing.id,
          slug,
          config: targetInfra,
          diffs: infraDiffs,
        });
        touchedInfrastructure.add(key);
      }
    } else if (!touchedInfrastructure.has(key) && existingInfra) {
      const hasExistingInfra =
        existingInfra.controlPlaneURI.trim().length > 0 || existingInfra.autopilotCadence !== 0n;
      if (hasExistingInfra) {
        warnings.push(`Domain ${slug} missing infrastructureControl config; retaining on-chain wiring.`);
      }
    }
  }

  for (const input of desired.domains) {
    const key = input.slug.trim().toLowerCase();
    if (!touchedOperations.has(key) && input.operations) {
      const existingOps = current.domainOperations[key];
      const targetOps = buildDomainOperationsStruct(input.operations, existingOps);
      const opDiffs = diffDomainOperations(existingOps, targetOps);
      if (opDiffs.length > 0) {
        domainOperationsPlans.push({
          action: 'setDomainOperations',
          id: domainIdFromSlug(input.slug),
          slug: input.slug,
          config: targetOps,
          diffs: opDiffs,
        });
        touchedOperations.add(key);
      }
    }
    if (!touchedTelemetry.has(key) && input.telemetry) {
      const targetTelemetry = buildDomainTelemetryStruct(
        input.telemetry,
        current.domainTelemetry[key],
      );
      const telemetryDiffs = diffDomainTelemetry(current.domainTelemetry[key], targetTelemetry);
      if (telemetryDiffs.length > 0) {
        domainTelemetryPlans.push({
          action: 'setDomainTelemetry',
          id: domainIdFromSlug(input.slug),
          slug: input.slug,
          config: targetTelemetry,
          diffs: telemetryDiffs,
        });
        touchedTelemetry.add(key);
      }
    }
  }

  for (const [slug, existing] of currentMap.entries()) {
    if (!desiredSlugs.has(slug)) {
      warnings.push(`On-chain domain ${existing.slug} (${existing.id}) missing from configuration.`);
    }
  }

  return plan;
}

type SummaryOptions = {
  manager: string;
  governance: string;
  specVersion: string;
  network: { name: string; chainId?: number | null };
  configPath?: string;
  dryRun: boolean;
  filters: {
    skipGlobal: boolean;
    skipSystemPause: boolean;
    skipEscalation: boolean;
    onlyDomains: Iterable<string>;
  };
};

function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serialize(entry));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = serialize(entry);
    }
    return output;
  }
  return value;
}

function cloneSunsetPlan(plan?: SunsetPlanInput | null): SunsetPlanInput | null {
  if (!plan) {
    return null;
  }
  const cloned: SunsetPlanInput = {};
  if (plan.reason !== undefined) cloned.reason = plan.reason;
  if (plan.retirementBlock !== undefined) cloned.retirementBlock = plan.retirementBlock;
  if (Array.isArray(plan.handoffDomains)) cloned.handoffDomains = [...plan.handoffDomains];
  if (plan.notes !== undefined) cloned.notes = plan.notes;
  return cloned;
}

export function buildPlanSummary(plan: Phase6Plan, options: SummaryOptions): Phase6PlanSummary {
  const onlyDomains = new Set(
    Array.from(options.filters.onlyDomains ?? []).map((slug) => slug.toLowerCase()),
  );
  const domainFilter = (slug: string) =>
    onlyDomains.size === 0 || onlyDomains.has(slug.toLowerCase());

  const summaryDomains = plan.domains
    .filter((domain) => domainFilter(domain.slug))
    .map((domain) => ({
      action: domain.action,
      slug: domain.slug,
      id: domain.id,
      diffs: [...domain.diffs],
      lifecycle: domain.lifecycle,
      sunsetPlan:
        domain.sunsetPlan && typeof domain.sunsetPlan === 'object'
          ? (serialize(domain.sunsetPlan) as Record<string, unknown>)
          : undefined,
      config: domain.config ? (serialize(domain.config) as Record<string, unknown>) : undefined,
    }));

  const summaryOps = plan.domainOperations
    .filter((domain) => domainFilter(domain.slug))
    .map((entry) => ({
      slug: entry.slug,
      diffs: [...entry.diffs],
      config: serialize(entry.config) as Record<string, unknown>,
    }));

  const summaryTelemetry = plan.domainTelemetry
    .filter((domain) => domainFilter(domain.slug))
    .map((entry) => ({
      slug: entry.slug,
      diffs: [...entry.diffs],
      config: serialize(entry.config) as Record<string, unknown>,
    }));

  const summaryInfrastructure = plan.domainInfrastructure
    .filter((domain) => domainFilter(domain.slug))
    .map((entry) => ({
      slug: entry.slug,
      diffs: [...entry.diffs],
      config: serialize(entry.config) as Record<string, unknown>,
    }));

  const actions: Phase6PlanSummary['actions'] = {
    domains: summaryDomains,
    domainOperations: summaryOps,
    domainTelemetry: summaryTelemetry,
    domainInfrastructure: summaryInfrastructure,
  };

  if (!options.filters.skipGlobal && plan.global) {
    actions.global = {
      diffs: [...plan.global.diffs],
      config: serialize(plan.global.config) as Record<string, unknown>,
    };
  }

  if (plan.globalGuards) {
    actions.globalGuards = {
      diffs: [...plan.globalGuards.diffs],
      config: serialize(plan.globalGuards.config) as Record<string, unknown>,
    };
  }

  if (plan.globalTelemetry) {
    actions.globalTelemetry = {
      diffs: [...plan.globalTelemetry.diffs],
      config: serialize(plan.globalTelemetry.config) as Record<string, unknown>,
    };
  }

  if (plan.globalInfrastructure) {
    actions.globalInfrastructure = {
      diffs: [...plan.globalInfrastructure.diffs],
      config: serialize(plan.globalInfrastructure.config) as Record<string, unknown>,
    };
  }

  if (!options.filters.skipSystemPause && plan.systemPause) {
    actions.systemPause = { target: plan.systemPause.target };
  }

  if (!options.filters.skipEscalation && plan.escalationBridge) {
    actions.escalationBridge = { target: plan.escalationBridge.target };
  }

  const globalActions = [
    actions.global,
    actions.globalGuards,
    actions.globalTelemetry,
    actions.globalInfrastructure,
    actions.systemPause,
    actions.escalationBridge,
  ].filter(Boolean).length;

  const counts = {
    global: globalActions,
    domains: actions.domains.length,
    domainOperations: actions.domainOperations.length,
    domainTelemetry: actions.domainTelemetry.length,
    domainInfrastructure: actions.domainInfrastructure.length,
  };
  counts.total =
    counts.global +
    counts.domains +
    counts.domainOperations +
    counts.domainTelemetry +
    counts.domainInfrastructure;

  return {
    generatedAt: new Date().toISOString(),
    manager: options.manager,
    governance: options.governance,
    specVersion: options.specVersion,
    network: options.network,
    configPath: options.configPath,
    dryRun: options.dryRun,
    filters: {
      skipGlobal: options.filters.skipGlobal,
      skipSystemPause: options.filters.skipSystemPause,
      skipEscalation: options.filters.skipEscalation,
      onlyDomains: Array.from(onlyDomains),
    },
    warnings: [...plan.warnings],
    counts,
    actions,
  };
}

export async function fetchPhase6State(manager: Contract): Promise<Phase6State> {
  const [
    globalRaw,
    systemPause,
    escalationBridge,
    domainViews,
    guardsRaw,
    globalTelemetryRaw,
    globalInfrastructureRaw,
  ] = await Promise.all([
    manager.globalConfig(),
    manager.systemPause(),
    manager.escalationBridge(),
    manager.listDomains(),
    manager.globalGuards(),
    manager.globalTelemetry(),
    manager.globalInfrastructure(),
  ]);

  const global: GlobalConfigStruct = {
    iotOracleRouter: String(globalRaw.iotOracleRouter ?? globalRaw[0] ?? ZERO_ADDRESS),
    defaultL2Gateway: String(globalRaw.defaultL2Gateway ?? globalRaw[1] ?? ZERO_ADDRESS),
    didRegistry: String(globalRaw.didRegistry ?? globalRaw[2] ?? ZERO_ADDRESS),
    treasuryBridge: String(globalRaw.treasuryBridge ?? globalRaw[3] ?? ZERO_ADDRESS),
    l2SyncCadence: asBigInt(globalRaw.l2SyncCadence ?? globalRaw[4] ?? 0),
    manifestURI: String(globalRaw.manifestURI ?? globalRaw[5] ?? ''),
  };

  const domains = (domainViews as any[]).map((view) => normalizeDomainView(view));
  const operationsEntries = await Promise.all(
    domains.map((domain) => manager.getDomainOperations(domain.id)),
  );
  const domainOperations: Record<string, DomainOperationsStruct> = {};
  operationsEntries.forEach((ops, idx) => {
    const slugKey = domains[idx].slug.toLowerCase();
    domainOperations[slugKey] = normalizeDomainOperations(ops);
  });

  const telemetryEntries = await Promise.all(
    domains.map((domain) => manager.getDomainTelemetry(domain.id).catch(() => null)),
  );
  const domainTelemetry: Record<string, DomainTelemetryStruct> = {};
  telemetryEntries.forEach((telemetry, idx) => {
    const slugKey = domains[idx].slug.toLowerCase();
    if (telemetry) {
      domainTelemetry[slugKey] = normalizeDomainTelemetry(telemetry);
    }
  });

  const infrastructureEntries = await Promise.all(
    domains.map((domain) => manager.getDomainInfrastructure(domain.id).catch(() => null)),
  );
  const domainInfrastructure: Record<string, DomainInfrastructureStruct> = {};
  infrastructureEntries.forEach((infra, idx) => {
    const slugKey = domains[idx].slug.toLowerCase();
    if (infra) {
      domainInfrastructure[slugKey] = normalizeDomainInfrastructure(infra);
    }
  });

  return {
    global,
    systemPause: String(systemPause ?? ZERO_ADDRESS),
    escalationBridge: String(escalationBridge ?? ZERO_ADDRESS),
    domains,
    domainOperations,
    globalGuards: normalizeGlobalGuards(guardsRaw),
    domainTelemetry,
    globalTelemetry: normalizeGlobalTelemetry(globalTelemetryRaw),
    domainInfrastructure,
    globalInfrastructure: normalizeGlobalInfrastructure(globalInfrastructureRaw),
  };
}

export function loadPhase6Config(path: string): Phase6Config {
  const absolute = resolve(path);
  const raw = JSON.parse(readFileSync(absolute, 'utf-8'));
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid configuration file at ${absolute}`);
  }
  if (!raw.global || typeof raw.global !== 'object') {
    throw new Error('Configuration missing global section.');
  }
  if (!Array.isArray(raw.domains)) {
    throw new Error('Configuration missing domains array.');
  }
  return raw as Phase6Config;
}
