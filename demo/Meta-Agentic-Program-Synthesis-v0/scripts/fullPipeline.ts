import { readFile, writeFile } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { executeSynthesis, type RunOptions } from "./runSynthesis";
import { updateManifest } from "./manifest";
import type { MissionConfig, OwnerCapability, OwnerControlCoverage, SynthesisRun } from "./types";

const BASE_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BASE_DIR, "..", "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const WORKFLOW_FILE = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");
const PACKAGE_JSON = path.join(REPO_ROOT, "package.json");

const FULL_JSON = path.join(REPORT_DIR, "meta-agentic-program-synthesis-full.json");
const FULL_MARKDOWN = path.join(REPORT_DIR, "meta-agentic-program-synthesis-full.md");
const CI_REPORT = path.join(REPORT_DIR, "meta-agentic-program-synthesis-ci.json");
const OWNER_JSON = path.join(REPORT_DIR, "meta-agentic-program-synthesis-owner-diagnostics.json");
const OWNER_MARKDOWN = path.join(REPORT_DIR, "meta-agentic-program-synthesis-owner-diagnostics.md");
const TRIANGULATION_JSON = path.join(REPORT_DIR, "meta-agentic-program-synthesis-triangulation.json");

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function renderMarkdown(
  run: SynthesisRun,
  ciAssessment: { ok: boolean; issues: string[] },
  ownerReadiness: string,
  artifacts: Record<string, string>,
): string {
  const lines: string[] = [];
  lines.push("# Meta-Agentic Program Synthesis – Full Run");
  lines.push("");
  lines.push(`Generated: ${run.generatedAt}`);
  lines.push("");
  lines.push("## Aggregate Metrics");
  lines.push("");
  lines.push(`- Global best score: ${formatNumber(run.aggregate.globalBestScore)}`);
  lines.push(`- Accuracy: ${formatPercent(run.aggregate.averageAccuracy)}`);
  lines.push(`- Energy envelope: ${formatNumber(run.aggregate.energyUsage)}`);
  lines.push(`- Novelty signal: ${formatPercent(run.aggregate.noveltyScore)}`);
  lines.push(`- Coverage: ${formatPercent(run.aggregate.coverageScore)}`);
  lines.push(
    `- Triangulation confidence: ${formatPercent(run.aggregate.triangulationConfidence)} (${run.aggregate.consensus.confirmed}/${run.aggregate.consensus.attention}/${run.aggregate.consensus.rejected})`,
  );
  lines.push("");
  lines.push("## Verification Consensus");
  lines.push("");
  lines.push(
    `- Confirmed: ${run.aggregate.consensus.confirmed} | Attention: ${run.aggregate.consensus.attention} | Rejected: ${run.aggregate.consensus.rejected}`,
  );
  lines.push("");
  lines.push("## CI Shield Assessment");
  lines.push("");
  lines.push(ciAssessment.ok ? "✅ All mandatory CI gates confirmed." : "❌ CI deviations detected. Review issues below.");
  if (ciAssessment.issues.length > 0) {
    for (const issue of ciAssessment.issues) {
      lines.push(`- ${issue}`);
    }
  }
  lines.push("");
  lines.push("## Owner Diagnostics");
  lines.push("");
  lines.push(`- Readiness: ${ownerReadiness}`);
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push("| Artifact | Path |");
  lines.push("| --- | --- |");
  for (const [label, filePath] of Object.entries(artifacts)) {
    lines.push(`| ${label} | \`${filePath}\` |`);
  }
  lines.push("");
  return lines.join("\n");
}

function extractCoverageThreshold(job: Record<string, unknown>): number | null {
  const steps = job.steps as Array<Record<string, unknown>> | undefined;
  if (!steps) {
    return null;
  }
  for (const step of steps) {
    const run = step.run;
    if (typeof run === "string" && run.includes("check-coverage")) {
      const match = run.match(/(\d{2,3})/);
      if (match) {
        return Number.parseInt(match[1], 10);
      }
    }
  }
  return null;
}

async function verifyCi(mission: MissionConfig): Promise<{
  ok: boolean;
  issues: string[];
  report: Record<string, unknown>;
}> {
  const workflowRaw = await readFile(WORKFLOW_FILE, "utf8");
  const workflow = yaml.load(workflowRaw) as Record<string, unknown>;

  const workflowName = typeof workflow.name === "string" ? workflow.name : "";
  const concurrency = (workflow.concurrency as { group?: string; ["cancel-in-progress"]?: boolean } | undefined) ?? {};
  const concurrencyGroup = concurrency.group ?? "";
  const cancelInProgress = Boolean(concurrency["cancel-in-progress"]);

  const triggers = (workflow.on as Record<string, unknown> | undefined) ?? {};
  const triggersIncludePush = Object.prototype.hasOwnProperty.call(triggers, "push");
  const triggersIncludePull = Object.prototype.hasOwnProperty.call(triggers, "pull_request");
  const triggersIncludeDispatch = Object.prototype.hasOwnProperty.call(triggers, "workflow_dispatch");

  const jobs = (workflow.jobs as Record<string, Record<string, unknown>>) ?? {};
  const requiredJobs = mission.ci.requiredJobs.map((expected) => {
    const job = jobs[expected.id];
    const present = Boolean(job);
    const name = present && typeof job.name === "string" ? job.name : "";
    return {
      id: expected.id,
      name: expected.name,
      present,
      nameMatches: present && name === expected.name,
    };
  });

  const coverageJob = jobs.coverage;
  let coverageThreshold = coverageJob ? extractCoverageThreshold(coverageJob) : null;
  const env = (workflow.env as Record<string, unknown> | undefined) ?? {};
  if (coverageThreshold === null) {
    const envThreshold = env.COVERAGE_MIN;
    if (typeof envThreshold === "string" || typeof envThreshold === "number") {
      const parsed = Number.parseFloat(envThreshold.toString());
      if (!Number.isNaN(parsed)) {
        coverageThreshold = parsed;
      }
    }
  }

  const issues: string[] = [];
  if (workflowName !== mission.ci.workflow) {
    issues.push(`Workflow name mismatch (expected "${mission.ci.workflow}", found "${workflowName}").`);
  }
  if (concurrencyGroup !== mission.ci.concurrency) {
    issues.push(`Concurrency group mismatch (expected "${mission.ci.concurrency}").`);
  }
  if (!cancelInProgress) {
    issues.push("Concurrency guard missing cancel-in-progress: true.");
  }
  if (!triggersIncludePush || !triggersIncludePull) {
    issues.push("Workflow triggers must include push and pull_request.");
  }
  if (!triggersIncludeDispatch) {
    issues.push("Workflow dispatch trigger missing (required for manual enforcement).");
  }
  for (const job of requiredJobs) {
    if (!job.present) {
      issues.push(`Missing CI job: ${job.id}.`);
    } else if (!job.nameMatches) {
      issues.push(`CI job name mismatch for ${job.id} (expected "${job.name}").`);
    }
  }
  if (coverageThreshold === null || coverageThreshold < mission.ci.minCoverage) {
    issues.push(
      `Coverage threshold below requirement (expected ≥ ${mission.ci.minCoverage}, found ${coverageThreshold ?? "unknown"}).`,
    );
  }

  const ok = issues.length === 0;
  const report = {
    workflowName,
    concurrencyGroup,
    cancelInProgress,
    triggersIncludePush,
    triggersIncludePull,
    triggersIncludeDispatch,
    requiredJobs,
    coverageThreshold,
  };

  await writeFile(CI_REPORT, JSON.stringify({ mission: mission.ci, verification: report }, null, 2), "utf8");
  return { ok, issues, report };
}

function inspectCommand(command: string, scripts: Record<string, string | undefined>): boolean {
  const trimmed = command.trim();
  if (trimmed.startsWith("npm run ")) {
    const [, , scriptName] = trimmed.split(/\s+/, 3);
    return Boolean(scriptName && scripts[scriptName]);
  }
  if (trimmed.startsWith("npx ")) {
    return true;
  }
  if (trimmed.startsWith("node ") || trimmed.startsWith("ts-node ")) {
    return true;
  }
  return trimmed.length > 0;
}

async function evaluateOwnerControls(
  mission: MissionConfig,
  coverage: OwnerControlCoverage,
): Promise<{
  readiness: "ready" | "attention" | "blocked";
  commandReadiness: "ready" | "attention" | "blocked";
  statuses: Array<{
    capability: OwnerCapability;
    commandAvailable: boolean;
    verificationAvailable: boolean;
  }>;
}> {
  const pkgRaw = await readFile(PACKAGE_JSON, "utf8");
  const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};

  const statuses = mission.ownerControls.capabilities.map((capability) => {
    const commandAvailable = inspectCommand(capability.command, scripts);
    const verificationAvailable = inspectCommand(capability.verification, scripts);
    return { capability, commandAvailable, verificationAvailable };
  });

  const anyError = statuses.some((status) => !status.commandAvailable && !status.verificationAvailable);
  const anyWarning = statuses.some(
    (status) => status.commandAvailable !== status.verificationAvailable,
  );
  let commandReadiness: "ready" | "attention" | "blocked" = "ready";
  if (anyError) {
    commandReadiness = "blocked";
  } else if (anyWarning) {
    commandReadiness = "attention";
  }

  const rank = (value: "ready" | "attention" | "blocked"): number => {
    switch (value) {
      case "blocked":
        return 2;
      case "attention":
        return 1;
      default:
        return 0;
    }
  };
  let readiness = commandReadiness;
  if (rank(coverage.readiness) > rank(readiness)) {
    readiness = coverage.readiness;
  }

  return { readiness, commandReadiness, statuses };
}

function renderOwnerMarkdown(
  readiness: string,
  coverage: OwnerControlCoverage,
  statuses: Array<{
    capability: OwnerCapability;
    commandAvailable: boolean;
    verificationAvailable: boolean;
  }>,
): string {
  const lines: string[] = [];
  lines.push("# Owner Diagnostics (Static Verification)");
  lines.push("");
  lines.push(`Readiness: ${readiness}`);
  lines.push("");
  lines.push(
    `Coverage readiness: ${coverage.readiness} (${coverage.satisfiedCategories.length}/${coverage.requiredCategories.length} controls satisfied)`,
  );
  lines.push("");
  lines.push("| Capability | Command | Verification | Status |");
  lines.push("| --- | --- | --- | --- |");
  for (const status of statuses) {
    const commandStatus = status.commandAvailable ? "✅" : "❌";
    const verificationStatus = status.verificationAvailable ? "✅" : "❌";
    const overall = status.commandAvailable && status.verificationAvailable
      ? "Ready"
      : status.commandAvailable || status.verificationAvailable
        ? "Attention"
        : "Blocked";
    lines.push(
      `| ${status.capability.label} | \`${status.capability.command}\` (${commandStatus}) | \`${status.capability.verification}\` (${verificationStatus}) | ${overall} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function runFullPipeline(options: RunOptions = {}): Promise<void> {
  const run = await executeSynthesis(options);
  const missionFile = path.resolve(options.missionFile ?? process.env.AGI_META_PROGRAM_MISSION ?? path.join(BASE_DIR, "config", "mission.meta-agentic-program-synthesis.json"));
  const reportDir = path.resolve(options.reportDir ?? REPORT_DIR);

  const ciAssessment = await verifyCi(run.mission);
  const ownerAssessment = await evaluateOwnerControls(run.mission, run.ownerCoverage);

  const ownerReport = {
    generatedAt: new Date().toISOString(),
    readiness: ownerAssessment.readiness,
    commandReadiness: ownerAssessment.commandReadiness,
    coverage: run.ownerCoverage,
    statuses: ownerAssessment.statuses,
  };

  await writeFile(OWNER_JSON, JSON.stringify(ownerReport, null, 2), "utf8");
  await writeFile(
    OWNER_MARKDOWN,
    renderOwnerMarkdown(ownerAssessment.readiness, run.ownerCoverage, ownerAssessment.statuses),
    "utf8",
  );

  const artifacts = {
    "Mission manifest": missionFile,
    "Markdown report": path.join(reportDir, "meta-agentic-program-synthesis-report.md"),
    "JSON summary": path.join(reportDir, "meta-agentic-program-synthesis-summary.json"),
    "Dashboard": path.join(reportDir, "meta-agentic-program-synthesis-dashboard.html"),
    "Triangulation digest": TRIANGULATION_JSON,
    "Manifest": path.join(reportDir, "meta-agentic-program-synthesis-manifest.json"),
    "CI verification": CI_REPORT,
    "Owner diagnostics (JSON)": OWNER_JSON,
    "Owner diagnostics (Markdown)": OWNER_MARKDOWN,
  };

  const fullSummary = {
    generatedAt: new Date().toISOString(),
    aggregate: run.aggregate,
    triangulation: {
      confidence: run.aggregate.triangulationConfidence,
      consensus: run.aggregate.consensus,
      tasks: run.tasks.map((task) => ({
        id: task.task.id,
        label: task.task.label,
        consensus: task.triangulation.consensus,
        confidence: task.triangulation.confidence,
        passed: task.triangulation.passed,
        total: task.triangulation.total,
      })),
    },
    mission: run.mission.meta,
    ci: {
      ok: ciAssessment.ok,
      issues: ciAssessment.issues,
      report: CI_REPORT,
    },
    ownerDiagnostics: ownerReport,
    ownerCoverage: run.ownerCoverage,
    artifacts,
  };

  await writeFile(FULL_JSON, JSON.stringify(fullSummary, null, 2), "utf8");
  await writeFile(
    FULL_MARKDOWN,
    renderMarkdown(run, { ok: ciAssessment.ok, issues: ciAssessment.issues }, ownerAssessment.readiness, artifacts),
    "utf8",
  );

  await updateManifest(path.join(reportDir, "meta-agentic-program-synthesis-manifest.json"), [
    CI_REPORT,
    OWNER_JSON,
    OWNER_MARKDOWN,
    TRIANGULATION_JSON,
    FULL_JSON,
    FULL_MARKDOWN,
  ]);

  if (!ciAssessment.ok) {
    console.error("❌ CI verification issues detected:");
    for (const issue of ciAssessment.issues) {
      console.error(`   - ${issue}`);
    }
    process.exitCode = 1;
  }

  if (ownerAssessment.readiness !== "ready") {
    console.warn(`⚠️ Owner diagnostics reported readiness: ${ownerAssessment.readiness}`);
  }

  console.log("✅ Meta-Agentic Program Synthesis full pipeline completed.");
  console.log(`   Aggregate score: ${run.aggregate.globalBestScore.toFixed(2)}`);
}

if (require.main === module) {
  runFullPipeline()
    .catch((error) => {
      console.error("❌ Full pipeline failed:", error);
      process.exitCode = 1;
    });
}
