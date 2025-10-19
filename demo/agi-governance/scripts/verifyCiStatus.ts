import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import yaml from "js-yaml";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const OUTPUT_FILE = path.join(REPORT_DIR, "ci-verification.json");
const WORKFLOW_FILE = path.join(__dirname, "..", "..", "..", ".github", "workflows", "ci.yml");
const MISSION_FILE = path.join(__dirname, "..", "config", "mission@v1.json");

type MissionCi = {
  workflow: string;
  requiredJobs: Array<{ id: string; name: string }>;
  minCoverage: number;
  concurrency: string;
};

type VerificationResult = {
  workflowNameMatches: boolean;
  concurrencyMatches: boolean;
  triggersIncludePush: boolean;
  triggersIncludePullRequest: boolean;
  requiredJobsPresent: Array<{ id: string; name: string; present: boolean; nameMatches: boolean }>;
  coverageThreshold: number | null;
};

async function loadMissionCi(): Promise<MissionCi> {
  const configRaw = await readFile(MISSION_FILE, "utf8");
  const mission = JSON.parse(configRaw) as { ci: MissionCi };
  return mission.ci;
}

function extractCoverageThreshold(job: Record<string, unknown>): number | null {
  const steps = job.steps as Array<Record<string, unknown>> | undefined;
  if (!steps) {
    return null;
  }
  for (const step of steps) {
    const run = step.run;
    if (typeof run === "string" && run.includes("check-coverage") && run.match(/\d+/)) {
      const match = run.match(/(\d{2,3})/);
      if (match) {
        return Number.parseInt(match[1], 10);
      }
    }
  }
  return null;
}

async function verifyWorkflow(ciConfig: MissionCi): Promise<VerificationResult> {
  const workflowRaw = await readFile(WORKFLOW_FILE, "utf8");
  const workflow = yaml.load(workflowRaw) as Record<string, unknown>;

  const workflowName = typeof workflow.name === "string" ? workflow.name : "";
  const concurrency = (workflow.concurrency as { group?: string } | undefined)?.group ?? "";

  const triggers = (workflow as Record<string, unknown>)["on"] as Record<string, unknown> | undefined;
  const triggersIncludePush = Boolean(triggers && Object.prototype.hasOwnProperty.call(triggers, "push"));
  const triggersIncludePullRequest = Boolean(triggers && Object.prototype.hasOwnProperty.call(triggers, "pull_request"));

  const jobs = (workflow.jobs as Record<string, Record<string, unknown>>) ?? {};

  const requiredJobsPresent = ciConfig.requiredJobs.map((expected) => {
    const job = jobs[expected.id];
    if (!job) {
      return { id: expected.id, name: expected.name, present: false, nameMatches: false };
    }
    const jobName = typeof job.name === "string" ? job.name : "";
    return { id: expected.id, name: expected.name, present: true, nameMatches: jobName === expected.name };
  });

  const coverageJob = jobs.coverage;
  let coverageThreshold = coverageJob ? extractCoverageThreshold(coverageJob) : null;
  if (coverageThreshold === null) {
    const env = workflow.env as Record<string, unknown> | undefined;
    const envThreshold = env?.COVERAGE_MIN;
    if (typeof envThreshold === "string" && envThreshold.trim().length > 0) {
      const parsed = Number.parseFloat(envThreshold);
      if (!Number.isNaN(parsed)) {
        coverageThreshold = parsed;
      }
    }
  }

  return {
    workflowNameMatches: workflowName === ciConfig.workflow,
    concurrencyMatches: concurrency === ciConfig.concurrency,
    triggersIncludePush,
    triggersIncludePullRequest,
    requiredJobsPresent,
    coverageThreshold,
  };
}

async function main(): Promise<void> {
  const ciConfig = await loadMissionCi();
  const verification = await verifyWorkflow(ciConfig);

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify({ ciConfig, verification }, null, 2), "utf8");

  const missingJobs = verification.requiredJobsPresent.filter((job) => !job.present || !job.nameMatches);
  if (!verification.workflowNameMatches) {
    console.error(`❌ Workflow name mismatch. Expected "${ciConfig.workflow}".`);
  }
  if (!verification.concurrencyMatches) {
    console.error(`❌ Concurrency guard mismatch. Expected "${ciConfig.concurrency}".`);
  }
  if (!verification.triggersIncludePush || !verification.triggersIncludePullRequest) {
    console.error("❌ Workflow triggers missing push or pull_request.");
  }
  if (missingJobs.length > 0) {
    console.error(
      `❌ Missing CI jobs: ${missingJobs
        .map((job) => `${job.id}${job.present ? " (name mismatch)" : ""}`)
        .join(", ")}`,
    );
  }
  if (verification.coverageThreshold === null || verification.coverageThreshold < ciConfig.minCoverage) {
    console.error(
      `❌ Coverage threshold below requirement. Expected ≥ ${ciConfig.minCoverage}, found ${verification.coverageThreshold ?? "unknown"}.`,
    );
  }

  if (
    verification.workflowNameMatches &&
    verification.concurrencyMatches &&
    verification.triggersIncludePush &&
    verification.triggersIncludePullRequest &&
    missingJobs.length === 0 &&
    verification.coverageThreshold !== null &&
    verification.coverageThreshold >= ciConfig.minCoverage
  ) {
    console.log("✅ CI workflow matches the enforced v2 shield.");
    console.log(`   Report: ${OUTPUT_FILE}`);
  } else {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("❌ Failed to verify CI workflow:", error);
  process.exitCode = 1;
});
