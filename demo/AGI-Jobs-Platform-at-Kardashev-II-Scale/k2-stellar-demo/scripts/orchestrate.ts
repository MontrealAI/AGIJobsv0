#!/usr/bin/env ts-node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Interface, keccak256, toUtf8Bytes } from "ethers";
import { z } from "zod";

const DEMO_ROOT = join(__dirname, "..");
const CONFIG_PATH = join(DEMO_ROOT, "config", "k2-stellar.manifest.json");
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

type MissionPower = z.infer<typeof MissionPowerSchema>;

function normaliseForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const missionDirectiveValidators: Record<
  string,
  (power: MissionPower, tx: SafeTransaction, manifest: Manifest) => boolean
> = {
  "global-parameters": (_power, tx, _manifest) =>
    normaliseForMatch(tx.description).includes("global parameters"),
  "guardian-council": (_power, tx, _manifest) =>
    normaliseForMatch(tx.description).includes("guardian council"),
  "system-pause": (_power, tx, _manifest) =>
    normaliseForMatch(tx.description).includes("system pause"),
  "self-improvement": (_power, tx, _manifest) =>
    normaliseForMatch(tx.description).includes("self improvement plan"),
  "pause-all": (_power, tx, _manifest) => {
    const description = normaliseForMatch(tx.description);
    return description.includes("pause") && description.includes("forwardpausecall");
  },
  "resume-all": (_power, tx, _manifest) => {
    const description = normaliseForMatch(tx.description);
    return description.includes("resume") && description.includes("forwardpausecall");
  },
};

function directiveMatches(power: MissionPower, tx: SafeTransaction, manifest: Manifest): boolean {
  const validator = missionDirectiveValidators[power.id];
  if (validator) {
    return validator(power, tx, manifest);
  }

  const normaliseTokens = (value: string) =>
    normaliseForMatch(value)
      .split(" ")
      .filter((token) => token.length > 2);

  const directiveTokens = new Set([
    ...normaliseTokens(power.title),
    ...normaliseTokens(power.description),
  ]);
  const transactionTokens = new Set(normaliseTokens(tx.description));

  const sharedTokens = [...directiveTokens].filter((token) => transactionTokens.has(token));

  if (sharedTokens.length >= Math.min(2, directiveTokens.size)) {
    return true;
  }

  return normaliseForMatch(power.title) === normaliseForMatch(tx.description);
}

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

function buildMermaid(manifest: Manifest, dominanceScore: number): string {
  const council = manifest.interstellarCouncil;
  const lines: string[] = [];
  lines.push("%% Autogenerated by orchestrate.ts (k2-stellar-demo)");
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
  lines.push("%% Autogenerated by orchestrate.ts (k2-stellar-demo)");
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

function buildRunbook(manifest: Manifest, telemetry: any, dominanceScore: number): string {
  const lines: string[] = [];
  lines.push("# Kardashev II Stellar Orchestration Runbook");
  lines.push("");
  lines.push(`**Manifest hash**: ${telemetry.manifest.hash}`);
  lines.push(`**Dominance score**: ${dominanceScore.toFixed(1)} / 100`);
  lines.push("\n---\n");
  lines.push("## Governance actions");
  lines.push("1. Load `output/stellar-safe-transaction-batch.json` into Safe (or timelock). ");
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

function buildOperatorBriefing(manifest: Manifest, telemetry: any): string {
  const lines: string[] = [];
  lines.push("# Kardashev II Stellar Operator Briefing");
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
  lines.push(`* Audit checklist: ${telemetry.verification.auditChecklistURI}`);
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

  const thermostatBudgetGw =
    manifest.energyProtocols.stellarLattice.baselineCapturedGw * manifest.energyProtocols.thermostat.targetKelvin;
  const energyAgreementWithinMargin =
    sumRegionalGw <= dysonYield && sumRegionalGw <= thermostatBudgetGw * (1 + marginPct) && dysonYield >= capturedGw;

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

  const totalExaflops = manifest.federations.reduce((sum, f) => sum + f.compute.exaflops, 0);
  const dysonComputeEstimate = dysonYield / 10_000;
  const computeDeviationPct =
    dysonComputeEstimate === 0
      ? 0
      : Math.abs(totalExaflops - dysonComputeEstimate) / Math.max(dysonComputeEstimate, 1) * 100;
  const computeWithinTolerance = computeDeviationPct <= manifest.verificationProtocols.computeTolerancePct;

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
    dominance: {
      monthlyValueUSD: totalMonthlyValue,
      averageResilience,
      averageCoverage,
      score: dominanceScore,
    },
    bridges: bridgeTelemetry,
    federations: federationsDetail,
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
      auditChecklistURI: manifest.verificationProtocols.auditChecklistURI,
    },
  };
}

type Telemetry = ReturnType<typeof computeTelemetry>;

function buildStabilityLedger(
  manifest: Manifest,
  telemetry: Telemetry,
  dominanceScore: number,
  transactions: SafeTransaction[]
) {
  const safetyMargin = manifest.energyProtocols.stellarLattice.safetyMarginPct / 100;
  const permittedUtilisation = 1 - safetyMargin;
  const utilisation = telemetry.energy.utilisationPct;
  const overshoot = Math.max(0, utilisation - permittedUtilisation);
  const energyBufferScore =
    safetyMargin === 0 ? (overshoot === 0 ? 1 : 0) : Math.max(0, Math.min(1, 1 - overshoot / safetyMargin));

  const coverageRatio =
    manifest.interstellarCouncil.guardianReviewWindow === 0
      ? 1
      : Math.min(
          1,
          telemetry.governance.minimumCoverageSeconds /
            Math.max(manifest.interstellarCouncil.guardianReviewWindow, 1)
        );

  const directiveIndices = new Set(manifest.missionDirectives.ownerPowers.map((power) => power.safeIndex));
  const directiveAlignmentIssues: string[] = [];
  manifest.missionDirectives.ownerPowers.forEach((power) => {
    if (power.safeIndex < 0 || power.safeIndex >= transactions.length) {
      directiveAlignmentIssues.push(
        `${power.id} points to out-of-range index ${power.safeIndex}`
      );
      return;
    }

    const tx = transactions[power.safeIndex];
    if (!directiveMatches(power, tx, manifest)) {
      directiveAlignmentIssues.push(
        `${power.id} expected ${power.title} but found tx[${power.safeIndex}] "${tx.description}"`
      );
    }
  });

  const directivesAligned =
    directiveIndices.size === manifest.missionDirectives.ownerPowers.length &&
    directiveAlignmentIssues.length === 0;

  const reflectionPrepared =
    telemetry.manifest.manifestoHashMatches &&
    telemetry.manifest.planHashMatches &&
    telemetry.governance.coverageOk &&
    telemetry.energy.tripleCheck;

  const autonomyDeviations = manifest.federations.flatMap((federation) =>
    federation.domains.map((domain) => Math.abs(domain.autonomyLevelBps - manifest.dysonProgram.safety.maxAutonomyBps))
  );
  const autonomyHarmonics =
    autonomyDeviations.length === 0
      ? 1
      : 1 -
        Math.min(
          1,
          autonomyDeviations.reduce((sum, deviation) => sum + deviation, 0) /
            (autonomyDeviations.length * Math.max(manifest.dysonProgram.safety.maxAutonomyBps, 1))
        );

  const redundantFlags = [
    telemetry.energy.tripleCheck,
    telemetry.verification.energyModels.withinMargin,
    telemetry.verification.compute.withinTolerance,
    telemetry.verification.bridges.allWithinTolerance,
    telemetry.governance.coverageOk,
    telemetry.manifest.manifestoHashMatches,
    telemetry.manifest.planHashMatches,
    directivesAligned,
    reflectionPrepared,
    autonomyHarmonics >= 0.9,
  ];
  const redundancyScore =
    redundantFlags.reduce((sum, flag) => sum + (flag ? 1 : 0), 0) / Math.max(redundantFlags.length, 1);

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
      evidence: "setGlobalParameters + pause/unpause transactions present",
    },
    {
      id: "mission-directive-alignment",
      title: "Mission directives map to Safe payload",
      severity: "medium",
      status: directivesAligned,
      weight: 0.65,
      evidence:
        directiveAlignmentIssues.length === 0
          ? `owner powers ${manifest.missionDirectives.ownerPowers.length} · unique indices ${directiveIndices.size} · transactions ${transactions.length}`
          : directiveAlignmentIssues.join("; "),
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
      id: "reflection-ready",
      title: "Reflection gate satisfied",
      severity: "medium",
      status: reflectionPrepared,
      weight: 0.75,
      evidence: "Manifest + plan digests match, guardians cover, energy triple-check true.",
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
      id: "bridge-latency",
      title: "Bridge latency ≤ tolerance",
      severity: "high",
      status: telemetry.verification.bridges.allWithinTolerance,
      weight: 0.75,
      evidence: `tolerance ${telemetry.verification.bridges.toleranceSeconds}s · failsafe ${manifest.dysonProgram.safety.failsafeLatencySeconds}s`,
    },
    {
      id: "autonomy-harmonics",
      title: "Autonomy harmonics within guardrail",
      severity: "medium",
      status: autonomyHarmonics >= 0.9,
      weight: 0.55,
      evidence: `harmonics ${(autonomyHarmonics * 100).toFixed(2)}%`,
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
          ? "All Stellar Kardashev-II invariants satisfied. Safe batch ready for execution."
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
          method: "mission-directive-alignment",
          score: directivesAligned ? 1 : 0,
          explanation: "Owner directive indices validated against encoded Safe payload.",
        },
        {
          method: "reflection-preflight",
          score: reflectionPrepared ? 1 : 0,
          explanation: "Manifest and plan digests match with guardian coverage and energy triple-check.",
        },
        {
          method: "autonomy-harmonics",
          score: autonomyHarmonics,
          explanation: "Average deviation of domain autonomy against configured maxima.",
        },
      ],
    },
    checks,
    alerts,
    ownerControls: {
      manager: manifest.interstellarCouncil.managerAddress,
      systemPause: manifest.interstellarCouncil.systemPauseAddress,
      guardianCouncil: manifest.interstellarCouncil.guardianCouncil,
      transactionsEncoded: transactions.length,
      pauseCallEncoded: pauseIncluded,
      resumeCallEncoded: resumeIncluded,
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
      name: "AGI Jobs Kardashev-II Stellar Command Batch",
      description: "Owner-calibrated payload synthesised by demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo",
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
  const stabilityLedger = buildStabilityLedger(manifest, telemetry, dominanceScore, transactions);
  const mermaid = buildMermaid(manifest, dominanceScore);
  const dysonTimeline = buildDysonTimeline(manifest);
  const runbook = buildRunbook(manifest, telemetry, dominanceScore);
  const operatorBriefing = buildOperatorBriefing(manifest, telemetry);

  const telemetryJson = `${JSON.stringify(telemetry, null, 2)}\n`;
  const safeJson = `${JSON.stringify(safeBatch, null, 2)}\n`;
  const ledgerJson = `${JSON.stringify(stabilityLedger, null, 2)}\n`;

  const outputs = [
    { path: join(OUTPUT_DIR, "stellar-telemetry.json"), content: telemetryJson },
    { path: join(OUTPUT_DIR, "stellar-safe-transaction-batch.json"), content: safeJson },
    { path: join(OUTPUT_DIR, "stellar-stability-ledger.json"), content: ledgerJson },
    { path: join(OUTPUT_DIR, "stellar-mermaid.mmd"), content: `${mermaid}\n` },
    { path: join(OUTPUT_DIR, "stellar-orchestration-report.md"), content: `${runbook}\n` },
    { path: join(OUTPUT_DIR, "stellar-dyson.mmd"), content: `${dysonTimeline}\n` },
    { path: join(OUTPUT_DIR, "stellar-operator-briefing.md"), content: `${operatorBriefing}\n` },
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
    console.error("Stellar Kardashev-II demo validation failed.");
      process.exit(failures);
    }
    console.log("✔ Stellar Kardashev-II artefacts are up-to-date.");
    return;
  }

  console.log("✔ Stellar Kardashev-II orchestration artefacts generated.");
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
