#!/usr/bin/env ts-node
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ROOT = join(__dirname, "..", "config", "universal.value.manifest.json");
const HTML = join(__dirname, "..", "index.html");
const README = join(__dirname, "..", "README.md");
const OUTPUT_DIR = join(__dirname, "..", "output");
const PLAN_EXPORT = join(OUTPUT_DIR, "phase8-self-improvement-plan.json");
const ORCHESTRATION_REPORT = join(OUTPUT_DIR, "phase8-orchestration-report.txt");
const CYCLE_REPORT = join(OUTPUT_DIR, "phase8-cycle-report.csv");

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

  const requiredExports = [
    { path: PLAN_EXPORT, label: "self-improvement plan export" },
    { path: ORCHESTRATION_REPORT, label: "orchestration transcript" },
    { path: CYCLE_REPORT, label: "cycle report" },
  ] as const;
  for (const artifact of requiredExports) {
    if (!existsSync(artifact.path)) {
      throw new Error(`Phase 8 ${artifact.label} missing at ${artifact.path}`);
    }
    if (statSync(artifact.path).size === 0) {
      throw new Error(`Phase 8 ${artifact.label} at ${artifact.path} is empty`);
    }
  }

  const planExportRaw = readFileSync(PLAN_EXPORT, "utf-8");
  const planExport = JSON.parse(planExportRaw) as {
    planURI?: string;
    planHash?: string;
    cadenceSeconds?: number;
  };
  const manifestPlan = config.selfImprovement.plan;
  if (!planExport.planHash) {
    throw new Error("Self-improvement plan export missing planHash");
  }
  if (planExport.planHash.toLowerCase() !== manifestPlan.planHash.toLowerCase()) {
    throw new Error("Manifest planHash does not match exported plan JSON");
  }
  if (!planExport.planURI || planExport.planURI !== manifestPlan.planURI) {
    throw new Error("Self-improvement plan export planURI misaligned with manifest");
  }
  if (typeof planExport.cadenceSeconds !== "number" || planExport.cadenceSeconds !== manifestPlan.cadenceSeconds) {
    throw new Error("Self-improvement plan export cadence mismatch");
  }

  const cycleReportRaw = readFileSync(CYCLE_REPORT, "utf-8").trim();
  const cycleLines = cycleReportRaw.split(/\r?\n/).filter((line) => line.length > 0);
  if (cycleLines.length < 2) {
    throw new Error("Phase 8 cycle report must include at least one execution entry");
  }
  const expectedHeader = ["cycle", "executedAt", "reportUri"];
  const header = cycleLines[0].split(",");
  if (expectedHeader.some((value, idx) => header[idx] !== value)) {
    throw new Error(`Cycle report header mismatch — expected ${expectedHeader.join(", ")}`);
  }

  const slugs = new Set<string>();
  for (const domain of config.domains) {
    const slug = domain.slug.toLowerCase();
    if (slugs.has(slug)) {
      throw new Error(`Duplicate domain slug detected: ${slug}`);
    }
    slugs.add(slug);
  }

  const sentinelDomains = new Set<string>();
  for (const sentinel of config.sentinels) {
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

  for (const stream of config.capitalStreams) {
    for (const domain of stream.domains ?? []) {
      const normalized = domain.toLowerCase();
      if (!slugs.has(normalized)) {
        throw new Error(`Capital stream ${stream.slug} references unknown domain ${domain}`);
      }
    }
  }

  const sentinelCoverage = config.sentinels.reduce((acc, s) => acc + s.coverageSeconds, 0);
  if (sentinelCoverage < config.global.guardianReviewWindow) {
    throw new Error(
      `Sentinel coverage ${sentinelCoverage}s must exceed guardian review window ${config.global.guardianReviewWindow}s`,
    );
  }

  const html = readFileSync(HTML, "utf-8");
  if (!html.includes("Phase 8")) {
    throw new Error("index.html must mention Phase 8 to guide operators");
  }
  if (!html.includes("mermaid")) {
    throw new Error("index.html must embed a mermaid diagram placeholder");
  }

  const uiMarkers = [
    'data-test-id="stat-card"',
    'data-test-id="sentinel-card"',
    'data-test-id="stream-card"',
    'data-test-id="runbook-step"',
    'phase8-orchestration-report.txt',
  ] as const;
  for (const marker of uiMarkers) {
    if (!html.includes(marker)) {
      throw new Error(`index.html missing required UI marker: ${marker}`);
    }
  }

  const readme = readFileSync(README, "utf-8");
  const requiredSections = ["Quickstart", "Smart contract", "Mermaid", "Self-improvement"];
  for (const section of requiredSections) {
    if (!readme.toLowerCase().includes(section.toLowerCase())) {
      throw new Error(`README missing required section: ${section}`);
    }
  }

  const headingSequence = [
    "## 🚀 Quickstart for operators",
    "## ⚙️ Orchestration flow & troubleshooting",
    "## 🧭 Why this demo matters",
    "## 🧱 Smart contract control surface",
    "## 🧠 Self-improvement kernel",
    "## 🛰️ Demo control surface",
  ] as const;
  const headingPositions = headingSequence.map((heading) => {
    const index = readme.indexOf(heading);
    if (index === -1) {
      throw new Error(`README missing required heading: ${heading}`);
    }
    return index;
  });
  const orderedHeadingPositions = [...headingPositions].sort((a, b) => a - b);
  if (!headingPositions.every((pos, idx) => pos === orderedHeadingPositions[idx])) {
    throw new Error("README headings out of canonical order");
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
  console.log(`  README headings verified: ${headingSequence.length}`);
  console.log(`  UI markers verified: ${uiMarkers.length}`);
  console.log(`  Cycle report entries: ${cycleLines.length - 1}`);
  console.log(`  Plan hash alignment: ${planExport.planHash}`);
  console.log(`  Domains: ${config.domains.length}`);
  console.log(`  Sentinels: ${config.sentinels.length}`);
  console.log(`  Capital streams: ${config.capitalStreams.length}`);
  console.log(`  Total sentinel coverage: ${sentinelCoverage}s`);
  console.log(`  Domains with sentinel coverage: ${sentinelDomains.size}`);
  console.log("  Sentinel coverage guard: PASS");
  console.log(`  Self-improvement cadence: ${config.selfImprovement.plan.cadenceSeconds}s`);
  if (config.selfImprovement.plan.lastExecutedAt) {
    console.log(`  Last self-improvement execution: ${config.selfImprovement.plan.lastExecutedAt}`);
  }
}

main();
