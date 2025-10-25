#!/usr/bin/env ts-node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ROOT = join(__dirname, "..", "config", "universal.value.manifest.json");
const HTML = join(__dirname, "..", "index.html");
const README = join(__dirname, "..", "README.md");
const OUTPUT_DIR = join(__dirname, "..", "output");
const SCORECARD = join(OUTPUT_DIR, "phase8-dominance-scorecard.json");
const DIRECTIVES = join(OUTPUT_DIR, "phase8-governance-directives.md");
const EMERGENCY = join(OUTPUT_DIR, "phase8-emergency-overrides.json");
const CALLDATA_MANIFEST = join(OUTPUT_DIR, "phase8-governance-calldata.json");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
  }),
});

function main() {
  const configRaw = JSON.parse(readFileSync(ROOT, "utf-8"));
  const config = configSchema.parse(configRaw);

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
  for (const sentinel of config.sentinels) {
    const slug = sentinel.slug.toLowerCase();
    if (sentinelSlugs.has(slug)) {
      throw new Error(`Duplicate sentinel slug detected: ${slug}`);
    }
    sentinelSlugs.add(slug);
    for (const domain of sentinel.domains ?? []) {
      const normalized = domain.toLowerCase();
      if (!slugs.has(normalized)) {
        throw new Error(`Sentinel ${sentinel.slug} references unknown domain ${domain}`);
      }
      sentinelDomains.add(normalized);
    }
  }

  const uncoveredDomains = config.domains.filter((domain) => !sentinelDomains.has(domain.slug.toLowerCase()));
  if (uncoveredDomains.length > 0) {
    const list = uncoveredDomains.map((domain) => domain.slug).join(", ");
    throw new Error(`All domains require sentinel coverage — missing: ${list}`);
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

  const sentinelCoverage = config.sentinels.reduce((acc, s) => acc + s.coverageSeconds, 0);
  if (sentinelCoverage < config.global.guardianReviewWindow) {
    throw new Error(
      `Sentinel coverage ${sentinelCoverage}s must exceed guardian review window ${config.global.guardianReviewWindow}s`,
    );
  }

  const guardianWindow = config.global.guardianReviewWindow;
  if (guardianWindow > 0) {
    const domainCoverage = new Map<string, number>();
    const domainList = Array.from(slugs.values());
    if (domainList.length !== config.domains.length) {
      // Defer to slug validation errors before enforcing coverage-specific diagnostics.
      return;
    }

    for (const sentinel of config.sentinels) {
      const coverage = sentinel.coverageSeconds;
      if (!Number.isFinite(coverage) || coverage <= 0) continue;

      const sentinelDomains = (sentinel.domains ?? []).map((domain) => domain.toLowerCase());
      const targets = sentinelDomains.length > 0 ? sentinelDomains : domainList;

      for (const domain of targets) {
        if (!slugs.has(domain)) continue;
        domainCoverage.set(domain, (domainCoverage.get(domain) ?? 0) + coverage);
      }
    }

    const insufficient = domainList.filter((domain) => (domainCoverage.get(domain) ?? 0) < guardianWindow);
    if (insufficient.length > 0) {
      const formatted = insufficient.join(", ");
      throw new Error(`Domains below guardian window ${guardianWindow}s: ${formatted}`);
    }
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
    "phase8-self-improvement-plan.json",
    "phase8-cycle-report.csv",
    "phase8-dominance-scorecard.json",
    "phase8-emergency-overrides.json",
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
  if (config.selfImprovement.plan.lastExecutedAt) {
    console.log(`  Last self-improvement execution: ${config.selfImprovement.plan.lastExecutedAt}`);
  }
}

main();
