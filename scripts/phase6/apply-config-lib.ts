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
};

export type DomainConfigInput = {
  slug: string;
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

export type Phase6Config = {
  global: GlobalConfigInput & { guards?: GlobalGuardsInput; telemetry?: GlobalTelemetryInput };
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

export type Phase6State = {
  global: GlobalConfigStruct;
  systemPause: string;
  escalationBridge: string;
  domains: ChainDomain[];
  domainOperations: Record<string, DomainOperationsStruct>;
  globalGuards: GlobalGuardsStruct;
  domainTelemetry: Record<string, DomainTelemetryStruct>;
  globalTelemetry: GlobalTelemetryStruct;
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
  action: 'registerDomain' | 'updateDomain';
  id: string;
  slug: string;
  config: DomainStruct;
  diffs: string[];
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

export type Phase6Plan = {
  global?: GlobalPlan;
  systemPause?: AddressPlan;
  escalationBridge?: AddressPlan;
  domains: DomainPlan[];
  domainOperations: DomainOperationsPlan[];
  globalGuards?: GlobalGuardsPlan;
  domainTelemetry: DomainTelemetryPlan[];
  globalTelemetry?: {
    action: 'setGlobalTelemetry';
    config: GlobalTelemetryStruct;
    diffs: string[];
  };
  warnings: string[];
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
  const touchedOperations = new Set<string>();
  const touchedTelemetry = new Set<string>();

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
    const struct = buildDomainStruct(input, existing?.active);
    if (!existing) {
      domains.push({
        action: 'registerDomain',
        id: domainIdFromSlug(slug),
        slug,
        config: struct,
        diffs: ['slug', 'metadataURI', 'validationModule', 'subgraphEndpoint', 'heartbeatSeconds'],
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

export async function fetchPhase6State(manager: Contract): Promise<Phase6State> {
  const [globalRaw, systemPause, escalationBridge, domainViews, guardsRaw, globalTelemetryRaw] = await Promise.all([
    manager.globalConfig(),
    manager.systemPause(),
    manager.escalationBridge(),
    manager.listDomains(),
    manager.globalGuards(),
    manager.globalTelemetry(),
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

  return {
    global,
    systemPause: String(systemPause ?? ZERO_ADDRESS),
    escalationBridge: String(escalationBridge ?? ZERO_ADDRESS),
    domains,
    domainOperations,
    globalGuards: normalizeGlobalGuards(guardsRaw),
    domainTelemetry,
    globalTelemetry: normalizeGlobalTelemetry(globalTelemetryRaw),
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
