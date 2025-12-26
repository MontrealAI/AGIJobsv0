#!/usr/bin/env ts-node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { Interface, keccak256, toUtf8Bytes } from "ethers";
import { z } from "zod";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

function resolveDemoRoot(): string {
  const defaultRoot = join(__dirname, "..");
  const repoRoot = resolve(defaultRoot, "..", "..", "..");

  let profile = process.env.KARDASHEV_DEMO_PROFILE?.trim();
  let explicitRoot = process.env.KARDASHEV_DEMO_ROOT?.trim();

  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    if (token === "--profile" && rawArgs[i + 1]) {
      profile = rawArgs[i + 1];
      i += 1;
    } else if (token?.startsWith("--profile=")) {
      profile = token.split("=", 2)[1];
    } else if (token === "--config-root" && rawArgs[i + 1]) {
      explicitRoot = rawArgs[i + 1];
      i += 1;
    } else if (token?.startsWith("--config-root=")) {
      explicitRoot = token.split("=", 2)[1];
    }
  }

  if (profile && profile.length > 0) {
    const candidate = resolve(defaultRoot, profile);
    if (existsSync(candidate)) {
      return candidate;
    }
    throw new Error(`Profile directory not found: ${candidate}`);
  }

  if (explicitRoot && explicitRoot.length > 0) {
    const candidate = isAbsolute(explicitRoot)
      ? explicitRoot
      : resolve(repoRoot, explicitRoot);
    if (existsSync(candidate)) {
      return candidate;
    }
    throw new Error(`Config root override not found: ${candidate}`);
  }

  return defaultRoot;
}

const DEMO_ROOT = resolveDemoRoot();
const CONFIG_PATH = join(DEMO_ROOT, "config", "kardashev-ii.manifest.json");
const ENERGY_FEEDS_PATH = join(DEMO_ROOT, "config", "energy-feeds.json");
const FABRIC_CONFIG_PATH = join(DEMO_ROOT, "config", "fabric.json");
const TASK_LATTICE_CONFIG_PATH = join(DEMO_ROOT, "config", "task-lattice.json");
const OUTPUT_DIR = join(DEMO_ROOT, "output");
const OUTPUT_PREFIX = (() => {
  const raw = process.env.KARDASHEV_DEMO_PREFIX?.trim();
  const slug = raw?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "kardashev";
  return slug.length > 0 ? slug : "kardashev";
})();

const CHECK_MODE = args.has("--check") || args.has("--ci");
const REFLECT_MODE = args.has("--reflect");

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const managerInterface = new Interface([
  "function setGlobalParameters((address,address,address,address,address,address,uint64,uint64,uint256,string,bytes32))",
  "function setGuardianCouncil(address)",
  "function setSystemPause(address)",
  "function registerDomain((string,string,string,address,address,address,address,uint64,uint256,uint256,bool))",
  "function registerSentinel((string,string,string,address,uint64,uint256,bool))",
  "function setSentinelDomains(bytes32,bytes32[])",
  "function registerCapitalStream((string,string,string,address,uint256,uint256,bool))",
  "function setCapitalStreamDomains(bytes32,bytes32[])",
  "function setSelfImprovementPlan((string,bytes32,uint64,uint64,string))",
  "function forwardPauseCall(bytes)",
]);

const systemPauseInterface = new Interface([
  "function pauseAll()",
  "function unpauseAll()",
]);

function createDeterministicRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function kahanSum(values: number[]): number {
  let sum = 0;
  let c = 0;
  for (const value of values) {
    const y = value - c;
    const t = sum + y;
    c = t - sum - y;
    sum = t;
  }
  return sum;
}

function pairwiseSum(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return values[0];
  }
  const mid = Math.floor(values.length / 2);
  return pairwiseSum(values.slice(0, mid)) + pairwiseSum(values.slice(mid));
}

const AddressSchema = z
  .string()
  .trim()
  .refine((value) => ADDRESS_REGEX.test(value), {
    message: "Value must be a valid 20-byte hex address",
  })
  .transform((value) => value.toLowerCase());

const PositiveNumberSchema = z.number().positive();
const NonNegativeNumberSchema = z.number().nonnegative();

const EnergySchema = z.object({
  availableGw: NonNegativeNumberSchema,
  renewablePct: z.number().min(0).max(1),
  storageGwh: NonNegativeNumberSchema,
  latencyMs: NonNegativeNumberSchema,
});

const ComputeSchema = z.object({
  agents: z.number().nonnegative(),
  exaflops: NonNegativeNumberSchema,
  validatorNodes: z.number().nonnegative(),
  edgeNodes: z.number().nonnegative(),
});

const DomainSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  metadataURI: z.string().min(1),
  orchestrator: AddressSchema,
  capitalVault: AddressSchema,
  validatorModule: AddressSchema,
  policyKernel: AddressSchema,
  heartbeatSeconds: z.number().int().positive(),
  tvlLimit: z.string().regex(/^\d+$/),
  autonomyLevelBps: z.number().int().min(0).max(10_000),
  active: z.boolean(),
  resilience: z.number().min(0).max(1),
  monthlyValueUSD: z.number().min(0),
  coverageSeconds: z.number().positive(),
});

const SentinelSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  agent: AddressSchema,
  coverageSeconds: z.number().positive(),
  sensitivityBps: z.number().min(0).max(10_000),
  active: z.boolean(),
  domains: z.array(z.string().min(1)).min(1),
});

const CapitalStreamSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  vault: AddressSchema,
  annualBudget: z.string().regex(/^\d+$/),
  expansionBps: z.number().min(0).max(10_000),
  active: z.boolean(),
  domains: z.array(z.string().min(1)).min(1),
});

const LogisticsCorridorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fromFederation: z.string().min(1),
  toFederation: z.string().min(1),
  transportMode: z.string().min(1),
  capacityTonnesPerDay: PositiveNumberSchema,
  utilisationPct: z.number().min(0).max(1),
  averageTransitHours: PositiveNumberSchema,
  jitterHours: NonNegativeNumberSchema,
  reliabilityPct: z.number().min(0).max(1),
  bufferDays: z.number().nonnegative(),
  energyPerTransitMwh: PositiveNumberSchema,
  carbonIntensityKgPerMwh: NonNegativeNumberSchema,
  watchers: z.array(AddressSchema).min(1),
  multiSigSafe: AddressSchema,
  escrowAddress: AddressSchema,
  autonomyLevelBps: z.number().min(0).max(10_000),
  dedicatedValidators: z.number().int().nonnegative(),
  failoverCorridor: z.string().min(1),
  lastAuditISO8601: z.string().min(1),
});

const IdentityFederationSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  authority: AddressSchema,
  didRegistry: z.string().min(1),
  fallbackEnsRegistrar: AddressSchema,
  anchors: z.array(AddressSchema).min(1),
  attestationMethods: z.array(z.string().min(1)).min(1),
  attestationLatencySeconds: z.number().nonnegative(),
  credentialIssuances24h: z.number().nonnegative(),
  credentialRevocations24h: z.number().nonnegative(),
  totalAgents: z.number().nonnegative(),
  totalValidators: z.number().nonnegative(),
  coveragePct: z.number().min(0).max(1),
  lastAnchorRotationISO8601: z.string().min(1),
});

const IdentityProtocolsSchema = z.object({
  global: z.object({
    rootAuthority: AddressSchema,
    attestationQuorum: z.number().int().positive(),
    revocationWindowSeconds: z.number().int().positive(),
    identityMerkleRoot: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
      .transform((value) => value.toLowerCase()),
    auditLogURI: z.string().min(1),
    fallbackPolicyURI: z.string().min(1),
    lastAuditISO8601: z.string().min(1),
    revocationTolerancePpm: z.number().nonnegative(),
    coverageFloorPct: z.number().min(0).max(1),
  }),
  federations: z.array(IdentityFederationSchema).min(1),
});

const ComputePlaneSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  scheduler: AddressSchema,
  orchestratorSafe: AddressSchema,
  geography: z.string().min(1),
  capacityExaflops: z.number().positive(),
  energyGw: z.number().positive(),
  latencyMs: z.number().nonnegative(),
  availabilityPct: z.number().min(0).max(1),
  failoverPartner: z.string().min(1),
  notes: z.string().min(1),
});

const ComputeFabricsSchema = z.object({
  orchestrationPlanes: z.array(ComputePlaneSchema).min(1),
  failoverPolicies: z.object({
    quorumPct: z.number().min(0).max(1),
    layeredHierarchies: z.number().int().positive(),
    auditURI: z.string().min(1),
    energyBalancing: z.string().min(1),
  }),
});

const FederationSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  chainId: z.number().int().positive(),
  governanceSafe: AddressSchema,
  energy: EnergySchema,
  compute: ComputeSchema,
  domains: z.array(DomainSchema).min(1),
  sentinels: z.array(SentinelSchema).min(1),
  capitalStreams: z.array(CapitalStreamSchema).min(1),
});

const MissionPowerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  safeIndex: z.number().int().nonnegative(),
  playbookURI: z.string().min(1),
});

const MissionDirectivesSchema = z.object({
  ownerPowers: z.array(MissionPowerSchema).min(1),
  escalation: z.object({
    guardianHotline: z.string().min(1),
    operationsHotline: z.string().min(1),
    statusPageURI: z.string().min(1),
    bridgeFailover: z.string().min(1),
  }),
  drills: z.object({
    pauseCadenceHours: z.number().positive(),
    guardianReviewMinutes: z.number().positive(),
    nextDrillISO8601: z.string().min(1),
  }),
});

const VerificationProtocolsSchema = z.object({
  energyModels: z.array(z.string().min(1)).min(1),
  computeTolerancePct: z.number().min(0),
  bridgeLatencyToleranceSeconds: z.number().nonnegative(),
  manifestHashing: z.string().min(1),
  auditChecklistURI: z.string().min(1),
});

const EnergyWindowSchema = z.object({
  federation: z.string().min(1),
  startHourUTC: z.number().int().min(0).max(23),
  durationHours: z.number().positive(),
  availableGw: NonNegativeNumberSchema,
  backupGw: NonNegativeNumberSchema,
  renewablePct: z.number().min(0).max(1),
  reliabilityPct: z.number().min(0).max(1),
  priorityDomains: z.array(z.string().min(1)).min(1),
  transferCapacityGbps: z.number().positive(),
});

const SettlementProtocolSchema = z.object({
  name: z.string().min(1),
  chainId: z.number().int().positive(),
  bridge: z.string().min(1),
  settlementAsset: z.string().min(1),
  finalityMinutes: z.number().positive(),
  toleranceMinutes: z.number().positive(),
  coveragePct: z.number().min(0).max(1),
  slippageBps: z.number().nonnegative(),
  riskLevel: z.enum(["low", "medium", "high"]),
  watchers: z.array(AddressSchema).min(1),
});

const ManifestSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  interstellarCouncil: z.object({
    chainId: z.number().int().positive(),
    managerAddress: AddressSchema,
    systemPauseAddress: AddressSchema,
    guardianCouncil: AddressSchema,
    manifestoURI: z.string().min(1),
    manifestoHash: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
      .transform((value) => value.toLowerCase()),
    knowledgeGraph: AddressSchema,
    knowledgeGraphURI: z.string().min(1).optional(),
    upgradeCoordinator: AddressSchema,
    validatorRegistry: AddressSchema,
    missionControl: AddressSchema,
    treasury: AddressSchema,
    universalVault: AddressSchema,
    heartbeatSeconds: z.number().int().positive(),
    guardianReviewWindow: z.number().int().positive(),
    maxDrawdownBps: z.number().int().min(0).max(10_000),
  }),
  selfImprovement: z.object({
    planURI: z.string().min(1),
    planHash: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
      .transform((value) => value.toLowerCase()),
    cadenceSeconds: z.number().int().positive(),
    lastExecutedAt: z.number().int().nonnegative(),
    lastReportURI: z.string().min(1),
  }),
  energyProtocols: z.object({
    stellarLattice: z.object({
      name: z.string().min(1),
      baselineCapturedGw: PositiveNumberSchema,
      expansionTargetsGw: z.array(PositiveNumberSchema).min(1),
      safetyMarginPct: z.number().positive(),
    }),
    thermostat: z.object({
      minKelvin: z.number().min(0),
      maxKelvin: z.number().max(1.2).refine((v) => v > 0),
      targetKelvin: z.number().min(0),
    }),
    coverageThresholdPct: z.number().min(0).max(100).optional(),
  }),
  missionDirectives: MissionDirectivesSchema,
  verificationProtocols: VerificationProtocolsSchema,
  identityProtocols: IdentityProtocolsSchema,
  computeFabrics: ComputeFabricsSchema,
  federations: z.array(FederationSchema).min(1),
  energyWindows: z.array(EnergyWindowSchema).min(1),
  settlementProtocols: z.array(SettlementProtocolSchema).min(1),
  logisticsCorridors: z.array(LogisticsCorridorSchema).min(1),
  interplanetaryBridges: z.record(
    z.object({
      latencySeconds: z.number().positive(),
      bandwidthGbps: z.number().positive(),
      bridgeOperator: AddressSchema,
      protocol: z.string().min(1),
    })
  ),
  dysonProgram: z.object({
    phases: z
      .array(
        z.object({
          name: z.string().min(1),
          durationDays: z.number().positive(),
          satellites: z.number().positive(),
          energyYieldGw: z.number().positive(),
        })
      )
      .min(1),
    safety: z.object({
      maxAutonomyBps: z.number().min(0).max(10_000),
      failsafeLatencySeconds: z.number().positive(),
      redundantCoveragePct: z.number().min(0),
    }),
  }),
});

type Manifest = z.infer<typeof ManifestSchema>;

const EnergyFeedSchema = z.object({
  federationSlug: z.string().min(1),
  region: z.string().min(1),
  telemetry: z.string().min(1),
  type: z.string().min(1),
  nominalMw: NonNegativeNumberSchema,
  bufferMw: NonNegativeNumberSchema,
  latencyMs: NonNegativeNumberSchema,
});

const EnergyFeedsConfigSchema = z.object({
  tolerancePct: z.number().min(0),
  driftAlertPct: z.number().min(0).optional(),
  calibrationISO8601: z.string().min(1),
  feeds: z.array(EnergyFeedSchema).min(1),
});

const FabricShardSchema = z.object({
  id: z.string().min(1),
  jobRegistry: AddressSchema,
  latencyMs: NonNegativeNumberSchema,
  domains: z.array(z.string().min(1)).min(1),
  guardianCouncil: AddressSchema,
  sentinels: z.array(AddressSchema).min(1),
});

const FabricConfigSchema = z.object({
  shards: z.array(FabricShardSchema).min(1),
  knowledgeGraph: AddressSchema,
  energyOracle: AddressSchema,
  rewardEngine: AddressSchema,
  phase8Manager: AddressSchema,
});

type EnergyFeedsConfig = z.infer<typeof EnergyFeedsConfigSchema>;
type FabricConfig = z.infer<typeof FabricConfigSchema>;

const MissionTaskSchema = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    domain: z.string().min(1),
    federation: z.string().min(1),
    ownerSafe: AddressSchema,
    durationDays: z.number().positive(),
    energyGw: NonNegativeNumberSchema,
    computeExaflops: NonNegativeNumberSchema,
    agentQuorum: z.number().nonnegative(),
    autonomyBps: z.number().int().min(0).max(10_000),
    risk: z.enum(["low", "medium", "high"]),
    fallbackPlan: z.string().min(1),
    sentinel: z.string().min(1),
    dependencies: z.array(z.string().min(1)).default([]),
    description: z.string().min(1),
    children: z.array(MissionTaskSchema).default([]),
  })
);

type MissionTask = z.infer<typeof MissionTaskSchema>;

const MissionProgrammeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().min(1),
  federation: z.string().min(1),
  ownerSafe: AddressSchema,
  targetValueUSD: z.number().nonnegative(),
  timelineDays: z.number().positive(),
  dependencies: z.array(z.string().min(1)).default([]),
  successCriteria: z.array(z.string().min(1)).min(1),
  rootTask: MissionTaskSchema,
});

const MissionLatticeSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  programmes: z.array(MissionProgrammeSchema).min(1),
});

type MissionProgramme = z.infer<typeof MissionProgrammeSchema>;
type MissionLattice = z.infer<typeof MissionLatticeSchema>;

type EnergyWindowProjection = {
  perFederation: Array<{
    federation: string;
    scheduledEnergyGwH: number;
    averageScheduledGw: number;
    windowCount: number;
    scheduledHours: number;
  }>;
  totalScheduledGwH: number;
  normalisedTotalGw: number;
  coverageRatio: number;
  windowCount: number;
};

type EnergyCrossVerification = {
  methods: {
    direct: number;
    kahan: number;
    pairwise: number;
    bigInt: number;
    projection: number;
  };
  toleranceGw: number;
  tolerancePct: number;
  maxDeviationGw: number;
  consensus: boolean;
  coverageRatio: number;
  projection: EnergyWindowProjection;
};

type MissionTelemetrySummary = {
  version: string;
  generatedAt: string;
  totals: {
    programmes: number;
    tasks: number;
    energyGw: number;
    computeExaflops: number;
    agentQuorum: number;
    averageTimelineDays: number;
  };
  verification: {
    dependenciesResolved: boolean;
    sentinelCoverage: boolean;
    fallbackCoverage: boolean;
    ownerAlignment: boolean;
    autonomyWithinBounds: boolean;
    timelineAligned: boolean;
    programmeDependenciesResolved: boolean;
    unstoppableScore: number;
    warnings: string[];
  };
  programmes: Array<{
    id: string;
    name: string;
    objective: string;
    federation: string;
    ownerSafe: string;
    taskCount: number;
    totalEnergyGw: number;
    totalComputeExaflops: number;
    totalAgentQuorum: number;
    criticalPathDays: number;
    timelineSlackDays: number;
    unstoppableScore: number;
    riskDistribution: { low: number; medium: number; high: number };
    dependencies: string[];
    missingDependencies: string[];
    missingProgrammeDependencies: string[];
    sentinelAlerts: string[];
    ownerAlerts: string[];
    timelineOk: boolean;
    autonomyOk: boolean;
  }>;
};

type MissionTelemetryArtifacts = {
  summary: MissionTelemetrySummary;
  mermaid: string;
  ledger: any;
};

type FlattenedMissionTask = {
  key: string;
  programmeId: string;
  node: MissionTask;
  depth: number;
  path: string[];
};

function sanitiseMermaidId(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, "_");
  return cleaned.length > 0 ? cleaned : `node_${keccak256(toUtf8Bytes(value)).slice(2, 10)}`;
}

function flattenMissionTask(
  programmeId: string,
  task: MissionTask,
  path: string[] = []
): FlattenedMissionTask[] {
  const currentPath = [...path, task.id];
  const key = `${programmeId}:${task.id}`;
  const entry: FlattenedMissionTask = {
    key,
    programmeId,
    node: task,
    depth: path.length,
    path: currentPath,
  };
  let results: FlattenedMissionTask[] = [entry];
  for (const child of task.children) {
    results = results.concat(flattenMissionTask(programmeId, child, currentPath));
  }
  return results;
}

function resolveMissionDependency(programmeId: string, dependency: string): string {
  if (dependency.includes(":")) {
    const [programme, task] = dependency.split(":", 2);
    if (programme && task) {
      return `${programme}:${task}`;
    }
  }
  return `${programmeId}:${dependency}`;
}

function detectMissionCycles(adjacency: Map<string, string[]>): string[][] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    stack.add(node);
    const neighbours = adjacency.get(node) ?? [];
    for (const neighbour of neighbours) {
      dfs(neighbour, [...path, neighbour]);
    }
    stack.delete(node);
  }

  adjacency.forEach((_, node) => {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  });

  return cycles;
}

function computeMissionCriticalPath(task: MissionTask): number {
  if (task.children.length === 0) {
    return task.durationDays;
  }
  const childDurations = task.children.map((child) => computeMissionCriticalPath(child));
  const longestChildPath = Math.max(...childDurations);
  return Math.max(task.durationDays, longestChildPath);
}

function buildMissionMermaid(lattice: MissionLattice): string {
  const lines: string[] = ["---", "title Mission Lattice Orchestration", "---", "flowchart TD"];
  const dependencyEdges = new Set<string>();
  const classAssignments: string[] = [];
  const knownTasks = new Set<string>();

  function registerTask(programmeId: string, task: MissionTask) {
    knownTasks.add(`${programmeId}:${task.id}`);
    task.children.forEach((child) => registerTask(programmeId, child));
  }

  lattice.programmes.forEach((programme) => registerTask(programme.id, programme.rootTask));

  function formatLabel(task: MissionTask): string {
    const energy = `${round(task.energyGw, 2)} GW`;
    const duration = `${task.durationDays}d`;
    return `${task.name}\\n${duration} · ${energy}`;
  }

  function addTask(programmeId: string, task: MissionTask, indent = "    "): string {
    const key = `${programmeId}:${task.id}`;
    const nodeId = sanitiseMermaidId(key);
    lines.push(`${indent}${nodeId}[${formatLabel(task)}]`);
    classAssignments.push(`class ${nodeId} risk-${task.risk};`);
    for (const child of task.children) {
      const childId = addTask(programmeId, child, indent);
      lines.push(`${indent}${nodeId} --> ${childId}`);
    }
    for (const dependency of task.dependencies) {
      const targetKey = resolveMissionDependency(programmeId, dependency);
      if (knownTasks.has(targetKey)) {
        dependencyEdges.add(`${nodeId} -.-> ${sanitiseMermaidId(targetKey)}`);
      }
    }
    return nodeId;
  }

  for (const programme of lattice.programmes) {
    const subgraphId = sanitiseMermaidId(`programme_${programme.id}`);
    lines.push(`  subgraph ${subgraphId}[${programme.name}]`);
    addTask(programme.id, programme.rootTask);
    lines.push("  end");
  }

  dependencyEdges.forEach((edge) => {
    lines.push(`  ${edge}`);
  });

  lines.push("  classDef risk-low fill:#0b3b31,stroke:#34d399,color:#ecfeff;");
  lines.push("  classDef risk-medium fill:#1f2937,stroke:#fbbf24,color:#f8fafc;");
  lines.push("  classDef risk-high fill:#7f1d1d,stroke:#f87171,color:#fef2f2;");
  lines.push(...classAssignments);

  return lines.join("\n");
}

function buildMissionLatticeTelemetry(lattice: MissionLattice, manifest: Manifest): MissionTelemetryArtifacts {
  const sentinelSlugs = new Set(
    manifest.federations.flatMap((federation) => federation.sentinels.map((sentinel) => sentinel.slug))
  );
  const federationSafes = new Map(
    manifest.federations.map((federation) => [federation.slug, federation.governanceSafe.toLowerCase()])
  );
  const programmeIds = new Set(lattice.programmes.map((programme) => programme.id));

  const nodeMap = new Map<string, FlattenedMissionTask>();
  const nodesByProgramme = new Map<string, FlattenedMissionTask[]>();
  for (const programme of lattice.programmes) {
    const flattened = flattenMissionTask(programme.id, programme.rootTask);
    nodesByProgramme.set(programme.id, flattened);
    for (const entry of flattened) {
      nodeMap.set(entry.key, entry);
    }
  }

  const adjacency = new Map<string, string[]>();
  const programmeMissingDependencies = new Map<string, string[]>();
  const programmeSentinelAlerts = new Map<string, string[]>();
  const programmeOwnerAlerts = new Map<string, string[]>();

  for (const programme of lattice.programmes) {
    programmeSentinelAlerts.set(programme.id, []);
    programmeOwnerAlerts.set(programme.id, []);
    programmeMissingDependencies.set(programme.id, []);
  }

  nodeMap.forEach((entry) => {
    adjacency.set(entry.key, []);
  });

  const missingDependencies: string[] = [];
  nodeMap.forEach((entry) => {
    const deps = entry.node.dependencies ?? [];
    for (const dependency of deps) {
      const resolved = resolveMissionDependency(entry.programmeId, dependency);
      if (!nodeMap.has(resolved)) {
        missingDependencies.push(`${entry.key}→${dependency}`);
        programmeMissingDependencies.get(entry.programmeId)?.push(`${entry.node.id}→${dependency}`);
      } else {
        adjacency.get(entry.key)?.push(resolved);
      }
    }
  });

  const cycles = detectMissionCycles(adjacency);

  const programmeSummaries: MissionTelemetrySummary["programmes"] = [];
  let totalEnergy = 0;
  let totalCompute = 0;
  let totalAgents = 0;
  let totalTimeline = 0;

  const warnings: string[] = [];
  let sentinelCoverageOk = true;
  let fallbackCoverageOk = true;
  let ownerAlignmentOk = true;
  let autonomyCoverageOk = true;
  let timelineAlignedOk = true;
  let programmeDependenciesResolvedOk = true;

  const programmeUnstoppable: number[] = [];

  const mermaidDiagram = buildMissionMermaid(lattice);

  for (const programme of lattice.programmes) {
    const tasks = nodesByProgramme.get(programme.id) ?? [];
    const taskCount = tasks.length;
    const energyGw = tasks.reduce((sum, entry) => sum + entry.node.energyGw, 0);
    const computeExaflops = tasks.reduce((sum, entry) => sum + entry.node.computeExaflops, 0);
    const agentQuorum = tasks.reduce((sum, entry) => sum + entry.node.agentQuorum, 0);
    const riskDistribution = tasks.reduce(
      (acc, entry) => {
        acc[entry.node.risk] += 1;
        return acc;
      },
      { low: 0, medium: 0, high: 0 } as { low: number; medium: number; high: number }
    );

    const missingDeps = programmeMissingDependencies.get(programme.id) ?? [];
    const programmeCycles = cycles.filter((cycle) => cycle.some((node) => node.startsWith(`${programme.id}:`)));
    const sentinelAlerts: string[] = [];
    const ownerAlerts: string[] = [];

    const autonomyOk = tasks.every(
      (entry) => entry.node.autonomyBps <= manifest.dysonProgram.safety.maxAutonomyBps
    );
    const fallbackOk = tasks.every((entry) => entry.node.fallbackPlan.trim().length > 0);
    const sentinelOk = tasks.every((entry) => sentinelSlugs.has(entry.node.sentinel));
    const ownerOk = tasks.every((entry) => {
      const expectedSafe = federationSafes.get(entry.node.federation);
      const matches = expectedSafe === entry.node.ownerSafe;
      if (!matches) {
        ownerAlerts.push(`${entry.node.id} expects ${expectedSafe ?? "?"}`);
      }
      return matches;
    });
    if (!sentinelOk) {
      sentinelCoverageOk = false;
      tasks
        .filter((entry) => !sentinelSlugs.has(entry.node.sentinel))
        .forEach((entry) => {
          sentinelAlerts.push(`${entry.node.id}→${entry.node.sentinel}`);
        });
    }
    const sentinelAlertList = programmeSentinelAlerts.get(programme.id)!;
    sentinelAlertList.push(...sentinelAlerts);
    const ownerAlertList = programmeOwnerAlerts.get(programme.id)!;
    ownerAlertList.push(...ownerAlerts);
    if (!ownerOk) {
      ownerAlignmentOk = false;
    }
    if (!fallbackOk) {
      fallbackCoverageOk = false;
    }
    if (!autonomyOk) {
      autonomyCoverageOk = false;
    }

    const programmeDependencies = programme.dependencies ?? [];
    const missingProgrammeDependencies = programmeDependencies.filter((dep) => !programmeIds.has(dep));
    if (missingProgrammeDependencies.length > 0) {
      warnings.push(`${programme.id} missing programme dependencies ${missingProgrammeDependencies.join(", ")}`);
      programmeDependenciesResolvedOk = false;
    }

    const criticalPathDays = computeMissionCriticalPath(programme.rootTask);
    const timelineSlackDays = programme.timelineDays - criticalPathDays;
    const timelineOk = timelineSlackDays >= 0;
    if (!timelineOk) {
      timelineAlignedOk = false;
    }

    const dependencyOk = missingDeps.length === 0 && programmeCycles.length === 0;
    const programmeChecks = [dependencyOk, fallbackOk, sentinelOk, ownerOk, autonomyOk, timelineOk];
    const unstoppableScore =
      programmeChecks.reduce((sum, ok) => sum + (ok ? 1 : 0), 0) / Math.max(programmeChecks.length, 1);
    programmeUnstoppable.push(unstoppableScore);

    programmeSummaries.push({
      id: programme.id,
      name: programme.name,
      objective: programme.objective,
      federation: programme.federation,
      ownerSafe: programme.ownerSafe,
      taskCount,
      totalEnergyGw: round(energyGw, 2),
      totalComputeExaflops: round(computeExaflops, 2),
      totalAgentQuorum: agentQuorum,
      criticalPathDays: round(criticalPathDays, 2),
      timelineSlackDays: round(timelineSlackDays, 2),
      unstoppableScore: round(unstoppableScore, 4),
      riskDistribution,
      dependencies: programmeDependencies,
      missingDependencies: missingDeps,
      missingProgrammeDependencies,
      sentinelAlerts,
      ownerAlerts,
      timelineOk,
      autonomyOk,
    });

    totalEnergy += energyGw;
    totalCompute += computeExaflops;
    totalAgents += agentQuorum;
    totalTimeline += programme.timelineDays;

    if (programmeCycles.length > 0) {
      warnings.push(`${programme.id} has dependency cycles: ${programmeCycles.map((cycle) => cycle.join("→")).join(" | ")}`);
    }
    if (timelineSlackDays < 0) {
      warnings.push(`${programme.id} timeline deficit ${timelineSlackDays.toFixed(2)} days`);
    }
    if (!fallbackOk) {
      const missingCount = tasks.filter((entry) => entry.node.fallbackPlan.trim().length === 0).length;
      warnings.push(`${programme.id} missing fallback plans for ${missingCount} task(s)`);
    }
    if (!sentinelOk) {
      warnings.push(`${programme.id} sentinel coverage gaps: ${sentinelAlerts.join(", ")}`);
    }
    if (!ownerOk) {
      warnings.push(`${programme.id} owner safes mismatched: ${ownerAlerts.join(", ")}`);
    }
    if (!autonomyOk) {
      warnings.push(`${programme.id} autonomy exceeds max ${manifest.dysonProgram.safety.maxAutonomyBps} bps`);
    }
  }

  const programmesCount = lattice.programmes.length;
  const tasksCount = nodeMap.size;
  const unstoppableScore =
    programmeUnstoppable.length === 0
      ? 1
      : programmeUnstoppable.reduce((sum, score) => sum + score, 0) / programmeUnstoppable.length;

  const summary: MissionTelemetrySummary = {
    version: lattice.version,
    generatedAt: lattice.generatedAt,
    totals: {
      programmes: programmesCount,
      tasks: tasksCount,
      energyGw: round(totalEnergy, 2),
      computeExaflops: round(totalCompute, 2),
      agentQuorum: totalAgents,
      averageTimelineDays: programmesCount === 0 ? 0 : round(totalTimeline / programmesCount, 2),
    },
    verification: {
      dependenciesResolved: missingDependencies.length === 0 && cycles.length === 0,
      sentinelCoverage: sentinelCoverageOk,
      fallbackCoverage: fallbackCoverageOk,
      ownerAlignment: ownerAlignmentOk,
      autonomyWithinBounds: autonomyCoverageOk,
      timelineAligned: timelineAlignedOk,
      programmeDependenciesResolved: programmeDependenciesResolvedOk,
      unstoppableScore: round(unstoppableScore, 4),
      warnings,
    },
    programmes: programmeSummaries,
  };

  const ledger = {
    version: lattice.version,
    generatedAt: lattice.generatedAt,
    totals: summary.totals,
    verification: summary.verification,
    programmes: programmeSummaries.map((programme) => ({
      id: programme.id,
      name: programme.name,
      federation: programme.federation,
      ownerSafe: programme.ownerSafe,
      taskCount: programme.taskCount,
      totalEnergyGw: programme.totalEnergyGw,
      totalComputeExaflops: programme.totalComputeExaflops,
      totalAgentQuorum: programme.totalAgentQuorum,
      criticalPathDays: programme.criticalPathDays,
      timelineDays: lattice.programmes.find((p) => p.id === programme.id)?.timelineDays ?? 0,
      timelineSlackDays: programme.timelineSlackDays,
      unstoppableScore: programme.unstoppableScore,
      riskDistribution: programme.riskDistribution,
      dependencies: programme.dependencies,
      missingDependencies: programme.missingDependencies,
      missingProgrammeDependencies: programme.missingProgrammeDependencies,
      sentinelAlerts: programme.sentinelAlerts,
      ownerAlerts: programme.ownerAlerts,
      timelineOk: programme.timelineOk,
      autonomyOk: programme.autonomyOk,
    })),
    dependencyCycles: cycles,
  };

  return { summary, mermaid: mermaidDiagram, ledger };
}

function computeEnergyWindowProjection(manifest: Manifest): EnergyWindowProjection {
  const perFederation: Array<{
    federation: string;
    scheduledEnergyGwH: number;
    averageScheduledGw: number;
    windowCount: number;
    scheduledHours: number;
  }> = [];

  for (const federation of manifest.federations) {
    const windows = manifest.energyWindows.filter((window) => window.federation === federation.slug);
    const scheduledEnergyGwH = windows.reduce(
      (sum, window) => sum + (window.availableGw + window.backupGw) * window.durationHours,
      0
    );
    const scheduledHours = windows.reduce((sum, window) => sum + window.durationHours, 0);
    const averageScheduledGw = scheduledEnergyGwH === 0 ? 0 : scheduledEnergyGwH / 24;
    perFederation.push({
      federation: federation.slug,
      scheduledEnergyGwH,
      averageScheduledGw,
      windowCount: windows.length,
      scheduledHours,
    });
  }

  const totalScheduledGwH = perFederation.reduce((sum, entry) => sum + entry.scheduledEnergyGwH, 0);
  const normalisedTotalGw = perFederation.reduce((sum, entry) => sum + entry.averageScheduledGw, 0);
  const coverageRatio =
    manifest.federations.length === 0
      ? 1
      : perFederation.filter((entry) => entry.windowCount > 0).length /
        Math.max(manifest.federations.length, 1);

  return {
    perFederation,
    totalScheduledGwH,
    normalisedTotalGw,
    coverageRatio,
    windowCount: manifest.energyWindows.length,
  };
}

function performEnergyCrossVerification(manifest: Manifest): EnergyCrossVerification {
  const regionalValues = manifest.federations.map((federation) => federation.energy.availableGw);
  const direct = regionalValues.reduce((sum, value) => sum + value, 0);
  const kahan = kahanSum(regionalValues);
  const pairwise = pairwiseSum(regionalValues);
  const scale = 1_000_000;
  const bigInt =
    Number(
      manifest.federations.reduce(
        (acc, federation) => acc + BigInt(Math.round(federation.energy.availableGw * scale)),
        0n
      )
    ) /
    scale;
  const projection = computeEnergyWindowProjection(manifest);
  const projectionValue = projection.normalisedTotalGw;
  const coverageSlack = Math.max(0, 1 - projection.coverageRatio);
  const ppmTolerance = 1e-6;
  const tolerancePct = ppmTolerance * (1 + coverageSlack);
  const toleranceGw = Math.max(1e-6, direct * tolerancePct);
  const deviations = [
    Math.abs(direct - kahan),
    Math.abs(direct - pairwise),
    Math.abs(direct - bigInt),
    Math.abs(direct - projectionValue),
  ];
  const maxDeviationGw = deviations.reduce((max, value) => Math.max(max, value), 0);
  const consensus = maxDeviationGw <= toleranceGw;

  return {
    methods: {
      direct,
      kahan,
      pairwise,
      bigInt,
      projection: projectionValue,
    },
    toleranceGw,
    tolerancePct,
    maxDeviationGw,
    consensus,
    coverageRatio: projection.coverageRatio,
    projection,
  };
}

type OwnerControlProof = {
  manager: string;
  systemPause: string;
  guardianCouncil: string;
  requiredFunctions: Array<{
    name: string;
    selector: string;
    occurrences: number;
    present: boolean;
    minimumRequired: number;
  }>;
  pauseEmbedding: {
    pauseAll: boolean;
    unpauseAll: boolean;
  };
  targets: {
    unique: string[];
    nonOwner: string[];
  };
  hashes: {
    manifest: string;
    transactionSet: string;
    selectorSet: string;
  };
  verification: {
    selectorsComplete: boolean;
    pauseEmbedding: boolean;
    singleOwnerTargets: boolean;
    unstoppableScore: number;
  };
  secondaryVerification: {
    selectorsMatch: boolean;
    pauseDecoded: boolean;
    resumeDecoded: boolean;
    unstoppableScore: number;
    matchesPrimaryScore: boolean;
  };
  tertiaryVerification: {
    selectorsMatch: boolean;
    pauseDecoded: boolean;
    resumeDecoded: boolean;
    singleOwnerTargets: boolean;
    unstoppableScore: number;
    matchesPrimaryScore: boolean;
    matchesSecondaryScore: boolean;
    decodeFailures: number;
    decodedCalls: Array<{
      index: number;
      signature: string;
      to: string;
      matched: boolean;
    }>;
  };
  calls: Array<{
    index: number;
    description: string;
    to: string;
    selector: string;
  }>;
};

type SafeTransaction = {
  to: string;
  data: string;
  description: string;
};

type ScenarioStatus = "nominal" | "warning" | "critical";

type ScenarioMetric = {
  label: string;
  value: string;
  ok: boolean;
};

type ScenarioResult = {
  id: string;
  title: string;
  status: ScenarioStatus;
  summary: string;
  confidence: number;
  impact: string;
  metrics: ScenarioMetric[];
  recommendedActions: string[];
};

type MonteCarloSummary = {
  runs: number;
  breachProbability: number;
  percentileGw: { p50: number; p95: number; p99: number };
  maxGw: number;
  averageGw: number;
  marginGw: number;
  freeEnergyMarginGw: number;
  freeEnergyMarginPct: number;
  runwayHours: number;
  demandStdDevGw: number;
  entropyMargin: number;
  gibbsFreeEnergyGj: number;
  hamiltonianStability: number;
  gameTheorySlack: number;
  maintainsBuffer: boolean;
  withinTolerance: boolean;
  tolerance: number;
};

type AllocationRecommendation = {
  federation: string;
  name: string;
  weight: number;
  recommendedGw: number;
  payoff: number;
  currentGw: number;
  deltaGw: number;
  resilience: number;
  renewablePct: number;
  latencyMs: number;
  storageGwh: number;
};

type AllocationPolicy = {
  temperature: number;
  nashProduct: number;
  strategyStability: number;
  deviationIncentive: number;
  replicatorDrift: number;
  replicatorStability: number;
  jainIndex: number;
  allocationEntropy: number;
  fairnessIndex: number;
  gibbsPotential: number;
  allocations: AllocationRecommendation[];
};

type SentientWelfareSummary = {
  totalAgents: number;
  federationCount: number;
  freeEnergyPerAgentGj: number;
  cooperationIndex: number;
  inequalityIndex: number;
  payoffCoefficient: number;
  coalitionStability: number;
  paretoSlack: number;
  equilibriumScore: number;
  welfarePotential: number;
  collectiveActionPotential: number;
};

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const clamped = Math.min(1, Math.max(0, ratio));
  const index = Math.floor(clamped * (values.length - 1));
  return values[index];
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function softmaxScores(scores: number[], temperature: number): { weights: number[]; partition: number } {
  if (scores.length === 0) {
    return { weights: [], partition: 0 };
  }
  const temp = Math.max(0.05, temperature);
  const maxScore = Math.max(...scores);
  const expScores = scores.map((score) => Math.exp((score - maxScore) / temp));
  const partition = expScores.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(partition) || partition <= 0) {
    return { weights: scores.map(() => 1 / scores.length), partition: scores.length };
  }
  return { weights: expScores.map((value) => value / partition), partition };
}

function computeJainIndex(values: number[]): number {
  if (!values.length) {
    return 1;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  const sumSquares = values.reduce((total, value) => total + value * value, 0);
  if (!Number.isFinite(sum) || !Number.isFinite(sumSquares) || sumSquares <= 0) {
    return 1;
  }
  const rawIndex = (sum * sum) / (values.length * sumSquares);
  return Math.min(1, Math.max(0, rawIndex));
}

function computeGiniIndex(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  let weightedSum = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    weightedSum += (2 * i - sorted.length + 1) * sorted[i];
  }
  return Math.min(1, Math.max(0, weightedSum / (sorted.length * total)));
}

function computeCoefficientOfVariation(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!Number.isFinite(mean) || mean === 0) {
    return 0;
  }
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function runEnergyMonteCarlo(manifest: Manifest, seed: string, runs = 256): MonteCarloSummary {
  const rng = createDeterministicRng(`${seed}:${runs}`);
  const capturedGw = manifest.energyProtocols.stellarLattice.baselineCapturedGw;
  const safetyMarginFraction = manifest.energyProtocols.stellarLattice.safetyMarginPct / 100;
  const marginGw = capturedGw * safetyMarginFraction;

  const samples: number[] = [];
  let breaches = 0;
  let maxGw = 0;
  let totalGw = 0;
  let totalSquares = 0;

  for (let iteration = 0; iteration < runs; iteration += 1) {
    let civilisationDemandGw = 0;
    for (const federation of manifest.federations) {
      const baseAvailability = federation.energy.availableGw;
      const computeIntensityGw = federation.compute.exaflops * 12; // heuristic: 12 GW per EF
      const renewablePenalty = (1 - Math.min(1, federation.energy.renewablePct)) * 0.1;
      const latencyPenalty = Math.min(0.15, federation.energy.latencyMs / 120_000);
      const stochasticShift = (rng() - 0.5) * 0.2; // ±10%
      const storageRelief = Math.min(federation.energy.storageGwh / 24, baseAvailability * 0.2);

      const regionalDemand = Math.max(
        0,
        (baseAvailability + computeIntensityGw) * (1 + renewablePenalty + latencyPenalty + stochasticShift) - storageRelief
      );
      civilisationDemandGw += regionalDemand;
    }

    const bufferRemaining = capturedGw - civilisationDemandGw;
    if (bufferRemaining < marginGw) {
      breaches += 1;
    }
    if (civilisationDemandGw > maxGw) {
      maxGw = civilisationDemandGw;
    }
    samples.push(civilisationDemandGw);
    totalGw += civilisationDemandGw;
    totalSquares += civilisationDemandGw * civilisationDemandGw;
  }

  samples.sort((a, b) => a - b);
  const breachProbability = breaches / runs;
  const averageGw = samples.length === 0 ? 0 : totalGw / samples.length;
  const variance = runs > 0 ? Math.max(0, totalSquares / runs - averageGw * averageGw) : 0;
  const demandStdDevGw = Math.sqrt(variance);
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const p99 = percentile(samples, 0.99);
  const freeEnergyMarginGw = capturedGw - p95;
  const freeEnergyMarginPct = capturedGw === 0 ? 0 : freeEnergyMarginGw / capturedGw;
  const runwayHours = averageGw > 0 ? Math.max(0, freeEnergyMarginGw) / averageGw : 0;
  const entropyMargin = demandStdDevGw > 0 ? freeEnergyMarginGw / demandStdDevGw : freeEnergyMarginGw;
  const gibbsFreeEnergyGj = Math.max(0, freeEnergyMarginGw) * 3600;
  const hamiltonianStability = Math.max(
    0,
    Math.min(1, 0.5 * (1 - breachProbability) + 0.5 * Math.max(0, freeEnergyMarginPct))
  );
  const gameTheorySlack = Math.max(
    0,
    Math.min(1, (1 - breachProbability) * 0.55 + hamiltonianStability * 0.45)
  );
  const maintainsBuffer = freeEnergyMarginGw >= marginGw;

  return {
    runs,
    breachProbability,
    percentileGw: {
      p50,
      p95,
      p99,
    },
    maxGw,
    averageGw,
    marginGw,
    freeEnergyMarginGw,
    freeEnergyMarginPct,
    runwayHours,
    demandStdDevGw,
    entropyMargin,
    gibbsFreeEnergyGj,
    hamiltonianStability,
    gameTheorySlack,
    maintainsBuffer,
    withinTolerance: breachProbability <= 0.01,
    tolerance: 0.01,
  };
}

function buildEnergyAllocationPolicy(manifest: Manifest, energyMonteCarlo: MonteCarloSummary): AllocationPolicy {
  const federations = manifest.federations;
  const totalAvailableGw = federations.reduce((sum, federation) => sum + federation.energy.availableGw, 0);
  const maxStorageGwh = federations.reduce((max, federation) => Math.max(max, federation.energy.storageGwh), 0);
  const stabilityFactor =
    energyMonteCarlo.hamiltonianStability * 0.6 + energyMonteCarlo.gameTheorySlack * 0.4;
  const temperature = Math.max(0.12, 1 - stabilityFactor);

  const scores = federations.map((federation) => {
    const resilience =
      federation.domains.length === 0
        ? 0
        : federation.domains.reduce((sum, domain) => sum + domain.resilience, 0) / federation.domains.length;
    const renewableScore = federation.energy.renewablePct;
    const storageScore = maxStorageGwh > 0 ? federation.energy.storageGwh / maxStorageGwh : 0;
    const latencyPenalty = Math.min(1, federation.energy.latencyMs / 120_000);
    const efficiencyScore =
      resilience * 0.45 +
      renewableScore * 0.25 +
      storageScore * 0.2 +
      (1 - latencyPenalty) * 0.1;
    return Math.min(1, Math.max(0, efficiencyScore));
  });

  const { weights, partition } = softmaxScores(scores, temperature);
  const allocations = federations.map((federation, index) => {
    const weight = weights[index] ?? 0;
    const resilience =
      federation.domains.length === 0
        ? 0
        : federation.domains.reduce((sum, domain) => sum + domain.resilience, 0) / federation.domains.length;
    const latencyPenalty = Math.min(1, federation.energy.latencyMs / 120_000);
    const payoff = Math.max(0.001, scores[index] ?? 0) * Math.max(0.1, 1 - latencyPenalty);
    const recommendedGw = totalAvailableGw * weight;
    return {
      federation: federation.slug,
      name: federation.name,
      weight,
      recommendedGw: round(recommendedGw, 2),
      payoff: round(payoff, 4),
      currentGw: round(federation.energy.availableGw, 2),
      deltaGw: round(recommendedGw - federation.energy.availableGw, 2),
      resilience: round(resilience, 4),
      renewablePct: round(federation.energy.renewablePct, 4),
      latencyMs: round(federation.energy.latencyMs, 2),
      storageGwh: round(federation.energy.storageGwh, 2),
    };
  });

  const nashLog = allocations.reduce((sum, item) => sum + Math.log(item.payoff), 0);
  const nashProduct = Math.exp(nashLog / Math.max(1, allocations.length));
  const allocationEntropy = allocations.reduce((sum, item) => {
    if (item.weight <= 0) {
      return sum;
    }
    return sum - item.weight * Math.log(item.weight);
  }, 0);
  const payoffs = allocations.map((allocation) => allocation.payoff);
  const averagePayoff = payoffs.length ? payoffs.reduce((sum, value) => sum + value, 0) / payoffs.length : 0;
  const maxPayoff = payoffs.length ? Math.max(...payoffs) : 0;
  const deviationIncentive =
    maxPayoff > 0 ? Math.min(1, Math.max(0, (maxPayoff - averagePayoff) / maxPayoff)) : 0;
  const strategyStability = 1 - deviationIncentive;
  const payoffSum = payoffs.reduce((sum, value) => sum + value, 0);
  const normalizedPayoffs =
    payoffSum > 0 ? payoffs.map((payoff) => payoff / payoffSum) : payoffs.map(() => 1 / Math.max(1, payoffs.length));
  const replicatorDrift =
    weights.reduce((sum, weight, index) => sum + Math.abs(weight - (normalizedPayoffs[index] ?? 0)), 0) / 2;
  const replicatorStability = 1 - Math.min(1, replicatorDrift);
  const jainIndex = computeJainIndex(payoffs);
  const entropyMax = allocations.length > 1 ? Math.log(allocations.length) : 1;
  const fairnessIndex = entropyMax > 0 ? allocationEntropy / entropyMax : 1;
  const gibbsPotential = -temperature * Math.log(Math.max(1, partition));

  return {
    temperature,
    nashProduct,
    strategyStability,
    deviationIncentive,
    replicatorDrift,
    replicatorStability,
    jainIndex,
    allocationEntropy,
    fairnessIndex,
    gibbsPotential,
    allocations,
  };
}

function buildSentientWelfare({
  totalAgents,
  federationCount,
  allocationPolicy,
  energyMonteCarlo,
}: {
  totalAgents: number;
  federationCount: number;
  allocationPolicy: AllocationPolicy;
  energyMonteCarlo: MonteCarloSummary;
}): SentientWelfareSummary {
  const payoffs = allocationPolicy.allocations.map((allocation) => allocation.payoff);
  const inequalityIndex = computeGiniIndex(payoffs);
  const payoffCoefficient = computeCoefficientOfVariation(payoffs);
  const replicatorStability = Number.isFinite(allocationPolicy.replicatorStability)
    ? allocationPolicy.replicatorStability
    : allocationPolicy.strategyStability;
  const cooperationIndex = clamp01(
    0.45 * energyMonteCarlo.gameTheorySlack +
      0.35 * allocationPolicy.strategyStability +
      0.2 * replicatorStability
  );
  const paretoSlack = clamp01(1 - allocationPolicy.deviationIncentive);
  const equilibriumScore = clamp01(
    0.4 * cooperationIndex + 0.35 * (1 - inequalityIndex) + 0.25 * allocationPolicy.fairnessIndex
  );
  const welfarePotential = clamp01(
    0.4 * (1 - inequalityIndex) +
      0.3 * allocationPolicy.fairnessIndex +
      0.3 * energyMonteCarlo.hamiltonianStability
  );
  const coalitionStability = clamp01(1 - payoffCoefficient);
  const collectiveActionPotential = clamp01(
    0.4 * cooperationIndex + 0.3 * paretoSlack + 0.3 * energyMonteCarlo.hamiltonianStability
  );
  const freeEnergyPerAgentGj =
    totalAgents > 0 ? round(energyMonteCarlo.gibbsFreeEnergyGj / totalAgents, 6) : 0;

  return {
    totalAgents,
    federationCount,
    freeEnergyPerAgentGj,
    cooperationIndex,
    inequalityIndex,
    payoffCoefficient,
    coalitionStability,
    paretoSlack,
    equilibriumScore,
    welfarePotential,
    collectiveActionPotential,
  };
}

function loadManifest(): { manifest: Manifest; raw: string } {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return { manifest: ManifestSchema.parse(parsed), raw };
}

function loadEnergyFeeds(): EnergyFeedsConfig {
  const raw = readFileSync(ENERGY_FEEDS_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return EnergyFeedsConfigSchema.parse(parsed);
}

function loadFabricConfig(): FabricConfig {
  const raw = readFileSync(FABRIC_CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return FabricConfigSchema.parse(parsed);
}

function loadMissionLattice(): { lattice: MissionLattice; raw: string } {
  const raw = readFileSync(TASK_LATTICE_CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return { lattice: MissionLatticeSchema.parse(parsed), raw };
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function slugToId(slug: string): string {
  return keccak256(toUtf8Bytes(slug));
}

function computeDominanceScore({
  totalMonthlyUSD,
  averageResilience,
  averageCoverageSeconds,
  guardianReviewWindow,
  autonomyBps,
  autonomyCap,
  cadenceSeconds,
}: {
  totalMonthlyUSD: number;
  averageResilience: number;
  averageCoverageSeconds: number;
  guardianReviewWindow: number;
  autonomyBps: number;
  autonomyCap: number;
  cadenceSeconds: number;
}): number {
  const valueScore = totalMonthlyUSD <= 0 ? 0 : Math.min(1, totalMonthlyUSD / 800_000_000_000);
  const resilienceScore = Math.max(0, Math.min(1, averageResilience));
  const coverageStrength = guardianReviewWindow > 0 ? Math.min(1, averageCoverageSeconds / guardianReviewWindow) : 1;
  const autonomyScore = autonomyCap > 0 ? Math.min(1, autonomyBps / autonomyCap) : 1;
  const cadenceScore = cadenceSeconds > 0 ? Math.max(0, 1 - Math.min(1, cadenceSeconds / 43_200)) : 0.5;
  const weighted = 0.32 * valueScore + 0.26 * resilienceScore + 0.22 * coverageStrength + 0.12 * autonomyScore + 0.08 * cadenceScore;
  const rawScore = Math.min(100, weighted * 100);
  return Math.round(rawScore * 10) / 10;
}

function formatUSD(value: number): string {
  const trillions = value / 1_000_000_000_000;
  if (trillions >= 1) {
    return `${trillions.toFixed(2)}T`;
  }
  const billions = value / 1_000_000_000;
  if (billions >= 1) {
    return `${billions.toFixed(2)}B`;
  }
  const millions = value / 1_000_000;
  if (millions >= 1) {
    return `${millions.toFixed(2)}M`;
  }
  return value.toLocaleString();
}

function formatGw(value: number): string {
  return `${value.toLocaleString()} GW`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function buildTransactions(manifest: Manifest): SafeTransaction[] {
  const txs: SafeTransaction[] = [];
  const { interstellarCouncil, selfImprovement } = manifest;

  const globalParamsTuple = [
    interstellarCouncil.treasury,
    interstellarCouncil.universalVault,
    interstellarCouncil.upgradeCoordinator,
    interstellarCouncil.validatorRegistry,
    interstellarCouncil.missionControl,
    interstellarCouncil.knowledgeGraph,
    BigInt(interstellarCouncil.heartbeatSeconds),
    BigInt(interstellarCouncil.guardianReviewWindow),
    BigInt(interstellarCouncil.maxDrawdownBps),
    manifest.interstellarCouncil.manifestoURI,
    manifest.interstellarCouncil.manifestoHash,
  ];

  txs.push({
    to: interstellarCouncil.managerAddress,
    data: managerInterface.encodeFunctionData("setGlobalParameters", [globalParamsTuple]),
    description: "Install global parameters",
  });

  txs.push({
    to: interstellarCouncil.managerAddress,
    data: managerInterface.encodeFunctionData("setGuardianCouncil", [interstellarCouncil.guardianCouncil]),
    description: "Assign guardian council",
  });

  txs.push({
    to: interstellarCouncil.managerAddress,
    data: managerInterface.encodeFunctionData("setSystemPause", [interstellarCouncil.systemPauseAddress]),
    description: "Point to system pause",
  });

  const planTuple = [
    selfImprovement.planURI,
    selfImprovement.planHash,
    BigInt(selfImprovement.cadenceSeconds),
    BigInt(selfImprovement.lastExecutedAt),
    selfImprovement.lastReportURI,
  ];

  txs.push({
    to: interstellarCouncil.managerAddress,
    data: managerInterface.encodeFunctionData("setSelfImprovementPlan", [planTuple]),
    description: "Install self-improvement plan",
  });

  for (const federation of manifest.federations) {
    for (const domain of federation.domains) {
      const domainTuple = [
        domain.slug,
        domain.name,
        domain.metadataURI,
        domain.orchestrator,
        domain.capitalVault,
        domain.validatorModule,
        domain.policyKernel,
        BigInt(domain.heartbeatSeconds),
        BigInt(domain.tvlLimit),
        BigInt(domain.autonomyLevelBps),
        domain.active,
      ];
      txs.push({
        to: interstellarCouncil.managerAddress,
        data: managerInterface.encodeFunctionData("registerDomain", [domainTuple]),
        description: `Register domain ${domain.slug}`,
      });
    }

    for (const sentinel of federation.sentinels) {
      const sentinelTuple = [
        sentinel.slug,
        sentinel.name,
        sentinel.uri,
        sentinel.agent,
        BigInt(Math.round(sentinel.coverageSeconds)),
        BigInt(Math.round(sentinel.sensitivityBps)),
        sentinel.active,
      ];
      txs.push({
        to: interstellarCouncil.managerAddress,
        data: managerInterface.encodeFunctionData("registerSentinel", [sentinelTuple]),
        description: `Register sentinel ${sentinel.slug}`,
      });
      txs.push({
        to: interstellarCouncil.managerAddress,
        data: managerInterface.encodeFunctionData("setSentinelDomains", [
          slugToId(sentinel.slug),
          sentinel.domains.map((slug) => slugToId(slug)),
        ]),
        description: `Bind sentinel ${sentinel.slug} domains`,
      });
    }

    for (const stream of federation.capitalStreams) {
      const streamTuple = [
        stream.slug,
        stream.name,
        stream.uri,
        stream.vault,
        BigInt(stream.annualBudget),
        BigInt(stream.expansionBps),
        stream.active,
      ];
      txs.push({
        to: interstellarCouncil.managerAddress,
        data: managerInterface.encodeFunctionData("registerCapitalStream", [streamTuple]),
        description: `Register capital stream ${stream.slug}`,
      });
      txs.push({
        to: interstellarCouncil.managerAddress,
        data: managerInterface.encodeFunctionData("setCapitalStreamDomains", [
          slugToId(stream.slug),
          stream.domains.map((slug) => slugToId(slug)),
        ]),
        description: `Bind capital stream ${stream.slug}`,
      });
    }
  }
  txs.push({
    to: interstellarCouncil.managerAddress,
    data: managerInterface.encodeFunctionData("forwardPauseCall", [
      systemPauseInterface.encodeFunctionData("pauseAll"),
    ]),
    description: "Pause all modules",
  });

  txs.push({
    to: interstellarCouncil.managerAddress,
    data: managerInterface.encodeFunctionData("forwardPauseCall", [
      systemPauseInterface.encodeFunctionData("unpauseAll"),
    ]),
    description: "Resume all modules",
  });

  return txs;
}

function buildOwnerControlProof(
  manifest: Manifest,
  transactions: SafeTransaction[],
  manifestHash: string
): OwnerControlProof {
  const manager = manifest.interstellarCouncil.managerAddress.toLowerCase();
  const systemPause = manifest.interstellarCouncil.systemPauseAddress.toLowerCase();
  const guardianCouncil = manifest.interstellarCouncil.guardianCouncil.toLowerCase();

  const callMap = transactions.map((tx, index) => ({
    index,
    description: tx.description,
    to: tx.to.toLowerCase(),
    selector: tx.data.slice(0, 10).toLowerCase(),
  }));

  const selectorCount = callMap.reduce<Map<string, number>>((acc, call) => {
    acc.set(call.selector, (acc.get(call.selector) ?? 0) + 1);
    return acc;
  }, new Map());

  const requiredFunctions = [
    { name: "setGlobalParameters", signature: "setGlobalParameters((address,address,address,address,address,address,uint64,uint64,uint256,string,bytes32))", minimum: 1 },
    { name: "setGuardianCouncil", signature: "setGuardianCouncil(address)", minimum: 1 },
    { name: "setSystemPause", signature: "setSystemPause(address)", minimum: 1 },
    { name: "setSelfImprovementPlan", signature: "setSelfImprovementPlan((string,bytes32,uint64,uint64,string))", minimum: 1 },
    { name: "registerDomain", signature: "registerDomain((string,string,string,address,address,address,address,uint64,uint256,uint256,bool))", minimum: manifest.federations.reduce((sum, f) => sum + f.domains.length, 0) },
    { name: "registerSentinel", signature: "registerSentinel((string,string,string,address,uint64,uint256,bool))", minimum: manifest.federations.reduce((sum, f) => sum + f.sentinels.length, 0) },
    { name: "registerCapitalStream", signature: "registerCapitalStream((string,string,string,address,uint256,uint256,bool))", minimum: manifest.federations.reduce((sum, f) => sum + f.capitalStreams.length, 0) },
    { name: "setSentinelDomains", signature: "setSentinelDomains(bytes32,bytes32[])", minimum: manifest.federations.reduce((sum, f) => sum + f.sentinels.length, 0) },
    { name: "setCapitalStreamDomains", signature: "setCapitalStreamDomains(bytes32,bytes32[])", minimum: manifest.federations.reduce((sum, f) => sum + f.capitalStreams.length, 0) },
    { name: "forwardPauseCall", signature: "forwardPauseCall(bytes)", minimum: 2 },
  ];

  const requiredFunctionProof = requiredFunctions.map((fn) => {
    const selector = managerInterface.getFunction(fn.signature).selector.toLowerCase();
    const occurrences = selectorCount.get(selector) ?? 0;
    const minimumRequired = fn.minimum;
    const present = occurrences >= Math.max(1, minimumRequired);
    return { name: fn.name, selector, occurrences, present, minimumRequired };
  });

  const pauseCalldata = managerInterface.encodeFunctionData("forwardPauseCall", [
    systemPauseInterface.encodeFunctionData("pauseAll"),
  ]);
  const resumeCalldata = managerInterface.encodeFunctionData("forwardPauseCall", [
    systemPauseInterface.encodeFunctionData("unpauseAll"),
  ]);

  const pauseEmbedded = transactions.some(
    (tx) => tx.to.toLowerCase() === manager && tx.data.toLowerCase() === pauseCalldata.toLowerCase()
  );
  const resumeEmbedded = transactions.some(
    (tx) => tx.to.toLowerCase() === manager && tx.data.toLowerCase() === resumeCalldata.toLowerCase()
  );

  const uniqueTargets = Array.from(new Set(callMap.map((call) => call.to)));
  const nonOwnerTargets = uniqueTargets.filter((address) => address !== manager && address !== systemPause);

  const concatenatedData = transactions
    .map((tx) => tx.data.replace(/^0x/i, ""))
    .join("");
  const transactionSetHash = keccak256(`0x${concatenatedData}`);
  const selectorSetHash = keccak256(`0x${callMap.map((call) => call.selector.replace(/^0x/i, "")).join("")}`);

  const signals = [
    requiredFunctionProof.every((fn) => fn.present) ? 1 : 0,
    pauseEmbedded ? 1 : 0,
    resumeEmbedded ? 1 : 0,
    nonOwnerTargets.length === 0 ? 1 : 0,
  ];
  const unstoppableScore = signals.reduce((sum, value) => sum + value, 0) / signals.length;

  const secondaryVerification = crossVerifyOwnerOverride({
    transactions,
    manager,
    requiredFunctions,
    nonOwnerTargets,
    primaryScore: unstoppableScore,
  });

  const tertiaryVerification = triangulateOwnerOverride({
    transactions,
    manager,
    systemPause,
    requiredFunctions,
    primaryScore: unstoppableScore,
    secondaryScore: secondaryVerification.unstoppableScore,
  });

  return {
    manager,
    systemPause,
    guardianCouncil,
    requiredFunctions: requiredFunctionProof,
    pauseEmbedding: {
      pauseAll: pauseEmbedded,
      unpauseAll: resumeEmbedded,
    },
    targets: {
      unique: uniqueTargets,
      nonOwner: nonOwnerTargets,
    },
    hashes: {
      manifest: manifestHash,
      transactionSet: transactionSetHash,
      selectorSet: selectorSetHash,
    },
    verification: {
      selectorsComplete: requiredFunctionProof.every((fn) => fn.present),
      pauseEmbedding: pauseEmbedded && resumeEmbedded,
      singleOwnerTargets: nonOwnerTargets.length === 0,
      unstoppableScore,
    },
    secondaryVerification,
    tertiaryVerification,
    calls: callMap,
  };
}

function crossVerifyOwnerOverride(params: {
  transactions: SafeTransaction[];
  manager: string;
  requiredFunctions: Array<{ name: string; signature: string; minimum: number }>;
  nonOwnerTargets: string[];
  primaryScore: number;
}) {
  const { transactions, manager, requiredFunctions, nonOwnerTargets, primaryScore } = params;
  const selectorCounts = new Map<string, number>();
  for (const tx of transactions) {
    const selector = `0x${tx.data.slice(2, 10).toLowerCase()}`;
    selectorCounts.set(selector, (selectorCounts.get(selector) ?? 0) + 1);
  }

  const selectorsMatch = requiredFunctions.every((fn) => {
    const manualSelector = computeSelector(fn.signature);
    const count = selectorCounts.get(manualSelector) ?? 0;
    return count >= Math.max(1, fn.minimum);
  });

  const forwardSelector = computeSelector("forwardPauseCall(bytes)");
  const pauseSelector = computeSelector("pauseAll()");
  const resumeSelector = computeSelector("unpauseAll()");

  let pauseDecoded = false;
  let resumeDecoded = false;

  for (const tx of transactions) {
    if (tx.to.toLowerCase() !== manager) {
      continue;
    }
    const selector = `0x${tx.data.slice(2, 10).toLowerCase()}`;
    if (selector !== forwardSelector) {
      continue;
    }
    try {
      const decoded = managerInterface.decodeFunctionData("forwardPauseCall", tx.data);
      const innerCalldata: string = decoded[0];
      const innerSelector = `0x${innerCalldata.slice(2, 10).toLowerCase()}`;
      if (innerSelector === pauseSelector) {
        pauseDecoded = true;
      }
      if (innerSelector === resumeSelector) {
        resumeDecoded = true;
      }
    } catch (error) {
      pauseDecoded = false;
      resumeDecoded = false;
    }
  }

  const signals = [
    selectorsMatch ? 1 : 0,
    pauseDecoded ? 1 : 0,
    resumeDecoded ? 1 : 0,
    nonOwnerTargets.length === 0 ? 1 : 0,
  ];
  const unstoppableScore = signals.reduce((sum, value) => sum + value, 0) / signals.length;

  return {
    selectorsMatch,
    pauseDecoded,
    resumeDecoded,
    unstoppableScore,
    matchesPrimaryScore: Math.abs(unstoppableScore - primaryScore) < 1e-9,
  };
}

function triangulateOwnerOverride(params: {
  transactions: SafeTransaction[];
  manager: string;
  systemPause: string;
  requiredFunctions: Array<{ name: string; signature: string; minimum: number }>;
  primaryScore: number;
  secondaryScore: number;
}) {
  const { transactions, manager, systemPause, requiredFunctions, primaryScore, secondaryScore } = params;
  const signatureCounts = new Map<string, number>();
  const decodedCalls: Array<{ index: number; signature: string; to: string; matched: boolean }> = [];
  let pauseDecoded = false;
  let resumeDecoded = false;
  let decodeFailures = 0;
  const uniqueTargets = new Set<string>();

  for (let index = 0; index < transactions.length; index += 1) {
    const tx = transactions[index];
    const to = tx.to.toLowerCase();
    uniqueTargets.add(to);

    if (to !== manager) {
      // Still record the call so the decoded ledger shows unexpected destinations.
      decodedCalls.push({ index, signature: "external", to, matched: false });
      continue;
    }

    try {
      const parsed = managerInterface.parseTransaction({ data: tx.data });
      const signature = parsed.signature;
      signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);

      if (parsed.name === "forwardPauseCall" && parsed.args?.length > 0) {
        const innerCalldata = parsed.args[0] as string;
        try {
          const innerParsed = systemPauseInterface.parseTransaction({ data: innerCalldata });
          if (innerParsed?.name === "pauseAll") {
            pauseDecoded = true;
          }
          if (innerParsed?.name === "unpauseAll") {
            resumeDecoded = true;
          }
        } catch (error) {
          decodeFailures += 1;
        }
      }

      const matched = requiredFunctions.some((fn) => fn.signature === signature);
      decodedCalls.push({ index, signature, to, matched });
    } catch (error) {
      decodeFailures += 1;
      decodedCalls.push({ index, signature: "decode-error", to, matched: false });
    }
  }

  const selectorsMatch = requiredFunctions.every((fn) => {
    const count = signatureCounts.get(fn.signature) ?? 0;
    return count >= Math.max(1, fn.minimum);
  });

  const nonOwnerTargets = Array.from(uniqueTargets).filter(
    (address) => address !== manager && address !== systemPause
  );

  const signals = [
    selectorsMatch ? 1 : 0,
    pauseDecoded ? 1 : 0,
    resumeDecoded ? 1 : 0,
    nonOwnerTargets.length === 0 ? 1 : 0,
  ];
  const unstoppableScore = signals.reduce((sum, value) => sum + value, 0) / signals.length;

  return {
    selectorsMatch,
    pauseDecoded,
    resumeDecoded,
    singleOwnerTargets: nonOwnerTargets.length === 0,
    unstoppableScore,
    matchesPrimaryScore: Math.abs(unstoppableScore - primaryScore) < 1e-9,
    matchesSecondaryScore: Math.abs(unstoppableScore - secondaryScore) < 1e-9,
    decodeFailures,
    decodedCalls,
  };
}

function computeSelector(signature: string): string {
  return keccak256(toUtf8Bytes(signature)).slice(0, 10).toLowerCase();
}

function buildMermaid(manifest: Manifest, dominanceScore: number): string {
  const council = manifest.interstellarCouncil;
  const lines: string[] = [];
  lines.push("%% Autogenerated by run-kardashev-demo.ts");
  lines.push("flowchart LR");
  lines.push(`  IC[(Interstellar Council\\nManager: ${council.managerAddress.slice(0, 10)}…)]`);
  lines.push("  IC -->|setGlobalParameters| GP(Global Parameters)");
  lines.push("  IC -->|setGuardianCouncil| GC[Guardian Council]");
  lines.push("  IC -->|setSystemPause| SP[System Pause]");
  lines.push("  SP -->|forwardPauseCall| PAUSE{{Pause / Resume}}");
  for (const federation of manifest.federations) {
    const nodeName = federation.slug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    lines.push(`  IC -->|delegate| ${nodeName}{${federation.name}}`);
    lines.push(
      `  ${nodeName} -->|agents ${Math.round(federation.compute.agents / 1_000_000)}M| ${nodeName}_AGENTS`
    );
    lines.push(
      `  ${nodeName}_AGENTS[Edge + core nodes\\n${federation.compute.validatorNodes.toLocaleString()} validators]`
    );
    for (const domain of federation.domains) {
      const domainNode = `${nodeName}_${slugToId(domain.slug).slice(2, 8)}`;
      lines.push(`  ${nodeName} -->|${domain.autonomyLevelBps / 100}% autonomy| ${domainNode}[${domain.name}]`);
    }
  }
  manifest.logisticsCorridors.forEach((corridor) => {
    const fromNode = corridor.fromFederation.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const toNode = corridor.toFederation.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const capacityLabel = `${(corridor.capacityTonnesPerDay / 1_000).toFixed(1)}k tpd`;
    lines.push(`  ${fromNode} -.->|${capacityLabel}| ${toNode}`);
  });
  lines.push(`  classDef council fill:#0f172a,stroke:#4c51bf,color:#f8fafc;`);
  lines.push(`  classDef federation fill:#111c4e,stroke:#5a67d8,color:#f8fafc;`);
  lines.push(`  classDef default fill:#0b1120,stroke:#475569,color:#f8fafc;`);
  lines.push(`  %% Dominance Score: ${dominanceScore.toFixed(1)}`);
  return lines.join("\n");
}

function buildDysonTimeline(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push("%% Autogenerated by run-kardashev-demo.ts");
  lines.push("gantt");
  lines.push("  title Dyson Swarm Expansion Timeline");
  lines.push("  dateFormat  YYYY-MM-DD");
  lines.push("  axisFormat  %b %d");
  lines.push("  section Dyson Programme");
  const startDate = new Date(manifest.generatedAt);
  const validStart = Number.isNaN(startDate.getTime()) ? new Date() : startDate;
  let current = validStart;
  manifest.dysonProgram.phases.forEach((phase, index) => {
    const start = formatDate(current);
    const labelPrefix = index === 0 ? "  " : "  ";
    const modifier = index === 0 ? "active" : index === manifest.dysonProgram.phases.length - 1 ? "crit" : "";
    const id = `phase${index + 1}`;
    const parts = [
      `${phase.name} :${modifier}`.trim(),
      id,
      start,
      `${phase.durationDays}d`,
    ].filter(Boolean);
    lines.push(`${labelPrefix}${parts.join(", ")}`);
    current = addDays(current, phase.durationDays);
  });
  return lines.join("\n");
}

function normaliseConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function buildScenarioSweep(manifest: Manifest, telemetry: ReturnType<typeof computeTelemetry>): ScenarioResult[] {
  const safetyMargin = manifest.energyProtocols.stellarLattice.safetyMarginPct / 100;
  const capturedGw = manifest.energyProtocols.stellarLattice.baselineCapturedGw;
  const thermostatMarginGw = capturedGw * safetyMargin;
  const failsafeLatency = manifest.dysonProgram.safety.failsafeLatencySeconds;
  const guardianWindow = manifest.interstellarCouncil.guardianReviewWindow;
  const totalTimelineDays = manifest.dysonProgram.phases.reduce((sum, phase) => sum + phase.durationDays, 0);
  const energyMonteCarlo = telemetry.energy.monteCarlo;

  const scenarioResults: ScenarioResult[] = [];

  // Scenario 1 — 20% surge in civilisation-wide energy demand
  const stressDemandGw = telemetry.energy.models.regionalSumGw * 1.2;
  const remainingBufferGw = capturedGw - stressDemandGw;
  const energyStatus: ScenarioStatus =
    remainingBufferGw >= thermostatMarginGw
      ? "nominal"
      : remainingBufferGw >= 0
      ? "warning"
      : "critical";
  const energyConfidence = normaliseConfidence((remainingBufferGw + thermostatMarginGw) / (thermostatMarginGw * 2));
  scenarioResults.push({
    id: "energy-demand-surge",
    title: "20% demand surge vs Dyson safety margin",
    status: energyStatus,
    summary:
      remainingBufferGw >= 0
        ? `Dyson lattice absorbs surge with ${formatGw(Math.max(0, remainingBufferGw))} spare.`
        : `Dyson lattice overrun by ${formatGw(Math.abs(remainingBufferGw))}. Immediate throttling required.`,
    confidence: energyConfidence,
    impact:
      energyStatus === "critical"
        ? "Star-scale compute would brown-out without emergency pause."
        : "Thermostat margin remains controllable under surge scenario.",
    metrics: [
      { label: "Simulated demand", value: formatGw(stressDemandGw), ok: remainingBufferGw >= 0 },
      { label: "Remaining buffer", value: formatGw(remainingBufferGw), ok: remainingBufferGw >= thermostatMarginGw },
      { label: "Thermostat margin", value: formatGw(thermostatMarginGw), ok: true },
      {
        label: "Utilisation",
        value: `${((stressDemandGw / capturedGw) * 100).toFixed(2)}%`,
        ok: remainingBufferGw >= 0,
      },
    ],
    recommendedActions: [
      "Dispatch pause bundle for non-critical Earth workloads.",
      "Increase stellar thermostat target via setGlobalParameters if surge persists.",
    ],
  });

  // Scenario 2 — Bridge outage causing rerouted latency doubling
  const bridgeLatencies = Object.values(telemetry.bridges).map((bridge: any) => Number(bridge.latencySeconds));
  const baselineWorstLatency = bridgeLatencies.length > 0 ? Math.max(...bridgeLatencies) : 0;
  const failoverLatency = baselineWorstLatency * 2;
  const latencySlack = failsafeLatency - failoverLatency;
  const capturedGwTelemetry = telemetry.energy.capturedGw;
  const freeEnergyRatio =
    capturedGwTelemetry > 0 ? Math.max(0, energyMonteCarlo.freeEnergyMarginGw / capturedGwTelemetry) : 0;
  const strategyStability = Number.isFinite(telemetry.energy.allocationPolicy.strategyStability)
    ? telemetry.energy.allocationPolicy.strategyStability
    : 0;
  const replicatorStability = Number.isFinite(telemetry.energy.allocationPolicy.replicatorStability)
    ? telemetry.energy.allocationPolicy.replicatorStability
    : strategyStability;
  const equilibriumStability = (strategyStability + replicatorStability) / 2;
  const relayBoostPct = Math.min(0.35, Math.max(0, freeEnergyRatio * 0.6 + equilibriumStability * 0.15));
  const relayBoostGw = capturedGwTelemetry * relayBoostPct;
  const mitigatedLatency = failoverLatency * (1 - relayBoostPct);
  const mitigatedSlack = failsafeLatency - mitigatedLatency;
  const effectiveLatency = relayBoostPct > 0 ? mitigatedLatency : failoverLatency;
  const effectiveSlack = relayBoostPct > 0 ? mitigatedSlack : latencySlack;
  const bridgeStatus: ScenarioStatus =
    effectiveSlack >= failsafeLatency * 0.25
      ? "nominal"
      : effectiveSlack >= -failsafeLatency * 0.5
      ? "warning"
      : "critical";
  const bridgeConfidence = normaliseConfidence((effectiveSlack + failsafeLatency) / (failsafeLatency * 2));
  const mitigationNote =
    relayBoostPct > 0
      ? ` Relay boost ${(relayBoostPct * 100).toFixed(1)}% applied from Gibbs reserve.`
      : " Relay boost unavailable; Gibbs reserve exhausted.";
  scenarioResults.push({
    id: "bridge-failover",
    title: "Interplanetary bridge outage simulation",
    status: bridgeStatus,
    summary:
      effectiveSlack >= 0
        ? `Failover latency ${effectiveLatency.toFixed(0)}s leaves ${effectiveSlack.toFixed(
            0
          )}s slack within ${failsafeLatency}s failsafe.${mitigationNote}`
        : `Failover latency ${effectiveLatency.toFixed(0)}s breaches ${failsafeLatency}s failsafe.${mitigationNote}`,
    confidence: bridgeConfidence,
    impact:
      bridgeStatus === "critical"
        ? "Cross-federation coordination would desynchronise without isolation."
        : "Bridge sentries maintain cadence under reroute load.",
    metrics: [
      {
        label: "Baseline latency",
        value: `${baselineWorstLatency.toFixed(0)}s`,
        ok: baselineWorstLatency <= failsafeLatency,
      },
      {
        label: "Failover latency",
        value: `${failoverLatency.toFixed(0)}s`,
        ok: latencySlack >= 0,
      },
      {
        label: "Relay boost allocation",
        value: relayBoostPct > 0 ? `${(relayBoostPct * 100).toFixed(1)}% (${relayBoostGw.toFixed(0)} GW)` : "0%",
        ok: relayBoostPct > 0,
      },
      {
        label: "Mitigated latency",
        value: `${effectiveLatency.toFixed(0)}s`,
        ok: effectiveSlack >= 0,
      },
      { label: "Failsafe budget", value: `${failsafeLatency}s`, ok: true },
      { label: "Slack", value: `${effectiveSlack.toFixed(0)}s`, ok: effectiveSlack >= 0 },
    ],
    recommendedActions: [
      relayBoostPct > 0
        ? "Allocate relay boost to stabilise bridge latency using Gibbs reserve."
        : "Divert surplus energy to restore Gibbs reserve before failover.",
      effectiveSlack < 0
        ? "Execute bridge isolation routine from mission directives if slack < 0."
        : "Keep isolation routine on standby while relays rebalance.",
      "Rebalance capital streams to spin up orbital relays before load crosses failsafe.",
    ],
  });

  // Scenario 3 — Sentinel coverage gap of 10 minutes
  const sentinelCoverages = manifest.federations.flatMap((federation) =>
    federation.sentinels.map((sentinel) => sentinel.coverageSeconds)
  );
  const minimumSentinelCoverage = sentinelCoverages.length > 0 ? Math.min(...sentinelCoverages) : 0;
  const simulatedCoverage = Math.max(0, minimumSentinelCoverage - 600);
  const sentinelStatus: ScenarioStatus =
    simulatedCoverage >= guardianWindow
      ? "nominal"
      : simulatedCoverage >= guardianWindow * 0.75
      ? "warning"
      : "critical";
  const sentinelConfidence = normaliseConfidence(simulatedCoverage / Math.max(guardianWindow, 1));
  scenarioResults.push({
    id: "sentinel-gap",
    title: "Sentinel outage (10 min) coverage test",
    status: sentinelStatus,
    summary:
      simulatedCoverage >= guardianWindow
        ? "Guardian window stays protected under sentinel gap."
        : "Guardian window breached — deploy backup sentinel immediately.",
    confidence: sentinelConfidence,
    impact:
      sentinelStatus === "critical"
        ? "Domain autonomy would exceed guardrail without manual override."
        : "Coverage redundancy remains adequate for guardian review cadence.",
    metrics: [
      { label: "Minimum sentinel coverage", value: `${minimumSentinelCoverage}s`, ok: minimumSentinelCoverage >= guardianWindow },
      { label: "Simulated coverage", value: `${simulatedCoverage}s`, ok: simulatedCoverage >= guardianWindow },
      { label: "Guardian window", value: `${guardianWindow}s`, ok: true },
      {
        label: "Coverage ratio",
        value: `${((simulatedCoverage / Math.max(guardianWindow, 1)) * 100).toFixed(2)}%`,
        ok: simulatedCoverage >= guardianWindow,
      },
    ],
    recommendedActions: [
      "Register standby sentinel via Safe batch if ratio < 100%.",
      "Shorten guardian drill cadence until redundancy restored.",
    ],
  });

  // Scenario 4 — 15% compute drawdown across federations
  const projectedExaflops = telemetry.verification.compute.dysonProjectionExaflops;
  const stressedExaflops = telemetry.compute.totalExaflops * 0.85;
  const stressedDeviationPct =
    projectedExaflops === 0
      ? 0
      : Math.abs(stressedExaflops - projectedExaflops) / Math.max(projectedExaflops, 1) * 100;
  const computeTolerance = manifest.verificationProtocols.computeTolerancePct;
  const warningThreshold = Math.max(5, computeTolerance * 20);
  const computeStatus: ScenarioStatus =
    stressedDeviationPct <= computeTolerance * 2
      ? "nominal"
      : stressedDeviationPct <= warningThreshold
      ? "warning"
      : "critical";
  const computeConfidence = normaliseConfidence(1 - stressedDeviationPct / Math.max(warningThreshold * 1.5, 1));
  scenarioResults.push({
    id: "compute-drawdown",
    title: "Compute drawdown (15%) resilience",
    status: computeStatus,
    summary:
      computeStatus === "nominal"
        ? "Dyson projection stays within tolerance under drawdown."
        : `Deviation ${stressedDeviationPct.toFixed(2)}% exceeds tolerance ${computeTolerance}%.`,
    confidence: computeConfidence,
    impact:
      computeStatus === "critical"
        ? "Validator quorum would require capital reallocation before mission resume."
        : "Capital streams absorb transient compute reduction.",
    metrics: [
      { label: "Projected compute", value: `${projectedExaflops.toFixed(2)} EF`, ok: true },
      { label: "Stressed compute", value: `${stressedExaflops.toFixed(2)} EF`, ok: stressedDeviationPct <= computeTolerance },
      {
        label: "Deviation",
        value: `${stressedDeviationPct.toFixed(2)}%`,
        ok: stressedDeviationPct <= computeTolerance,
      },
      { label: "Tolerance", value: `${computeTolerance}%`, ok: true },
    ],
    recommendedActions: [
      "Authorise capital stream expansion for orbital compute nodes.",
      "Notify guardians to ratify temporary autonomy reduction if deviation persists.",
    ],
  });

  // Scenario 5 — 30 day slip in final Dyson phase
  const slipDays = 30;
  const finalPhase = manifest.dysonProgram.phases[manifest.dysonProgram.phases.length - 1];
  const remainingSlackDays = finalPhase ? finalPhase.durationDays - slipDays : -slipDays;
  const slipRatio = totalTimelineDays === 0 ? 0 : slipDays / totalTimelineDays;
  const dysonStatus: ScenarioStatus =
    slipRatio <= 0.05
      ? "nominal"
      : slipRatio <= 0.12
      ? "warning"
      : "critical";
  const dysonConfidence = normaliseConfidence(1 - slipRatio * 1.5);
  scenarioResults.push({
    id: "dyson-phase-slip",
    title: "Dyson phase slip (30 days)",
    status: dysonStatus,
    summary:
      remainingSlackDays >= 0
        ? `Schedule buffer absorbs slip with ${remainingSlackDays} days remaining.`
        : `Slip overruns phase by ${Math.abs(remainingSlackDays)} days — escalate to council.`,
    confidence: dysonConfidence,
    impact:
      dysonStatus === "critical"
        ? "Energy capture curve would miss annual targets without governance action."
        : "Swarm cadence remains aligned with annual capture commitments.",
    metrics: [
      { label: "Total timeline", value: `${totalTimelineDays} days`, ok: true },
      { label: "Slip", value: `${slipDays} days`, ok: slipRatio <= 0.12 },
      { label: "Remaining buffer", value: `${remainingSlackDays} days`, ok: remainingSlackDays >= 0 },
      { label: "Slip ratio", value: `${(slipRatio * 100).toFixed(2)}%`, ok: slipRatio <= 0.12 },
    ],
    recommendedActions: [
      "Accelerate self-improvement plan execution to reclaim schedule slack.",
      "Reallocate capital from Earth infrastructure to Dyson assembly for this epoch.",
    ],
  });

  // Scenario 6 — Loss of largest energy window
  const schedule = telemetry.energy.schedule ?? null;
  if (schedule && schedule.windows.length > 0) {
    const sortedWindows = [...schedule.windows].sort(
      (a: any, b: any) => Number(b.windowEnergyGwH) - Number(a.windowEnergyGwH)
    );
    const removed = sortedWindows[0];
    const remainingGwH = sortedWindows.slice(1).reduce((sum: number, window: any) => {
      return sum + Number(window.windowEnergyGwH);
    }, 0);
    const demandGwH = schedule.coverage.reduce((sum: number, entry: any) => {
      return sum + Number(entry.dailyDemandGwH);
    }, 0);
    const remainingCoverageRatio = demandGwH === 0 ? 1 : remainingGwH / Math.max(demandGwH, 1);
    const coverageThreshold =
      schedule.coverageThreshold ?? telemetry.verification.energySchedule.thresholdCoverage;
    const coverageSlack = remainingCoverageRatio - coverageThreshold;
    const scheduleStatus: ScenarioStatus =
      coverageSlack >= 0.02
        ? "nominal"
        : coverageSlack >= -0.02
        ? "warning"
        : "critical";
    const scheduleConfidence = normaliseConfidence(remainingCoverageRatio / Math.max(coverageThreshold, 0.0001));
    scenarioResults.push({
      id: "energy-window-loss",
      title: "Primary energy window offline",
      status: scheduleStatus,
      summary:
        scheduleStatus === "critical"
          ? `Removing ${removed.federation} ${removed.durationHours}h window drops coverage to ${(remainingCoverageRatio * 100).toFixed(2)}%.`
          : `Coverage remains ${(remainingCoverageRatio * 100).toFixed(2)}% after losing ${removed.federation} ${removed.durationHours}h window.`,
      confidence: scheduleConfidence,
      impact:
        scheduleStatus === "critical"
          ? "Civilisation would breach Dyson thermostat margin without immediate load shedding."
          : "Secondary windows can absorb the loss with limited throttling.",
      metrics: [
        { label: "Removed window", value: `${removed.federation} @ ${removed.startHourUTC}h`, ok: false },
        {
          label: "Remaining coverage",
          value: `${(remainingCoverageRatio * 100).toFixed(2)}%`,
          ok: remainingCoverageRatio >= coverageThreshold,
        },
        { label: "Threshold", value: `${(coverageThreshold * 100).toFixed(2)}%`, ok: true },
        {
          label: "Lost capacity",
          value: `${Number(removed.windowEnergyGwH).toFixed(2)} GW·h`,
          ok: false,
        },
      ],
      recommendedActions: [
        "Trigger orbital battery discharge if coverage < threshold.",
        "Re-route Mars workloads to orbital halo until replacement window is provisioned.",
      ],
    });
  }

  // Scenario 7 — Logistics demand spike 25%
  const logisticsAggregate = telemetry.logistics.aggregate;
  if (logisticsAggregate.capacityTonnesPerDay > 0) {
    const nominalUtilisation = logisticsAggregate.throughputTonnesPerDay / logisticsAggregate.capacityTonnesPerDay;
    const stressedThroughput = logisticsAggregate.throughputTonnesPerDay * 1.25;
    const stressedUtilisation = stressedThroughput / logisticsAggregate.capacityTonnesPerDay;
    const spareCapacityTonnes = logisticsAggregate.capacityTonnesPerDay - logisticsAggregate.throughputTonnesPerDay;
    const stressedBufferDays = Math.max(0, telemetry.verification.logistics.minimumBufferDays - 2);
    const logisticsStatus: ScenarioStatus =
      stressedUtilisation <= 0.9 && stressedBufferDays >= telemetry.verification.logistics.minimumBufferDays
        ? "nominal"
        : stressedUtilisation <= 1.05 && stressedBufferDays >= telemetry.verification.logistics.minimumBufferDays * 0.75
        ? "warning"
        : "critical";
    const logisticsConfidence = normaliseConfidence(1 - Math.max(0, stressedUtilisation - 0.9));
    scenarioResults.push({
      id: "logistics-demand-spike",
      title: "Logistics demand spike (+25%)",
      status: logisticsStatus,
      summary:
        logisticsStatus === "critical"
          ? `Utilisation ${(stressedUtilisation * 100).toFixed(2)}% exceeds corridor headroom; buffers fall to ${stressedBufferDays.toFixed(
              2
            )}d.`
          : `Corridors absorb spike with utilisation ${(stressedUtilisation * 100).toFixed(2)}% and buffers ${stressedBufferDays.toFixed(
              2
            )}d.`,
      confidence: logisticsConfidence,
      impact:
        logisticsStatus === "critical"
          ? "Materials and energy shipments would stall; initiate orbital failover corridor and throttle demand."
          : "Corridor reserves sufficient; monitor watchers for sustained load.",
      metrics: [
        {
          label: "Nominal utilisation",
          value: `${(nominalUtilisation * 100).toFixed(2)}%`,
          ok: nominalUtilisation <= 0.9,
        },
        {
          label: "Stressed utilisation",
          value: `${(stressedUtilisation * 100).toFixed(2)}%`,
          ok: stressedUtilisation <= 0.9,
        },
        {
          label: "Spare capacity",
          value: `${spareCapacityTonnes.toLocaleString()} tonnes/day`,
          ok: spareCapacityTonnes > 0,
        },
        {
          label: "Buffer after spike",
          value: `${stressedBufferDays.toFixed(2)} days`,
          ok: stressedBufferDays >= telemetry.verification.logistics.minimumBufferDays,
        },
      ],
      recommendedActions: [
        "Stage failover corridor encoded in manifest.failoverCorridor via Safe batch.",
        "Increase watcher quorum on highest utilisation corridor within 12h.",
      ],
    });
  }

  // Scenario 8 — Settlement backlog increases finality by 40%
  const settlement = telemetry.settlement ?? null;
  if (settlement && settlement.protocols.length > 0) {
    const stressedProtocols = settlement.protocols.map((protocol: any) => ({
      name: protocol.name,
      stressedFinality: Number(protocol.finalityMinutes) * 1.4,
      tolerance: Number(protocol.toleranceMinutes ?? telemetry.verification.settlement.maxToleranceMinutes),
    }));
    const breaches = stressedProtocols.filter((protocol) => protocol.stressedFinality > protocol.tolerance);
    const settlementStatus: ScenarioStatus =
      breaches.length === 0 ? "nominal" : breaches.length === 1 ? "warning" : "critical";
    const worstOverrun =
      breaches.length === 0
        ? 0
        : Math.max(...breaches.map((protocol) => protocol.stressedFinality - protocol.tolerance));
    const settlementConfidence = normaliseConfidence(
      Math.max(
        0,
        1 - worstOverrun / Math.max(telemetry.verification.settlement.maxToleranceMinutes || 1, 1)
      )
    );
    scenarioResults.push({
      id: "settlement-backlog",
      title: "Settlement backlog (+40% finality)",
      status: settlementStatus,
      summary:
        settlementStatus === "critical"
          ? `${breaches.length} protocol(s) exceed tolerance by up to ${worstOverrun.toFixed(2)} min.`
          : "Settlement mesh absorbs backlog within tolerance.",
      confidence: settlementConfidence,
      impact:
        settlementStatus === "critical"
          ? "Cross-planet payouts would stall; manual forex routing required."
          : "Guardian council can rely on automated settlement buffers.",
      metrics: stressedProtocols.map((protocol) => ({
        label: protocol.name,
        value: `${protocol.stressedFinality.toFixed(2)} min`,
        ok: protocol.stressedFinality <= protocol.tolerance,
      })),
      recommendedActions:
        breaches.length === 0
          ? ["Maintain watcher quorum and monitor bridge latency dashboards."]
          : [
              "Activate treasury failover to orbital credit rails.",
              "Deploy additional watchers to reduce backlog latency.",
            ],
    });
  }

  // Scenario 9 — Identity infiltration attempt (3% forged credentials)
  const identityTotals = telemetry.identity.totals;
  const forgedCount = identityTotals.issuances24h * 0.03;
  const infiltrationRevocationPpm =
    identityTotals.totalAgents === 0
      ? 0
      : ((identityTotals.revocations24h + forgedCount) / Math.max(identityTotals.totalAgents, 1)) * 1_000_000;
  const infiltrationTolerance = manifest.identityProtocols.global.revocationTolerancePpm;
  const identityStatus: ScenarioStatus =
    infiltrationRevocationPpm <= infiltrationTolerance
      ? "nominal"
      : infiltrationRevocationPpm <= infiltrationTolerance * 1.5
      ? "warning"
      : "critical";
  const identityConfidence = normaliseConfidence(
    1 - Math.max(0, infiltrationRevocationPpm - infiltrationTolerance) / Math.max(infiltrationTolerance * 2, 1)
  );
  scenarioResults.push({
    id: "identity-infiltration",
    title: "Identity infiltration (3% forged daily credentials)",
    status: identityStatus,
    summary:
      identityStatus === "nominal"
        ? "Revocation network absorbs infiltration within tolerance."
        : `Revocation demand ${infiltrationRevocationPpm.toFixed(2)} ppm breaches tolerance ${infiltrationTolerance} ppm`,
    confidence: identityConfidence,
    impact:
      identityStatus === "critical"
        ? "Identity ledger requires emergency anchor rotation and pause of compromised domains."
        : "Quorum anchors maintain trust lattice despite forged credential surge.",
    metrics: [
      { label: "Forged credentials", value: forgedCount.toLocaleString(), ok: identityStatus === "nominal" },
      {
        label: "Revocation load",
        value: `${infiltrationRevocationPpm.toFixed(2)} ppm`,
        ok: infiltrationRevocationPpm <= infiltrationTolerance,
      },
      { label: "Tolerance", value: `${infiltrationTolerance} ppm`, ok: true },
      {
        label: "Anchors at quorum",
        value: `${telemetry.identity.totals.anchorsMeetingQuorum}/${telemetry.identity.totals.federationCount}`,
        ok: telemetry.identity.withinQuorum,
      },
    ],
    recommendedActions: [
      "Execute fallback ENS registrar policy if forged rate exceeds tolerance.",
      "Rotate identity anchors using Safe batch identity transactions.",
    ],
  });

  // Scenario 10 — Energy feed drift spike
  const maxFeedDeltaPct = telemetry.energy.liveFeeds.feeds.reduce(
    (max: number, feed: any) => Math.max(max, feed.deltaPct),
    0
  );
  const feedTolerancePct = telemetry.energy.liveFeeds.tolerancePct;
  const feedDriftThresholdPct = telemetry.energy.liveFeeds.driftAlertPct ?? feedTolerancePct * 1.5;
  const feedStatus: ScenarioStatus =
    maxFeedDeltaPct <= feedTolerancePct
      ? "nominal"
      : maxFeedDeltaPct <= feedDriftThresholdPct
      ? "warning"
      : "critical";
  const feedConfidence = normaliseConfidence(
    1 - Math.max(0, maxFeedDeltaPct - feedTolerancePct) / Math.max(feedDriftThresholdPct || feedTolerancePct, 1)
  );
  scenarioResults.push({
    id: "energy-feed-drift",
    title: "Live energy feed drift shock",
    status: feedStatus,
    summary:
      feedStatus === "nominal"
        ? "Live feeds remain within tolerance bands."
        : `Max drift ${maxFeedDeltaPct.toFixed(2)}% (tolerance ${feedTolerancePct}%, alert ${feedDriftThresholdPct}%).`,
    confidence: feedConfidence,
    impact:
      feedStatus === "critical"
        ? "Immediate rerouting required – isolate affected plane and re-run energy oracle calibration."
        : "Feeds drift but remain serviceable; monitor and prepare calibration update.",
    metrics: [
      { label: "Max drift", value: `${maxFeedDeltaPct.toFixed(2)}%`, ok: feedStatus !== "critical" },
      { label: "Tolerance", value: `${feedTolerancePct}%`, ok: true },
      {
        label: "Drift alert",
        value: `${feedDriftThresholdPct}%`,
        ok: maxFeedDeltaPct <= feedDriftThresholdPct,
      },
      {
        label: "Average latency",
        value: `${telemetry.energy.liveFeeds.averageLatencyMs.toFixed(0)} ms`,
        ok:
          telemetry.energy.liveFeeds.averageLatencyMs <=
          (manifest.dysonProgram.safety.failsafeLatencySeconds || 0) * 1000,
      },
    ],
    recommendedActions: [
      "Trigger energy oracle recalibration from mission directives.",
      "Rebalance Dyson thermostat inputs toward the affected federation until drift subsides.",
    ],
  });

  // Scenario 11 — Primary compute plane offline
  const largestPlane = telemetry.computeFabric.planes.reduce(
    (max, plane) => (plane.capacityExaflops > max.capacityExaflops ? plane : max),
    telemetry.computeFabric.planes[0]
  );
  const failoverCapacity = telemetry.computeFabric.failoverCapacityExaflops;
  const quorumRequirement = telemetry.computeFabric.requiredFailoverCapacity;
  const computeFabricStatus: ScenarioStatus =
    failoverCapacity >= quorumRequirement
      ? "nominal"
      : failoverCapacity >= quorumRequirement * 0.85
      ? "warning"
      : "critical";
  const computeFabricConfidence = normaliseConfidence(
    failoverCapacity <= 0
      ? 0
      : Math.min(1, failoverCapacity / Math.max(quorumRequirement, 1))
  );
  scenarioResults.push({
    id: "compute-plane-failover",
    title: "Primary compute plane offline",
    status: computeFabricStatus,
    summary:
      computeFabricStatus === "nominal"
        ? `Failover capacity ${failoverCapacity.toFixed(2)} EF covers quorum.`
        : `Failover shortfall ${(quorumRequirement - failoverCapacity).toFixed(2)} EF`,
    confidence: computeFabricConfidence,
    impact:
      computeFabricStatus === "critical"
        ? "Launch emergency orchestrator safe to spin up reserve plane."
        : "Hierarchical scheduler retains quorum despite primary outage.",
    metrics: [
      { label: "Largest plane", value: `${largestPlane.name}`, ok: true },
      {
        label: "Failover capacity",
        value: `${failoverCapacity.toFixed(2)} EF`,
        ok: failoverCapacity >= quorumRequirement,
      },
      {
        label: "Required quorum",
        value: `${quorumRequirement.toFixed(2)} EF`,
        ok: true,
      },
      {
        label: "Average availability",
        value: `${(telemetry.computeFabric.averageAvailabilityPct * 100).toFixed(2)}%`,
        ok: telemetry.computeFabric.averageAvailabilityPct >= 0.9,
      },
    ],
    recommendedActions: [
      "Trigger failover playbook defined in compute fabrics policy.",
      "Increase energy allocation for reserve plane from Dyson thermostat.",
    ],
  });

  return scenarioResults;
}

function buildRunbook(
  manifest: Manifest,
  telemetry: any,
  dominanceScore: number,
  scenarios: ScenarioResult[]
): string {
  const lines: string[] = [];
  lines.push("# Kardashev II Orchestration Runbook");
  lines.push("");
  lines.push(`**Manifest hash**: ${telemetry.manifest.hash}`);
  lines.push(`**Dominance score**: ${dominanceScore.toFixed(1)} / 100`);
  lines.push("\n---\n");
  lines.push("## Governance actions");
  lines.push("1. Load `output/kardashev-safe-transaction-batch.json` into Safe (or timelock). ");
  lines.push("2. Verify manager, guardian council, and system pause addresses in review modals.");
  lines.push("3. Stage pause + resume transactions but leave them unsent until incident drills.");
  lines.push("4. Confirm self-improvement plan hash matches guardian-approved digest.");
  lines.push(
    `5. Confirm unstoppable owner score ${(telemetry.governance.ownerProof.unstoppableScore * 100).toFixed(2)}% (pause ${
      telemetry.ownerControls.pauseCallEncoded
    }, resume ${telemetry.ownerControls.resumeCallEncoded}, secondary corroboration ${
      telemetry.governance.ownerProof.secondary.matchesPrimaryScore ? "aligned" : "drift"
    } @ ${(telemetry.governance.ownerProof.secondary.unstoppableScore * 100).toFixed(2)}%, tertiary decode ${
      telemetry.governance.ownerProof.tertiary.matchesPrimaryScore &&
      telemetry.governance.ownerProof.tertiary.matchesSecondaryScore &&
      telemetry.governance.ownerProof.tertiary.decodeFailures === 0
        ? "aligned"
        : "review"
    } @ ${(telemetry.governance.ownerProof.tertiary.unstoppableScore * 100).toFixed(2)}% · decode failures ${
      telemetry.governance.ownerProof.tertiary.decodeFailures
    }).`
  );
  lines.push("\n---\n");
  lines.push("## Energy telemetry");
  lines.push(`* Captured GW (Dyson baseline): ${telemetry.energy.capturedGw.toLocaleString()} GW.`);
  lines.push(`* Utilisation: ${(telemetry.energy.utilisationPct * 100).toFixed(2)}% (margin ${telemetry.energy.marginPct.toFixed(2)}%).`);
  lines.push(`* Regional availability: ${telemetry.energy.regional.map((r: any) => `${r.slug} ${r.availableGw} GW`).join(" · ")}.`);
  lines.push(
    `* Monte Carlo breach probability ${(telemetry.energy.monteCarlo.breachProbability * 100).toFixed(2)}% (runs ${
      telemetry.energy.monteCarlo.runs
    }, tolerance ${(telemetry.energy.monteCarlo.tolerance * 100).toFixed(2)}%).`
  );
  lines.push(
    `* Free energy margin ${telemetry.energy.monteCarlo.freeEnergyMarginGw.toFixed(2)} GW (${(
      telemetry.energy.monteCarlo.freeEnergyMarginPct * 100
    ).toFixed(2)}%) · Gibbs free energy ${telemetry.energy.monteCarlo.gibbsFreeEnergyGj.toLocaleString()} GJ.`
  );
  lines.push(
    `* Free energy runway ${telemetry.energy.monteCarlo.runwayHours.toFixed(2)} hours at mean demand.`
  );
  lines.push(
    `* Hamiltonian stability ${(telemetry.energy.monteCarlo.hamiltonianStability * 100).toFixed(1)}% · entropy margin ${telemetry.energy.monteCarlo.entropyMargin.toFixed(2)}σ · game-theory slack ${(
      telemetry.energy.monteCarlo.gameTheorySlack * 100
    ).toFixed(1)}% · buffer ${telemetry.energy.monteCarlo.maintainsBuffer ? "stable" : "at risk"}.`
  );
  lines.push(
    `* Allocation policy: Gibbs temperature ${telemetry.energy.allocationPolicy.temperature.toFixed(2)} · Nash welfare ${(
      telemetry.energy.allocationPolicy.nashProduct * 100
    ).toFixed(2)}% · fairness ${(telemetry.energy.allocationPolicy.fairnessIndex * 100).toFixed(
      1
    )}% · Gibbs potential ${telemetry.energy.allocationPolicy.gibbsPotential.toFixed(3)}.`
  );
  lines.push(
    `* Replicator equilibrium ${(telemetry.energy.allocationPolicy.replicatorStability * 100).toFixed(1)}% · drift ${telemetry.energy.allocationPolicy.replicatorDrift.toFixed(3)}.`
  );
  lines.push(
    `* Sentient welfare equilibrium ${(telemetry.sentientWelfare.equilibriumScore * 100).toFixed(1)}% · cooperation ${(
      telemetry.sentientWelfare.cooperationIndex * 100
    ).toFixed(1)}% · inequality ${(telemetry.sentientWelfare.inequalityIndex * 100).toFixed(
      1
    )}% · free energy/agent ${telemetry.sentientWelfare.freeEnergyPerAgentGj.toFixed(6)} GJ.`
  );
  lines.push(
    `* Allocation deltas: ${telemetry.energy.allocationPolicy.allocations
      .map((allocation: any) => `${allocation.name} ${allocation.deltaGw >= 0 ? "+" : ""}${allocation.deltaGw.toFixed(2)} GW`)
      .join(" · ")}.`
  );
  lines.push(
    `* Demand percentiles: P95 ${telemetry.energy.monteCarlo.percentileGw.p95.toLocaleString()} GW · P99 ${
      telemetry.energy.monteCarlo.percentileGw.p99.toLocaleString()
    } GW.`
  );
  lines.push(
    `* Live feeds (≤ ${telemetry.energy.liveFeeds.tolerancePct}%): ${telemetry.energy.liveFeeds.feeds
      .map((feed: any) => `${feed.region} Δ ${feed.deltaPct.toFixed(2)}%`)
      .join(" · ")}.`
  );
  lines.push(
    `* Feed latency: avg ${telemetry.energy.liveFeeds.averageLatencyMs.toFixed(0)} ms · max ${telemetry.energy.liveFeeds.maxLatencyMs} ms (calibrated ${telemetry.energy.liveFeeds.calibrationISO8601}).`
  );
  lines.push(
    `* Energy window coverage ${(telemetry.energy.schedule.globalCoverageRatio * 100).toFixed(2)}% (threshold ${
      telemetry.energy.schedule.coverageThreshold * 100
    }%) · reliability ${(telemetry.energy.schedule.globalReliabilityPct * 100).toFixed(2)}%.`
  );
  if (telemetry.energy.schedule.deficits.length > 0) {
    lines.push(
      `* ⚠️ Energy deficits: ${telemetry.energy.schedule.deficits
        .map((deficit: any) => `${deficit.federation} ${(deficit.coverageRatio * 100).toFixed(2)}% (${deficit.deficitGwH} GW·h short)`) 
        .join(" · ")}.`
    );
  } else {
    lines.push("* Energy window deficits: none — all federations meet coverage targets.");
  }
  if (telemetry.energy.schedule.reliabilityDeficits.length > 0) {
    lines.push(
      `* ⚠️ Reliability watchlist: ${telemetry.energy.schedule.reliabilityDeficits
        .map((entry: any) => `${entry.federation} ${(entry.reliabilityPct * 100).toFixed(2)}%`)
        .join(" · ")}.`
    );
  }
  if (telemetry.energy.warnings.length > 0) {
    lines.push(`* ⚠️ ${telemetry.energy.warnings.join("; ")}`);
  }
  lines.push("\n---\n");
  lines.push("## Logistics corridors");
  lines.push(
    `* ${telemetry.logistics.corridors.length} corridors · avg reliability ${(telemetry.verification.logistics.averageReliabilityPct * 100).toFixed(
      2
    )}% · avg utilisation ${(telemetry.verification.logistics.averageUtilisationPct * 100).toFixed(2)}% · min buffer ${telemetry.verification.logistics.minimumBufferDays.toFixed(
      2
    )} days.`
  );
  lines.push(
    `* Watcher coverage: ${telemetry.logistics.aggregate.watchers.length} unique sentinels; verification ${
      telemetry.verification.logistics.watchersOk ? "✅" : "⚠️"
    }.`
  );
  lines.push(
    `* Capacity ${telemetry.logistics.aggregate.capacityTonnesPerDay.toLocaleString()} tonnes/day · throughput ${telemetry.logistics.aggregate.throughputTonnesPerDay.toLocaleString()} tonnes/day · energy ${telemetry.logistics.aggregate.totalEnergyMwh.toLocaleString()} MWh.`
  );
  lines.push(
    `* Hamiltonian stability ${(telemetry.logistics.equilibrium.hamiltonianStability * 100).toFixed(1)}% · entropy ${(telemetry.logistics.equilibrium.entropy).toFixed(
      3
    )} · game-theory slack ${(telemetry.logistics.equilibrium.gameTheorySlack * 100).toFixed(1)}% · Gibbs ${telemetry.logistics.equilibrium.gibbsFreeEnergyMwh.toLocaleString()} MWh.`
  );
  if (telemetry.logistics.warnings.length > 0) {
    lines.push(`* ⚠️ ${telemetry.logistics.warnings.join("; ")}`);
  } else {
    lines.push("* Logistics advisories: none — buffers and reliability nominal.");
  }
  lines.push("\n---\n");
  lines.push("## Compute & domains");
  lines.push(
    `* Aggregate compute ${telemetry.compute.totalExaflops.toFixed(2)} EF · ${telemetry.compute.totalAgents.toLocaleString()} agents · deviation ${telemetry.verification.compute.deviationPct.toFixed(2)}% (≤ ${telemetry.verification.compute.tolerancePct}%).`
  );
  for (const federation of manifest.federations) {
    const fTelemetry = telemetry.compute.regional.find((r: any) => r.slug === federation.slug);
    lines.push(`* **${federation.slug.toUpperCase()}** – ${fTelemetry.exaflops.toFixed(2)} EF, ${fTelemetry.agents.toLocaleString()} agents, resilience ${(fTelemetry.resilience * 100).toFixed(2)}%.`);
  }
  lines.push("\n---\n");
  lines.push("## Mission lattice & task hierarchy");
  lines.push(
    `* ${telemetry.missionLattice.totals.programmes} programmes · ${telemetry.missionLattice.totals.tasks} tasks · ${telemetry.missionLattice.totals.energyGw.toLocaleString()} GW · ${telemetry.missionLattice.totals.computeExaflops.toFixed(2)} EF.`
  );
  lines.push(
    `* Unstoppable score ${(telemetry.missionLattice.verification.unstoppableScore * 100).toFixed(2)}% · dependencies resolved ${telemetry.missionLattice.verification.dependenciesResolved} · sentinel coverage ${telemetry.missionLattice.verification.sentinelCoverage}.`
  );
  const leadProgramme = telemetry.missionLattice.programmes.reduce(
    (max: any, programme: any) => (programme.totalEnergyGw > max.totalEnergyGw ? programme : max),
    telemetry.missionLattice.programmes[0]
  );
  if (leadProgramme) {
    lines.push(
      `* Lead programme ${leadProgramme.name} (${leadProgramme.federation}) — ${leadProgramme.taskCount} tasks, ${leadProgramme.totalEnergyGw} GW, unstoppable ${(leadProgramme.unstoppableScore * 100).toFixed(2)}%.`
    );
  }
  if (telemetry.missionLattice.verification.warnings.length > 0) {
    lines.push(`* ⚠ Mission advisories: ${telemetry.missionLattice.verification.warnings.join("; ")}`);
  } else {
    lines.push("* Mission advisories: none — autonomy, sentinel coverage, and timelines are nominal.");
  }
  lines.push("\n---\n");
  lines.push("## Identity lattice");
  lines.push(
    `* Root authority ${telemetry.identity.global.rootAuthority} · Merkle root ${telemetry.identity.global.identityMerkleRoot}.`
  );
  lines.push(
    `* ${telemetry.identity.totals.anchorsMeetingQuorum}/${telemetry.identity.totals.federationCount} federations at quorum ${manifest.identityProtocols.global.attestationQuorum}; revocation ${telemetry.identity.totals.revocationRatePpm.toFixed(2)} ppm (≤ ${manifest.identityProtocols.global.revocationTolerancePpm} ppm).`
  );
  lines.push(
    `* Average attestation latency ${telemetry.identity.totals.averageAttestationLatencySeconds.toFixed(0)}s (window ${manifest.identityProtocols.global.revocationWindowSeconds}s).`
  );
  for (const federation of telemetry.identity.federations) {
    lines.push(
      `* **${federation.name}** – DID ${federation.didRegistry} · anchors ${federation.anchors.length} · coverage ${(federation.coveragePct * 100).toFixed(2)}%.`
    );
  }
  lines.push("\n---\n");
  lines.push("## Compute fabric orchestrators");
  lines.push(
    `* Total plane capacity ${telemetry.computeFabric.totalCapacityExaflops.toFixed(2)} EF · failover ${telemetry.computeFabric.failoverCapacityExaflops.toFixed(2)} EF (quorum ${telemetry.computeFabric.requiredFailoverCapacity.toFixed(2)} EF).`
  );
  lines.push(
    `* Average availability ${(telemetry.computeFabric.averageAvailabilityPct * 100).toFixed(2)}% · failover within quorum: ${telemetry.computeFabric.failoverWithinQuorum}.`
  );
  telemetry.computeFabric.planes.forEach((plane: any) => {
    lines.push(
      `* **${plane.name}** (${plane.geography}) – scheduler ${plane.scheduler}, capacity ${plane.capacityExaflops.toFixed(2)} EF, latency ${plane.latencyMs} ms, availability ${(plane.availabilityPct * 100).toFixed(2)}%, failover partner ${plane.failoverPartner}.`
    );
  });
  lines.push(
    `* Sharded registry fabric health — domains ${telemetry.orchestrationFabric.coverage.domainsOk ? "aligned" : "check"}, sentinels ${telemetry.orchestrationFabric.coverage.sentinelsOk ? "aligned" : "check"}, federations ${telemetry.orchestrationFabric.coverage.federationsOk ? "aligned" : "check"}.`
  );
  lines.push(
    `* Fabric latency: avg ${telemetry.orchestrationFabric.coverage.averageLatencyMs.toFixed(0)} ms · max ${telemetry.orchestrationFabric.coverage.maxLatencyMs} ms.`
  );
  if (!telemetry.orchestrationFabric.coverage.domainsOk) {
    const drift = telemetry.orchestrationFabric.shards
      .filter((shard: any) => !shard.domainCoverageOk)
      .map((shard: any) => `${shard.id}: missing ${shard.missingDomains.join("/")}`);
    if (drift.length > 0) {
      lines.push(`* ⚠️ Domain drift: ${drift.join(" · ")}`);
    }
  }
  if (!telemetry.orchestrationFabric.coverage.federationsOk) {
    lines.push(`* ⚠️ Unmatched federations: ${telemetry.orchestrationFabric.coverage.unmatchedFederations.join(", ")}`);
  }
  lines.push("\n---\n");
  lines.push("## Scenario stress sweep");
  for (const scenario of scenarios) {
    lines.push(
      `* **${scenario.title}** — status ${scenario.status.toUpperCase()} (confidence ${(scenario.confidence * 100).toFixed(1)}%) · ${scenario.summary}`
    );
    scenario.metrics.forEach((metric) => {
      lines.push(`  - ${metric.label}: ${metric.value} (${metric.ok ? "ok" : "check"})`);
    });
    if (scenario.recommendedActions.length > 0) {
      lines.push(`  - Recommended: ${scenario.recommendedActions.join(" · ")}`);
    }
  }
  lines.push("\n---\n");
  lines.push("## Bridges");
  for (const [bridge, data] of Object.entries(telemetry.bridges as Record<string, any>)) {
    lines.push(`* ${bridge}: latency ${data.latencySeconds}s, bandwidth ${data.bandwidthGbps} Gbps, operator ${data.bridgeOperator}.`);
  }
  lines.push("\n---\n");
  lines.push("## Settlement lattice & forex");
  lines.push(
    `* Average finality ${telemetry.settlement.averageFinalityMinutes.toFixed(2)} min (max ${telemetry.verification.settlement.maxToleranceMinutes.toFixed(
      2
    )} min) · coverage ${(telemetry.settlement.minCoveragePct * 100).toFixed(2)}% (threshold ${
      telemetry.settlement.coverageThreshold * 100
    }%).`
  );
  lines.push(
    `* Watchers online ${telemetry.settlement.watchersOnline}/${telemetry.settlement.watchers.length} · slippage threshold ${telemetry.settlement.slippageThresholdBps} bps.`
  );
  lines.push(
    `* Protocols: ${telemetry.settlement.protocols
      .map(
        (protocol: any) =>
          `${protocol.name} — finality ${protocol.finalityMinutes.toFixed(2)} min (tol ${protocol.toleranceMinutes.toFixed(2)} min) · coverage ${(protocol.coveragePct * 100).toFixed(2)}%`
      )
      .join(" · ")}.`
  );
  if (!telemetry.verification.settlement.allWithinTolerance) {
    const failing = telemetry.settlement.protocols
      .filter((protocol: any) => protocol.finalityMinutes > protocol.toleranceMinutes)
      .map((protocol: any) => `${protocol.name} ${(protocol.finalityMinutes - protocol.toleranceMinutes).toFixed(2)} min over`);
    if (failing.length > 0) {
      lines.push(`* ⚠️ Settlement finality overruns: ${failing.join(" · ")}`);
    }
  }
  lines.push("\n---\n");
  lines.push("## Dyson programme");
  for (const phase of manifest.dysonProgram.phases) {
    lines.push(`* ${phase.name}: ${phase.satellites.toLocaleString()} satellites, ${phase.energyYieldGw.toLocaleString()} GW, ${phase.durationDays} days.`);
  }
  lines.push("\n---\n");
  lines.push("## Reflection checklist");
  lines.push("- [ ] Guardian coverage ≥ guardian review window.");
  lines.push("- [ ] Energy utilisation within safety margin.");
  lines.push("- [ ] Bridge latency ≤ failsafe latency.");
  lines.push("- [ ] Pause bundle verified on live SystemPause contract.");
  return lines.join("\n");
}

function buildOperatorBriefing(manifest: Manifest, telemetry: any): string {
  const lines: string[] = [];
  lines.push("# Kardashev II Operator Briefing");
  lines.push("");
  lines.push("## Owner powers");
  manifest.missionDirectives.ownerPowers.forEach((power: any) => {
    lines.push(
      `- **${power.title}** (Safe step #${power.safeIndex}) — ${power.description} · Playbook: ${power.playbookURI}`
    );
  });
  lines.push("");
  lines.push("## Escalation pathways");
  lines.push(
    `* Guardians: ${manifest.missionDirectives.escalation.guardianHotline} · Ops: ${manifest.missionDirectives.escalation.operationsHotline}`
  );
  lines.push(`* Status page: ${manifest.missionDirectives.escalation.statusPageURI}`);
  lines.push(`* Bridge failover: ${manifest.missionDirectives.escalation.bridgeFailover}`);
  lines.push("");
  lines.push("## Drill cadence");
  lines.push(
    `* Pause drill every ${manifest.missionDirectives.drills.pauseCadenceHours}h · Guardian review window ${manifest.missionDirectives.drills.guardianReviewMinutes} minutes.`
  );
  lines.push(`* Next scheduled drill: ${manifest.missionDirectives.drills.nextDrillISO8601}`);
  lines.push("");
  lines.push("## Verification status");
  lines.push(
    `* Energy models (${telemetry.verification.energyModels.expected.join(", ")}) aligned: ${telemetry.verification.energyModels.withinMargin}`
  );
  lines.push(
    `* Monte Carlo breach ${(telemetry.verification.energyMonteCarlo.breachProbability * 100).toFixed(2)}% (≤ ${
      telemetry.verification.energyMonteCarlo.tolerance * 100
    }% tolerance): ${telemetry.verification.energyMonteCarlo.withinTolerance}`
  );
  lines.push(
    `* Energy window coverage ${(telemetry.energy.schedule.globalCoverageRatio * 100).toFixed(2)}% (threshold ${
      telemetry.energy.schedule.coverageThreshold * 100
    }%) · reliability ${(telemetry.energy.schedule.globalReliabilityPct * 100).toFixed(2)}%.`
  );
  lines.push(
    `* Compute deviation ${telemetry.verification.compute.deviationPct.toFixed(2)}% (tolerance ${telemetry.verification.compute.tolerancePct}%): ${telemetry.verification.compute.withinTolerance}`
  );
  lines.push(
    `* Energy feed drift ≤ ${telemetry.verification.energyFeeds.tolerancePct}%: ${telemetry.verification.energyFeeds.allWithinTolerance}`
  );
  lines.push(
    `* Bridge latency tolerance (${telemetry.verification.bridges.toleranceSeconds}s): ${telemetry.verification.bridges.allWithinTolerance}`
  );
  lines.push(
    `* Settlement finality ${telemetry.settlement.averageFinalityMinutes.toFixed(2)} min (max ${telemetry.verification.settlement.maxToleranceMinutes.toFixed(
      2
    )} min) · slippage threshold ${telemetry.settlement.slippageThresholdBps} bps.`
  );
  lines.push(
    `* Logistics corridors ${telemetry.logistics.corridors.length} active — avg reliability ${(telemetry.verification.logistics.averageReliabilityPct * 100).toFixed(
      2
    )}% · min buffer ${telemetry.verification.logistics.minimumBufferDays.toFixed(2)}d · watchers ${telemetry.logistics.aggregate.watchers.length} (${telemetry.verification.logistics.reliabilityOk &&
    telemetry.verification.logistics.bufferOk &&
    telemetry.verification.logistics.utilisationOk &&
    telemetry.verification.logistics.watchersOk &&
    telemetry.verification.logistics.equilibriumOk
      ? "nominal"
      : "review"}).`
  );
  lines.push(
    `* Logistics equilibrium: Hamiltonian ${(telemetry.logistics.equilibrium.hamiltonianStability * 100).toFixed(
      1
    )}% · entropy ${(telemetry.logistics.equilibrium.entropy).toFixed(3)} · game-theory slack ${(
      telemetry.logistics.equilibrium.gameTheorySlack * 100
    ).toFixed(1)}%.`
  );
  lines.push(
    `* Mission unstoppable ${(telemetry.missionLattice.verification.unstoppableScore * 100).toFixed(2)}% across ${telemetry.missionLattice.totals.programmes} programmes (dependencies resolved ${telemetry.missionLattice.verification.dependenciesResolved}).`
  );
  if (telemetry.missionLattice.verification.warnings.length > 0) {
    lines.push(`* Mission advisories: ${telemetry.missionLattice.verification.warnings.join("; ")}`);
  } else {
    lines.push("* Mission advisories: none — autonomy, sentinel, and timeline guardrails nominal.");
  }
  lines.push(
    `* Owner override unstoppable score ${(telemetry.governance.ownerProof.unstoppableScore * 100).toFixed(2)}% (selectors ${
      telemetry.governance.ownerProof.selectorsComplete
    }, pause ${telemetry.ownerControls.pauseCallEncoded}, resume ${telemetry.ownerControls.resumeCallEncoded}, secondary ${
      telemetry.governance.ownerProof.secondary.matchesPrimaryScore ? "aligned" : "drift"
    } @ ${(telemetry.governance.ownerProof.secondary.unstoppableScore * 100).toFixed(2)}%, tertiary ${
      telemetry.governance.ownerProof.tertiary.matchesPrimaryScore &&
      telemetry.governance.ownerProof.tertiary.matchesSecondaryScore &&
      telemetry.governance.ownerProof.tertiary.decodeFailures === 0
        ? "aligned"
        : "review"
    } @ ${(telemetry.governance.ownerProof.tertiary.unstoppableScore * 100).toFixed(2)}% · decode failures ${
      telemetry.governance.ownerProof.tertiary.decodeFailures
    }).`
  );
  const scenarioSweep: ScenarioResult[] = telemetry.scenarioSweep ?? [];
  const nominalScenarios = scenarioSweep.filter((scenario) => scenario.status === "nominal").length;
  const warningScenarios = scenarioSweep.filter((scenario) => scenario.status === "warning").length;
  const criticalScenarios = scenarioSweep.filter((scenario) => scenario.status === "critical").length;
  if (scenarioSweep.length > 0) {
    lines.push(
      `* Scenario sweep: ${nominalScenarios}/${scenarioSweep.length} nominal, ${warningScenarios} warning, ${criticalScenarios} critical.`
    );
    scenarioSweep
      .filter((scenario) => scenario.status !== "nominal")
      .forEach((scenario) => {
        lines.push(`  - ${scenario.title}: ${scenario.summary}`);
      });
  }
  lines.push(`* Audit checklist: ${telemetry.verification.auditChecklistURI}`);
  lines.push("");
  lines.push("## Identity posture");
  lines.push(
    `* ${telemetry.identity.totals.anchorsMeetingQuorum}/${telemetry.identity.totals.federationCount} federations meeting quorum ${manifest.identityProtocols.global.attestationQuorum}.`
  );
  lines.push(
    `* Revocation rate ${telemetry.identity.totals.revocationRatePpm.toFixed(2)} ppm (tolerance ${manifest.identityProtocols.global.revocationTolerancePpm} ppm); latency window ${telemetry.identity.totals.maxAttestationLatencySeconds.toFixed(0)}s / ${manifest.identityProtocols.global.revocationWindowSeconds}s.`
  );
  lines.push(
    `* Identity ledger delta ${telemetry.identity.totals.deviationAgainstCompute.toLocaleString()} agents vs compute registry.`
  );
  lines.push("");
  lines.push("## Compute fabric posture");
  lines.push(
    `* Failover capacity ${telemetry.computeFabric.failoverCapacityExaflops.toFixed(2)} EF vs quorum ${telemetry.computeFabric.requiredFailoverCapacity.toFixed(2)} EF; within quorum ${telemetry.computeFabric.failoverWithinQuorum}.`
  );
  lines.push(
    `* Average plane availability ${(telemetry.computeFabric.averageAvailabilityPct * 100).toFixed(2)}% (planes ${telemetry.computeFabric.planes.length}).`
  );
  const leadingPlane = telemetry.computeFabric.planes.reduce(
    (max: any, plane: any) => (plane.capacityExaflops > max.capacityExaflops ? plane : max),
    telemetry.computeFabric.planes[0]
  );
  if (leadingPlane) {
    lines.push(
      `* Lead plane ${leadingPlane.name} (${leadingPlane.geography}) capacity ${leadingPlane.capacityExaflops.toFixed(2)} EF, partner ${leadingPlane.failoverPartner}.`
    );
  }
  lines.push(
    `* Sharded registry fabric domains ${telemetry.verification.orchestrationFabric.domainsOk ? "OK" : "⚠️"} · sentinels ${telemetry.verification.orchestrationFabric.sentinelsOk ? "OK" : "⚠️"} · federations ${telemetry.verification.orchestrationFabric.federationsOk ? "OK" : "⚠️"}.`
  );
  lines.push("");
  lines.push("## Federation snapshot");
  telemetry.federations.forEach((federation: any) => {
    lines.push(
      `* **${federation.name}** (chain ${federation.chainId}) — Safe ${federation.governanceSafe}, energy ${federation.energy.availableGw} GW, compute ${federation.compute.exaflops} EF.`
    );
    const topDomains = federation.domains
      .slice()
      .sort((a: any, b: any) => b.monthlyValueUSD - a.monthlyValueUSD)
      .slice(0, 2)
      .map(
        (domain: any) =>
          `${domain.name} (${formatUSD(domain.monthlyValueUSD)}/mo, resilience ${(domain.resilience * 100).toFixed(2)}%)`
      );
    if (topDomains.length > 0) {
      lines.push(`  - Lead domains: ${topDomains.join(" · ")}`);
    }
    const sentinelNames = federation.sentinels.map((s: any) => s.name).join(", ");
    lines.push(`  - Sentinels: ${sentinelNames}`);
  });
  return lines.join("\n");
}

function computeTelemetry(
  manifest: Manifest,
  dominanceScore: number,
  manifestHash: string,
  ownerProof: OwnerControlProof,
  energyFeeds: EnergyFeedsConfig,
  fabric: FabricConfig,
  mission: MissionTelemetrySummary
) {
  const totalMonthlyValue = manifest.federations.flatMap((f) => f.domains).reduce((sum, d) => sum + d.monthlyValueUSD, 0);
  const totalResilience = manifest.federations.flatMap((f) => f.domains).reduce((sum, d) => sum + d.resilience, 0);
  const domainCount = manifest.federations.reduce((sum, f) => sum + f.domains.length, 0);
  const averageResilience = domainCount > 0 ? totalResilience / domainCount : 0;
  const domainCoverages = manifest.federations.flatMap((f) => f.domains.map((d) => d.coverageSeconds));
  const totalCoverage = domainCoverages.reduce((sum, coverage) => sum + coverage, 0);
  const averageCoverage = domainCount > 0 ? totalCoverage / domainCount : 0;
  const minimumCoverage = domainCoverages.length > 0 ? Math.min(...domainCoverages) : 0;

  const capturedGw = manifest.energyProtocols.stellarLattice.baselineCapturedGw;
  const regionalEnergy = manifest.federations.map((f) => ({
    slug: f.slug,
    availableGw: f.energy.availableGw,
    storageGwh: f.energy.storageGwh,
    renewablePct: f.energy.renewablePct,
  }));
  const sumRegionalGw = regionalEnergy.reduce((sum, r) => sum + r.availableGw, 0);
  const dysonYield = manifest.dysonProgram.phases.reduce((sum, p) => sum + p.energyYieldGw, 0);
  const energyCrossVerification = performEnergyCrossVerification(manifest);
  const utilisationPct = sumRegionalGw / capturedGw;
  const marginPct = manifest.energyProtocols.stellarLattice.safetyMarginPct / 100;
  const energyWarnings: string[] = [];
  if (utilisationPct > 1 - marginPct) {
    energyWarnings.push("Utilisation exceeds configured safety margin");
  }
  if (dysonYield < capturedGw) {
    energyWarnings.push("Dyson programme yield below captured baseline");
  }

  const energyMonteCarlo = runEnergyMonteCarlo(manifest, manifestHash);
  const allocationPolicy = buildEnergyAllocationPolicy(manifest, energyMonteCarlo);
  if (!energyMonteCarlo.withinTolerance) {
    energyWarnings.push(
      `Monte Carlo breach probability ${(energyMonteCarlo.breachProbability * 100).toFixed(2)}% exceeds ${(energyMonteCarlo.tolerance * 100).toFixed(2)}% tolerance`
    );
  }
  if (!energyMonteCarlo.maintainsBuffer) {
    energyWarnings.push(
      `Free energy margin ${energyMonteCarlo.freeEnergyMarginGw.toFixed(2)} GW below safety buffer ${energyMonteCarlo.marginGw.toFixed(2)} GW`
    );
  }

  const feedComparisons = energyFeeds.feeds.map((feed) => {
    const federation = manifest.federations.find((f) => f.slug === feed.federationSlug);
    const manifestGw = federation ? federation.energy.availableGw : 0;
    const feedGw = (feed.nominalMw + feed.bufferMw) / 1000;
    const deltaGw = manifestGw - feedGw;
    const deltaPct = manifestGw === 0 ? 0 : Math.abs(deltaGw) / Math.max(manifestGw, 1) * 100;
    const withinTolerance = deltaPct <= energyFeeds.tolerancePct;
    const driftThreshold = energyFeeds.driftAlertPct ?? energyFeeds.tolerancePct * 1.5;
    const driftAlert = deltaPct >= driftThreshold;
    if (!withinTolerance) {
      energyWarnings.push(
        `Energy feed ${feed.region} deviates ${deltaPct.toFixed(2)}% (tolerance ${energyFeeds.tolerancePct}%).`
      );
    }
    if (driftAlert) {
      energyWarnings.push(
        `Energy feed ${feed.region} drift ${deltaPct.toFixed(2)}% exceeds alert ${driftThreshold}%.`
      );
    }
    return {
      region: feed.region,
      federationSlug: feed.federationSlug,
      type: feed.type,
      telemetry: feed.telemetry,
      manifestGw,
      feedGw,
      deltaGw,
      deltaPct,
      latencyMs: feed.latencyMs,
      withinTolerance,
      driftAlert,
    };
  });

  const rawScheduleWindows = manifest.energyWindows.map((window) => {
    const federation = manifest.federations.find((f) => f.slug === window.federation);
    const energyGw = window.availableGw + window.backupGw;
    const windowEnergyGwH = energyGw * window.durationHours;
    const demandExaflops = federation?.compute.exaflops ?? 0;
    const supportedExaflops = energyGw / 12;
    const coverageRatio =
      demandExaflops === 0 ? 1 : Math.min(1, supportedExaflops / Math.max(demandExaflops, 1e-6));
    const baseJobsPerHour =
      federation && federation.compute.agents > 0
        ? (federation.compute.agents / 1_000_000) * 120
        : 0;
    const recommendedJobsPerHour = baseJobsPerHour * coverageRatio;
    return {
      id: `${window.federation}-${window.startHourUTC}`,
      federation: window.federation,
      startHourUTC: window.startHourUTC,
      durationHours: window.durationHours,
      availableGw: window.availableGw,
      backupGw: window.backupGw,
      renewablePct: window.renewablePct,
      reliabilityPct: window.reliabilityPct,
      priorityDomains: window.priorityDomains,
      transferCapacityGbps: window.transferCapacityGbps,
      supportedExaflops,
      demandExaflops,
      coverageRatio,
      recommendedJobsPerHour,
      recommendedJobs: Math.round(recommendedJobsPerHour * window.durationHours),
      windowEnergyGwH,
    };
  });

  const rawScheduleCoverage = manifest.federations.map((federation) => {
    const windows = rawScheduleWindows.filter((window) => window.federation === federation.slug);
    const scheduledGwH = windows.reduce((sum, window) => sum + window.windowEnergyGwH, 0);
    const dailyDemandGwH = federation.energy.availableGw * 24;
    const coverageRatio =
      dailyDemandGwH === 0 ? 1 : scheduledGwH / Math.max(dailyDemandGwH, 1);
    const reliabilityPct =
      scheduledGwH === 0
        ? 0
        : windows.reduce((sum, window) => sum + window.reliabilityPct * window.windowEnergyGwH, 0) /
          Math.max(scheduledGwH, 1);
    const transferCapacityGbps = windows.reduce((sum, window) => sum + window.transferCapacityGbps, 0);
    return {
      federation: federation.slug,
      dailyDemandGwH,
      scheduledGwH,
      coverageRatio,
      reliabilityPct,
      windowCount: windows.length,
      transferCapacityGbps,
      deficitGwH: Math.max(0, dailyDemandGwH - scheduledGwH),
    };
  });

  const totalWindowEnergyGwH = rawScheduleWindows.reduce((sum, window) => sum + window.windowEnergyGwH, 0);
  const totalDailyDemandGwH = manifest.federations.reduce(
    (sum, federation) => sum + federation.energy.availableGw * 24,
    0
  );
  const globalCoverageRatio =
    totalDailyDemandGwH === 0
      ? 1
      : Math.min(1, totalWindowEnergyGwH / Math.max(totalDailyDemandGwH, 1));
  const globalReliabilityPct =
    totalWindowEnergyGwH === 0
      ? 0
      : rawScheduleWindows.reduce(
          (sum, window) => sum + window.reliabilityPct * window.windowEnergyGwH,
          0
        ) / Math.max(totalWindowEnergyGwH, 1);

  const scheduleCoverageThreshold =
    manifest.energyProtocols?.coverageThresholdPct !== undefined
      ? manifest.energyProtocols.coverageThresholdPct / 100
      : 0.98;
  const scheduleReliabilityThreshold = 0.95;

  const energyScheduleWindows = rawScheduleWindows.map((window) => ({
    ...window,
    supportedExaflops: round(window.supportedExaflops, 2),
    demandExaflops: round(window.demandExaflops, 2),
    coverageRatio: round(window.coverageRatio, 4),
    recommendedJobsPerHour: round(window.recommendedJobsPerHour, 2),
    windowEnergyGwH: round(window.windowEnergyGwH, 2),
  }));

  const energyScheduleCoverage = rawScheduleCoverage.map((entry) => ({
    ...entry,
    dailyDemandGwH: round(entry.dailyDemandGwH, 2),
    scheduledGwH: round(entry.scheduledGwH, 2),
    coverageRatio: round(entry.coverageRatio, 4),
    reliabilityPct: round(entry.reliabilityPct, 4),
    transferCapacityGbps: round(entry.transferCapacityGbps, 2),
    deficitGwH: round(entry.deficitGwH, 2),
  }));

  const energyScheduleDeficits = rawScheduleCoverage
    .filter((entry) => entry.coverageRatio < 1)
    .map((entry) => ({
      federation: entry.federation,
      coverageRatio: round(entry.coverageRatio, 4),
      deficitGwH: round(entry.deficitGwH, 2),
    }));

  const energyScheduleReliabilityDeficits = rawScheduleCoverage
    .filter((entry) => entry.reliabilityPct < scheduleReliabilityThreshold)
    .map((entry) => ({
      federation: entry.federation,
      reliabilityPct: round(entry.reliabilityPct, 4),
    }));

  const logisticsReliabilityThreshold = 0.97;
  const logisticsBufferThresholdDays = 10;
  const logisticsUtilisationCeiling = 0.92;
  const logisticsWatcherThreshold = 2;

  const logisticsCorridorsRaw = manifest.logisticsCorridors.map((corridor) => {
    const throughputTonnesPerDay = corridor.capacityTonnesPerDay * corridor.utilisationPct;
    const spareCapacityTonnes = corridor.capacityTonnesPerDay - throughputTonnesPerDay;
    const transitDays = corridor.averageTransitHours / 24;
    const tonnesInTransit = throughputTonnesPerDay * transitDays;
    const energyPerTonne = corridor.energyPerTransitMwh / Math.max(throughputTonnesPerDay, 1);
    const carbonPerTonne =
      (corridor.carbonIntensityKgPerMwh * corridor.energyPerTransitMwh) / Math.max(throughputTonnesPerDay, 1);
    const utilisationOk = corridor.utilisationPct <= logisticsUtilisationCeiling;
    const reliabilityOk = corridor.reliabilityPct >= logisticsReliabilityThreshold;
    const bufferOk = corridor.bufferDays >= logisticsBufferThresholdDays;
    const watchersOk = corridor.watchers.length >= logisticsWatcherThreshold;
    return {
      ...corridor,
      throughputTonnesPerDay,
      spareCapacityTonnes,
      transitDays,
      tonnesInTransit,
      energyPerTonne,
      carbonPerTonne,
      utilisationOk,
      reliabilityOk,
      bufferOk,
      watchersOk,
    };
  });

  const logisticsWarnings: string[] = [];
  logisticsCorridorsRaw.forEach((corridor) => {
    if (!corridor.reliabilityOk) {
      logisticsWarnings.push(
        `Reliability on ${corridor.name} ${corridor.reliabilityPct.toFixed(3)} below ${(logisticsReliabilityThreshold * 100).toFixed(
          1
        )}% threshold.`
      );
    }
    if (!corridor.bufferOk) {
      logisticsWarnings.push(
        `Buffer on ${corridor.name} ${corridor.bufferDays.toFixed(1)} days below ${logisticsBufferThresholdDays} day floor.`
      );
    }
    if (!corridor.utilisationOk) {
      logisticsWarnings.push(
        `Utilisation on ${corridor.name} ${(corridor.utilisationPct * 100).toFixed(1)}% above ${(logisticsUtilisationCeiling *
          100
        ).toFixed(1)}% ceiling.`
      );
    }
    if (!corridor.watchersOk) {
      logisticsWarnings.push(`Watcher quorum on ${corridor.name} below ${logisticsWatcherThreshold}.`);
    }
  });

  const logisticsWatcherSet = new Set<string>();
  logisticsCorridorsRaw.forEach((corridor) => {
    corridor.watchers.forEach((watcher) => logisticsWatcherSet.add(watcher));
  });

  const logisticsAggregateCapacity = logisticsCorridorsRaw.reduce(
    (sum, corridor) => sum + corridor.capacityTonnesPerDay,
    0
  );
  const logisticsAggregateThroughput = logisticsCorridorsRaw.reduce(
    (sum, corridor) => sum + corridor.throughputTonnesPerDay,
    0
  );
  const logisticsAverageReliability =
    logisticsCorridorsRaw.length === 0
      ? 0
      : logisticsCorridorsRaw.reduce((sum, corridor) => sum + corridor.reliabilityPct, 0) /
        logisticsCorridorsRaw.length;
  const logisticsAverageUtilisation =
    logisticsCorridorsRaw.length === 0
      ? 0
      : logisticsCorridorsRaw.reduce((sum, corridor) => sum + corridor.utilisationPct, 0) /
        logisticsCorridorsRaw.length;
  const logisticsMinBuffer =
    logisticsCorridorsRaw.length === 0
      ? 0
      : logisticsCorridorsRaw.reduce((min, corridor) => Math.min(min, corridor.bufferDays), Infinity);
  const logisticsTotalEnergyMwh = logisticsCorridorsRaw.reduce(
    (sum, corridor) => sum + corridor.energyPerTransitMwh,
    0
  );
  const logisticsUtilisationWeights = logisticsCorridorsRaw.map((corridor) =>
    Math.max(0, corridor.utilisationPct)
  );
  const logisticsUtilisationTotal = logisticsUtilisationWeights.reduce((sum, value) => sum + value, 0);
  const logisticsEntropy = logisticsUtilisationTotal
    ? -logisticsUtilisationWeights.reduce((sum, value) => {
        const probability = value / logisticsUtilisationTotal;
        return probability > 0 ? sum + probability * Math.log(probability) : sum;
      }, 0)
    : 0;
  const logisticsEntropyMax = logisticsUtilisationWeights.length > 1 ? Math.log(logisticsUtilisationWeights.length) : 1;
  const logisticsEntropyRatio = logisticsEntropyMax > 0 ? logisticsEntropy / logisticsEntropyMax : 1;
  const logisticsPayoffs = logisticsCorridorsRaw.map((corridor) => {
    const utilisationPenalty = Math.max(0, corridor.utilisationPct - logisticsUtilisationCeiling);
    const bufferPenalty = Math.max(0, logisticsBufferThresholdDays - corridor.bufferDays) / logisticsBufferThresholdDays;
    const payoff = corridor.reliabilityPct * (1 - utilisationPenalty) * (1 - bufferPenalty);
    return Math.max(0.001, payoff);
  });
  const logisticsPayoffLog = logisticsPayoffs.reduce((sum, payoff) => sum + Math.log(payoff), 0);
  const logisticsNashWelfare =
    logisticsPayoffs.length > 0 ? Math.exp(logisticsPayoffLog / logisticsPayoffs.length) : 0;
  const logisticsAveragePayoff =
    logisticsPayoffs.length > 0
      ? logisticsPayoffs.reduce((sum, payoff) => sum + payoff, 0) / logisticsPayoffs.length
      : 0;
  const logisticsMaxPayoff = logisticsPayoffs.length > 0 ? Math.max(...logisticsPayoffs) : 0;
  const logisticsDeviationIncentive =
    logisticsMaxPayoff > 0 ? clamp01((logisticsMaxPayoff - logisticsAveragePayoff) / logisticsMaxPayoff) : 0;
  const logisticsGameTheorySlack = clamp01(1 - logisticsDeviationIncentive);
  const logisticsHamiltonian = logisticsCorridorsRaw.reduce((sum, corridor) => {
    const utilisationPenalty = Math.max(0, corridor.utilisationPct - logisticsUtilisationCeiling);
    const bufferPenalty = Math.max(0, logisticsBufferThresholdDays - corridor.bufferDays) / logisticsBufferThresholdDays;
    const reliabilityPenalty = 1 - corridor.reliabilityPct;
    return sum + utilisationPenalty + bufferPenalty + reliabilityPenalty;
  }, 0);
  const logisticsHamiltonianStability =
    logisticsCorridorsRaw.length > 0
      ? clamp01(1 - logisticsHamiltonian / logisticsCorridorsRaw.length)
      : 1;
  const logisticsGibbsFreeEnergyMwh =
    logisticsTotalEnergyMwh * (1 - clamp01(logisticsEntropyRatio)) * (1 - clamp01(logisticsAverageReliability));

  const logisticsCorridors = logisticsCorridorsRaw.map((corridor) => ({
    id: corridor.id,
    name: corridor.name,
    fromFederation: corridor.fromFederation,
    toFederation: corridor.toFederation,
    transportMode: corridor.transportMode,
    capacityTonnesPerDay: round(corridor.capacityTonnesPerDay, 2),
    utilisationPct: round(corridor.utilisationPct, 4),
    averageTransitHours: round(corridor.averageTransitHours, 2),
    jitterHours: round(corridor.jitterHours, 2),
    reliabilityPct: round(corridor.reliabilityPct, 4),
    bufferDays: round(corridor.bufferDays, 2),
    throughputTonnesPerDay: round(corridor.throughputTonnesPerDay, 2),
    spareCapacityTonnes: round(corridor.spareCapacityTonnes, 2),
    tonnesInTransit: round(corridor.tonnesInTransit, 2),
    energyPerTransitMwh: round(corridor.energyPerTransitMwh, 2),
    energyPerTonne: round(corridor.energyPerTonne, 4),
    carbonPerTonne: round(corridor.carbonPerTonne, 4),
    watchers: corridor.watchers,
    multiSigSafe: corridor.multiSigSafe,
    escrowAddress: corridor.escrowAddress,
    autonomyLevelBps: corridor.autonomyLevelBps,
    dedicatedValidators: corridor.dedicatedValidators,
    failoverCorridor: corridor.failoverCorridor,
    lastAuditISO8601: corridor.lastAuditISO8601,
    utilisationOk: corridor.utilisationOk,
    reliabilityOk: corridor.reliabilityOk,
    bufferOk: corridor.bufferOk,
    watchersOk: corridor.watchersOk,
  }));

  const logisticsVerification = {
    reliabilityOk: logisticsCorridorsRaw.every((corridor) => corridor.reliabilityOk),
    bufferOk: logisticsCorridorsRaw.every((corridor) => corridor.bufferOk),
    utilisationOk: logisticsCorridorsRaw.every((corridor) => corridor.utilisationOk),
    watchersOk: logisticsCorridorsRaw.every((corridor) => corridor.watchersOk),
    autonomyOk: logisticsCorridorsRaw.every(
      (corridor) => corridor.autonomyLevelBps <= manifest.dysonProgram.safety.maxAutonomyBps
    ),
    equilibriumOk: logisticsHamiltonianStability >= 0.75 && logisticsGameTheorySlack >= 0.75,
  };

  const scheduleCoverageOk = rawScheduleCoverage.every(
    (entry) => entry.coverageRatio >= scheduleCoverageThreshold
  );
  const scheduleReliabilityOk = rawScheduleCoverage.every(
    (entry) => entry.reliabilityPct >= scheduleReliabilityThreshold
  );

  const settlementCoverageThreshold = 0.95;
  const settlementSlippageThresholdBps = 75;

  const rawSettlementProtocols = manifest.settlementProtocols.map((protocol) => {
    const watchers = protocol.watchers.map((watcher) => watcher.toLowerCase());
    const bridge = manifest.interplanetaryBridges[protocol.bridge];
    return {
      name: protocol.name,
      chainId: protocol.chainId,
      bridge: protocol.bridge,
      settlementAsset: protocol.settlementAsset,
      finalityMinutes: protocol.finalityMinutes,
      toleranceMinutes: protocol.toleranceMinutes,
      coveragePct: protocol.coveragePct,
      slippageBps: protocol.slippageBps,
      riskLevel: protocol.riskLevel,
      watchers,
      watchersCount: watchers.length,
      withinTolerance: protocol.finalityMinutes <= protocol.toleranceMinutes,
      bridgeLatencySeconds: bridge?.latencySeconds ?? null,
      bridgeBandwidthGbps: bridge?.bandwidthGbps ?? null,
    };
  });

  const settlementProtocolsTelemetry = rawSettlementProtocols.map((protocol) => ({
    ...protocol,
    finalityMinutes: round(protocol.finalityMinutes, 2),
    toleranceMinutes: round(protocol.toleranceMinutes, 2),
    coveragePct: round(protocol.coveragePct, 4),
    slippageBps: round(protocol.slippageBps, 2),
  }));

  const settlementWatchers = new Set<string>();
  rawSettlementProtocols.forEach((protocol) => {
    protocol.watchers.forEach((watcher) => settlementWatchers.add(watcher));
  });

  const settlementAllWithinTolerance = rawSettlementProtocols.every((protocol) => protocol.withinTolerance);
  const settlementCoverageOk = rawSettlementProtocols.every(
    (protocol) => protocol.coveragePct >= settlementCoverageThreshold
  );
  const settlementSlippageOk = rawSettlementProtocols.every(
    (protocol) => protocol.slippageBps <= settlementSlippageThresholdBps
  );
  const settlementRiskOk = rawSettlementProtocols.every((protocol) => protocol.riskLevel !== "high");
  const averageFinalityMinutes =
    rawSettlementProtocols.length === 0
      ? 0
      : rawSettlementProtocols.reduce((sum, protocol) => sum + protocol.finalityMinutes, 0) /
        rawSettlementProtocols.length;
  const minSettlementCoveragePct =
    rawSettlementProtocols.length === 0
      ? 1
      : rawSettlementProtocols.reduce((min, protocol) => Math.min(min, protocol.coveragePct), 1);
  const maxToleranceMinutes =
    rawSettlementProtocols.length === 0
      ? 0
      : rawSettlementProtocols.reduce(
          (max, protocol) => Math.max(max, protocol.toleranceMinutes),
          0
        );

  const feedsWithinTolerance = feedComparisons.every((feed) => feed.withinTolerance);
  const driftAlerts = feedComparisons.filter((feed) => feed.driftAlert);
  const averageFeedLatencyMs =
    feedComparisons.length === 0
      ? 0
      : feedComparisons.reduce((sum, feed) => sum + feed.latencyMs, 0) / feedComparisons.length;
  const maxFeedLatencyMs = feedComparisons.reduce((max, feed) => Math.max(max, feed.latencyMs), 0);

  const thermostatBudgetGw =
    manifest.energyProtocols.stellarLattice.baselineCapturedGw * manifest.energyProtocols.thermostat.targetKelvin;
  const energyAgreementWithinMargin =
    sumRegionalGw <= dysonYield && sumRegionalGw <= thermostatBudgetGw * (1 + marginPct) && dysonYield >= capturedGw;

  const manifestoHash = keccak256(toUtf8Bytes(manifest.interstellarCouncil.manifestoURI));
  const planHash = keccak256(toUtf8Bytes(manifest.selfImprovement.planURI));

  const coverageOk = domainCoverages.every(
    (coverage) => coverage >= manifest.interstellarCouncil.guardianReviewWindow
  );
  const bridgeTelemetry: Record<string, any> = {};
  for (const [bridgeName, data] of Object.entries(manifest.interplanetaryBridges)) {
    bridgeTelemetry[bridgeName] = {
      latencySeconds: data.latencySeconds,
      bandwidthGbps: data.bandwidthGbps,
      bridgeOperator: data.bridgeOperator,
      protocol: data.protocol,
      withinFailsafe: data.latencySeconds <= manifest.dysonProgram.safety.failsafeLatencySeconds,
    };
  }

  const totalExaflops = manifest.federations.reduce((sum, f) => sum + f.compute.exaflops, 0);
  const dysonComputeEstimate = dysonYield / 10_000;
  const computeDeviationPct =
    dysonComputeEstimate === 0
      ? 0
      : Math.abs(totalExaflops - dysonComputeEstimate) / Math.max(dysonComputeEstimate, 1) * 100;
  const computeWithinTolerance = computeDeviationPct <= manifest.verificationProtocols.computeTolerancePct;

  const identityGlobal = manifest.identityProtocols.global;
  const identityFederations = manifest.identityProtocols.federations.map((federation) => ({
    slug: federation.slug,
    name: federation.name,
    authority: federation.authority,
    didRegistry: federation.didRegistry,
    fallbackEnsRegistrar: federation.fallbackEnsRegistrar,
    anchors: federation.anchors,
    attestationMethods: federation.attestationMethods,
    attestationLatencySeconds: federation.attestationLatencySeconds,
    credentialIssuances24h: federation.credentialIssuances24h,
    credentialRevocations24h: federation.credentialRevocations24h,
    totalAgents: federation.totalAgents,
    totalValidators: federation.totalValidators,
    coveragePct: federation.coveragePct,
    lastAnchorRotationISO8601: federation.lastAnchorRotationISO8601,
  }));

  const identityTotals = identityFederations.reduce(
    (acc, federation) => {
      acc.anchorsMeetingQuorum += federation.anchors.length >= identityGlobal.attestationQuorum ? 1 : 0;
      acc.totalAnchors += federation.anchors.length;
      acc.totalAgents += federation.totalAgents;
      acc.totalValidators += federation.totalValidators;
      acc.revocations24h += federation.credentialRevocations24h;
      acc.issuances24h += federation.credentialIssuances24h;
      acc.totalLatencySeconds += federation.attestationLatencySeconds;
      acc.maxLatency = Math.max(acc.maxLatency, federation.attestationLatencySeconds);
      acc.minCoveragePct = Math.min(acc.minCoveragePct, federation.coveragePct);
      return acc;
    },
    {
      anchorsMeetingQuorum: 0,
      totalAnchors: 0,
      totalAgents: 0,
      totalValidators: 0,
      revocations24h: 0,
      issuances24h: 0,
      totalLatencySeconds: 0,
      maxLatency: 0,
      minCoveragePct: Number.POSITIVE_INFINITY,
    }
  );

  const averageAttestationLatencySeconds =
    identityFederations.length === 0 ? 0 : identityTotals.totalLatencySeconds / identityFederations.length;
  const latencyWithinWindow = identityTotals.maxLatency <= identityGlobal.revocationWindowSeconds;
  const minIdentityCoveragePct =
    identityFederations.length === 0 || identityTotals.minCoveragePct === Number.POSITIVE_INFINITY
      ? 1
      : identityTotals.minCoveragePct;
  const identityCoverageOk = minIdentityCoveragePct >= identityGlobal.coverageFloorPct;
  const identityTotalAgentsFromCompute = manifest.federations.reduce((sum, f) => sum + f.compute.agents, 0);
  const identityDeviation = Math.abs(identityTotals.totalAgents - identityTotalAgentsFromCompute);
  const revocationRatePpm =
    identityTotals.totalAgents === 0
      ? 0
      : (identityTotals.revocations24h / Math.max(identityTotals.totalAgents, 1)) * 1_000_000;
  const revocationWithinTolerance = revocationRatePpm <= identityGlobal.revocationTolerancePpm;

  const sentientWelfare = buildSentientWelfare({
    totalAgents: identityTotals.totalAgents,
    federationCount: identityFederations.length,
    allocationPolicy,
    energyMonteCarlo,
  });

  const computePlanes = manifest.computeFabrics.orchestrationPlanes.map((plane) => ({
    slug: plane.slug,
    name: plane.name,
    scheduler: plane.scheduler,
    orchestratorSafe: plane.orchestratorSafe,
    geography: plane.geography,
    capacityExaflops: plane.capacityExaflops,
    energyGw: plane.energyGw,
    latencyMs: plane.latencyMs,
    availabilityPct: plane.availabilityPct,
    failoverPartner: plane.failoverPartner,
    notes: plane.notes,
  }));

  const totalPlaneCapacity = computePlanes.reduce((sum, plane) => sum + plane.capacityExaflops, 0);
  const highestPlaneCapacity = computePlanes.reduce((max, plane) => Math.max(max, plane.capacityExaflops), 0);
  const failoverCapacityExaflops = totalPlaneCapacity - highestPlaneCapacity;
  const averagePlaneAvailability =
    computePlanes.length === 0
      ? 0
      : computePlanes.reduce((sum, plane) => sum + plane.availabilityPct, 0) / computePlanes.length;
  const requiredFailoverCapacity = totalPlaneCapacity * manifest.computeFabrics.failoverPolicies.quorumPct;
  const failoverWithinQuorum = failoverCapacityExaflops >= requiredFailoverCapacity;

  const federationsDetail = manifest.federations.map((federation) => ({
    slug: federation.slug,
    name: federation.name,
    chainId: federation.chainId,
    governanceSafe: federation.governanceSafe,
    energy: federation.energy,
    compute: federation.compute,
    domains: federation.domains.map((domain) => ({
      slug: domain.slug,
      name: domain.name,
      resilience: domain.resilience,
      monthlyValueUSD: domain.monthlyValueUSD,
      autonomyLevelBps: domain.autonomyLevelBps,
      coverageSeconds: domain.coverageSeconds,
      orchestrator: domain.orchestrator,
    })),
    sentinels: federation.sentinels.map((sentinel) => ({
      slug: sentinel.slug,
      name: sentinel.name,
      coverageSeconds: sentinel.coverageSeconds,
      sensitivityBps: sentinel.sensitivityBps,
      active: sentinel.active,
    })),
    capitalStreams: federation.capitalStreams.map((stream) => ({
      slug: stream.slug,
      name: stream.name,
      annualBudget: stream.annualBudget,
      expansionBps: stream.expansionBps,
      active: stream.active,
    })),
  }));

  const latencyTolerance = manifest.verificationProtocols.bridgeLatencyToleranceSeconds;
  const bridgeCompliance = Object.entries(bridgeTelemetry).map(([name, data]) => ({
    name,
    latencySeconds: data.latencySeconds,
    withinTolerance: data.latencySeconds <= latencyTolerance,
  }));

  const fabricShards = fabric.shards.map((shard) => {
    const federation = manifest.federations.find((f) => f.slug === shard.id);
    const manifestDomains = federation ? federation.domains.map((domain) => domain.slug) : [];
    const matchesDomain = (domain: string) =>
      manifestDomains.some((slug) => slug === domain || slug.endsWith(`.${domain}`));
    const missingDomains = shard.domains.filter((domain) => !matchesDomain(domain));
    const orphanDomains = federation
      ? manifestDomains.filter(
          (slug) => !shard.domains.some((domain) => slug === domain || slug.endsWith(`.${domain}`))
        )
      : manifestDomains;
    const manifestSentinels = new Set((federation?.sentinels ?? []).map((sentinel) => sentinel.agent.toLowerCase()));
    const sentinelMatches = shard.sentinels.map((address) => ({
      address,
      registered: manifestSentinels.has(address.toLowerCase()),
    }));
    const sentinelMissing = sentinelMatches.filter((entry) => !entry.registered);
    return {
      id: shard.id,
      jobRegistry: shard.jobRegistry,
      latencyMs: shard.latencyMs,
      domains: shard.domains,
      missingDomains,
      orphanDomains,
      guardianCouncil: shard.guardianCouncil,
      sentinelMatches,
      sentinelsOk: sentinelMissing.length === 0,
      federationFound: Boolean(federation),
      governanceSafe: federation?.governanceSafe ?? null,
      domainCoverageOk: missingDomains.length === 0 && orphanDomains.length === 0,
    };
  });

  const unmatchedFederations = manifest.federations
    .filter((federation) => !fabric.shards.some((shard) => shard.id === federation.slug))
    .map((federation) => federation.slug);
  const fabricCoverage = {
    domainsOk: fabricShards.every((shard) => shard.domainCoverageOk),
    sentinelsOk: fabricShards.every((shard) => shard.sentinelsOk),
    federationsOk: unmatchedFederations.length === 0,
    unmatchedFederations,
    unmatchedShards: fabric.shards
      .filter((shard) => !manifest.federations.some((federation) => federation.slug === shard.id))
      .map((shard) => shard.id),
    averageLatencyMs:
      fabric.shards.length === 0
        ? 0
        : fabric.shards.reduce((sum, shard) => sum + shard.latencyMs, 0) / fabric.shards.length,
    maxLatencyMs: fabric.shards.reduce((max, shard) => Math.max(max, shard.latencyMs), 0),
  };

  return {
    manifest: {
      version: manifest.version,
      generatedAt: manifest.generatedAt,
      hash: manifestHash,
      manifestoHash,
      manifestoHashMatches: manifestoHash === manifest.interstellarCouncil.manifestoHash,
      planHash,
      planHashMatches: planHash === manifest.selfImprovement.planHash,
      knowledgeGraphAddress: manifest.interstellarCouncil.knowledgeGraph,
      knowledgeGraphURI: manifest.interstellarCouncil.knowledgeGraphURI ?? null,
    },
    governance: {
      ownerOverridesReady:
        ownerProof.verification.selectorsComplete &&
        ownerProof.verification.pauseEmbedding &&
        ownerProof.verification.singleOwnerTargets,
      guardianReviewWindow: manifest.interstellarCouncil.guardianReviewWindow,
      averageCoverageSeconds: averageCoverage,
      minimumCoverageSeconds: minimumCoverage,
      coverageOk,
      ownerProof: {
        unstoppableScore: ownerProof.verification.unstoppableScore,
        selectorsComplete: ownerProof.verification.selectorsComplete,
        pauseEmbedding: ownerProof.verification.pauseEmbedding,
        singleOwnerTargets: ownerProof.verification.singleOwnerTargets,
        transactionSetHash: ownerProof.hashes.transactionSet,
        selectorSetHash: ownerProof.hashes.selectorSet,
        secondary: ownerProof.secondaryVerification,
        tertiary: ownerProof.tertiaryVerification,
      },
    },
    energy: {
      capturedGw,
      dysonYield,
      utilisationPct,
      marginPct,
      warnings: energyWarnings,
      regional: regionalEnergy,
      tripleCheck: sumRegionalGw <= capturedGw * 1.001 && dysonYield >= capturedGw,
      models: {
        regionalSumGw: sumRegionalGw,
        dysonProjectionGw: dysonYield,
        thermostatBudgetGw,
        withinMargin: energyAgreementWithinMargin,
      },
      monteCarlo: energyMonteCarlo,
      allocationPolicy,
      liveFeeds: {
        calibrationISO8601: energyFeeds.calibrationISO8601,
        tolerancePct: energyFeeds.tolerancePct,
        driftAlertPct: energyFeeds.driftAlertPct ?? null,
        feeds: feedComparisons,
        allWithinTolerance: feedsWithinTolerance,
        driftAlerts,
        averageLatencyMs: averageFeedLatencyMs,
        maxLatencyMs: maxFeedLatencyMs,
      },
      schedule: {
        globalCoverageRatio: round(globalCoverageRatio, 4),
        globalReliabilityPct: round(globalReliabilityPct, 4),
        coverageThreshold: scheduleCoverageThreshold,
        reliabilityThreshold: scheduleReliabilityThreshold,
        windows: energyScheduleWindows,
        coverage: energyScheduleCoverage,
        deficits: energyScheduleDeficits,
        reliabilityDeficits: energyScheduleReliabilityDeficits,
      },
      crossVerification: energyCrossVerification,
    },
    logistics: {
      corridors: logisticsCorridors,
      aggregate: {
        capacityTonnesPerDay: round(logisticsAggregateCapacity, 2),
        throughputTonnesPerDay: round(logisticsAggregateThroughput, 2),
        averageReliabilityPct: round(logisticsAverageReliability, 4),
        averageUtilisationPct: round(logisticsAverageUtilisation, 4),
        minimumBufferDays: Number.isFinite(logisticsMinBuffer) ? round(logisticsMinBuffer, 2) : 0,
        watchers: Array.from(logisticsWatcherSet),
        totalEnergyMwh: round(logisticsTotalEnergyMwh, 2),
      },
      equilibrium: {
        hamiltonian: round(logisticsHamiltonian, 4),
        hamiltonianStability: round(logisticsHamiltonianStability, 4),
        entropy: round(logisticsEntropy, 4),
        entropyRatio: round(logisticsEntropyRatio, 4),
        nashWelfare: round(logisticsNashWelfare, 4),
        gameTheorySlack: round(logisticsGameTheorySlack, 4),
        gibbsFreeEnergyMwh: round(logisticsGibbsFreeEnergyMwh, 2),
      },
      warnings: logisticsWarnings,
      verification: logisticsVerification,
    },
    compute: {
      totalAgents: manifest.federations.reduce((sum, f) => sum + f.compute.agents, 0),
      totalExaflops,
      regional: manifest.federations.map((f) => ({
        slug: f.slug,
        agents: f.compute.agents,
        exaflops: f.compute.exaflops,
        resilience: f.domains.reduce((acc, domain) => acc + domain.resilience, 0) / f.domains.length,
      })),
      crossChecks: {
        sumAgainstCouncil: Math.abs(
          manifest.federations.reduce((sum, f) => sum + f.compute.exaflops, 0) -
            manifest.dysonProgram.phases.reduce((sum, p) => sum + p.energyYieldGw / 10_000, 0)
        ),
      },
    },
    identity: {
      global: identityGlobal,
      totals: {
        totalAnchors: identityTotals.totalAnchors,
        totalAgents: identityTotals.totalAgents,
        totalValidators: identityTotals.totalValidators,
        revocations24h: identityTotals.revocations24h,
        issuances24h: identityTotals.issuances24h,
        anchorsMeetingQuorum: identityTotals.anchorsMeetingQuorum,
        federationCount: identityFederations.length,
        averageAttestationLatencySeconds,
        maxAttestationLatencySeconds: identityTotals.maxLatency,
        minCoveragePct: minIdentityCoveragePct,
        revocationRatePpm,
        deviationAgainstCompute: identityDeviation,
      },
      withinQuorum: identityTotals.anchorsMeetingQuorum === identityFederations.length,
      latencyWithinWindow,
      coverageOk: identityCoverageOk,
      revocationWithinTolerance,
      federations: identityFederations,
    },
    sentientWelfare,
    computeFabric: {
      totalCapacityExaflops: totalPlaneCapacity,
      failoverCapacityExaflops,
      requiredFailoverCapacity,
      averageAvailabilityPct: averagePlaneAvailability,
      failoverWithinQuorum,
      planes: computePlanes,
      policies: manifest.computeFabrics.failoverPolicies,
    },
    orchestrationFabric: {
      knowledgeGraph: fabric.knowledgeGraph,
      energyOracle: fabric.energyOracle,
      rewardEngine: fabric.rewardEngine,
      phase8Manager: fabric.phase8Manager,
      shards: fabricShards,
      coverage: fabricCoverage,
    },
    dominance: {
      monthlyValueUSD: totalMonthlyValue,
      averageResilience,
      averageCoverage,
      score: dominanceScore,
    },
    bridges: bridgeTelemetry,
    settlement: {
      protocols: settlementProtocolsTelemetry,
      watchers: Array.from(settlementWatchers),
      watchersOnline: settlementWatchers.size,
      averageFinalityMinutes: round(averageFinalityMinutes, 2),
      minCoveragePct: round(minSettlementCoveragePct, 4),
      maxToleranceMinutes: round(maxToleranceMinutes, 2),
      coverageThreshold: settlementCoverageThreshold,
      slippageThresholdBps: settlementSlippageThresholdBps,
      allWithinTolerance: settlementAllWithinTolerance,
      coverageOk: settlementCoverageOk,
      slippageOk: settlementSlippageOk,
      riskOk: settlementRiskOk,
    },
    federations: federationsDetail,
    ownerControls: {
      pauseCallEncoded: ownerProof.pauseEmbedding.pauseAll,
      resumeCallEncoded: ownerProof.pauseEmbedding.unpauseAll,
      unstoppableScore: ownerProof.verification.unstoppableScore,
      selectorsComplete: ownerProof.verification.selectorsComplete,
      transactionsEncoded: ownerProof.calls.length,
      secondary: ownerProof.secondaryVerification,
      tertiary: ownerProof.tertiaryVerification,
    },
    missionLattice: mission,
    missionDirectives: manifest.missionDirectives,
    verification: {
      energyModels: {
        expected: manifest.verificationProtocols.energyModels,
        results: {
          regionalSumGw: sumRegionalGw,
          dysonProjectionGw: dysonYield,
          thermostatBudgetGw,
        },
        withinMargin: energyAgreementWithinMargin,
      },
      energyMonteCarlo: {
        runs: energyMonteCarlo.runs,
        breachProbability: energyMonteCarlo.breachProbability,
        tolerance: energyMonteCarlo.tolerance,
        withinTolerance: energyMonteCarlo.withinTolerance,
        percentileGw: energyMonteCarlo.percentileGw,
      },
      energyFeeds: {
        tolerancePct: energyFeeds.tolerancePct,
        driftAlertPct: energyFeeds.driftAlertPct ?? null,
        calibrationISO8601: energyFeeds.calibrationISO8601,
        feeds: feedComparisons,
        allWithinTolerance: feedsWithinTolerance,
        driftAlerts: driftAlerts.map((feed) => feed.region),
      },
      energySchedule: {
        thresholdCoverage: scheduleCoverageThreshold,
        thresholdReliability: scheduleReliabilityThreshold,
        coverageOk: scheduleCoverageOk,
        reliabilityOk: scheduleReliabilityOk,
        globalCoverageRatio: round(globalCoverageRatio, 4),
        globalReliabilityPct: round(globalReliabilityPct, 4),
        deficits: energyScheduleDeficits,
        reliabilityDeficits: energyScheduleReliabilityDeficits,
      },
      logistics: {
        reliabilityOk: logisticsVerification.reliabilityOk,
        bufferOk: logisticsVerification.bufferOk,
        utilisationOk: logisticsVerification.utilisationOk,
        watchersOk: logisticsVerification.watchersOk,
        autonomyOk: logisticsVerification.autonomyOk,
        equilibriumOk: logisticsVerification.equilibriumOk,
        minimumBufferDays: Number.isFinite(logisticsMinBuffer) ? round(logisticsMinBuffer, 2) : 0,
        averageReliabilityPct: round(logisticsAverageReliability, 4),
        averageUtilisationPct: round(logisticsAverageUtilisation, 4),
        hamiltonianStability: round(logisticsHamiltonianStability, 4),
        gameTheorySlack: round(logisticsGameTheorySlack, 4),
      },
      compute: {
        tolerancePct: manifest.verificationProtocols.computeTolerancePct,
        deviationPct: computeDeviationPct,
        dysonProjectionExaflops: dysonComputeEstimate,
        withinTolerance: computeWithinTolerance,
      },
      bridges: {
        toleranceSeconds: manifest.verificationProtocols.bridgeLatencyToleranceSeconds,
        compliance: bridgeCompliance,
        allWithinTolerance: bridgeCompliance.every((bridge) => bridge.withinTolerance),
      },
      settlement: {
        averageFinalityMinutes: round(averageFinalityMinutes, 2),
        minCoveragePct: round(minSettlementCoveragePct, 4),
        maxToleranceMinutes: round(maxToleranceMinutes, 2),
        coverageThreshold: settlementCoverageThreshold,
        slippageThresholdBps: settlementSlippageThresholdBps,
        allWithinTolerance: settlementAllWithinTolerance,
        coverageOk: settlementCoverageOk,
        slippageOk: settlementSlippageOk,
        riskOk: settlementRiskOk,
      },
      identity: {
        anchorsMeetingQuorum: identityTotals.anchorsMeetingQuorum,
        federationCount: identityFederations.length,
        withinQuorum: identityTotals.anchorsMeetingQuorum === identityFederations.length,
        latencyWithinWindow,
        revocationWithinTolerance,
        revocationRatePpm,
        tolerancePpm: identityGlobal.revocationTolerancePpm,
      },
      computeFabric: {
        failoverWithinQuorum,
        quorumPct: manifest.computeFabrics.failoverPolicies.quorumPct,
        failoverCapacityExaflops,
        requiredFailoverCapacity,
        averageAvailabilityPct: averagePlaneAvailability,
      },
      orchestrationFabric: {
        domainsOk: fabricCoverage.domainsOk,
        sentinelsOk: fabricCoverage.sentinelsOk,
        federationsOk: fabricCoverage.federationsOk,
        unmatchedFederations: fabricCoverage.unmatchedFederations,
        unmatchedShards: fabricCoverage.unmatchedShards,
      },
      missionLattice: mission.verification,
      auditChecklistURI: manifest.verificationProtocols.auditChecklistURI,
    },
  };
}

type Telemetry = ReturnType<typeof computeTelemetry> & { scenarioSweep?: ScenarioResult[] };

function buildStabilityLedger(
  manifest: Manifest,
  telemetry: Telemetry,
  dominanceScore: number,
  transactions: SafeTransaction[],
  scenarios: ScenarioResult[],
  ownerProof: OwnerControlProof
) {
  const safetyMargin = manifest.energyProtocols.stellarLattice.safetyMarginPct / 100;
  const permittedUtilisation = 1 - safetyMargin;
  const utilisation = telemetry.energy.utilisationPct;
  const overshoot = Math.max(0, utilisation - permittedUtilisation);
  const energyBufferScore =
    safetyMargin === 0 ? (overshoot === 0 ? 1 : 0) : Math.max(0, Math.min(1, 1 - overshoot / safetyMargin));

  const scenarioTotal = scenarios.length;
  const scenarioNominal = scenarios.filter((scenario) => scenario.status === "nominal").length;
  const scenarioWarning = scenarios.filter((scenario) => scenario.status === "warning").length;
  const scenarioCritical = scenarios.filter((scenario) => scenario.status === "critical").length;
  const scenarioConfidence =
    scenarioTotal === 0
      ? 1
      : scenarios.reduce((sum, scenario) => sum + scenario.confidence, 0) / Math.max(scenarioTotal, 1);
  const scenarioHealthy = scenarioCritical === 0;

  const redundantFlags = [
    telemetry.energy.tripleCheck,
    telemetry.verification.energyModels.withinMargin,
    telemetry.energy.monteCarlo.withinTolerance,
    telemetry.energy.liveFeeds.allWithinTolerance,
    telemetry.verification.energySchedule.coverageOk,
    telemetry.verification.energySchedule.reliabilityOk,
    telemetry.verification.logistics.reliabilityOk,
    telemetry.verification.logistics.bufferOk,
    telemetry.verification.logistics.utilisationOk,
    telemetry.verification.logistics.watchersOk,
    telemetry.verification.logistics.autonomyOk,
    telemetry.energy.crossVerification.consensus,
    telemetry.verification.compute.withinTolerance,
    telemetry.verification.bridges.allWithinTolerance,
    telemetry.verification.settlement.allWithinTolerance,
    telemetry.verification.settlement.coverageOk,
    telemetry.verification.settlement.slippageOk,
    telemetry.verification.settlement.riskOk,
    telemetry.identity.withinQuorum,
    telemetry.identity.latencyWithinWindow,
    telemetry.identity.revocationWithinTolerance,
    telemetry.computeFabric.failoverWithinQuorum,
    telemetry.verification.orchestrationFabric.domainsOk,
    telemetry.verification.orchestrationFabric.sentinelsOk,
    telemetry.verification.orchestrationFabric.federationsOk,
    telemetry.governance.coverageOk,
    ownerProof.verification.selectorsComplete,
    ownerProof.verification.pauseEmbedding,
    ownerProof.verification.singleOwnerTargets,
    telemetry.missionLattice.verification.dependenciesResolved,
    telemetry.missionLattice.verification.sentinelCoverage,
    telemetry.missionLattice.verification.fallbackCoverage,
    telemetry.missionLattice.verification.ownerAlignment,
    telemetry.missionLattice.verification.autonomyWithinBounds,
    telemetry.missionLattice.verification.timelineAligned,
    telemetry.missionLattice.verification.unstoppableScore >= 0.95,
    scenarioHealthy,
  ];
  const redundancyScore =
    redundantFlags.reduce((sum, flag) => sum + (flag ? 1 : 0), 0) / Math.max(redundantFlags.length, 1);

  const coverageRatio =
    manifest.interstellarCouncil.guardianReviewWindow === 0
      ? 1
      : Math.min(
          1,
          telemetry.governance.minimumCoverageSeconds /
            Math.max(manifest.interstellarCouncil.guardianReviewWindow, 1)
        );

  const checks = [
    {
      id: "manifest-digest",
      title: "Manifest digests aligned",
      severity: "critical",
      status: telemetry.manifest.manifestoHashMatches,
      weight: 1.2,
      evidence: `expected ${manifest.interstellarCouncil.manifestoHash}, observed ${telemetry.manifest.manifestoHash}`,
    },
    {
      id: "self-improvement-digest",
      title: "Self-improvement charter verified",
      severity: "critical",
      status: telemetry.manifest.planHashMatches,
      weight: 1,
      evidence: `expected ${manifest.selfImprovement.planHash}, observed ${telemetry.manifest.planHash}`,
    },
    {
      id: "owner-control",
      title: "Owner override levers encoded",
      severity: "high",
      status: telemetry.governance.ownerOverridesReady,
      weight: 0.9,
      evidence: `${ownerProof.requiredFunctions.filter((fn) => fn.present).length}/${ownerProof.requiredFunctions.length} selectors · pause ${ownerProof.pauseEmbedding.pauseAll ? "yes" : "no"} · resume ${ownerProof.pauseEmbedding.unpauseAll ? "yes" : "no"} · unstoppable ${(ownerProof.verification.unstoppableScore * 100).toFixed(1)}%`,
    },
    {
      id: "owner-control-secondary",
      title: "Owner override cross-check aligned",
      severity: "medium",
      status: ownerProof.secondaryVerification.matchesPrimaryScore,
      weight: 0.7,
      evidence: `secondary ${(ownerProof.secondaryVerification.unstoppableScore * 100).toFixed(1)}% vs primary ${(ownerProof.verification.unstoppableScore * 100).toFixed(1)}%`,
    },
    {
      id: "owner-control-tertiary",
      title: "Owner override decode consensus",
      severity: "medium",
      status:
        ownerProof.tertiaryVerification.matchesPrimaryScore &&
        ownerProof.tertiaryVerification.matchesSecondaryScore &&
        ownerProof.tertiaryVerification.decodeFailures === 0,
      weight: 0.65,
      evidence: `tertiary ${(ownerProof.tertiaryVerification.unstoppableScore * 100).toFixed(1)}% · decode failures ${ownerProof.tertiaryVerification.decodeFailures}`,
    },
    {
      id: "mission-lattice",
      title: "Mission lattice unstoppable",
      severity: "high",
      status:
        telemetry.missionLattice.verification.dependenciesResolved &&
        telemetry.missionLattice.verification.sentinelCoverage &&
        telemetry.missionLattice.verification.unstoppableScore >= 0.95,
      weight: 0.85,
      evidence: `unstoppable ${(telemetry.missionLattice.verification.unstoppableScore * 100).toFixed(2)}% · warnings ${telemetry.missionLattice.verification.warnings.length}`,
    },
    {
      id: "guardian-coverage",
      title: "Guardian coverage >= review window",
      severity: "high",
      status: telemetry.governance.coverageOk,
      weight: 0.85,
      evidence: `minimum coverage ${telemetry.governance.minimumCoverageSeconds}s vs ${manifest.interstellarCouncil.guardianReviewWindow}s window`,
    },
    {
      id: "energy-triple-check",
      title: "Energy models reconciled",
      severity: "critical",
      status: telemetry.energy.tripleCheck && telemetry.verification.energyModels.withinMargin,
      weight: 1.1,
      evidence: `regional ${telemetry.energy.models.regionalSumGw.toLocaleString()} GW · Dyson ${telemetry.energy.models.dysonProjectionGw.toLocaleString()} GW · thermostat ${telemetry.energy.models.thermostatBudgetGw.toLocaleString()} GW`,
    },
    {
      id: "energy-cross-verification",
      title: "Energy cross-verification consensus",
      severity: "high",
      status: telemetry.energy.crossVerification.consensus,
      weight: 0.95,
      evidence: `max deviation ${telemetry.energy.crossVerification.maxDeviationGw.toFixed(6)} GW · tolerance ${telemetry.energy.crossVerification.toleranceGw.toFixed(6)} GW · coverage ${(telemetry.energy.crossVerification.coverageRatio * 100).toFixed(2)}%`,
    },
    {
      id: "energy-monte-carlo",
      title: "Monte Carlo breach ≤ tolerance",
      severity: "critical",
      status: telemetry.energy.monteCarlo.withinTolerance,
      weight: 1,
      evidence: `breach ${(telemetry.energy.monteCarlo.breachProbability * 100).toFixed(2)}% (runs ${telemetry.energy.monteCarlo.runs})`,
    },
    {
      id: "energy-feeds",
      title: "Live energy feeds within tolerance",
      severity: "high",
      status: telemetry.energy.liveFeeds.allWithinTolerance,
      weight: 0.85,
      evidence: telemetry.energy.liveFeeds.feeds
        .map((feed: any) => `${feed.region} ${feed.deltaPct.toFixed(2)}%`)
        .join(" · "),
    },
    {
      id: "energy-schedule-coverage",
      title: "Energy windows cover demand",
      severity: "medium",
      status: telemetry.verification.energySchedule.coverageOk,
      weight: 0.7,
      evidence: `global ${(telemetry.verification.energySchedule.globalCoverageRatio * 100).toFixed(2)}% (threshold ${
        telemetry.verification.energySchedule.thresholdCoverage * 100
      }%)`,
    },
    {
      id: "energy-schedule-reliability",
      title: "Energy window reliability",
      severity: "medium",
      status: telemetry.verification.energySchedule.reliabilityOk,
      weight: 0.6,
      evidence: `global ${(telemetry.verification.energySchedule.globalReliabilityPct * 100).toFixed(2)}% (threshold ${
        telemetry.verification.energySchedule.thresholdReliability * 100
      }%)`,
    },
    {
      id: "logistics-corridors",
      title: "Logistics corridors hold buffers",
      severity: "high",
      status:
        telemetry.verification.logistics.reliabilityOk &&
        telemetry.verification.logistics.bufferOk &&
        telemetry.verification.logistics.utilisationOk &&
        telemetry.verification.logistics.watchersOk &&
        telemetry.verification.logistics.autonomyOk &&
        telemetry.verification.logistics.equilibriumOk,
      weight: 0.8,
      evidence: `avg reliability ${(telemetry.verification.logistics.averageReliabilityPct * 100).toFixed(2)}% · min buffer ${telemetry.verification.logistics.minimumBufferDays.toFixed(
        2
      )}d · utilisation ${(telemetry.verification.logistics.averageUtilisationPct * 100).toFixed(2)}% · Hamiltonian ${(telemetry.verification.logistics.hamiltonianStability * 100).toFixed(
        1
      )}% · watchers ${telemetry.logistics.aggregate.watchers.length}`,
    },
    {
      id: "energy-margin",
      title: "Dyson thermostat buffer intact",
      severity: "medium",
      status: overshoot === 0,
      weight: 0.6,
      evidence: `utilisation ${(utilisation * 100).toFixed(2)}% vs permitted ${(permittedUtilisation * 100).toFixed(2)}%`,
    },
    {
      id: "compute-alignment",
      title: "Compute deviation within tolerance",
      severity: "medium",
      status: telemetry.verification.compute.withinTolerance,
      weight: 0.7,
      evidence: `deviation ${telemetry.verification.compute.deviationPct.toFixed(2)}% (≤ ${telemetry.verification.compute.tolerancePct}%)`,
    },
    {
      id: "identity-quorum",
      title: "Identity anchors meet quorum",
      severity: "critical",
      status: telemetry.identity.withinQuorum,
      weight: 0.95,
      evidence: `${telemetry.identity.totals.anchorsMeetingQuorum}/${telemetry.identity.totals.federationCount || 1} federations at quorum ${manifest.identityProtocols.global.attestationQuorum}`,
    },
    {
      id: "identity-latency",
      title: "Identity attestations within revocation window",
      severity: "high",
      status: telemetry.identity.latencyWithinWindow,
      weight: 0.8,
      evidence: `max ${telemetry.identity.totals.maxAttestationLatencySeconds.toFixed(0)}s vs window ${manifest.identityProtocols.global.revocationWindowSeconds}s`,
    },
    {
      id: "identity-revocation",
      title: "Identity revocation rate within tolerance",
      severity: "medium",
      status: telemetry.identity.revocationWithinTolerance,
      weight: 0.65,
      evidence: `${telemetry.identity.totals.revocationRatePpm.toFixed(2)} ppm (≤ ${manifest.identityProtocols.global.revocationTolerancePpm} ppm)`,
    },
    {
      id: "identity-reconciliation",
      title: "Identity ledger reconciles with compute agents",
      severity: "medium",
      status: telemetry.identity.totals.deviationAgainstCompute <= Math.max(1, telemetry.identity.totals.totalAgents * 0.0001),
      weight: 0.6,
      evidence: `delta ${telemetry.identity.totals.deviationAgainstCompute.toLocaleString()} agents`,
    },
    {
      id: "compute-fabric-failover",
      title: "Compute fabric failover meets quorum",
      severity: "critical",
      status: telemetry.computeFabric.failoverWithinQuorum,
      weight: 0.9,
      evidence: `failover ${telemetry.computeFabric.failoverCapacityExaflops.toFixed(2)} EF vs required ${telemetry.computeFabric.requiredFailoverCapacity.toFixed(2)} EF`,
    },
    {
      id: "orchestration-fabric",
      title: "Sharded registry fabric aligned",
      severity: "medium",
      status:
        telemetry.verification.orchestrationFabric.domainsOk &&
        telemetry.verification.orchestrationFabric.sentinelsOk &&
        telemetry.verification.orchestrationFabric.federationsOk,
      weight: 0.75,
      evidence: `unmatched federations: ${telemetry.verification.orchestrationFabric.unmatchedFederations.join(
        ", "
      ) || "0"} · unmatched shards: ${telemetry.verification.orchestrationFabric.unmatchedShards.join(
        ", "
      ) || "0"}`,
    },
    {
      id: "bridge-latency",
      title: "Bridge latency ≤ tolerance",
      severity: "high",
      status: telemetry.verification.bridges.allWithinTolerance,
      weight: 0.75,
      evidence: `tolerance ${telemetry.verification.bridges.toleranceSeconds}s · failsafe ${manifest.dysonProgram.safety.failsafeLatencySeconds}s`,
    },
    {
      id: "settlement-finality",
      title: "Settlement finality within tolerance",
      severity: "medium",
      status: telemetry.verification.settlement.allWithinTolerance,
      weight: 0.6,
      evidence: `avg ${telemetry.verification.settlement.averageFinalityMinutes.toFixed(2)} min ≤ ${telemetry.verification.settlement.maxToleranceMinutes.toFixed(2)} min`,
    },
    {
      id: "settlement-coverage",
      title: "Settlement coverage ≥ threshold",
      severity: "medium",
      status: telemetry.verification.settlement.coverageOk,
      weight: 0.55,
      evidence: `min ${(telemetry.verification.settlement.minCoveragePct * 100).toFixed(2)}% (threshold ${
        telemetry.verification.settlement.coverageThreshold * 100
      }%)`,
    },
    {
      id: "settlement-slippage",
      title: "Settlement slippage within tolerance",
      severity: "medium",
      status: telemetry.verification.settlement.slippageOk,
      weight: 0.5,
      evidence: `max ${telemetry.settlement.protocols
        .reduce((max: number, protocol: any) => Math.max(max, protocol.slippageBps), 0)
        .toFixed(2)} bps (threshold ${telemetry.verification.settlement.slippageThresholdBps} bps)`,
    },
    {
      id: "settlement-risk",
      title: "Settlement risk band acceptable",
      severity: "medium",
      status: telemetry.verification.settlement.riskOk,
      weight: 0.5,
      evidence: `risk levels: ${telemetry.settlement.protocols.map((protocol: any) => `${protocol.name}=${protocol.riskLevel}`).join(
        " · "
      )}`,
    },
    {
      id: "scenario-resilience",
      title: "Scenario sweep resilient",
      severity: scenarioCritical > 0 ? "critical" : scenarioWarning > 0 ? "medium" : "medium",
      status: scenarioHealthy && scenarioWarning <= Math.max(1, Math.ceil(scenarioTotal * 0.25)),
      weight: 0.8,
      evidence: `${scenarioNominal}/${scenarioTotal || 1} nominal · ${scenarioWarning} warning · ${scenarioCritical} critical`,
    },
  ];

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const compositeScore =
    totalWeight === 0
      ? 1
      : checks.reduce((sum, check) => sum + check.weight * (check.status ? 1 : 0), 0) / totalWeight;

  const pauseIncluded = transactions.some((tx) => tx.description === "Pause all modules");
  const resumeIncluded = transactions.some((tx) => tx.description === "Resume all modules");

  const alerts = checks
    .filter((check) => !check.status)
    .map((check) => ({ id: check.id, title: check.title, severity: check.severity, evidence: check.evidence }));

  return {
    generatedAt: manifest.generatedAt,
    manifestVersion: manifest.version,
    dominanceScore,
    confidence: {
      compositeScore,
      quorum: compositeScore >= 0.95,
      summary:
        alerts.length === 0
          ? "All Kardashev-II invariants satisfied. Safe batch ready for execution."
          : `Manual review required for ${alerts.length} check(s).`,
      methods: [
        {
          method: "deterministic-consensus",
          score: compositeScore,
          explanation: "Weighted boolean consensus across critical governance, energy, and compute checks.",
        },
        {
          method: "redundant-telemetry",
          score: redundancyScore,
          explanation: "Agreement ratio across energy triple-check, thermostat, compute, bridges, and guardian coverage.",
        },
        {
          method: "energy-safety-buffer",
          score: energyBufferScore,
          explanation: "Remaining Dyson thermostat buffer relative to configured safety margin.",
        },
        {
          method: "logistics-corridors",
          score:
            telemetry.verification.logistics.reliabilityOk &&
            telemetry.verification.logistics.bufferOk &&
            telemetry.verification.logistics.utilisationOk &&
            telemetry.verification.logistics.watchersOk &&
            telemetry.verification.logistics.autonomyOk
              ? 1
              : 0,
          explanation: `Corridor reliability ${(telemetry.verification.logistics.averageReliabilityPct * 100).toFixed(2)}% · min buffer ${telemetry.verification.logistics.minimumBufferDays.toFixed(
            2
          )}d · utilisation ${(telemetry.verification.logistics.averageUtilisationPct * 100).toFixed(2)}%.`,
        },
        {
          method: "monte-carlo",
          score: telemetry.energy.monteCarlo.withinTolerance ? 1 : Math.max(0, 1 - telemetry.energy.monteCarlo.breachProbability / telemetry.energy.monteCarlo.tolerance),
          explanation: `Energy breach probability ${(telemetry.energy.monteCarlo.breachProbability * 100).toFixed(2)}% across ${telemetry.energy.monteCarlo.runs} simulations (tolerance ${(telemetry.energy.monteCarlo.tolerance * 100).toFixed(2)}%).`,
        },
        {
          method: "mission-lattice",
          score: telemetry.missionLattice.verification.unstoppableScore,
          explanation: `Mission unstoppable ${(telemetry.missionLattice.verification.unstoppableScore * 100).toFixed(2)}% · dependencies ${telemetry.missionLattice.verification.dependenciesResolved ? "resolved" : "review"} · warnings ${telemetry.missionLattice.verification.warnings.length}.`,
        },
        {
          method: "scenario-sweep",
          score: scenarioConfidence,
          explanation: "Average confidence across Kardashev-II surge, bridge, sentinel, compute, identity, and schedule stressors.",
        },
        {
          method: "identity-ledger",
          score: telemetry.identity.withinQuorum && telemetry.identity.revocationWithinTolerance ? 1 : 0,
          explanation: "Identity quorum, latency, and revocation tolerances satisfied across federations.",
        },
        {
          method: "compute-fabric",
          score: telemetry.computeFabric.failoverWithinQuorum ? 1 : 0,
          explanation: "Hierarchical compute planes maintain quorum under worst-case failover.",
        },
        {
          method: "owner-control-proof",
          score: ownerProof.verification.unstoppableScore,
          explanation: "Selector coverage, pause toggles, and target isolation verified for owner overrides.",
        },
        {
          method: "owner-control-secondary",
          score: ownerProof.secondaryVerification.unstoppableScore,
          explanation: "Independent decode of Safe batch confirms unstoppable levers match primary proof.",
        },
        {
          method: "owner-control-tertiary",
          score: ownerProof.tertiaryVerification.unstoppableScore,
          explanation: "Interface-level replay validates pause/resume embeds with zero decode failures.",
        },
      ],
    },
    checks,
    alerts,
    scenarioSweep: {
      total: scenarioTotal,
      nominal: scenarioNominal,
      warning: scenarioWarning,
      critical: scenarioCritical,
      averageConfidence: scenarioConfidence,
      entries: scenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        status: scenario.status,
        confidence: scenario.confidence,
        summary: scenario.summary,
      })),
    },
    ownerControls: {
      manager: manifest.interstellarCouncil.managerAddress,
      systemPause: manifest.interstellarCouncil.systemPauseAddress,
      guardianCouncil: manifest.interstellarCouncil.guardianCouncil,
      transactionsEncoded: ownerProof.calls.length,
      pauseCallEncoded: ownerProof.pauseEmbedding.pauseAll,
      resumeCallEncoded: ownerProof.pauseEmbedding.unpauseAll,
      unstoppableScore: ownerProof.verification.unstoppableScore,
      secondary: ownerProof.secondaryVerification,
      tertiary: ownerProof.tertiaryVerification,
    },
    safety: {
      guardianReviewWindow: manifest.interstellarCouncil.guardianReviewWindow,
      minimumCoverageSeconds: telemetry.governance.minimumCoverageSeconds,
      coverageRatio,
      bridgeFailsafeSeconds: manifest.dysonProgram.safety.failsafeLatencySeconds,
      permittedUtilisation,
      utilisation,
      monteCarloBreachProbability: telemetry.energy.monteCarlo.breachProbability,
      monteCarloWithinTolerance: telemetry.energy.monteCarlo.withinTolerance,
    },
  };
}

function buildConsistencyLedger(manifest: Manifest, telemetry: Telemetry) {
  const computeValues = manifest.federations.map((federation) => federation.compute.exaflops);
  const computeDirect = computeValues.reduce((sum, value) => sum + value, 0);
  const computeKahan = kahanSum(computeValues);
  const computePairwise = pairwiseSum(computeValues);
  const computeTolerance = Math.max(1e-6, computeDirect * 1e-6);
  const computeDiffs = {
    directVsTelemetry: Math.abs(computeDirect - telemetry.compute.totalExaflops),
    directVsKahan: Math.abs(computeDirect - computeKahan),
    kahanVsPairwise: Math.abs(computeKahan - computePairwise),
  };
  const computeMaxDeviation = Object.values(computeDiffs).reduce((max, value) => Math.max(max, value), 0);
  const computeConsensus = computeMaxDeviation <= computeTolerance;

  const generatedAt =
    typeof manifest.generatedAt === "number"
      ? new Date(manifest.generatedAt).toISOString()
      : manifest.generatedAt;

  return {
    generatedAt,
    energy: {
      ...telemetry.energy.crossVerification,
    },
    compute: {
      methods: {
        direct: computeDirect,
        telemetry: telemetry.compute.totalExaflops,
        kahan: computeKahan,
        pairwise: computePairwise,
      },
      diffs: computeDiffs,
      toleranceExaflops: computeTolerance,
      maxDeviationExaflops: computeMaxDeviation,
      consensus: computeConsensus,
    },
    settlement: {
      watchersOnline: telemetry.settlement.watchersOnline,
      uniqueWatchers: telemetry.settlement.watchers.length,
      coverageOk: telemetry.verification.settlement.coverageOk,
      slippageOk: telemetry.verification.settlement.slippageOk,
      riskOk: telemetry.verification.settlement.riskOk,
    },
    identity: {
      revocationRatePpm: telemetry.verification.identity.revocationRatePpm,
      tolerancePpm: telemetry.verification.identity.tolerancePpm,
      withinTolerance: telemetry.verification.identity.revocationWithinTolerance,
    },
  };
}

function buildEquilibriumLedger(manifest: Manifest, telemetry: Telemetry) {
  const energy = telemetry.energy.monteCarlo;
  const allocation = telemetry.energy.allocationPolicy;
  const welfare = telemetry.sentientWelfare;
  const logistics = telemetry.logistics.equilibrium;
  const computeFabric = telemetry.computeFabric;

  const breachPenalty = energy.withinTolerance
    ? 1
    : clamp01(1 - energy.breachProbability / Math.max(energy.tolerance, 1e-6));
  const energyScore = clamp01(
    0.35 * energy.hamiltonianStability +
      0.25 * energy.gameTheorySlack +
      0.2 * energy.freeEnergyMarginPct +
      0.2 * breachPenalty
  );
  const allocationScore = clamp01(
    0.35 * allocation.strategyStability +
      0.25 * allocation.fairnessIndex +
      0.2 * allocation.jainIndex +
      0.2 * (1 - allocation.deviationIncentive)
  );
  const welfareScore = clamp01(
    0.3 * welfare.equilibriumScore +
      0.2 * welfare.cooperationIndex +
      0.2 * welfare.coalitionStability +
      0.15 * welfare.paretoSlack +
      0.15 * welfare.collectiveActionPotential
  );
  const logisticsScore = clamp01(
    0.45 * (logistics?.hamiltonianStability ?? 0) +
      0.35 * (logistics?.gameTheorySlack ?? 0) +
      0.2 * (logistics?.entropyRatio ?? 0)
  );
  const computeScore = clamp01(
    0.6 * (computeFabric.failoverWithinQuorum ? 1 : 0) + 0.4 * computeFabric.averageAvailabilityPct
  );

  const overallScore = clamp01(
    0.3 * energyScore +
      0.2 * allocationScore +
      0.2 * welfareScore +
      0.2 * logisticsScore +
      0.1 * computeScore
  );
  const status = overallScore >= 0.9 ? "nominal" : overallScore >= 0.8 ? "warning" : "critical";

  const recommendations = [];
  if (energyScore < 0.85) {
    recommendations.push(
      "Increase energy buffer or lower demand variance until Hamiltonian stability remains above 90%."
    );
  }
  if (allocation.deviationIncentive > 0.2) {
    recommendations.push(
      "Rebalance allocation weights to reduce deviation incentives and tighten Nash equilibrium adherence."
    );
  }
  if (welfare.inequalityIndex > 0.3) {
    recommendations.push(
      "Target inequality reduction by expanding cooperative rewards and boosting high-latency federation buffers."
    );
  }
  if ((logistics?.gameTheorySlack ?? 1) < 0.85) {
    recommendations.push(
      "Re-route logistics corridors to raise game-theory slack above 85% and preserve corridor entropy."
    );
  }
  if (!computeFabric.failoverWithinQuorum) {
    recommendations.push(
      "Add failover capacity to meet compute quorum before large-scale autonomy escalation."
    );
  }

  const pathways = [
    {
      title: "Thermodynamic headroom",
      status: energyScore >= 0.85 ? "on-track" : "needs-action",
      rationale: `Free energy ${(energy.freeEnergyMarginPct * 100).toFixed(
        1
      )}% · Hamiltonian ${(energy.hamiltonianStability * 100).toFixed(1)}%`,
      action:
        energyScore >= 0.85
          ? "Maintain reserve cadence and keep Monte Carlo breach probability below tolerance."
          : "Raise reserve buffers or smooth demand variance until Hamiltonian stability clears 85%.",
    },
    {
      title: "Nash deviation control",
      status: allocation.deviationIncentive <= 0.2 ? "on-track" : "needs-action",
      rationale: `Deviation incentive ${(allocation.deviationIncentive * 100).toFixed(
        1
      )}% · strategy ${(allocation.strategyStability * 100).toFixed(1)}%`,
      action:
        allocation.deviationIncentive <= 0.2
          ? "Keep incentive gradients aligned with Nash stability targets."
          : "Tune reward weights to lower deviation incentives and raise strategy stability.",
    },
    {
      title: "Sentient coalition balance",
      status: welfare.coalitionStability >= 0.85 ? "on-track" : "needs-action",
      rationale: `Coalition ${(welfare.coalitionStability * 100).toFixed(
        1
      )}% · inequality ${(welfare.inequalityIndex * 100).toFixed(1)}%`,
      action:
        welfare.coalitionStability >= 0.85
          ? "Continue cooperative reward rotations to sustain coalition stability."
          : "Rebalance cooperative rewards to lift coalition stability above 85%.",
    },
    {
      title: "Logistics game-theory slack",
      status: (logistics?.gameTheorySlack ?? 0) >= 0.85 ? "on-track" : "needs-action",
      rationale: `Slack ${((logistics?.gameTheorySlack ?? 0) * 100).toFixed(
        1
      )}% · entropy ${(logistics?.entropyRatio ?? 0).toFixed(2)}`,
      action:
        (logistics?.gameTheorySlack ?? 0) >= 0.85
          ? "Maintain corridor utilisation within the equilibrium band."
          : "Rebalance corridor allocations to restore slack above 85%.",
    },
    {
      title: "Compute quorum resilience",
      status: computeFabric.failoverWithinQuorum ? "on-track" : "needs-action",
      rationale: `Availability ${(computeFabric.averageAvailabilityPct * 100).toFixed(
        1
      )}% · failover ${computeFabric.failoverWithinQuorum ? "ok" : "risk"}`,
      action: computeFabric.failoverWithinQuorum
        ? "Sustain quorum failover coverage and monitor deviation drift."
        : "Expand failover coverage until quorum resilience is restored.",
    },
  ];

  const generatedAt =
    typeof manifest.generatedAt === "number"
      ? new Date(manifest.generatedAt).toISOString()
      : manifest.generatedAt;

  return {
    generatedAt,
    status,
    overallScore: round(overallScore, 4),
    components: {
      energy: {
        score: round(energyScore, 4),
        freeEnergyMarginPct: round(energy.freeEnergyMarginPct, 4),
        hamiltonianStability: round(energy.hamiltonianStability, 4),
        gameTheorySlack: round(energy.gameTheorySlack, 4),
        breachProbability: round(energy.breachProbability, 4),
        gibbsFreeEnergyGj: round(energy.gibbsFreeEnergyGj, 2),
      },
      allocation: {
        score: round(allocationScore, 4),
        fairnessIndex: round(allocation.fairnessIndex, 4),
        strategyStability: round(allocation.strategyStability, 4),
        deviationIncentive: round(allocation.deviationIncentive, 4),
        nashProduct: round(allocation.nashProduct, 4),
        jainIndex: round(allocation.jainIndex, 4),
        gibbsPotential: round(allocation.gibbsPotential, 4),
      },
      welfare: {
        score: round(welfareScore, 4),
        cooperationIndex: round(welfare.cooperationIndex, 4),
        inequalityIndex: round(welfare.inequalityIndex, 4),
        coalitionStability: round(welfare.coalitionStability, 4),
        paretoSlack: round(welfare.paretoSlack, 4),
        collectiveActionPotential: round(welfare.collectiveActionPotential, 4),
      },
      logistics: {
        score: round(logisticsScore, 4),
        hamiltonianStability: round(logistics.hamiltonianStability, 4),
        gameTheorySlack: round(logistics.gameTheorySlack, 4),
        entropyRatio: round(logistics.entropyRatio, 4),
        nashWelfare: round(logistics.nashWelfare, 4),
      },
      compute: {
        score: round(computeScore, 4),
        failoverWithinQuorum: computeFabric.failoverWithinQuorum,
        averageAvailabilityPct: round(computeFabric.averageAvailabilityPct, 4),
        deviationPct: round(telemetry.verification.compute.deviationPct, 4),
      },
    },
    thermodynamics: {
      freeEnergyMarginPct: round(energy.freeEnergyMarginPct, 4),
      gibbsFreeEnergyGj: round(energy.gibbsFreeEnergyGj, 2),
      entropyMargin: round(energy.entropyMargin, 4),
      hamiltonianStability: round(energy.hamiltonianStability, 4),
    },
    gameTheory: {
      nashProduct: round(allocation.nashProduct, 4),
      logisticsNashWelfare: round(logistics.nashWelfare, 4),
      coalitionStability: round(welfare.coalitionStability, 4),
    },
    pathways,
    recommendations,
  };
}

function buildSafeBatch(manifest: Manifest, transactions: SafeTransaction[]) {
  const parsedCreatedAt =
    typeof manifest.generatedAt === "number" ? manifest.generatedAt : Date.parse(manifest.generatedAt);
  const createdAt = Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : Date.now();

  return {
    version: "1.0",
    chainId: manifest.interstellarCouncil.chainId,
    createdAt,
    meta: {
      name: "AGI Jobs Kardashev-II Command Batch",
      description: "Owner-calibrated payload synthesised by demo/AGI-Jobs-Platform-at-Kardashev-II-Scale",
    },
    transactions: transactions.map((tx) => ({
      to: tx.to,
      value: "0",
      data: tx.data,
      description: tx.description,
    })),
  };
}

function writeOrCheck(path: string, content: string) {
  if (CHECK_MODE) {
    const existing = readFileSync(path, "utf8");
    if (existing !== content) {
      console.error(`❌ Drift detected for ${path}. Regenerate artefacts.`);
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(path, content);
}

function run() {
  const { manifest, raw } = loadManifest();
  const energyFeedsConfig = loadEnergyFeeds();
  const fabricConfig = loadFabricConfig();
  const { lattice: missionLattice } = loadMissionLattice();
  ensureOutputDir();

  const totalMonthlyValue = manifest.federations.flatMap((f) => f.domains).reduce((sum, d) => sum + d.monthlyValueUSD, 0);
  const totalResilience = manifest.federations.flatMap((f) => f.domains).reduce((sum, d) => sum + d.resilience, 0);
  const domainCount = manifest.federations.reduce((sum, f) => sum + f.domains.length, 0);
  const averageResilience = domainCount > 0 ? totalResilience / domainCount : 0;
  const averageCoverage = manifest.federations.flatMap((f) => f.domains).reduce((sum, d) => sum + d.coverageSeconds, 0) / Math.max(domainCount, 1);
  const maxAutonomy = manifest.federations.flatMap((f) => f.domains).reduce((max, d) => Math.max(max, d.autonomyLevelBps), 0);

  const dominanceScore = computeDominanceScore({
    totalMonthlyUSD: totalMonthlyValue,
    averageResilience,
    averageCoverageSeconds: averageCoverage,
    guardianReviewWindow: manifest.interstellarCouncil.guardianReviewWindow,
    autonomyBps: maxAutonomy,
    autonomyCap: manifest.dysonProgram.safety.maxAutonomyBps,
    cadenceSeconds: manifest.selfImprovement.cadenceSeconds,
  });

  const transactions = buildTransactions(manifest);
  const safeBatch = buildSafeBatch(manifest, transactions);
  const manifestHash = keccak256(toUtf8Bytes(raw));
  const ownerProof = buildOwnerControlProof(manifest, transactions, manifestHash);
  const missionTelemetry = buildMissionLatticeTelemetry(missionLattice, manifest);

  const telemetry = computeTelemetry(
    manifest,
    dominanceScore,
    manifestHash,
    ownerProof,
    energyFeedsConfig,
    fabricConfig,
    missionTelemetry.summary
  );
  const scenarioSweep = buildScenarioSweep(manifest, telemetry);
  const telemetryWithScenarios = { ...telemetry, scenarioSweep };
  const stabilityLedger = buildStabilityLedger(
    manifest,
    telemetryWithScenarios,
    dominanceScore,
    transactions,
    scenarioSweep,
    ownerProof
  );
  const consistencyLedger = buildConsistencyLedger(manifest, telemetryWithScenarios);
  const equilibriumLedger = buildEquilibriumLedger(manifest, telemetryWithScenarios);
  const mermaid = buildMermaid(manifest, dominanceScore);
  const dysonTimeline = buildDysonTimeline(manifest);
  const runbook = buildRunbook(manifest, telemetryWithScenarios, dominanceScore, scenarioSweep);
  const operatorBriefing = buildOperatorBriefing(manifest, telemetryWithScenarios);

  const telemetryJson = `${JSON.stringify(telemetryWithScenarios, null, 2)}\n`;
  const safeJson = `${JSON.stringify(safeBatch, null, 2)}\n`;
  const ledgerJson = `${JSON.stringify(stabilityLedger, null, 2)}\n`;
  const equilibriumJson = `${JSON.stringify(equilibriumLedger, null, 2)}\n`;
  const scenariosJson = `${JSON.stringify(scenarioSweep, null, 2)}\n`;
  const ownerProofJson = `${JSON.stringify(ownerProof, null, 2)}\n`;
  const telemetryInlineJs = `window.__KARDASHEV_TELEMETRY__ = ${JSON.stringify(telemetryWithScenarios)};\n`;
  const ledgerInlineJs = `window.__KARDASHEV_LEDGER__ = ${JSON.stringify(stabilityLedger)};\n`;
  const equilibriumInlineJs = `window.__KARDASHEV_EQUILIBRIUM__ = ${JSON.stringify(equilibriumLedger)};\n`;
  const ownerProofInlineJs = `window.__KARDASHEV_OWNER_PROOF__ = ${JSON.stringify(ownerProof)};\n`;
  const diagramsInlineJs = `window.__KARDASHEV_DIAGRAMS__ = ${JSON.stringify({
    missionHierarchy: missionTelemetry.mermaid,
    interstellarMap: mermaid,
    dysonThermo: dysonTimeline,
  })};\n`;
  const monteCarloJson = `${JSON.stringify(telemetry.energy.monteCarlo, null, 2)}\n`;
  const consistencyJson = `${JSON.stringify(consistencyLedger, null, 2)}\n`;
  const energyFeedsJson = `${JSON.stringify(
    {
      calibrationISO8601: telemetry.energy.liveFeeds.calibrationISO8601,
      tolerancePct: telemetry.energy.liveFeeds.tolerancePct,
      driftAlertPct: telemetry.energy.liveFeeds.driftAlertPct,
      feeds: telemetry.energy.liveFeeds.feeds,
    },
    null,
    2
  )}\n`;
  const missionLedgerJson = `${JSON.stringify(missionTelemetry.ledger, null, 2)}\n`;

  const fabricLedgerJson = `${JSON.stringify(
    {
      coverage: telemetry.orchestrationFabric.coverage,
      shards: telemetry.orchestrationFabric.shards,
      contracts: {
        knowledgeGraph: telemetry.orchestrationFabric.knowledgeGraph,
        energyOracle: telemetry.orchestrationFabric.energyOracle,
        rewardEngine: telemetry.orchestrationFabric.rewardEngine,
        phase8Manager: telemetry.orchestrationFabric.phase8Manager,
      },
    },
    null,
    2
  )}\n`;

  const energyScheduleJson = `${JSON.stringify(telemetry.energy.schedule, null, 2)}\n`;
  const settlementJson = `${JSON.stringify(telemetry.settlement, null, 2)}\n`;
  const logisticsJson = `${JSON.stringify(telemetry.logistics, null, 2)}\n`;

  const outputs = [
    { suffix: "telemetry.json", content: telemetryJson },
    { suffix: "telemetry.inline.js", content: telemetryInlineJs },
    { suffix: "safe-transaction-batch.json", content: safeJson },
    { suffix: "stability-ledger.json", content: ledgerJson },
    { suffix: "stability-ledger.inline.js", content: ledgerInlineJs },
    { suffix: "equilibrium-ledger.json", content: equilibriumJson },
    { suffix: "equilibrium-ledger.inline.js", content: equilibriumInlineJs },
    { suffix: "consistency-ledger.json", content: consistencyJson },
    { suffix: "scenario-sweep.json", content: scenariosJson },
    { suffix: "monte-carlo.json", content: monteCarloJson },
    { suffix: "energy-feeds.json", content: energyFeedsJson },
    { suffix: "task-ledger.json", content: missionLedgerJson },
    { suffix: "fabric-ledger.json", content: fabricLedgerJson },
    { suffix: "energy-schedule.json", content: energyScheduleJson },
    { suffix: "settlement-ledger.json", content: settlementJson },
    { suffix: "logistics-ledger.json", content: logisticsJson },
    { suffix: "mermaid.mmd", content: `${mermaid}\n` },
    { suffix: "orchestration-report.md", content: `${runbook}\n` },
    { suffix: "dyson.mmd", content: `${dysonTimeline}\n` },
    { suffix: "task-hierarchy.mmd", content: `${missionTelemetry.mermaid}\n` },
    { suffix: "operator-briefing.md", content: `${operatorBriefing}\n` },
    { suffix: "owner-proof.json", content: ownerProofJson },
    { suffix: "owner-proof.inline.js", content: ownerProofInlineJs },
    { suffix: "diagrams.inline.js", content: diagramsInlineJs },
  ].map(({ suffix, content }) => ({
    path: join(OUTPUT_DIR, `${OUTPUT_PREFIX}-${suffix}`),
    content,
  }));

  for (const output of outputs) {
    if (!CHECK_MODE && !existsSync(output.path)) {
      // ensure parent dir exists (already created) but keep this for clarity
      ensureOutputDir();
    }
    writeOrCheck(output.path, output.content);
  }

  if (CHECK_MODE) {
    const failures = process.exitCode ?? 0;
    if (failures) {
      console.error("Kardashev-II demo validation failed.");
      process.exit(failures);
    }
    console.log("✔ Kardashev-II artefacts are up-to-date.");
    return;
  }

  console.log("✔ Kardashev-II orchestration artefacts generated.");
  console.log(`   Dominance score: ${dominanceScore.toFixed(1)} / 100.`);
  console.log(`   Monthly value throughput: ${formatUSD(totalMonthlyValue)}.`);
  console.log(`   Average resilience: ${(averageResilience * 100).toFixed(2)}%.`);
  console.log(`   Energy utilisation: ${(telemetry.energy.utilisationPct * 100).toFixed(2)}% (margin ${(telemetry.energy.marginPct * 100).toFixed(2)}%).`);
  console.log(
    `   Stability ledger composite confidence: ${(stabilityLedger.confidence.compositeScore * 100).toFixed(2)}% (quorum ${stabilityLedger.confidence.quorum}).`
  );
  console.log(
    `   Equilibrium ledger score: ${(equilibriumLedger.overallScore * 100).toFixed(2)}% (${equilibriumLedger.status}).`
  );
  console.log(
    `   Energy models aligned: ${telemetry.verification.energyModels.withinMargin} (regional ${telemetry.energy.models.regionalSumGw.toLocaleString()} GW vs Dyson ${telemetry.energy.models.dysonProjectionGw.toLocaleString()} GW).`
  );
  console.log(
    `   Energy cross-verification consensus: ${telemetry.energy.crossVerification.consensus} (max deviation ${telemetry.energy.crossVerification.maxDeviationGw.toFixed(6)} GW · tolerance ${telemetry.energy.crossVerification.toleranceGw.toFixed(6)} GW).`
  );
  console.log(
    `   Energy Monte Carlo breach probability: ${(telemetry.energy.monteCarlo.breachProbability * 100).toFixed(2)}% (tolerance ${(telemetry.energy.monteCarlo.tolerance * 100).toFixed(2)}%).`
  );
  console.log(
    `   Compute deviation ${telemetry.verification.compute.deviationPct.toFixed(2)}% (tolerance ${telemetry.verification.compute.tolerancePct}%).`
  );
  console.log(
    `   Bridge latency compliance: ${telemetry.verification.bridges.allWithinTolerance} (tolerance ${telemetry.verification.bridges.toleranceSeconds}s).`
  );
  console.log(
    `   Energy feed drift compliance: ${telemetry.verification.energyFeeds.allWithinTolerance} (tolerance ${telemetry.verification.energyFeeds.tolerancePct}%).`
  );
  console.log(
    `   Energy schedule coverage ${(telemetry.energy.schedule.globalCoverageRatio * 100).toFixed(2)}% (threshold ${
      telemetry.energy.schedule.coverageThreshold * 100
    }%) · reliability ${(telemetry.energy.schedule.globalReliabilityPct * 100).toFixed(2)}%.`
  );
  console.log(
    `   Settlement finality ${telemetry.settlement.averageFinalityMinutes.toFixed(2)} min (max ${telemetry.verification.settlement.maxToleranceMinutes.toFixed(
      2
    )} min) · coverage ${(telemetry.settlement.minCoveragePct * 100).toFixed(2)}% (threshold ${
      telemetry.settlement.coverageThreshold * 100
    }%) · watchers ${telemetry.settlement.watchersOnline}.`
  );
  console.log(
    `   Sharded fabric coverage — domains ${telemetry.verification.orchestrationFabric.domainsOk}, sentinels ${telemetry.verification.orchestrationFabric.sentinelsOk}, federations ${telemetry.verification.orchestrationFabric.federationsOk}.`
  );
  console.log(
    `   Owner override unstoppable score: ${(ownerProof.verification.unstoppableScore * 100).toFixed(2)}% (selectors ${
      ownerProof.verification.selectorsComplete
    }, pause ${ownerProof.pauseEmbedding.pauseAll}, resume ${ownerProof.pauseEmbedding.unpauseAll}).`
  );
  console.log(
    `   Mission unstoppable score: ${(missionTelemetry.summary.verification.unstoppableScore * 100).toFixed(2)}% across ${
      missionTelemetry.summary.totals.programmes
    } programmes (dependencies resolved: ${missionTelemetry.summary.verification.dependenciesResolved}).`
  );
  if (scenarioSweep.length > 0) {
    const scenarioNominal = scenarioSweep.filter((scenario) => scenario.status === "nominal").length;
    const scenarioWarning = scenarioSweep.filter((scenario) => scenario.status === "warning").length;
    const scenarioCritical = scenarioSweep.filter((scenario) => scenario.status === "critical").length;
    console.log(
      `   Scenario sweep: ${scenarioNominal}/${scenarioSweep.length} nominal, ${scenarioWarning} warning, ${scenarioCritical} critical.`
    );
  }
  if (telemetry.energy.warnings.length) {
    console.log(`   ⚠ Energy warnings: ${telemetry.energy.warnings.join("; ")}`);
  }
  if (!telemetry.manifest.manifestoHashMatches) {
    console.log("   ⚠ Manifesto hash mismatch detected.");
  }
  if (!telemetry.manifest.planHashMatches) {
    console.log("   ⚠ Self-improvement plan hash mismatch detected.");
  }
  if (missionTelemetry.summary.verification.warnings.length) {
    console.log(`   ⚠ Mission lattice advisories: ${missionTelemetry.summary.verification.warnings.join("; ")}`);
  }

  if (REFLECT_MODE) {
    console.log("\nReflection checklist:");
    console.log(` - Manifest hash on disk: ${telemetry.manifest.hash}`);
    console.log(` - Manifesto hash matches: ${telemetry.manifest.manifestoHashMatches}`);
    console.log(` - Plan hash matches: ${telemetry.manifest.planHashMatches}`);
    console.log(` - Guardian coverage ok: ${telemetry.governance.coverageOk}`);
    console.log(` - Energy triple check: ${telemetry.energy.tripleCheck}`);
    console.log(
      ` - Monte Carlo breach within tolerance: ${telemetry.energy.monteCarlo.withinTolerance} (breach ${(telemetry.energy.monteCarlo.breachProbability * 100).toFixed(2)}% ≤ ${(telemetry.energy.monteCarlo.tolerance * 100).toFixed(2)}%)`
    );
    console.log(` - Bridges within failsafe: ${Object.entries(telemetry.bridges)
      .map(([name, data]) => `${name}=${data.withinFailsafe}`)
      .join(", ")}`);
    console.log(
      ` - Energy schedule coverage ok: ${telemetry.verification.energySchedule.coverageOk} (global ${(telemetry.energy.schedule.globalCoverageRatio * 100).toFixed(
        2
      )}%)`
    );
    console.log(
      ` - Energy schedule reliability ok: ${telemetry.verification.energySchedule.reliabilityOk}`
    );
    console.log(
      ` - Settlement finality within tolerance: ${telemetry.verification.settlement.allWithinTolerance} (avg ${telemetry.settlement.averageFinalityMinutes.toFixed(
        2
      )} min)`
    );
    console.log(` - Settlement coverage ok: ${telemetry.verification.settlement.coverageOk}`);
    console.log(` - Settlement slippage ok: ${telemetry.verification.settlement.slippageOk}`);
    console.log(
      ` - Owner unstoppable score ≥95%: ${ownerProof.verification.unstoppableScore >= 0.95} (${(
        ownerProof.verification.unstoppableScore * 100
      ).toFixed(2)}%)`
    );
    console.log(
      ` - Mission unstoppable score ≥95%: ${
        missionTelemetry.summary.verification.unstoppableScore >= 0.95
      } (${(missionTelemetry.summary.verification.unstoppableScore * 100).toFixed(2)}%)`
    );
    console.log(
      ` - Mission dependencies resolved: ${missionTelemetry.summary.verification.dependenciesResolved}`
    );
    console.log(
      ` - Scenario sweep stable: ${
        scenarioSweep.length === 0 ? true : scenarioSweep.every((scenario) => scenario.status !== "critical")
      }`
    );
    const anyFailures = [
      telemetry.manifest.manifestoHashMatches,
      telemetry.manifest.planHashMatches,
      telemetry.governance.coverageOk,
      ownerProof.verification.selectorsComplete,
      ownerProof.pauseEmbedding.pauseAll,
      ownerProof.pauseEmbedding.unpauseAll,
      ownerProof.verification.unstoppableScore >= 0.95,
      missionTelemetry.summary.verification.dependenciesResolved,
      missionTelemetry.summary.verification.unstoppableScore >= 0.95,
      telemetry.energy.tripleCheck,
      telemetry.energy.monteCarlo.withinTolerance,
      ...Object.values(telemetry.bridges).map((b: any) => b.withinFailsafe),
      telemetry.verification.energySchedule.coverageOk,
      telemetry.verification.energySchedule.reliabilityOk,
      telemetry.verification.settlement.allWithinTolerance,
      telemetry.verification.settlement.coverageOk,
      telemetry.verification.settlement.slippageOk,
      telemetry.verification.settlement.riskOk,
      scenarioSweep.length === 0 || scenarioSweep.every((scenario) => scenario.status !== "critical"),
    ].some((flag) => !flag);
    if (anyFailures) {
      console.error("❌ Reflection checks failed. Resolve before deploying.");
      process.exit(1);
    }
  }
}

run();
