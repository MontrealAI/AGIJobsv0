#!/usr/bin/env ts-node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Interface, keccak256, toUtf8Bytes } from "ethers";
import { z } from "zod";

const DEMO_ROOT = join(__dirname, "..");
const CONFIG_PATH = join(DEMO_ROOT, "config", "kardashev-ii.manifest.json");
const OUTPUT_DIR = join(DEMO_ROOT, "output");

const args = new Set(process.argv.slice(2));
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
  }),
  missionDirectives: MissionDirectivesSchema,
  verificationProtocols: VerificationProtocolsSchema,
  identityProtocols: IdentityProtocolsSchema,
  computeFabrics: ComputeFabricsSchema,
  federations: z.array(FederationSchema).min(1),
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

function loadManifest(): { manifest: Manifest; raw: string } {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return { manifest: ManifestSchema.parse(parsed), raw };
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
    calls: callMap,
  };
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
  const bridgeStatus: ScenarioStatus =
    latencySlack >= failsafeLatency * 0.25
      ? "nominal"
      : latencySlack >= -failsafeLatency * 0.5
      ? "warning"
      : "critical";
  const bridgeConfidence = normaliseConfidence((latencySlack + failsafeLatency) / (failsafeLatency * 2));
  scenarioResults.push({
    id: "bridge-failover",
    title: "Interplanetary bridge outage simulation",
    status: bridgeStatus,
    summary:
      latencySlack >= 0
        ? `Failover latency ${failoverLatency.toFixed(0)}s leaves ${latencySlack.toFixed(0)}s slack within ${failsafeLatency}s failsafe.`
        : `Failover latency ${failoverLatency.toFixed(0)}s breaches ${failsafeLatency}s failsafe.`,
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
      { label: "Failsafe budget", value: `${failsafeLatency}s`, ok: true },
      { label: "Slack", value: `${latencySlack.toFixed(0)}s`, ok: latencySlack >= 0 },
    ],
    recommendedActions: [
      "Execute bridge isolation routine from mission directives if slack < 0.",
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

  // Scenario 6 — Identity infiltration attempt (3% forged credentials)
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

  // Scenario 7 — Primary compute plane offline
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
    }, resume ${telemetry.ownerControls.resumeCallEncoded}).`
  );
  lines.push("\n---\n");
  lines.push("## Energy telemetry");
  lines.push(`* Captured GW (Dyson baseline): ${telemetry.energy.capturedGw.toLocaleString()} GW.`);
  lines.push(`* Utilisation: ${(telemetry.energy.utilisationPct * 100).toFixed(2)}% (margin ${telemetry.energy.marginPct.toFixed(2)}%).`);
  lines.push(`* Regional availability: ${telemetry.energy.regional.map((r: any) => `${r.slug} ${r.availableGw} GW`).join(" · ")}.`);
  if (telemetry.energy.warnings.length > 0) {
    lines.push(`* ⚠️ ${telemetry.energy.warnings.join("; ")}`);
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
    `* Compute deviation ${telemetry.verification.compute.deviationPct.toFixed(2)}% (tolerance ${telemetry.verification.compute.tolerancePct}%): ${telemetry.verification.compute.withinTolerance}`
  );
  lines.push(
    `* Bridge latency tolerance (${telemetry.verification.bridges.toleranceSeconds}s): ${telemetry.verification.bridges.allWithinTolerance}`
  );
  lines.push(
    `* Owner override unstoppable score ${(telemetry.governance.ownerProof.unstoppableScore * 100).toFixed(2)}% (selectors ${
      telemetry.governance.ownerProof.selectorsComplete
    }, pause ${telemetry.ownerControls.pauseCallEncoded}, resume ${telemetry.ownerControls.resumeCallEncoded}).`
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
  ownerProof: OwnerControlProof
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
  const utilisationPct = sumRegionalGw / capturedGw;
  const marginPct = manifest.energyProtocols.stellarLattice.safetyMarginPct / 100;
  const energyWarnings: string[] = [];
  if (utilisationPct > 1 - marginPct) {
    energyWarnings.push("Utilisation exceeds configured safety margin");
  }
  if (dysonYield < capturedGw) {
    energyWarnings.push("Dyson programme yield below captured baseline");
  }

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
  const minCoveragePct =
    identityFederations.length === 0 || identityTotals.minCoveragePct === Number.POSITIVE_INFINITY
      ? 1
      : identityTotals.minCoveragePct;
  const identityCoverageOk = minCoveragePct >= identityGlobal.coverageFloorPct;
  const identityTotalAgentsFromCompute = manifest.federations.reduce((sum, f) => sum + f.compute.agents, 0);
  const identityDeviation = Math.abs(identityTotals.totalAgents - identityTotalAgentsFromCompute);
  const revocationRatePpm =
    identityTotals.totalAgents === 0
      ? 0
      : (identityTotals.revocations24h / Math.max(identityTotals.totalAgents, 1)) * 1_000_000;
  const revocationWithinTolerance = revocationRatePpm <= identityGlobal.revocationTolerancePpm;

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
        minCoveragePct,
        revocationRatePpm,
        deviationAgainstCompute: identityDeviation,
      },
      withinQuorum: identityTotals.anchorsMeetingQuorum === identityFederations.length,
      latencyWithinWindow,
      coverageOk: identityCoverageOk,
      revocationWithinTolerance,
      federations: identityFederations,
    },
    computeFabric: {
      totalCapacityExaflops: totalPlaneCapacity,
      failoverCapacityExaflops,
      requiredFailoverCapacity,
      averageAvailabilityPct: averagePlaneAvailability,
      failoverWithinQuorum,
      planes: computePlanes,
      policies: manifest.computeFabrics.failoverPolicies,
    },
    dominance: {
      monthlyValueUSD: totalMonthlyValue,
      averageResilience,
      averageCoverage,
      score: dominanceScore,
    },
    bridges: bridgeTelemetry,
    federations: federationsDetail,
    ownerControls: {
      pauseCallEncoded: ownerProof.pauseEmbedding.pauseAll,
      resumeCallEncoded: ownerProof.pauseEmbedding.unpauseAll,
      unstoppableScore: ownerProof.verification.unstoppableScore,
      selectorsComplete: ownerProof.verification.selectorsComplete,
      transactionsEncoded: ownerProof.calls.length,
    },
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
    telemetry.verification.compute.withinTolerance,
    telemetry.verification.bridges.allWithinTolerance,
    telemetry.identity.withinQuorum,
    telemetry.identity.latencyWithinWindow,
    telemetry.identity.revocationWithinTolerance,
    telemetry.computeFabric.failoverWithinQuorum,
    telemetry.governance.coverageOk,
    ownerProof.verification.selectorsComplete,
    ownerProof.verification.pauseEmbedding,
    ownerProof.verification.singleOwnerTargets,
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
      id: "bridge-latency",
      title: "Bridge latency ≤ tolerance",
      severity: "high",
      status: telemetry.verification.bridges.allWithinTolerance,
      weight: 0.75,
      evidence: `tolerance ${telemetry.verification.bridges.toleranceSeconds}s · failsafe ${manifest.dysonProgram.safety.failsafeLatencySeconds}s`,
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
    },
    safety: {
      guardianReviewWindow: manifest.interstellarCouncil.guardianReviewWindow,
      minimumCoverageSeconds: telemetry.governance.minimumCoverageSeconds,
      coverageRatio,
      bridgeFailsafeSeconds: manifest.dysonProgram.safety.failsafeLatencySeconds,
      permittedUtilisation,
      utilisation,
    },
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
  const telemetry = computeTelemetry(manifest, dominanceScore, manifestHash, ownerProof);
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
  const mermaid = buildMermaid(manifest, dominanceScore);
  const dysonTimeline = buildDysonTimeline(manifest);
  const runbook = buildRunbook(manifest, telemetryWithScenarios, dominanceScore, scenarioSweep);
  const operatorBriefing = buildOperatorBriefing(manifest, telemetryWithScenarios);

  const telemetryJson = `${JSON.stringify(telemetryWithScenarios, null, 2)}\n`;
  const safeJson = `${JSON.stringify(safeBatch, null, 2)}\n`;
  const ledgerJson = `${JSON.stringify(stabilityLedger, null, 2)}\n`;
  const scenariosJson = `${JSON.stringify(scenarioSweep, null, 2)}\n`;
  const ownerProofJson = `${JSON.stringify(ownerProof, null, 2)}\n`;

  const outputs = [
    { path: join(OUTPUT_DIR, "kardashev-telemetry.json"), content: telemetryJson },
    { path: join(OUTPUT_DIR, "kardashev-safe-transaction-batch.json"), content: safeJson },
    { path: join(OUTPUT_DIR, "kardashev-stability-ledger.json"), content: ledgerJson },
    { path: join(OUTPUT_DIR, "kardashev-scenario-sweep.json"), content: scenariosJson },
    { path: join(OUTPUT_DIR, "kardashev-mermaid.mmd"), content: `${mermaid}\n` },
    { path: join(OUTPUT_DIR, "kardashev-orchestration-report.md"), content: `${runbook}\n` },
    { path: join(OUTPUT_DIR, "kardashev-dyson.mmd"), content: `${dysonTimeline}\n` },
    { path: join(OUTPUT_DIR, "kardashev-operator-briefing.md"), content: `${operatorBriefing}\n` },
    { path: join(OUTPUT_DIR, "kardashev-owner-proof.json"), content: ownerProofJson },
  ];

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
    `   Energy models aligned: ${telemetry.verification.energyModels.withinMargin} (regional ${telemetry.energy.models.regionalSumGw.toLocaleString()} GW vs Dyson ${telemetry.energy.models.dysonProjectionGw.toLocaleString()} GW).`
  );
  console.log(
    `   Compute deviation ${telemetry.verification.compute.deviationPct.toFixed(2)}% (tolerance ${telemetry.verification.compute.tolerancePct}%).`
  );
  console.log(
    `   Bridge latency compliance: ${telemetry.verification.bridges.allWithinTolerance} (tolerance ${telemetry.verification.bridges.toleranceSeconds}s).`
  );
  console.log(
    `   Owner override unstoppable score: ${(ownerProof.verification.unstoppableScore * 100).toFixed(2)}% (selectors ${
      ownerProof.verification.selectorsComplete
    }, pause ${ownerProof.pauseEmbedding.pauseAll}, resume ${ownerProof.pauseEmbedding.unpauseAll}).`
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

  if (REFLECT_MODE) {
    console.log("\nReflection checklist:");
    console.log(` - Manifest hash on disk: ${telemetry.manifest.hash}`);
    console.log(` - Manifesto hash matches: ${telemetry.manifest.manifestoHashMatches}`);
    console.log(` - Plan hash matches: ${telemetry.manifest.planHashMatches}`);
    console.log(` - Guardian coverage ok: ${telemetry.governance.coverageOk}`);
    console.log(` - Energy triple check: ${telemetry.energy.tripleCheck}`);
    console.log(` - Bridges within failsafe: ${Object.entries(telemetry.bridges)
      .map(([name, data]) => `${name}=${data.withinFailsafe}`)
      .join(", ")}`);
    console.log(
      ` - Owner unstoppable score ≥95%: ${ownerProof.verification.unstoppableScore >= 0.95} (${(
        ownerProof.verification.unstoppableScore * 100
      ).toFixed(2)}%)`
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
      telemetry.energy.tripleCheck,
      ...Object.values(telemetry.bridges).map((b: any) => b.withinFailsafe),
      scenarioSweep.length === 0 || scenarioSweep.every((scenario) => scenario.status !== "critical"),
    ].some((flag) => !flag);
    if (anyFailures) {
      console.error("❌ Reflection checks failed. Resolve before deploying.");
      process.exit(1);
    }
  }
}

run();
