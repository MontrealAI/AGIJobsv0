#!/usr/bin/env ts-node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { crossVerifyMetrics } from "./run-phase8-demo";

const ROOT = join(__dirname, "..", "config", "universal.value.manifest.json");
const HTML = join(__dirname, "..", "index.html");
const README = join(__dirname, "..", "README.md");
const OUTPUT_DIR = join(__dirname, "..", "output");
const SCORECARD = join(OUTPUT_DIR, "phase8-dominance-scorecard.json");
const DIRECTIVES = join(OUTPUT_DIR, "phase8-governance-directives.md");
const CHECKLIST = join(OUTPUT_DIR, "phase8-governance-checklist.md");
const EMERGENCY = join(OUTPUT_DIR, "phase8-emergency-overrides.json");
const CALLDATA_MANIFEST = join(OUTPUT_DIR, "phase8-governance-calldata.json");
const GUARDIAN_PLAYBOOK = join(OUTPUT_DIR, "phase8-guardian-response-playbook.md");
const AI_TEAM_MATRIX = join(OUTPUT_DIR, "phase8-ai-team-matrix.json");
const OWNER_BATCH = join(OUTPUT_DIR, "phase8-owner-batch.json");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SEVERITY_WEIGHTS: Record<string, number> = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 };

function severityDescriptor(score: number): string {
  if (score >= 0.875) return "CRITICAL";
  if (score >= 0.65) return "HIGH";
  if (score >= 0.45) return "MEDIUM";
  return "LOW";
}

const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => value.toLowerCase());

const domainSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  metadataURI: z.string().min(1),
  orchestrator: address,
  capitalVault: address,
  validatorModule: address,
  policyKernel: address,
  heartbeatSeconds: z.number().int().positive(),
  tvlLimit: z.string().min(1),
  autonomyLevelBps: z.number().int().min(0).max(10_000),
  skillTags: z.array(z.string()).optional(),
  resilienceIndex: z.number().min(0),
  valueFlowMonthlyUSD: z.number().min(0),
  autonomyNarrative: z.string().optional(),
  active: z.boolean(),
});

const sentinelSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  agent: address,
  coverageSeconds: z.number().int().positive(),
  sensitivityBps: z.number().int().min(0).max(10_000),
  domains: z.array(z.string()).default([]),
  active: z.boolean(),
});

const streamSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  vault: address,
  annualBudget: z.number().min(0),
  expansionBps: z.number().int().min(0).max(10_000),
  domains: z.array(z.string()).default([]),
  active: z.boolean(),
});

const guardianProtocolSchema = z.object({
  scenario: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  trigger: z.string().min(1),
  linkedSentinels: z.array(z.string()).default([]),
  linkedDomains: z.array(z.string()).default([]),
  immediateActions: z.array(z.string().min(1)).min(1),
  stabilizationActions: z.array(z.string().min(1)).min(1),
  communications: z.array(z.string().min(1)).min(1),
  successCriteria: z.array(z.string().min(1)).optional(),
});

const autonomySchema = z.object({
  session: z.object({
    maxHours: z.number().positive(),
    contextWindowTokens: z.number().int().positive(),
    checkpointCadenceMinutes: z.number().int().positive(),
    memoryBacking: z.string().min(1),
    environment: z.string().min(1),
    persistence: z.string().min(1),
  }),
  persistentExecution: z
    .object({
      runtime: z.string().min(1),
      image: z.string().min(1),
      resources: z
        .object({
          cpu: z.string().optional(),
          memory: z.string().optional(),
          storage: z.string().optional(),
        })
        .optional(),
      stateMount: z.string().optional(),
    })
    .optional(),
  progressCheckpoints: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        intervalMinutes: z.number().int().positive(),
        outputs: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  memoryStrategy: z.string().min(1),
});

const aiSpecialistSchema = z.object({
  role: z.string().min(1),
  agent: address,
  model: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  contextWindowTokens: z.number().int().positive(),
  maxAutonomyMinutes: z.number().int().positive(),
});

const aiTeamSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  mission: z.string().min(1),
  leadAgent: address,
  leadModel: z.string().min(1),
  collaborationProtocol: z.string().min(1),
  memoryChannel: z.string().optional(),
  escalationContact: z.string().optional(),
  cadenceMinutes: z.number().int().positive(),
  domains: z.array(z.string()).default([]),
  specialists: z.array(aiSpecialistSchema).default([]),
});

const safetySchema = z.object({
  autonomyThresholdMinutes: z.number().int().positive(),
  checkInCadenceMinutes: z.number().int().positive(),
  logging: z
    .object({
      sinks: z
        .array(
          z.object({
            name: z.string().min(1),
            target: z.string().min(1),
            retentionDays: z.number().int().positive(),
            piiHandling: z.string().optional(),
          }),
        )
        .default([]),
      traceSampling: z.number().min(0).max(1),
      auditConsole: z.string().optional(),
    })
    .default({ sinks: [], traceSampling: 0 }),
  tripwires: z
    .array(
      z.object({
        name: z.string().min(1),
        trigger: z.string().min(1),
        action: z.string().min(1),
        severity: z.enum(["critical", "high", "medium", "low"]),
      }),
    )
    .default([]),
  validatorConsoles: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().min(1),
        capabilities: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const economySchema = z.object({
  stakeTiers: z
    .array(
      z.object({
        name: z.string().min(1),
        durationHours: z.number().int().positive(),
        minimumStake: z.string().min(1),
        slashMultiplier: z.number().positive(),
      }),
    )
    .default([]),
  milestoneTemplates: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        payoutBps: z.number().int().min(0).max(10_000),
      }),
    )
    .default([]),
  budgetCaps: z
    .object({
      maxComputeUSD: z.number().min(0),
      maxApiSpendUSD: z.number().min(0),
      maxTokenSpendUSD: z.number().min(0),
    })
    .optional(),
  rewardCurves: z
    .object({
      longTaskBonusBps: z.number().int().min(0).max(10_000),
      validatorPremiumBps: z.number().int().min(0).max(10_000),
    })
    .optional(),
});

const modelSchema = z.object({
  adapters: z
    .array(
      z.object({
        name: z.string().min(1),
        provider: z.string().min(1),
        modality: z.string().min(1),
        maxContextTokens: z.number().int().positive(),
        costPer1kTokensUSD: z.number().min(0),
        strengths: z.array(z.string()).default([]),
        evalScore: z.number().min(0).max(100).optional(),
      }),
    )
    .default([]),
  evaluationCadenceHours: z.number().int().positive(),
  evaluationBenchmarks: z.array(z.string()).default([]),
  dynamicRouting: z
    .object({
      strategy: z.string().min(1),
      metrics: z.array(z.string()).default([]),
    })
    .optional(),
  safetyTests: z
    .array(
      z.object({
        name: z.string().min(1),
        frequencyHours: z.number().int().positive(),
      }),
    )
    .default([]),
});

const governanceSchema = z.object({
  interface: z.string().min(1),
  validatorTools: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().min(1),
        capabilities: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  proposalTemplates: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        executionEtaHours: z.number().int().positive(),
      }),
    )
    .default([]),
  humanPolicyControls: z
    .array(
      z.object({
        name: z.string().min(1),
        requirement: z.string().min(1),
        enforcement: z.string().min(1),
      }),
    )
    .default([]),
});

const planSchema = z
  .object({
    planURI: z.string().min(1),
    planHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    cadenceSeconds: z.number().int().positive(),
    lastExecutedAt: z.number().int().min(0),
    lastReportURI: z.string().default(""),
  })
  .refine((value) => value.lastExecutedAt === 0 || value.lastReportURI.length > 0, {
    message: "selfImprovement.plan.lastReportURI required when lastExecutedAt > 0",
  });

const configSchema = z.object({
  global: z.object({
    treasury: address,
    universalVault: address,
    upgradeCoordinator: address,
    validatorRegistry: address,
    missionControl: address,
    knowledgeGraph: address,
    guardianCouncil: address,
    systemPause: address,
    phase8Manager: address,
    heartbeatSeconds: z.number().int().positive(),
    guardianReviewWindow: z.number().int().positive(),
    maxDrawdownBps: z.number().int().min(0).max(10_000),
    manifestoURI: z.string().min(1),
  }),
  domains: z.array(domainSchema).min(1),
  sentinels: z.array(sentinelSchema).min(1),
  capitalStreams: z.array(streamSchema).min(1),
  guardianProtocols: z.array(guardianProtocolSchema).min(1),
  selfImprovement: z.object({
    plan: planSchema,
    playbooks: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().min(1),
          owner: address,
          automation: z.string().min(1),
          guardrails: z.array(z.string()).min(1),
        }),
      )
      .min(1),
    autonomyGuards: z.object({
      maxAutonomyBps: z.number().int().min(0).max(10_000),
      humanOverrideMinutes: z.number().int().min(1),
      pausable: z.boolean(),
      escalationChannels: z.array(z.string()).min(1),
    }),
    guardrails: z.object({
      checksum: z.object({
        algorithm: z.string().min(1),
        value: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      }),
      zkProof: z.object({
        circuit: z.string().min(1),
        artifactURI: z.string().min(1),
        status: z.enum(["pending", "verified", "disabled"]),
        notes: z.string().optional(),
      }),
    }),
  }),
  autonomy: autonomySchema.optional(),
  aiTeams: z.array(aiTeamSchema).default([]),
  safety: safetySchema.optional(),
  economy: economySchema.optional(),
  models: modelSchema.optional(),
  governance: governanceSchema.optional(),
}).passthrough();

function main() {
  const configRaw = JSON.parse(readFileSync(ROOT, "utf-8"));
  const config = configSchema.parse(configRaw);
  const { metrics: telemetryMetrics, crossCheck } = crossVerifyMetrics(config);

  if (config.global.phase8Manager === ZERO_ADDRESS) {
    throw new Error("global.phase8Manager must be a non-zero address to stage emergency overrides");
  }

  const slugs = new Set<string>();
  for (const domain of config.domains) {
    const slug = domain.slug.toLowerCase();
    if (slugs.has(slug)) {
      throw new Error(`Duplicate domain slug detected: ${slug}`);
    }
    slugs.add(slug);
  }

  const sentinelSlugs = new Set<string>();
  const sentinelDomains = new Set<string>();
  const domainCoverage = new Map<string, number>();
  const domainList = config.domains.map((domain) => domain.slug.toLowerCase());
  for (const sentinel of config.sentinels) {
    const slug = sentinel.slug.toLowerCase();
    if (sentinelSlugs.has(slug)) {
      throw new Error(`Duplicate sentinel slug detected: ${slug}`);
    }
    sentinelSlugs.add(slug);
    const sentinelDomainSlugs = (sentinel.domains ?? []).map((domain) => domain.toLowerCase());
    const targets = sentinelDomainSlugs.length > 0 ? sentinelDomainSlugs : domainList;
    for (const domain of targets) {
      if (!slugs.has(domain)) {
        throw new Error(`Sentinel ${sentinel.slug} references unknown domain ${domain}`);
      }
      sentinelDomains.add(domain);
      domainCoverage.set(domain, (domainCoverage.get(domain) ?? 0) + sentinel.coverageSeconds);
    }
  }

  const uncoveredDomains = config.domains.filter((domain) => !sentinelDomains.has(domain.slug.toLowerCase()));
  if (uncoveredDomains.length > 0) {
    const list = uncoveredDomains.map((domain) => domain.slug).join(", ");
    throw new Error(`All domains require sentinel coverage — missing: ${list}`);
  }

  const teamSlugs = new Set<string>();
  for (const team of config.aiTeams) {
    const slug = team.slug.toLowerCase();
    if (teamSlugs.has(slug)) {
      throw new Error(`Duplicate AI team slug detected: ${slug}`);
    }
    teamSlugs.add(slug);
    for (const domain of team.domains ?? []) {
      if (!slugs.has(domain.toLowerCase())) {
        throw new Error(`AI team ${team.slug} references unknown domain ${domain}`);
      }
    }
  }

  if (config.autonomy) {
    const sessionMinutes = config.autonomy.session.maxHours * 60;
    if (config.safety && sessionMinutes > config.safety.autonomyThresholdMinutes * 2) {
      throw new Error(
        `Autonomy session maxHours (${config.autonomy.session.maxHours}) exceeds double safety threshold (${config.safety.autonomyThresholdMinutes})`,
      );
    }
  }

  if (config.economy?.stakeTiers?.length) {
    const durations = config.economy.stakeTiers.map((tier) => tier.durationHours);
    for (let i = 1; i < durations.length; i += 1) {
      if (durations[i] < durations[i - 1]) {
        throw new Error("economy.stakeTiers must be sorted by durationHours ascending");
      }
    }
  }

  if (config.models && config.models.adapters.length === 0) {
    throw new Error("models.adapters must contain at least one adapter");
  }

  const streamSlugs = new Set<string>();
  for (const stream of config.capitalStreams) {
    const slug = stream.slug.toLowerCase();
    if (streamSlugs.has(slug)) {
      throw new Error(`Duplicate capital stream slug detected: ${slug}`);
    }
    streamSlugs.add(slug);
    for (const domain of stream.domains ?? []) {
      const normalized = domain.toLowerCase();
      if (!slugs.has(normalized)) {
        throw new Error(`Capital stream ${stream.slug} references unknown domain ${domain}`);
      }
    }
  }

  const streamCoverage = new Map<string, number>();
  for (const stream of config.capitalStreams) {
    const budget = Number(stream.annualBudget ?? 0);
    if (!Number.isFinite(budget) || budget <= 0) continue;
    const targets = (stream.domains ?? []).map((domain) => domain.toLowerCase());
    const normalizedTargets = targets.length > 0 ? targets : Array.from(slugs.values());
    for (const domain of normalizedTargets) {
      if (!slugs.has(domain)) continue;
      streamCoverage.set(domain, (streamCoverage.get(domain) ?? 0) + budget);
    }
  }
  const unfunded = Array.from(slugs.values()).filter((slug) => (streamCoverage.get(slug) ?? 0) <= 0);
  if (unfunded.length > 0) {
    throw new Error(`All domains require capital stream funding — missing: ${unfunded.join(", ")}`);
  }

  const protocolCoverage = new Map<string, number>();
  let protocolSeverityTotal = 0;
  for (const [index, protocol] of config.guardianProtocols.entries()) {
    const sentinelRefs = new Set((protocol.linkedSentinels ?? []).map((slug) => slug.toLowerCase()).filter(Boolean));
    for (const sentinel of sentinelRefs) {
      if (!config.sentinels.some((entry) => entry.slug.toLowerCase() === sentinel)) {
        throw new Error(`Guardian protocol ${protocol.scenario} references unknown sentinel ${sentinel} (index ${index})`);
      }
    }

    const domainRefs = new Set((protocol.linkedDomains ?? []).map((slug) => slug.toLowerCase()).filter(Boolean));
    if (sentinelRefs.size === 0 && domainRefs.size === 0) {
      throw new Error(`Guardian protocol ${protocol.scenario} must target at least one sentinel or domain`);
    }

    const targets = domainRefs.size > 0 ? Array.from(domainRefs.values()) : domainList;
    for (const domain of targets) {
      if (!slugs.has(domain)) {
        throw new Error(`Guardian protocol ${protocol.scenario} references unknown domain ${domain}`);
      }
      protocolCoverage.set(domain, (protocolCoverage.get(domain) ?? 0) + 1);
    }

    protocolSeverityTotal += SEVERITY_WEIGHTS[protocol.severity] ?? 0.5;
  }

  const unprotected = domainList.filter((slug) => (protocolCoverage.get(slug) ?? 0) === 0);
  if (unprotected.length > 0) {
    throw new Error(`All domains require guardian response coverage — missing protocols for: ${unprotected.join(", ")}`);
  }

  const protocolCoveragePercent = domainList.length === 0 ? 0 : (protocolCoverage.size / domainList.length) * 100;
  const protocolSeverityScore = config.guardianProtocols.length === 0 ? 0 : protocolSeverityTotal / config.guardianProtocols.length;
  const protocolSeverityLevel = severityDescriptor(protocolSeverityScore);

  const sentinelCoverage = config.sentinels.reduce((acc, s) => acc + s.coverageSeconds, 0);
  if (sentinelCoverage < config.global.guardianReviewWindow) {
    throw new Error(
      `Sentinel coverage ${sentinelCoverage}s must exceed guardian review window ${config.global.guardianReviewWindow}s`,
    );
  }

  const guardianWindow = config.global.guardianReviewWindow;
  if (guardianWindow > 0) {
    if (domainList.length !== config.domains.length) {
      // Defer to slug validation errors before enforcing coverage-specific diagnostics.
      return;
    }

    const insufficient = domainList.filter((domain) => (domainCoverage.get(domain) ?? 0) < guardianWindow);
    if (insufficient.length > 0) {
      const formatted = insufficient.join(", ");
      throw new Error(`Domains below guardian window ${guardianWindow}s: ${formatted}`);
    }
  }

  const manualMinimumCoverage = domainList.length === 0 ? 0 : Math.min(...domainList.map((slug) => domainCoverage.get(slug) ?? 0));
  if (Math.abs(manualMinimumCoverage - crossCheck.minDomainCoverageSeconds) > 1e-6) {
    throw new Error("Manual sentinel coverage map diverges from cross-verified metrics.");
  }
  if (Math.abs(sentinelCoverage / 60 - crossCheck.guardianCoverageMinutes) > 1e-6) {
    throw new Error("Sentinel coverage minutes mismatch against cross-verified metrics.");
  }
  const manualCoverageRatio = domainList.length === 0 ? 0 : (sentinelDomains.size / domainList.length) * 100;
  if (Math.abs(manualCoverageRatio - crossCheck.coverageRatioPercent) > 1e-6) {
    throw new Error("Sentinel coverage ratio mismatch against cross-verified metrics.");
  }
  const manualFundedRatio =
    domainList.length === 0
      ? 0
      : (Array.from(streamCoverage.entries()).filter(([, budget]) => budget > 0).length / domainList.length) * 100;
  if (Math.abs(manualFundedRatio - crossCheck.fundedDomainRatioPercent) > 1e-6) {
    throw new Error("Capital funding ratio mismatch against cross-verified metrics.");
  }
  for (const slug of domainList) {
    const manualFunding = streamCoverage.get(slug) ?? 0;
    const telemetryFunding = Number(crossCheck.domainFundingMap?.[slug] ?? 0);
    if (Math.abs(manualFunding - telemetryFunding) > 1e-6) {
      throw new Error(`Capital funding ledger mismatch for domain ${slug}`);
    }
  }
  if (Math.abs(protocolCoveragePercent - crossCheck.guardianProtocolCoverageRatio) > 1e-6) {
    throw new Error("Guardian protocol coverage mismatch against cross-verified metrics.");
  }
  if (Math.abs(protocolSeverityScore - crossCheck.guardianProtocolSeverityScore) > 1e-6) {
    throw new Error("Guardian protocol severity mismatch against cross-verified metrics.");
  }

  if (telemetryMetrics.minimumCoverageAdequacy < 1) {
    throw new Error("Telemetry metrics indicate guardian coverage adequacy below 100%.");
  }

  const html = readFileSync(HTML, "utf-8");
  if (!html.includes("Phase 8")) {
    throw new Error("index.html must mention Phase 8 to guide operators");
  }
  if (!html.includes("mermaid")) {
    throw new Error("index.html must embed a mermaid diagram placeholder");
  }
  if (!html.includes('id="mermaid-diagram"')) {
    throw new Error("index.html must provide a mermaid container with id=\"mermaid-diagram\"");
  }

  const readme = readFileSync(README, "utf-8");
  const requiredSections = ["Quickstart", "Smart contract", "Mermaid", "Self-improvement"];
  for (const section of requiredSections) {
    if (!readme.toLowerCase().includes(section.toLowerCase())) {
      throw new Error(`README missing required section: ${section}`);
    }
  }
  if (!readme.includes("```mermaid")) {
    throw new Error("README must include a mermaid code block for the architecture blueprint");
  }

  if (!existsSync(CALLDATA_MANIFEST)) {
    throw new Error(
      "Governance calldata manifest missing. Run npm run demo:phase8:orchestrate to regenerate outputs.",
    );
  }
  const calldataRaw = JSON.parse(readFileSync(CALLDATA_MANIFEST, "utf-8"));
  if (!Array.isArray(calldataRaw?.calls) || calldataRaw.calls.length === 0) {
    throw new Error("Governance calldata manifest must include at least one call entry.");
  }
  if (typeof calldataRaw.managerAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(calldataRaw.managerAddress)) {
    throw new Error("Governance calldata manifest must specify managerAddress hex string.");
  }
  if (
    calldataRaw.chainId === undefined ||
    (typeof calldataRaw.chainId !== "number" && typeof calldataRaw.chainId !== "string")
  ) {
    throw new Error("Governance calldata manifest must specify numeric chainId.");
  }
  const calldataLabels = new Set<string>();
  for (const entry of calldataRaw.calls) {
    if (!entry?.data || typeof entry.data !== "string" || !/^0x[a-fA-F0-9]+$/.test(entry.data)) {
      throw new Error("Governance calldata entries must include hex encoded data.");
    }
    if (entry?.label) {
      calldataLabels.add(String(entry.label));
    }
  }
  const requiredCalldataLabels = [
    "setGlobalParameters",
    "setGuardianCouncil",
    "setSystemPause",
    "registerDomain",
    "registerSentinel",
    "registerCapitalStream",
    "setSentinelDomains",
    "setCapitalStreamDomains",
    "setSelfImprovementPlan",
  ];
  for (const label of requiredCalldataLabels) {
    if (!calldataLabels.has(label)) {
      throw new Error(`Governance calldata manifest missing required label: ${label}`);
    }
  }

  const requiredArtifacts = [
    "phase8-governance-calldata.json",
    "phase8-safe-transaction-batch.json",
    "phase8-telemetry-report.md",
    "phase8-mermaid-diagram.mmd",
    "phase8-orchestration-report.txt",
    "phase8-governance-directives.md",
    "phase8-governance-checklist.md",
    "phase8-self-improvement-plan.json",
    "phase8-cycle-report.csv",
    "phase8-dominance-scorecard.json",
    "phase8-emergency-overrides.json",
    "phase8-guardian-response-playbook.md",
  ];
  for (const artifact of requiredArtifacts) {
    if (!readme.includes(artifact)) {
      throw new Error(`README must describe exported artifact ${artifact}`);
    }
  }

  if (!existsSync(DIRECTIVES)) {
    throw new Error("Governance directives file missing. Run npm run demo:phase8:orchestrate to regenerate outputs.");
  }
  const directives = readFileSync(DIRECTIVES, "utf-8");
  if (!directives.includes("Immediate directives") || !directives.includes("Oversight priorities")) {
    throw new Error("Governance directives must include Immediate directives and Oversight priorities sections.");
  }

  if (!existsSync(CHECKLIST)) {
    throw new Error("Governance checklist file missing. Run npm run demo:phase8:orchestrate to regenerate outputs.");
  }
  const checklist = readFileSync(CHECKLIST, "utf-8");
  if (!checklist.includes("Governance Execution Checklist") || !checklist.includes("Execution order")) {
    throw new Error("Governance checklist must include Execution order guidance for guardians.");
  }

  if (!existsSync(SCORECARD)) {
    throw new Error("Dominance scorecard file missing. Run npm run demo:phase8:orchestrate to regenerate outputs.");
  }
  const scorecardRaw = JSON.parse(readFileSync(SCORECARD, "utf-8"));
  if (typeof scorecardRaw?.metrics?.dominanceScore !== "number") {
    throw new Error("Dominance scorecard must include metrics.dominanceScore numeric field.");
  }
  if (!Array.isArray(scorecardRaw?.domains) || scorecardRaw.domains.length === 0) {
    throw new Error("Dominance scorecard must include at least one domain entry.");
  }
  if (!scorecardRaw?.chain?.manager) {
    throw new Error("Dominance scorecard must specify chain.manager to guide multisig routing.");
  }

  if (!existsSync(OWNER_BATCH)) {
    throw new Error("Owner command batch missing. Run npm run demo:phase8:owner-console to regenerate owner calldata.");
  }
  const ownerBatchRaw = JSON.parse(readFileSync(OWNER_BATCH, "utf-8"));
  if (!Array.isArray(ownerBatchRaw?.transactions) || ownerBatchRaw.transactions.length === 0) {
    throw new Error("Owner command batch must include at least one transaction entry.");
  }
  ownerBatchRaw.transactions.forEach((tx: unknown, index: number) => {
    const entry = tx as { to?: string; data?: string; description?: string };
    if (!entry?.to || !/^0x[a-fA-F0-9]{40}$/.test(entry.to)) {
      throw new Error(`Owner batch transaction #${index} missing valid 'to' address.`);
    }
    if (!entry?.data || typeof entry.data !== "string" || !/^0x[a-fA-F0-9]+$/.test(entry.data)) {
      throw new Error(`Owner batch transaction #${index} missing hex calldata.`);
    }
    if (!entry?.description) {
      throw new Error(`Owner batch transaction #${index} requires a human-readable description.`);
    }
  });
  if (!ownerBatchRaw?.manifestHash || !/^0x[a-fA-F0-9]{64}$/.test(ownerBatchRaw.manifestHash)) {
    throw new Error("Owner batch must embed a manifestHash to prove provenance.");
  }
  if (!ownerBatchRaw?.analytics?.score) {
    throw new Error("Owner batch analytics must include the dominance score snapshot.");
  }
  const batchManager = ownerBatchRaw?.manager ? String(ownerBatchRaw.manager).toLowerCase() : null;
  if (batchManager !== config.global.phase8Manager.toLowerCase()) {
    throw new Error("Owner batch manager mismatch — regenerate calldata to keep addresses in sync.");
  }

  const approxEqual = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

  const computeDominanceScore = () => {
    const totalMonthlyUSD = config.domains.reduce((acc, domain) => acc + Number(domain.valueFlowMonthlyUSD ?? 0), 0);
    const averageResilience =
      config.domains.reduce((acc, domain) => acc + Number(domain.resilienceIndex ?? 0), 0) /
      Math.max(1, config.domains.length);
    const coverageRatio = sentinelDomains.size / Math.max(1, config.domains.length);
    const averageDomainCoverage =
      Array.from(domainCoverage.values()).reduce((acc, value) => acc + value, 0) /
      Math.max(1, domainCoverage.size || config.domains.length);
    const maxDomainAutonomy = Math.max(...config.domains.map((domain) => domain.autonomyLevelBps));

    const cadenceSeconds = config.selfImprovement.plan.cadenceSeconds;
    const valueScore = totalMonthlyUSD <= 0 ? 0 : Math.min(1, totalMonthlyUSD / 500_000_000_000);
    const resilienceScore = Math.max(0, Math.min(1, averageResilience));
    const coverageRatioScore = coverageRatio <= 0 ? 0 : Math.min(1, coverageRatio);
    const coverageStrengthScore =
      guardianWindow > 0 ? Math.min(1, averageDomainCoverage / guardianWindow) : 1;
    const coverageScore = Math.min(1, (coverageRatioScore + coverageStrengthScore) / 2);
    const autonomyScore =
      config.selfImprovement.autonomyGuards.maxAutonomyBps > 0
        ? Math.min(1, maxDomainAutonomy / config.selfImprovement.autonomyGuards.maxAutonomyBps)
        : 1;
    const cadenceScore =
      cadenceSeconds > 0 ? Math.max(0, 1 - Math.min(1, cadenceSeconds / (24 * 60 * 60))) : 0.5;

    const weighted =
      0.3 * valueScore +
      0.25 * resilienceScore +
      0.2 * coverageScore +
      0.15 * autonomyScore +
      0.1 * cadenceScore;
    return Math.min(100, Math.round(weighted * 1000) / 10);
  };

  const expectedMonthlyValue = config.domains.reduce((acc, domain) => acc + domain.valueFlowMonthlyUSD, 0);
  if (!approxEqual(Number(scorecardRaw.metrics.monthlyValueUSD ?? 0), expectedMonthlyValue, 1)) {
    throw new Error("Dominance scorecard monthly value mismatch with manifest.");
  }

  const expectedAnnualBudget = config.capitalStreams.reduce((acc, stream) => acc + stream.annualBudget, 0);
  if (!approxEqual(Number(scorecardRaw.metrics.annualBudgetUSD ?? 0), expectedAnnualBudget, 1)) {
    throw new Error("Dominance scorecard annual budget mismatch with manifest.");
  }

  const expectedAverageResilience =
    config.domains.reduce((acc, domain) => acc + domain.resilienceIndex, 0) / Math.max(1, config.domains.length);
  if (!approxEqual(Number(scorecardRaw.metrics.averageResilience ?? 0), expectedAverageResilience, 1e-3)) {
    throw new Error("Dominance scorecard average resilience mismatch with manifest.");
  }

  const expectedSentinelCoverageMinutes = sentinelCoverage / 60;
  if (!approxEqual(Number(scorecardRaw.metrics.sentinelCoverageMinutes ?? 0), expectedSentinelCoverageMinutes, 0.25)) {
    throw new Error("Dominance scorecard sentinel coverage minutes mismatch with manifest.");
  }

  const expectedCoverageRatioPercent = Math.round((sentinelDomains.size / Math.max(1, config.domains.length)) * 100);
  if (!approxEqual(Number(scorecardRaw.metrics.coverageRatioPercent ?? 0), expectedCoverageRatioPercent, 0.5)) {
    throw new Error("Dominance scorecard coverage ratio percent mismatch with manifest.");
  }

  const expectedFundedRatioPercent = Math.round(
    (Array.from(streamCoverage.entries()).filter(([, budget]) => budget > 0).length / Math.max(1, config.domains.length)) *
      100,
  );
  if (!approxEqual(Number(scorecardRaw.metrics.fundedDomainRatioPercent ?? 0), expectedFundedRatioPercent, 0.5)) {
    throw new Error("Dominance scorecard funded domain ratio mismatch with manifest.");
  }

  if (!approxEqual(Number(scorecardRaw.metrics.guardianProtocolCount ?? 0), config.guardianProtocols.length, 1e-6)) {
    throw new Error("Dominance scorecard guardian protocol count mismatch with manifest.");
  }

  if (!approxEqual(Number(scorecardRaw.metrics.guardianProtocolCoveragePercent ?? 0), protocolCoveragePercent, 0.5)) {
    throw new Error("Dominance scorecard guardian protocol coverage mismatch with manifest.");
  }

  if (!approxEqual(Number(scorecardRaw.metrics.guardianProtocolSeverityScore ?? 0), protocolSeverityScore, 0.01)) {
    throw new Error("Dominance scorecard guardian protocol severity score mismatch with manifest.");
  }

  if ((scorecardRaw.metrics.guardianProtocolSeverityLevel ?? "").toUpperCase() !== protocolSeverityLevel) {
    throw new Error("Dominance scorecard guardian protocol severity level mismatch with manifest.");
  }

  const expectedMaxAutonomy = Math.max(...config.domains.map((domain) => domain.autonomyLevelBps));
  if (!approxEqual(Number(scorecardRaw.metrics.maxAutonomyBps ?? 0), expectedMaxAutonomy, 1e-6)) {
    throw new Error("Dominance scorecard maximum autonomy mismatch with manifest.");
  }

  const expectedCadenceHours = config.selfImprovement.plan.cadenceSeconds / 3600;
  if (!approxEqual(Number(scorecardRaw.metrics.cadenceHours ?? 0), expectedCadenceHours, 0.01)) {
    throw new Error("Dominance scorecard cadence hours mismatch with manifest.");
  }

  const minimumCoverageSeconds = domainList.length
    ? Math.min(...domainList.map((slug) => domainCoverage.get(slug) ?? 0))
    : 0;
  if (!approxEqual(Number(scorecardRaw.metrics.minimumCoverageSeconds ?? 0), minimumCoverageSeconds, 1e-6)) {
    throw new Error("Dominance scorecard minimum coverage seconds mismatch with manifest.");
  }

  if (!approxEqual(Number(scorecardRaw.metrics.guardianWindowSeconds ?? 0), guardianWindow, 1e-6)) {
    throw new Error("Dominance scorecard guardian window mismatch with manifest.");
  }

  const expectedAdequacy = guardianWindow > 0 ? Math.round((minimumCoverageSeconds / guardianWindow) * 100) : 0;
  if (!approxEqual(Number(scorecardRaw.metrics.minimumCoverageAdequacyPercent ?? 0), expectedAdequacy, 0.5)) {
    throw new Error("Dominance scorecard minimum coverage adequacy mismatch with manifest.");
  }

  const expectedDominanceScore = computeDominanceScore();
  if (!approxEqual(Number(scorecardRaw.metrics.dominanceScore ?? 0), expectedDominanceScore, 0.15)) {
    throw new Error("Dominance scorecard dominance score mismatch with manifest computation.");
  }

  if (scorecardRaw.chain?.manager?.toLowerCase() !== config.global.phase8Manager.toLowerCase()) {
    throw new Error("Dominance scorecard manager address must match manifest global.phase8Manager.");
  }

  const ensureSameStrings = (a: string[] = [], b: string[] = []) => {
    const left = new Set(a.map((value) => value.toLowerCase()));
    const right = new Set(b.map((value) => value.toLowerCase()));
    if (left.size !== right.size) return false;
    for (const value of left) {
      if (!right.has(value)) return false;
    }
    return true;
  };

  const domainBySlug = new Map(config.domains.map((domain) => [domain.slug.toLowerCase(), domain]));
  const sentinelLookup = new Map(config.sentinels.map((sentinel) => [sentinel.slug.toLowerCase(), sentinel]));
  const streamLookup = new Map(config.capitalStreams.map((stream) => [stream.slug.toLowerCase(), stream]));

  const sentinelNamesByDomain = new Map<string, string[]>();
  for (const sentinel of config.sentinels) {
    const domains = sentinel.domains ?? [];
    const targets = domains.length > 0 ? domains : domainList;
    for (const domain of targets) {
      const key = domain.toLowerCase();
      if (!sentinelNamesByDomain.has(key)) {
        sentinelNamesByDomain.set(key, []);
      }
      sentinelNamesByDomain.get(key)!.push(sentinel.name);
    }
  }

  const capitalSupportByDomain = new Map<string, number>();
  for (const stream of config.capitalStreams) {
    const targets = (stream.domains ?? []).map((domain) => domain.toLowerCase());
    const effectiveTargets = targets.length > 0 ? targets : domainList;
    for (const domain of effectiveTargets) {
      if (!capitalSupportByDomain.has(domain)) {
        capitalSupportByDomain.set(domain, 0);
      }
      capitalSupportByDomain.set(domain, (capitalSupportByDomain.get(domain) ?? 0) + stream.annualBudget);
    }
  }

  if (scorecardRaw.domains.length !== config.domains.length) {
    throw new Error("Dominance scorecard domain count mismatch with manifest.");
  }

  for (const scorecardDomain of scorecardRaw.domains) {
    const manifestDomain = domainBySlug.get(String(scorecardDomain.slug ?? "").toLowerCase());
    if (!manifestDomain) {
      throw new Error(`Dominance scorecard references unknown domain ${scorecardDomain.slug}`);
    }

    if (scorecardDomain.name !== manifestDomain.name) {
      throw new Error(`Dominance scorecard name mismatch for domain ${manifestDomain.slug}`);
    }

    if (!approxEqual(Number(scorecardDomain.autonomyLevelBps ?? 0), manifestDomain.autonomyLevelBps, 1e-6)) {
      throw new Error(`Dominance scorecard autonomy mismatch for domain ${manifestDomain.slug}`);
    }

    if (!approxEqual(Number(scorecardDomain.resilienceIndex ?? 0), manifestDomain.resilienceIndex, 1e-3)) {
      throw new Error(`Dominance scorecard resilience mismatch for domain ${manifestDomain.slug}`);
    }

    if (!approxEqual(Number(scorecardDomain.heartbeatSeconds ?? 0), manifestDomain.heartbeatSeconds, 1e-6)) {
      throw new Error(`Dominance scorecard heartbeat mismatch for domain ${manifestDomain.slug}`);
    }

    if (String(scorecardDomain.tvlLimit ?? "") !== manifestDomain.tvlLimit) {
      throw new Error(`Dominance scorecard TVL limit mismatch for domain ${manifestDomain.slug}`);
    }

    if (!approxEqual(Number(scorecardDomain.valueFlowMonthlyUSD ?? 0), manifestDomain.valueFlowMonthlyUSD, 1)) {
      throw new Error(`Dominance scorecard monthly value mismatch for domain ${manifestDomain.slug}`);
    }

    const expectedDomainCoverage = domainCoverage.get(manifestDomain.slug.toLowerCase()) ?? 0;
    if (!approxEqual(Number(scorecardDomain.sentinelCoverageSeconds ?? 0), expectedDomainCoverage, 1)) {
      throw new Error(`Dominance scorecard sentinel coverage mismatch for domain ${manifestDomain.slug}`);
    }

    const sentinelNames = sentinelNamesByDomain.get(manifestDomain.slug.toLowerCase()) ?? [];
    if (!ensureSameStrings(scorecardDomain.sentinelGuardians ?? [], sentinelNames)) {
      throw new Error(`Dominance scorecard sentinel guardian mismatch for domain ${manifestDomain.slug}`);
    }

    const expectedCapitalSupport = capitalSupportByDomain.get(manifestDomain.slug.toLowerCase()) ?? 0;
    if (!approxEqual(Number(scorecardDomain.capitalSupportUSD ?? 0), expectedCapitalSupport, 1)) {
      throw new Error(`Dominance scorecard capital support mismatch for domain ${manifestDomain.slug}`);
    }

    const expectedStreamNames = config.capitalStreams
      .filter((stream) => {
        const targets = (stream.domains ?? []).map((domain) => domain.toLowerCase());
        const normalizedTargets = targets.length > 0 ? targets : domainList;
        return normalizedTargets.includes(manifestDomain.slug.toLowerCase());
      })
      .map((stream) => stream.name);
    if (!ensureSameStrings(scorecardDomain.capitalStreams ?? [], expectedStreamNames)) {
      throw new Error(`Dominance scorecard stream list mismatch for domain ${manifestDomain.slug}`);
    }
  }

  if (scorecardRaw.sentinels.length !== config.sentinels.length) {
    throw new Error("Dominance scorecard sentinel count mismatch with manifest.");
  }

  for (const scorecardSentinel of scorecardRaw.sentinels) {
    const manifestSentinel = sentinelLookup.get(String(scorecardSentinel.slug ?? "").toLowerCase());
    if (!manifestSentinel) {
      throw new Error(`Dominance scorecard references unknown sentinel ${scorecardSentinel.slug}`);
    }
    if (scorecardSentinel.name !== manifestSentinel.name) {
      throw new Error(`Dominance scorecard name mismatch for sentinel ${manifestSentinel.slug}`);
    }
    if (!approxEqual(Number(scorecardSentinel.coverageSeconds ?? 0), manifestSentinel.coverageSeconds, 1)) {
      throw new Error(`Dominance scorecard coverage mismatch for sentinel ${manifestSentinel.slug}`);
    }
    if (!approxEqual(Number(scorecardSentinel.sensitivityBps ?? 0), manifestSentinel.sensitivityBps, 1e-6)) {
      throw new Error(`Dominance scorecard sensitivity mismatch for sentinel ${manifestSentinel.slug}`);
    }
    if (!ensureSameStrings(scorecardSentinel.domains ?? [], manifestSentinel.domains ?? [])) {
      throw new Error(`Dominance scorecard domain list mismatch for sentinel ${manifestSentinel.slug}`);
    }
  }

  if (scorecardRaw.capitalStreams.length !== config.capitalStreams.length) {
    throw new Error("Dominance scorecard capital stream count mismatch with manifest.");
  }

  for (const scorecardStream of scorecardRaw.capitalStreams) {
    const manifestStream = streamLookup.get(String(scorecardStream.slug ?? "").toLowerCase());
    if (!manifestStream) {
      throw new Error(`Dominance scorecard references unknown capital stream ${scorecardStream.slug}`);
    }
    if (scorecardStream.name !== manifestStream.name) {
      throw new Error(`Dominance scorecard name mismatch for capital stream ${manifestStream.slug}`);
    }
    if (!approxEqual(Number(scorecardStream.annualBudgetUSD ?? 0), manifestStream.annualBudget, 1)) {
      throw new Error(`Dominance scorecard budget mismatch for capital stream ${manifestStream.slug}`);
    }
    if (!approxEqual(Number(scorecardStream.expansionBps ?? 0), manifestStream.expansionBps, 1e-6)) {
      throw new Error(`Dominance scorecard expansion mismatch for capital stream ${manifestStream.slug}`);
    }
    if (!ensureSameStrings(scorecardStream.domains ?? [], manifestStream.domains ?? [])) {
      throw new Error(`Dominance scorecard domain list mismatch for capital stream ${manifestStream.slug}`);
    }
  }

  const guardrails = scorecardRaw.guardrails ?? {};
  if (guardrails.autonomy?.maxAutonomyBps !== config.selfImprovement.autonomyGuards.maxAutonomyBps) {
    throw new Error("Dominance scorecard autonomy guard mismatch with manifest.");
  }
  if (guardrails.autonomy?.humanOverrideMinutes !== config.selfImprovement.autonomyGuards.humanOverrideMinutes) {
    throw new Error("Dominance scorecard human override window mismatch with manifest.");
  }
  if (guardrails.autonomy?.pausable !== config.selfImprovement.autonomyGuards.pausable) {
    throw new Error("Dominance scorecard pausable flag mismatch with manifest.");
  }
  if (!ensureSameStrings(guardrails.autonomy?.escalationChannels ?? [], config.selfImprovement.autonomyGuards.escalationChannels)) {
    throw new Error("Dominance scorecard escalation channels mismatch with manifest.");
  }

  if (guardrails.kernel?.checksum?.algorithm !== config.selfImprovement.guardrails.checksum.algorithm) {
    throw new Error("Dominance scorecard checksum algorithm mismatch with manifest guardrails.");
  }
  if (guardrails.kernel?.checksum?.value !== config.selfImprovement.guardrails.checksum.value) {
    throw new Error("Dominance scorecard checksum value mismatch with manifest guardrails.");
  }
  if (guardrails.kernel?.zkProof?.circuit !== config.selfImprovement.guardrails.zkProof.circuit) {
    throw new Error("Dominance scorecard zk-proof circuit mismatch with manifest guardrails.");
  }
  if (guardrails.kernel?.zkProof?.artifactURI !== config.selfImprovement.guardrails.zkProof.artifactURI) {
    throw new Error("Dominance scorecard zk-proof artifact mismatch with manifest guardrails.");
  }
  if (guardrails.kernel?.zkProof?.status !== config.selfImprovement.guardrails.zkProof.status) {
    throw new Error("Dominance scorecard zk-proof status mismatch with manifest guardrails.");
  }

  const plan = guardrails.plan ?? {};
  if (plan.planURI !== config.selfImprovement.plan.planURI) {
    throw new Error("Dominance scorecard plan URI mismatch with manifest.");
  }
  if (plan.planHash !== config.selfImprovement.plan.planHash) {
    throw new Error("Dominance scorecard plan hash mismatch with manifest.");
  }
  if (Number(plan.cadenceSeconds ?? 0) !== config.selfImprovement.plan.cadenceSeconds) {
    throw new Error("Dominance scorecard plan cadence mismatch with manifest.");
  }
  if (Number(plan.lastExecutedAt ?? 0) !== config.selfImprovement.plan.lastExecutedAt) {
    throw new Error("Dominance scorecard plan lastExecutedAt mismatch with manifest.");
  }
  if (plan.lastReportURI !== config.selfImprovement.plan.lastReportURI) {
    throw new Error("Dominance scorecard plan lastReportURI mismatch with manifest.");
  }

  if (Number(guardrails.maxDrawdownBps ?? 0) !== config.global.maxDrawdownBps) {
    throw new Error("Dominance scorecard maxDrawdownBps mismatch with manifest.");
  }

  if (!existsSync(EMERGENCY)) {
    throw new Error("Emergency overrides pack missing. Regenerate outputs via npm run demo:phase8:orchestrate.");
  }
  const emergencyRaw = JSON.parse(readFileSync(EMERGENCY, "utf-8"));
  if (!Array.isArray(emergencyRaw?.overrides) || emergencyRaw.overrides.length < 2) {
    throw new Error("Emergency overrides must include pause and resume call descriptors.");
  }
  for (const override of emergencyRaw.overrides) {
    if (!override?.managerCalldata || typeof override.managerCalldata !== "string") {
      throw new Error("Emergency override entries must include managerCalldata hex string.");
    }
    if (!override?.pauseCalldata || typeof override.pauseCalldata !== "string") {
      throw new Error("Emergency override entries must include pauseCalldata hex string.");
    }
    if (!/^0x[a-fA-F0-9]+$/.test(override.managerCalldata)) {
      throw new Error("Emergency override managerCalldata must be hex encoded.");
    }
    if (!/^0x[a-fA-F0-9]+$/.test(override.pauseCalldata)) {
      throw new Error("Emergency override pauseCalldata must be hex encoded.");
    }
  }
  if (typeof emergencyRaw?.manager !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(emergencyRaw.manager)) {
    throw new Error("Emergency overrides must include manager address.");
  }
  if (!emergencyRaw?.metrics || typeof emergencyRaw.metrics?.minimumCoverageAdequacy !== "number") {
    throw new Error("Emergency overrides must surface minimum coverage adequacy metric.");
  }

  if (!existsSync(GUARDIAN_PLAYBOOK)) {
    throw new Error("Guardian response playbook missing. Regenerate outputs via npm run demo:phase8:orchestrate.");
  }
  const guardianPlaybook = readFileSync(GUARDIAN_PLAYBOOK, "utf-8");
  if (!guardianPlaybook.includes("Guardian Response Playbook")) {
    throw new Error("Guardian playbook must include title 'Guardian Response Playbook'.");
  }
  if (!guardianPlaybook.includes("Scenario") || !guardianPlaybook.includes("Immediate actions")) {
    throw new Error("Guardian playbook must document scenarios and immediate actions.");
  }

  if (!existsSync(AI_TEAM_MATRIX)) {
    throw new Error("AI team matrix missing. Run npm run demo:phase8:orchestrate to regenerate outputs.");
  }
  const aiTeamMatrixRaw = JSON.parse(readFileSync(AI_TEAM_MATRIX, "utf-8"));
  if (!aiTeamMatrixRaw || typeof aiTeamMatrixRaw !== "object") {
    throw new Error("AI team matrix must be a JSON object.");
  }
  if (!Array.isArray(aiTeamMatrixRaw.teams)) {
    throw new Error("AI team matrix must include a teams array.");
  }
  if (!aiTeamMatrixRaw.summary || typeof aiTeamMatrixRaw.summary !== "object") {
    throw new Error("AI team matrix must include a summary block.");
  }
  const summary = aiTeamMatrixRaw.summary as Record<string, unknown>;
  const expectedTeamCount = config.aiTeams.length;
  if (Number(summary.teams ?? 0) !== expectedTeamCount) {
    throw new Error("AI team matrix summary.teams must match manifest aiTeams length.");
  }
  const aiTeamCoverage = new Set<string>();
  for (const team of config.aiTeams) {
    for (const domain of team.domains ?? []) {
      const normalized = domain.toLowerCase();
      if (domainList.includes(normalized)) {
        aiTeamCoverage.add(normalized);
      }
    }
  }
  const expectedCoveragePercent =
    domainList.length === 0 ? 0 : Number(((aiTeamCoverage.size / domainList.length) * 100).toFixed(1));
  if (Number(summary.domainCoveragePercent ?? 0) !== expectedCoveragePercent) {
    throw new Error("AI team matrix coverage percent must match manifest coverage ratio.");
  }
  const expectedSessionMaxHours = Number(config.autonomy?.session?.maxHours ?? 0);
  if (Number(summary.sessionMaxHours ?? 0) !== expectedSessionMaxHours) {
    throw new Error("AI team matrix sessionMaxHours must match autonomy.session.maxHours.");
  }
  const expectedCheckpointCadence = Number(config.autonomy?.session?.checkpointCadenceMinutes ?? 0);
  if (Number(summary.checkpointCadenceMinutes ?? 0) !== expectedCheckpointCadence) {
    throw new Error("AI team matrix checkpoint cadence must match autonomy.session.checkpointCadenceMinutes.");
  }

  const manifestTeams = new Map<string, typeof config.aiTeams[number]>();
  for (const team of config.aiTeams) {
    manifestTeams.set(team.slug.toLowerCase(), team);
  }
  for (const entry of aiTeamMatrixRaw.teams as Array<Record<string, unknown>>) {
    const slug = String(entry?.slug ?? "").toLowerCase();
    if (!slug) {
      throw new Error("AI team matrix entries must include slug.");
    }
    const manifestTeam = manifestTeams.get(slug);
    if (!manifestTeam) {
      throw new Error(`AI team matrix references unknown team ${entry?.slug}`);
    }
    if (String(entry.name ?? "") !== manifestTeam.name) {
      throw new Error(`AI team matrix name mismatch for team ${manifestTeam.slug}`);
    }
    if (String(entry.mission ?? "") !== manifestTeam.mission) {
      throw new Error(`AI team matrix mission mismatch for team ${manifestTeam.slug}`);
    }
    if (Number(entry.cadenceMinutes ?? 0) !== manifestTeam.cadenceMinutes) {
      throw new Error(`AI team matrix cadence mismatch for team ${manifestTeam.slug}`);
    }
    if (String(entry.collaborationProtocol ?? "") !== manifestTeam.collaborationProtocol) {
      throw new Error(`AI team matrix collaborationProtocol mismatch for team ${manifestTeam.slug}`);
    }
    const expectedMemoryChannel = manifestTeam.memoryChannel ?? null;
    if ((entry.memoryChannel ?? null) !== expectedMemoryChannel) {
      throw new Error(`AI team matrix memoryChannel mismatch for team ${manifestTeam.slug}`);
    }
    const expectedEscalation = manifestTeam.escalationContact ?? null;
    if ((entry.escalationContact ?? null) !== expectedEscalation) {
      throw new Error(`AI team matrix escalationContact mismatch for team ${manifestTeam.slug}`);
    }
    const expectedLeadAgent = manifestTeam.leadAgent.toLowerCase();
    const matrixLeadAgent = String(entry.leadAgent ?? "").toLowerCase();
    if (matrixLeadAgent !== expectedLeadAgent) {
      throw new Error(`AI team matrix leadAgent mismatch for team ${manifestTeam.slug}`);
    }
    if (String(entry.leadModel ?? "") !== manifestTeam.leadModel) {
      throw new Error(`AI team matrix leadModel mismatch for team ${manifestTeam.slug}`);
    }
    const matrixDomains = Array.isArray(entry.domains) ? (entry.domains as string[]) : [];
    if (!ensureSameStrings(matrixDomains, manifestTeam.domains ?? [])) {
      throw new Error(`AI team matrix domains mismatch for team ${manifestTeam.slug}`);
    }
    const manifestSpecialists = manifestTeam.specialists ?? [];
    const matrixSpecialists = Array.isArray(entry.specialists) ? (entry.specialists as Array<Record<string, unknown>>) : [];
    if (matrixSpecialists.length !== manifestSpecialists.length) {
      throw new Error(`AI team matrix specialist count mismatch for team ${manifestTeam.slug}`);
    }
    const specialistLookup = new Map<string, (typeof manifestSpecialists)[number]>();
    for (const specialist of manifestSpecialists) {
      specialistLookup.set(specialist.role.toLowerCase(), specialist);
    }
    for (const specialist of matrixSpecialists) {
      const role = String(specialist?.role ?? "").toLowerCase();
      if (!role) {
        throw new Error(`AI team matrix specialist missing role for team ${manifestTeam.slug}`);
      }
      const manifestSpecialist = specialistLookup.get(role);
      if (!manifestSpecialist) {
        throw new Error(`AI team matrix references unknown specialist role ${specialist?.role} for team ${manifestTeam.slug}`);
      }
      const matrixAgent = String(specialist.agent ?? "").toLowerCase();
      if (matrixAgent !== manifestSpecialist.agent.toLowerCase()) {
        throw new Error(`AI team matrix specialist agent mismatch for ${manifestTeam.slug}:${manifestSpecialist.role}`);
      }
      if (specialist.model !== manifestSpecialist.model) {
        throw new Error(`AI team matrix specialist model mismatch for ${manifestTeam.slug}:${manifestSpecialist.role}`);
      }
      if (Number(specialist.contextWindowTokens ?? 0) !== manifestSpecialist.contextWindowTokens) {
        throw new Error(`AI team matrix specialist contextWindowTokens mismatch for ${manifestTeam.slug}:${manifestSpecialist.role}`);
      }
      if (Number(specialist.maxAutonomyMinutes ?? 0) !== manifestSpecialist.maxAutonomyMinutes) {
        throw new Error(`AI team matrix specialist maxAutonomyMinutes mismatch for ${manifestTeam.slug}:${manifestSpecialist.role}`);
      }
      const matrixCapabilities = Array.isArray(specialist.capabilities)
        ? (specialist.capabilities as string[])
        : [];
      if (!ensureSameStrings(matrixCapabilities, manifestSpecialist.capabilities ?? [])) {
        throw new Error(`AI team matrix specialist capabilities mismatch for ${manifestTeam.slug}:${manifestSpecialist.role}`);
      }
    }
  }

  const maxDomainAutonomy = Math.max(...config.domains.map((d) => d.autonomyLevelBps));
  if (maxDomainAutonomy > config.selfImprovement.autonomyGuards.maxAutonomyBps) {
    throw new Error("Domain autonomy exceeds guardrail maximum");
  }

  if (config.selfImprovement.plan.cadenceSeconds < config.global.heartbeatSeconds) {
    throw new Error("Self-improvement cadence must not be shorter than global heartbeat");
  }

  if (
    config.selfImprovement.plan.cadenceSeconds < config.global.guardianReviewWindow &&
    config.selfImprovement.plan.cadenceSeconds % config.global.guardianReviewWindow !== 0
  ) {
    console.warn("Self-improvement cadence is shorter than guardian review window; ensure oversight readiness.");
  }

  console.log("Phase 8 manifest validated ✔");
  console.log(`  Domains: ${config.domains.length}`);
  console.log(`  Sentinels: ${config.sentinels.length}`);
  console.log(`  Capital streams: ${config.capitalStreams.length}`);
  console.log(`  Total sentinel coverage: ${sentinelCoverage}s`);
  console.log(`  Domains with sentinel coverage: ${sentinelDomains.size}`);
  console.log("  Sentinel coverage guard: PASS");
  console.log(`  Self-improvement cadence: ${config.selfImprovement.plan.cadenceSeconds}s`);
  const fundedDomains = Array.from(streamCoverage.entries()).filter(([, budget]) => budget > 0).length;
  console.log(`  Domains with capital funding: ${fundedDomains}`);
  console.log(
    `  Telemetry cross-check → dominance ${telemetryMetrics.dominanceScore.toFixed(1)} · coverage ${telemetryMetrics.coverageRatio.toFixed(1)}% · funding floor $${telemetryMetrics.minDomainFundingUSD.toFixed(0)}`,
  );
  if (config.selfImprovement.plan.lastExecutedAt) {
    console.log(`  Last self-improvement execution: ${config.selfImprovement.plan.lastExecutedAt}`);
  }
}

main();
