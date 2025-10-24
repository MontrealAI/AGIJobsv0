#!/usr/bin/env ts-node
import { readFileSync } from 'node:fs';
import { Interface, formatEther, keccak256, toUtf8Bytes } from 'ethers';

export interface DecentralizedInfraEntry {
  name: string;
  role: string;
  status: string;
  endpoint?: string;
}

export interface DomainInfrastructureEntry {
  layer: string;
  name: string;
  role: string;
  status: string;
  endpoint?: string;
  uri?: string;
}

export interface DomainOperationsConfig {
  maxActiveJobs: number;
  maxQueueDepth: number;
  minStake: string | number;
  treasuryShareBps: number;
  circuitBreakerBps: number;
  requiresHumanValidation?: boolean;
}

export interface DomainTelemetryConfig {
  resilienceBps: number;
  automationBps: number;
  complianceBps: number;
  settlementLatencySeconds: number;
  usesL2Settlement: boolean;
  sentinelOracle?: string;
  settlementAsset?: string;
  metricsDigest: string;
  manifestHash: string;
}

export interface DomainMetadataConfig {
  domain: string;
  l2: string;
  sentinel: string;
  resilienceIndex: number;
  uptime: string;
  valueFlowMonthlyUSD: number;
  valueFlowDisplay?: string;
  [key: string]: unknown;
}

export interface Phase6DemoConfig {
  global: {
    manifestURI: string;
    iotOracleRouter?: string;
    defaultL2Gateway?: string;
    didRegistry?: string;
    treasuryBridge?: string;
    systemPause?: string;
    escalationBridge?: string;
    l2SyncCadence?: number;
    guards?: {
      treasuryBufferBps: number;
      circuitBreakerBps: number;
      anomalyGracePeriod: number;
      autoPauseEnabled: boolean;
      oversightCouncil?: string;
    };
    decentralizedInfra?: DecentralizedInfraEntry[];
    telemetry?: {
      manifestHash: string;
      metricsDigest: string;
      resilienceFloorBps: number;
      automationFloorBps: number;
      oversightWeightBps: number;
    };
  };
  domains: Array<{
    slug: string;
    name: string;
    manifestURI: string;
    subgraph: string;
    validationModule: string;
    oracle?: string;
    l2Gateway?: string;
    executionRouter?: string;
    heartbeatSeconds?: number;
    operations?: DomainOperationsConfig;
    telemetry?: DomainTelemetryConfig;
    skillTags?: string[];
    capabilities?: Record<string, number>;
    priority?: number;
    metadata?: DomainMetadataConfig;
    infrastructure?: DomainInfrastructureEntry[];
  }>;
}

export interface DomainBlueprint {
  slug: string;
  name: string;
  domainId: string;
  manifestURI: string;
  subgraph: string;
  priority: number;
  skillTags: string[];
  capabilities: Record<string, number>;
  heartbeatSeconds: number;
  addresses: {
    validationModule: string;
    oracle: string | null;
    l2Gateway: string | null;
    executionRouter: string | null;
  };
  operations: {
    maxActiveJobs: number;
    maxQueueDepth: number;
    minStakeWei: string;
    minStakeEth: string;
    treasuryShareBps: number;
    circuitBreakerBps: number;
    requiresHumanValidation: boolean;
  };
  telemetry: {
    resilienceBps: number;
    automationBps: number;
    complianceBps: number;
    settlementLatencySeconds: number;
    usesL2Settlement: boolean;
    sentinelOracle: string | null;
    settlementAsset: string | null;
    metricsDigest: string;
    manifestHash: string;
  };
  metadata: {
    resilienceIndex: number | null;
    valueFlowMonthlyUSD: number | null;
    valueFlowDisplay: string | null;
    sentinel: string | null;
    uptime: string | null;
    raw: Record<string, unknown>;
  };
  infrastructure: DomainInfrastructureEntry[];
  calldata: {
    registerDomain: string;
    updateDomain: string;
    setDomainOperations: string;
    setDomainTelemetry: string;
  };
}

export interface Phase6Blueprint {
  generatedAt: string;
  configPath?: string;
  configHash: string;
  specVersion: string;
  fragments: string[];
  metrics: {
    domainCount: number;
    averageResilience?: number;
    minResilience?: number;
    maxResilience?: number;
    averageAutomation?: number;
    averageCompliance?: number;
    averageLatency?: number;
    l2SettlementCoverage: number;
    totalValueFlowUSD: number;
    sentinelFamilies: number;
    globalInfraCount: number;
    domainInfraCount: number;
  };
  global: {
    manifestURI: string;
    iotOracleRouter: string | null;
    defaultL2Gateway: string | null;
    didRegistry: string | null;
    treasuryBridge: string | null;
    systemPause: string | null;
    escalationBridge: string | null;
    l2SyncCadenceSeconds: number;
  };
  guards: {
    treasuryBufferBps: number;
    circuitBreakerBps: number;
    anomalyGracePeriod: number;
    autoPauseEnabled: boolean;
    oversightCouncil: string | null;
  };
  telemetry: {
    manifestHash: string | null;
    metricsDigest: string | null;
    resilienceFloorBps: number | null;
    automationFloorBps: number | null;
    oversightWeightBps: number | null;
  };
  infrastructure: {
    global: DecentralizedInfraEntry[];
    domains: Record<string, DomainInfrastructureEntry[]>;
  };
  calldata: {
    globalConfig: string;
    globalGuards: string;
    globalTelemetry: string;
    systemPause?: string;
    escalationBridge?: string;
  };
  mermaid: string;
  domains: DomainBlueprint[];
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES32 = '0x' + '0'.repeat(64);

export const ABI_FRAGMENTS = [
  'function setGlobalConfig((address,address,address,address,uint64,string) config)',
  'function setGlobalGuards((uint16,uint16,uint32,bool,address) config)',
  'function setGlobalTelemetry((bytes32,bytes32,uint32,uint32,uint32) telemetry)',
  'function setSystemPause(address newPause)',
  'function setEscalationBridge(address newBridge)',
  'function registerDomain((string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
  'function updateDomain(bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
  'function setDomainOperations(bytes32 id,(uint48 maxActiveJobs,uint48 maxQueueDepth,uint96 minStake,uint16 treasuryShareBps,uint16 circuitBreakerBps,bool requiresHumanValidation) config)',
  'function setDomainTelemetry(bytes32 id,(uint32,uint32,uint32,uint32,bool,address,address,bytes32,bytes32) telemetry)',
];

const ABI_INTERFACE = new Interface(ABI_FRAGMENTS);

function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function normaliseAddress(value: string | undefined): string | null {
  if (!value) return null;
  if (value === ZERO_ADDRESS) return null;
  return value;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function toBigIntString(value: string | number | undefined): string {
  if (value === undefined) return '0';
  if (typeof value === 'number') return BigInt(Math.trunc(value)).toString();
  return BigInt(value).toString();
}

function minStakeEth(valueWei: string): string {
  try {
    return `${formatEther(BigInt(valueWei))} ETH`;
  } catch (error) {
    return valueWei;
  }
}

function computeMermaid(config: Phase6DemoConfig): string {
  const lines = ['graph TD', '  Owner[[Governance]] --> Expansion(Phase6ExpansionManager)'];
  for (const domain of config.domains) {
    const id = domain.slug.replace(/[^a-z0-9]/gi, '');
    lines.push(`  Expansion --> ${id}([${domain.name}])`);
    lines.push(`  ${id} --> Runtime`);
  }
  lines.push('  Runtime[Phase6 Runtime] --> IoT[IoT & external oracles]');
  lines.push('  Runtime --> L2[Layer-2 Executors]');
  lines.push('  L2 --> Settlement[Ethereum Mainnet]');
  return lines.join('\n');
}

function computeMetrics(config: Phase6DemoConfig) {
  const resilience: number[] = [];
  const automation: number[] = [];
  const compliance: number[] = [];
  const latency: number[] = [];
  const sentinels = new Set<string>();
  let l2Settlements = 0;
  let totalValueFlow = 0;

  for (const domain of config.domains) {
    const metadata = domain.metadata;
    if (metadata) {
      const resilienceIndex = toNumber(metadata.resilienceIndex);
      if (resilienceIndex !== null) {
        resilience.push(resilienceIndex);
      }
      const valueFlow = toNumber(metadata.valueFlowMonthlyUSD);
      if (valueFlow !== null) {
        totalValueFlow += valueFlow;
      }
      const sentinel = metadata.sentinel;
      if (typeof sentinel === 'string' && sentinel.length > 0) {
        sentinels.add(sentinel);
      }
    }
    const telemetry = domain.telemetry;
    if (telemetry) {
      const auto = toNumber(telemetry.automationBps);
      if (auto !== null) {
        automation.push(auto);
      }
      const comp = toNumber(telemetry.complianceBps);
      if (comp !== null) {
        compliance.push(comp);
      }
      const latencySeconds = toNumber(telemetry.settlementLatencySeconds);
      if (latencySeconds !== null) {
        latency.push(latencySeconds);
      }
      if (telemetry.usesL2Settlement) {
        l2Settlements += 1;
      }
    }
  }

  const average = (values: number[]): number | undefined => {
    if (!values.length) return undefined;
    return values.reduce((acc, cur) => acc + cur, 0) / values.length;
  };

  return {
    domainCount: config.domains.length,
    averageResilience: average(resilience),
    minResilience: resilience.length ? Math.min(...resilience) : undefined,
    maxResilience: resilience.length ? Math.max(...resilience) : undefined,
    averageAutomation: average(automation),
    averageCompliance: average(compliance),
    averageLatency: average(latency),
    l2SettlementCoverage: config.domains.length ? l2Settlements / config.domains.length : 0,
    totalValueFlowUSD: totalValueFlow,
    sentinelFamilies: sentinels.size,
    globalInfraCount: ensureArray(config.global.decentralizedInfra).length,
    domainInfraCount: config.domains.reduce(
      (acc, domain) => acc + ensureArray(domain.infrastructure).length,
      0,
    ),
  };
}

function buildDomainTuples(domain: Phase6DemoConfig['domains'][number]) {
  const tuple = [
    domain.slug,
    domain.name,
    domain.manifestURI,
    domain.validationModule ?? ZERO_ADDRESS,
    domain.oracle ?? ZERO_ADDRESS,
    domain.l2Gateway ?? ZERO_ADDRESS,
    domain.subgraph,
    domain.executionRouter ?? ZERO_ADDRESS,
    BigInt(domain.heartbeatSeconds ?? 120),
    true,
  ];

  const operations = domain.operations ?? {
    maxActiveJobs: 0,
    maxQueueDepth: 0,
    minStake: 0,
    treasuryShareBps: 0,
    circuitBreakerBps: 0,
    requiresHumanValidation: false,
  };

  const opsTuple = [
    BigInt(Math.trunc(Number(operations.maxActiveJobs ?? 0))),
    BigInt(Math.trunc(Number(operations.maxQueueDepth ?? 0))),
    BigInt(toBigIntString(operations.minStake)),
    Number(operations.treasuryShareBps ?? 0),
    Number(operations.circuitBreakerBps ?? 0),
    Boolean(operations.requiresHumanValidation),
  ];

  const telemetry = domain.telemetry ?? {
    resilienceBps: 0,
    automationBps: 0,
    complianceBps: 0,
    settlementLatencySeconds: 0,
    usesL2Settlement: false,
    metricsDigest: ZERO_BYTES32,
    manifestHash: ZERO_BYTES32,
  };

  const telemetryTuple = [
    Number(telemetry.resilienceBps ?? 0),
    Number(telemetry.automationBps ?? 0),
    Number(telemetry.complianceBps ?? 0),
    Number(telemetry.settlementLatencySeconds ?? 0),
    Boolean(telemetry.usesL2Settlement ?? false),
    telemetry.sentinelOracle ?? ZERO_ADDRESS,
    telemetry.settlementAsset ?? ZERO_ADDRESS,
    typeof telemetry.metricsDigest === 'string' && telemetry.metricsDigest.startsWith('0x')
      ? telemetry.metricsDigest
      : ZERO_BYTES32,
    typeof telemetry.manifestHash === 'string' && telemetry.manifestHash.startsWith('0x')
      ? telemetry.manifestHash
      : ZERO_BYTES32,
  ];

  return { tuple, opsTuple, telemetryTuple };
}

export function loadPhase6Config(path: string): Phase6DemoConfig {
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  return data as Phase6DemoConfig;
}

export function buildPhase6Blueprint(
  config: Phase6DemoConfig,
  options: { configPath?: string } = {},
): Phase6Blueprint {
  const metrics = computeMetrics(config);

  const configHash = keccak256(toUtf8Bytes(JSON.stringify(config)));
  const mermaid = computeMermaid(config);

  const globalGuards = config.global.guards ?? {
    treasuryBufferBps: 0,
    circuitBreakerBps: 0,
    anomalyGracePeriod: 0,
    autoPauseEnabled: false,
  };

  const globalTelemetry = config.global.telemetry ?? null;

  const globalTuple = [
    config.global.iotOracleRouter ?? ZERO_ADDRESS,
    config.global.defaultL2Gateway ?? ZERO_ADDRESS,
    config.global.didRegistry ?? ZERO_ADDRESS,
    config.global.treasuryBridge ?? ZERO_ADDRESS,
    BigInt(config.global.l2SyncCadence ?? 180),
    config.global.manifestURI,
  ];

  const guardTuple = [
    Number(globalGuards.treasuryBufferBps ?? 0),
    Number(globalGuards.circuitBreakerBps ?? 0),
    Number(globalGuards.anomalyGracePeriod ?? 0),
    Boolean(globalGuards.autoPauseEnabled ?? false),
    globalGuards.oversightCouncil ?? ZERO_ADDRESS,
  ];

  const telemetryTuple = [
    globalTelemetry?.manifestHash ?? ZERO_BYTES32,
    globalTelemetry?.metricsDigest ?? ZERO_BYTES32,
    Number(globalTelemetry?.resilienceFloorBps ?? 0),
    Number(globalTelemetry?.automationFloorBps ?? 0),
    Number(globalTelemetry?.oversightWeightBps ?? 0),
  ];

  const domains: DomainBlueprint[] = config.domains.map((domain) => {
    const domainId = keccak256(toUtf8Bytes(String(domain.slug).toLowerCase()));
    const tuples = buildDomainTuples(domain);
    const metadata = domain.metadata ?? ({} as DomainMetadataConfig);
    const telemetry = domain.telemetry ?? ({} as DomainTelemetryConfig);
    const operations = domain.operations ?? ({} as DomainOperationsConfig);

    return {
      slug: domain.slug,
      name: domain.name,
      domainId,
      manifestURI: domain.manifestURI,
      subgraph: domain.subgraph,
      priority: Number(domain.priority ?? 0),
      skillTags: ensureArray(domain.skillTags).map((tag) => tag.toLowerCase()),
      capabilities: Object.fromEntries(
        Object.entries(domain.capabilities ?? {}).map(([key, value]) => [key.toLowerCase(), Number(value)]),
      ),
      heartbeatSeconds: Number(domain.heartbeatSeconds ?? config.global.l2SyncCadence ?? 0),
      addresses: {
        validationModule: domain.validationModule,
        oracle: normaliseAddress(domain.oracle),
        l2Gateway: normaliseAddress(domain.l2Gateway),
        executionRouter: normaliseAddress(domain.executionRouter),
      },
      operations: {
        maxActiveJobs: Number(operations.maxActiveJobs ?? 0),
        maxQueueDepth: Number(operations.maxQueueDepth ?? 0),
        minStakeWei: toBigIntString(operations.minStake ?? '0'),
        minStakeEth: minStakeEth(toBigIntString(operations.minStake ?? '0')),
        treasuryShareBps: Number(operations.treasuryShareBps ?? 0),
        circuitBreakerBps: Number(operations.circuitBreakerBps ?? 0),
        requiresHumanValidation: Boolean(operations.requiresHumanValidation ?? false),
      },
      telemetry: {
        resilienceBps: Number(telemetry.resilienceBps ?? 0),
        automationBps: Number(telemetry.automationBps ?? 0),
        complianceBps: Number(telemetry.complianceBps ?? 0),
        settlementLatencySeconds: Number(telemetry.settlementLatencySeconds ?? 0),
        usesL2Settlement: Boolean(telemetry.usesL2Settlement ?? false),
        sentinelOracle: normaliseAddress(telemetry.sentinelOracle ?? undefined),
        settlementAsset: normaliseAddress(telemetry.settlementAsset ?? undefined),
        metricsDigest: telemetry.metricsDigest ?? ZERO_BYTES32,
        manifestHash: telemetry.manifestHash ?? ZERO_BYTES32,
      },
      metadata: {
        resilienceIndex: toNumber(metadata.resilienceIndex),
        valueFlowMonthlyUSD: toNumber(metadata.valueFlowMonthlyUSD),
        valueFlowDisplay: typeof metadata.valueFlowDisplay === 'string' ? metadata.valueFlowDisplay : null,
        sentinel: typeof metadata.sentinel === 'string' ? metadata.sentinel : null,
        uptime: typeof metadata.uptime === 'string' ? metadata.uptime : null,
        raw: metadata as Record<string, unknown>,
      },
      infrastructure: ensureArray(domain.infrastructure),
      calldata: {
        registerDomain: ABI_INTERFACE.encodeFunctionData('registerDomain', [tuples.tuple]),
        updateDomain: ABI_INTERFACE.encodeFunctionData('updateDomain', [domainId, tuples.tuple]),
        setDomainOperations: ABI_INTERFACE.encodeFunctionData('setDomainOperations', [domainId, tuples.opsTuple]),
        setDomainTelemetry: ABI_INTERFACE.encodeFunctionData('setDomainTelemetry', [domainId, tuples.telemetryTuple]),
      },
    };
  });

  const globalInfra = ensureArray(config.global.decentralizedInfra);
  const domainInfra: Record<string, DomainInfrastructureEntry[]> = {};
  for (const domain of config.domains) {
    domainInfra[domain.slug] = ensureArray(domain.infrastructure);
  }

  const calldata = {
    globalConfig: ABI_INTERFACE.encodeFunctionData('setGlobalConfig', [globalTuple]),
    globalGuards: ABI_INTERFACE.encodeFunctionData('setGlobalGuards', [guardTuple]),
    globalTelemetry: ABI_INTERFACE.encodeFunctionData('setGlobalTelemetry', [telemetryTuple]),
    systemPause: config.global.systemPause
      ? ABI_INTERFACE.encodeFunctionData('setSystemPause', [config.global.systemPause])
      : undefined,
    escalationBridge: config.global.escalationBridge
      ? ABI_INTERFACE.encodeFunctionData('setEscalationBridge', [config.global.escalationBridge])
      : undefined,
  };

  return {
    generatedAt: new Date().toISOString(),
    configPath: options.configPath,
    configHash,
    specVersion: 'phase6.expansion.v2',
    fragments: [...ABI_FRAGMENTS],
    metrics,
    global: {
      manifestURI: config.global.manifestURI,
      iotOracleRouter: normaliseAddress(config.global.iotOracleRouter),
      defaultL2Gateway: normaliseAddress(config.global.defaultL2Gateway),
      didRegistry: normaliseAddress(config.global.didRegistry),
      treasuryBridge: normaliseAddress(config.global.treasuryBridge),
      systemPause: normaliseAddress(config.global.systemPause),
      escalationBridge: normaliseAddress(config.global.escalationBridge),
      l2SyncCadenceSeconds: Number(config.global.l2SyncCadence ?? 0),
    },
    guards: {
      treasuryBufferBps: Number(globalGuards.treasuryBufferBps ?? 0),
      circuitBreakerBps: Number(globalGuards.circuitBreakerBps ?? 0),
      anomalyGracePeriod: Number(globalGuards.anomalyGracePeriod ?? 0),
      autoPauseEnabled: Boolean(globalGuards.autoPauseEnabled ?? false),
      oversightCouncil: normaliseAddress(globalGuards.oversightCouncil ?? undefined),
    },
    telemetry: {
      manifestHash: globalTelemetry?.manifestHash ?? null,
      metricsDigest: globalTelemetry?.metricsDigest ?? null,
      resilienceFloorBps: globalTelemetry?.resilienceFloorBps ?? null,
      automationFloorBps: globalTelemetry?.automationFloorBps ?? null,
      oversightWeightBps: globalTelemetry?.oversightWeightBps ?? null,
    },
    infrastructure: {
      global: globalInfra,
      domains: domainInfra,
    },
    calldata,
    mermaid,
    domains,
  };
}

