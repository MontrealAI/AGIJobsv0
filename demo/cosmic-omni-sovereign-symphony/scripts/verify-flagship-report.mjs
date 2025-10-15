#!/usr/bin/env node
import { promises as fs } from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DEMO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_DEMO_ROOT, "..");
const DEFAULT_REPORT_ROOT = path.join(DEFAULT_REPO_ROOT, "reports", "agi-os");
const DEFAULT_SUMMARY_PATH = path.join(
  DEFAULT_DEMO_ROOT,
  "logs",
  "flagship-demo",
  "summary.txt",
);
const DEFAULT_OUTPUT_PATH = path.join(
  DEFAULT_DEMO_ROOT,
  "logs",
  "flagship-demo",
  "verification.json",
);

function usage() {
  process.stdout.write(`AGI Jobs Flagship Demo Verification\n`);
  process.stdout.write(`Usage: verify-flagship-report [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --demo-root <path>    Override the demo root directory.\n`);
  process.stdout.write(`  --reports-root <path> Override the reports root directory.\n`);
  process.stdout.write(`  --summary <path>      Summary file to validate.\n`);
  process.stdout.write(`  --output <path>       Output file for verification results.\n`);
  process.stdout.write(`  --help                Show this message.\n`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }

  const options = {
    demoRoot: DEFAULT_DEMO_ROOT,
    reportsRoot: DEFAULT_REPORT_ROOT,
    summaryPath: DEFAULT_SUMMARY_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--demo-root" || arg === "--reports-root" || arg === "--summary" || arg === "--output") {
      if (i + 1 >= args.length) {
        throw new Error(`${arg} expects a value`);
      }
      const value = path.resolve(args[i + 1]);
      i += 1;
      if (arg === "--demo-root") {
        options.demoRoot = value;
      } else if (arg === "--reports-root") {
        options.reportsRoot = value;
      } else if (arg === "--summary") {
        options.summaryPath = value;
      } else if (arg === "--output") {
        options.outputPath = value;
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch (error) {
    return false;
  }
}

function asRelative(root, target) {
  return path.relative(root, target) || ".";
}

function describeCounts(label, counts) {
  return `${label}=${counts.join(", ")}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readJson(file) {
  const raw = await fs.readFile(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${errorMessage(error)}`);
  }
}

function aggregateStatus(results) {
  if (results.some((entry) => entry.status === "fail")) {
    return "fail";
  }
  if (results.some((entry) => entry.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function formatTable(results) {
  const nameWidth = Math.max(
    "Check".length,
    ...results.map((entry) => entry.label.length),
  );
  const statusWidth = Math.max(
    "Status".length,
    ...results.map((entry) => entry.status.length),
  );
  const lines = [];
  const header = `${"Check".padEnd(nameWidth)}  ${"Status".padEnd(statusWidth)}  Details`;
  lines.push(header);
  lines.push(`${"".padEnd(nameWidth, "-")}  ${"".padEnd(statusWidth, "-")}  ${"".padEnd(7, "-")}`);
  results.forEach((entry) => {
    lines.push(
      `${entry.label.padEnd(nameWidth)}  ${entry.status.padEnd(statusWidth)}  ${entry.details ?? ""}`,
    );
  });
  return lines.join("\n");
}

async function main() {
  const options = parseArgs();
  const results = [];
  const demoRoot = options.demoRoot;
  const reportsRoot = options.reportsRoot;
  const flagshipLogDir = path.join(demoRoot, "logs", "flagship-demo");

  const ledgerPath = path.join(demoRoot, "logs", "ledger-latest.json");
  const voteSimulationPath = path.join(demoRoot, "logs", "vote-simulation.json");
  const executionPlanPath = path.join(demoRoot, "logs", "execution-plan.json");
  const flagshipLogPath = path.join(flagshipLogDir, "flagship-demo.log");
  const summaryPath = options.summaryPath;
  const missionBundleDir = path.join(reportsRoot, "mission-bundle");
  const ownerMatrixPath = path.join(reportsRoot, "owner-control-matrix.json");
  const grandSummaryPath = path.join(reportsRoot, "grand-summary.json");

  const ledgerExists = await pathExists(ledgerPath);
  if (!ledgerExists) {
    results.push({
      key: "ledger",
      label: "Governance ledger",
      status: "fail",
      details: `Missing file ${asRelative(demoRoot, ledgerPath)}`,
    });
  } else {
    try {
      const ledger = await readJson(ledgerPath);
      const nationCount = Array.isArray(ledger.nations) ? ledger.nations.length : 0;
      const mandateCount = Array.isArray(ledger.mandates) ? ledger.mandates.length : 0;
      const detail = describeCounts("nations", [String(nationCount)]);
      if (nationCount === 0 || mandateCount === 0) {
        results.push({
          key: "ledger",
          label: "Governance ledger",
          status: "fail",
          details: `Ledger missing data: nations=${nationCount}, mandates=${mandateCount}`,
        });
      } else {
        results.push({
          key: "ledger",
          label: "Governance ledger",
          status: "pass",
          details: `${detail}; mandates=${mandateCount}`,
        });
      }
    } catch (error) {
      results.push({
        key: "ledger",
        label: "Governance ledger",
        status: "fail",
        details: errorMessage(error),
      });
    }
  }

  const voteExists = await pathExists(voteSimulationPath);
  if (!voteExists) {
    results.push({
      key: "votes",
      label: "Vote simulation",
      status: "fail",
      details: `Missing file ${asRelative(demoRoot, voteSimulationPath)}`,
    });
  } else {
    try {
      const voteLog = await readJson(voteSimulationPath);
      const voteCount = Array.isArray(voteLog.votes) ? voteLog.votes.length : 0;
      const ownerActions = Array.isArray(voteLog.ownerActions) ? voteLog.ownerActions : [];
      const hasPause = ownerActions.some((action) => action.action === "pause");
      const hasUnpause = ownerActions.some((action) => action.action === "unpause");
      if (voteCount === 0) {
        results.push({
          key: "votes",
          label: "Vote simulation",
          status: "fail",
          details: "No votes recorded",
        });
      } else if (!hasPause || !hasUnpause) {
        results.push({
          key: "votes",
          label: "Vote simulation",
          status: "fail",
          details: "Owner pause/unpause actions missing",
        });
      } else {
        results.push({
          key: "votes",
          label: "Vote simulation",
          status: "pass",
          details: `votes=${voteCount}; ownerActions=${ownerActions.length}`,
        });
      }
    } catch (error) {
      results.push({
        key: "votes",
        label: "Vote simulation",
        status: "fail",
        details: errorMessage(error),
      });
    }
  }

  const planExists = await pathExists(executionPlanPath);
  if (!planExists) {
    results.push({
      key: "plan",
      label: "Execution plan",
      status: "warn",
      details: `Missing file ${asRelative(demoRoot, executionPlanPath)}`,
    });
  } else {
    try {
      const plan = await readJson(executionPlanPath);
      const steps = Array.isArray(plan.steps) ? plan.steps.length : 0;
      if (steps < 5) {
        results.push({
          key: "plan",
          label: "Execution plan",
          status: "warn",
          details: `Unexpected step count (${steps})`,
        });
      } else {
        results.push({
          key: "plan",
          label: "Execution plan",
          status: "pass",
          details: `steps=${steps}`,
        });
      }
    } catch (error) {
      results.push({
        key: "plan",
        label: "Execution plan",
        status: "fail",
        details: errorMessage(error),
      });
    }
  }

  const flagshipLogExists = await pathExists(flagshipLogPath);
  if (!flagshipLogExists) {
    results.push({
      key: "log",
      label: "Flagship log",
      status: "warn",
      details: `Missing file ${asRelative(demoRoot, flagshipLogPath)}`,
    });
  } else {
    const size = (await fs.stat(flagshipLogPath)).size;
    if (size === 0) {
      results.push({
        key: "log",
        label: "Flagship log",
        status: "warn",
        details: "Log file is empty",
      });
    } else {
      results.push({
        key: "log",
        label: "Flagship log",
        status: "pass",
        details: `${size} bytes`,
      });
    }
  }

  const summaryExists = await pathExists(summaryPath);
  if (!summaryExists) {
    results.push({
      key: "summary",
      label: "Summary report",
      status: "fail",
      details: `Missing file ${asRelative(demoRoot, summaryPath)}`,
    });
  } else {
    const contents = await fs.readFile(summaryPath, "utf8");
    if (!contents.includes("Flagship Demo Completed")) {
      results.push({
        key: "summary",
        label: "Summary report",
        status: "fail",
        details: "Summary missing completion marker",
      });
    } else {
      results.push({
        key: "summary",
        label: "Summary report",
        status: "pass",
        details: `${contents.trim().split(/\r?\n/).length} lines`,
      });
    }
  }

  const bundleExists = await pathExists(missionBundleDir);
  if (!bundleExists) {
    results.push({
      key: "bundle",
      label: "Mission bundle",
      status: "fail",
      details: `Missing directory ${asRelative(reportsRoot, missionBundleDir)}`,
    });
  } else {
    const entries = await fs.readdir(missionBundleDir);
    results.push({
      key: "bundle",
      label: "Mission bundle",
      status: entries.length > 0 ? "pass" : "warn",
      details: `files=${entries.length}`,
    });
  }

  const matrixExists = await pathExists(ownerMatrixPath);
  if (!matrixExists) {
    results.push({
      key: "matrix",
      label: "Owner control matrix",
      status: "fail",
      details: `Missing file ${asRelative(reportsRoot, ownerMatrixPath)}`,
    });
  } else {
    try {
      const matrix = await readJson(ownerMatrixPath);
      const modules = Array.isArray(matrix.modules) ? matrix.modules : [];
      const summary = matrix.summary ?? {};
      const total = Number(summary.total ?? modules.length ?? 0);
      const ready = Number(summary.ready ?? 0);
      const needsConfig = Number(summary.needsConfig ?? 0);
      const missingSurface = Number(summary.missingSurface ?? 0);
      if (modules.length === 0 || total === 0) {
        results.push({
          key: "matrix",
          label: "Owner control matrix",
          status: "fail",
          details: "Matrix missing module coverage",
        });
      } else if (total !== ready + needsConfig + missingSurface) {
        results.push({
          key: "matrix",
          label: "Owner control matrix",
          status: "warn",
          details: `Summary totals inconsistent (total=${total}, sum=${ready + needsConfig + missingSurface})`,
        });
      } else {
        results.push({
          key: "matrix",
          label: "Owner control matrix",
          status: "pass",
          details: `modules=${modules.length}; ready=${ready}`,
        });
      }
    } catch (error) {
      results.push({
        key: "matrix",
        label: "Owner control matrix",
        status: "fail",
        details: errorMessage(error),
      });
    }
  }

  const grandSummaryExists = await pathExists(grandSummaryPath);
  if (!grandSummaryExists) {
    results.push({
      key: "grandSummary",
      label: "Grand summary",
      status: "fail",
      details: `Missing file ${asRelative(reportsRoot, grandSummaryPath)}`,
    });
  } else {
    try {
      const summary = await readJson(grandSummaryPath);
      const hasMission = summary && summary.mission && summary.mission.initiative;
      const controlReady = summary && summary.control && Array.isArray(summary.control.modules);
      if (!hasMission || !controlReady) {
        results.push({
          key: "grandSummary",
          label: "Grand summary",
          status: "fail",
          details: "Missing mission or control section",
        });
      } else {
        results.push({
          key: "grandSummary",
          label: "Grand summary",
          status: "pass",
          details: `${summary.mission.initiative}`,
        });
      }
    } catch (error) {
      results.push({
        key: "grandSummary",
        label: "Grand summary",
        status: "fail",
        details: errorMessage(error),
      });
    }
  }

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  const aggregate = aggregateStatus(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    demoRoot,
    reportsRoot,
    summaryPath,
    status: aggregate,
    checks: results,
  };
  await fs.writeFile(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  process.stdout.write(`${formatTable(results)}\n`);
  process.stdout.write(`Overall status: ${aggregate.toUpperCase()}\n`);
  process.stdout.write(`Verification written to ${options.outputPath}\n`);

  if (aggregate === "fail") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`Verification failed: ${errorMessage(error)}\n`);
  process.exitCode = 1;
});
