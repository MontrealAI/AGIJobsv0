#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// @ts-ignore — shared module ships as ESM without TS types at runtime
import { computeAutotunePlan } from "../shared/autotune.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");
const repoRoot = path.join(root, "..", "..");

function loadJson(relativePath) {
  const file = path.join(root, relativePath);
  const contents = fs.readFileSync(file, "utf8");
  return JSON.parse(contents);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatPlan(plan) {
  const lines = [];
  lines.push("=== Sovereign Constellation Thermostat Autotune ===");
  lines.push(`Average participation: ${(plan.summary.averageParticipation * 100).toFixed(2)}%`);
  lines.push(
    `Commit/Reveal windows -> ${plan.summary.commitWindowSeconds}s / ${plan.summary.revealWindowSeconds}s`
  );
  lines.push(`Min stake -> ${plan.summary.minStakeWei} wei`);
  lines.push(`Actions recommended: ${plan.summary.actionsRecommended}`);
  if (Array.isArray(plan.summary.notes) && plan.summary.notes.length > 0) {
    lines.push("Notes:");
    for (const note of plan.summary.notes) {
      lines.push(` - ${note}`);
    }
  }
  lines.push("Actions:");
  for (const action of plan.actions) {
    const scope = action.hub ? `hub ${action.hub}` : action.hubs ? `hubs ${action.hubs}` : "all hubs";
    lines.push(` - ${action.action} on ${scope}: ${action.reason}`);
  }
  return lines.join("\n");
}

async function main() {
  const telemetry = loadJson("config/autotune.telemetry.json");
  const plan = computeAutotunePlan(telemetry, {
    defaultCommitWindowSeconds: telemetry?.baseline?.commitWindowSeconds ?? 3600,
    defaultRevealWindowSeconds: telemetry?.baseline?.revealWindowSeconds ?? 1800,
    defaultMinStakeWei: telemetry?.baseline?.minStakeWei ?? "1000000000000000000"
  });

  const outDir = path.join(repoRoot, "reports", "sovereign-constellation");
  ensureDir(outDir);
  const outFile = path.join(outDir, "autotune-plan.json");
  fs.writeFileSync(outFile, `${JSON.stringify(plan, null, 2)}\n`);

  console.log(formatPlan(plan));
  console.log(`\nAutotune plan written to ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
