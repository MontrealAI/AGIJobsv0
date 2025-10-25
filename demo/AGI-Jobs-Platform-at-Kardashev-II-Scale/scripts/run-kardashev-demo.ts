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

const FederationSchema = z.object({
  slug: z.string().min(1),
  chainId: z.number().int().positive(),
  governanceSafe: AddressSchema,
  energy: EnergySchema,
  compute: ComputeSchema,
  domains: z.array(DomainSchema).min(1),
  sentinels: z.array(SentinelSchema).min(1),
  capitalStreams: z.array(CapitalStreamSchema).min(1),
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

type SafeTransaction = {
  to: string;
  data: string;
  description: string;
};

function loadManifest(): Manifest {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return ManifestSchema.parse(parsed);
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
    lines.push(`  IC -->|delegate| ${nodeName}{${federation.slug.toUpperCase()} Federation}`);
    lines.push(`  ${nodeName} -->|agents ${Math.round(federation.compute.agents / 1_000_000)}M| ${nodeName}_AGENTS`);
    lines.push(`  ${nodeName}_AGENTS[Edge + core nodes\\n${federation.compute.validatorNodes.toLocaleString()} validators]`);
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

function buildRunbook(manifest: Manifest, telemetry: any, dominanceScore: number): string {
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
  for (const federation of manifest.federations) {
    const fTelemetry = telemetry.compute.regional.find((r: any) => r.slug === federation.slug);
    lines.push(`* **${federation.slug.toUpperCase()}** – ${fTelemetry.exaflops.toFixed(2)} EF, ${fTelemetry.agents.toLocaleString()} agents, resilience ${(fTelemetry.resilience * 100).toFixed(2)}%.`);
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

function computeTelemetry(manifest: Manifest, dominanceScore: number) {
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

  const manifestHash = keccak256(toUtf8Bytes(readFileSync(CONFIG_PATH, "utf8")));
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
      ownerOverridesReady: true,
      guardianReviewWindow: manifest.interstellarCouncil.guardianReviewWindow,
      averageCoverageSeconds: averageCoverage,
      minimumCoverageSeconds: minimumCoverage,
      coverageOk,
    },
    energy: {
      capturedGw,
      dysonYield,
      utilisationPct,
      marginPct,
      warnings: energyWarnings,
      regional: regionalEnergy,
      tripleCheck: sumRegionalGw <= capturedGw * 1.001 && dysonYield >= capturedGw,
    },
    compute: {
      totalAgents: manifest.federations.reduce((sum, f) => sum + f.compute.agents, 0),
      totalExaflops: manifest.federations.reduce((sum, f) => sum + f.compute.exaflops, 0),
      regional: manifest.federations.map((f) => ({
        slug: f.slug,
        agents: f.compute.agents,
        exaflops: f.compute.exaflops,
        resilience: f.domains.reduce((acc, domain) => acc + domain.resilience, 0) / f.domains.length,
      })),
      crossChecks: {
        sumAgainstCouncil: Math.abs(
          manifest.federations.reduce((sum, f) => sum + f.compute.exaflops, 0) -
            manifest.dysonProgram.phases.reduce((sum, p) => sum + p.energyYieldGw / 1000, 0)
        ),
      },
    },
    dominance: {
      monthlyValueUSD: totalMonthlyValue,
      averageResilience,
      averageCoverage,
      score: dominanceScore,
    },
    bridges: bridgeTelemetry,
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
  const manifest = loadManifest();
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
  const telemetry = computeTelemetry(manifest, dominanceScore);
  const mermaid = buildMermaid(manifest, dominanceScore);
  const runbook = buildRunbook(manifest, telemetry, dominanceScore);

  const telemetryJson = `${JSON.stringify(telemetry, null, 2)}\n`;
  const safeJson = `${JSON.stringify(safeBatch, null, 2)}\n`;

  const outputs = [
    { path: join(OUTPUT_DIR, "kardashev-telemetry.json"), content: telemetryJson },
    { path: join(OUTPUT_DIR, "kardashev-safe-transaction-batch.json"), content: safeJson },
    { path: join(OUTPUT_DIR, "kardashev-mermaid.mmd"), content: `${mermaid}\n` },
    { path: join(OUTPUT_DIR, "kardashev-orchestration-report.md"), content: `${runbook}\n` },
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
    const anyFailures = [
      telemetry.manifest.manifestoHashMatches,
      telemetry.manifest.planHashMatches,
      telemetry.governance.coverageOk,
      telemetry.energy.tripleCheck,
      ...Object.values(telemetry.bridges).map((b: any) => b.withinFailsafe),
    ].some((flag) => !flag);
    if (anyFailures) {
      console.error("❌ Reflection checks failed. Resolve before deploying.");
      process.exit(1);
    }
  }
}

run();
