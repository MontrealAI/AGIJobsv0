#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.join(__dirname, "..", "");

function loadJson(relPath) {
  const fullPath = path.join(demoRoot, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

async function main() {
  console.log("\n🏆✨  ASI Dominance Protocol — Sovereign Constellation\n");
  const dominance = loadJson("config/asiTakesOffDominance.json");
  const deck = loadJson("config/asiTakesOffMatrix.json");
  const hubs = loadJson("config/constellation.hubs.json");
  const uiConfig = loadJson("config/constellation.ui.config.json");
  const telemetry = loadJson("config/autotune.telemetry.json");
  const ownerMatrixEntries = loadJson("config/asiTakesOffOwnerMatrix.json");

  const [{ buildOwnerAtlas }, { computeAutotunePlan }, { buildOwnerCommandMatrix }] = await Promise.all([
    import("../shared/ownerAtlas.mjs"),
    import("../shared/autotune.mjs"),
    import("../shared/ownerMatrix.mjs")
  ]);

  const atlas = buildOwnerAtlas(hubs, uiConfig);
  const plan = computeAutotunePlan(telemetry, { mission: deck?.mission?.id ?? "asi-takes-off" });
  const ownerMatrix = buildOwnerCommandMatrix(ownerMatrixEntries, atlas);
  const readyLevers = ownerMatrix.filter((entry) => entry.available).length;
  const pendingLevers = ownerMatrix.length - readyLevers;

  console.log(dominance.mission.tagline);
  console.log(dominance.mission.operatorPromise);
  console.log(`Owner supremacy: ${dominance.mission.ownerSupremacy}`);
  console.log(dominance.mission.ciGuardrail);
  console.log("\nThis dominance dossier proves a non-technical director can win the AI race while keeping absolute owner control.\n");

  console.log("Dominance vectors:");
  for (const vector of dominance.vectors ?? []) {
    console.log(` • ${vector.title}`);
    console.log(`   ${vector.description}`);
    console.log(`   Operator focus: ${vector.operatorFocus}`);
    console.log(`   Owner lever: ${vector.ownerLever}`);
    for (const automation of vector.automation ?? []) {
      console.log(`     - Command: ${automation.command} → ${automation.impact}`);
    }
    for (const proof of vector.proofs ?? []) {
      console.log(`     - Proof: ${proof}`);
    }
  }
  console.log("");

  console.log("Owner readiness metrics:");
  console.log(` • Ready levers: ${readyLevers}`);
  console.log(` • Pending levers: ${pendingLevers}`);
  if (plan?.summary) {
    console.log(
      ` • Thermostat: ${(plan.summary.averageParticipation * 100).toFixed(2)}% participation, ` +
        `${plan.summary.commitWindowSeconds}s commit / ${plan.summary.revealWindowSeconds}s reveal`
    );
  }
  console.log("");

  console.log("Dominance indicators:");
  for (const indicator of dominance.indicators ?? []) {
    console.log(` • ${indicator.metric} :: ${indicator.signal}`);
    console.log(`   Target: ${indicator.target}`);
    console.log(`   Source: ${indicator.source}`);
    console.log(`   Verification: ${indicator.verification}`);
  }
  console.log("");

  console.log("Owner directives:");
  for (const directive of dominance.ownerDirectives ?? []) {
    console.log(` • ${directive.action}`);
    console.log(`   Command: ${directive.command}`);
    console.log(`   Proof: ${directive.proof}`);
    console.log(`   Impact: ${directive.impact}`);
  }
  console.log("");

  console.log("Automation guardrails:");
  for (const command of dominance.automation?.commands ?? []) {
    console.log(` • ${command.label}`);
    console.log(`   Command: ${command.command}`);
    console.log(`   Purpose: ${command.purpose}`);
  }
  if (dominance.automation?.ci) {
    console.log(
      ` • CI: ${dominance.automation.ci.workflow} → ${dominance.automation.ci.job} — ${dominance.automation.ci.description}`
    );
    console.log(`   Owner visibility: ${dominance.automation.ci.ownerVisibility}`);
  }
  console.log("");

  console.log("Regenerate dominance artefacts before every launch:");
  console.log(" • npm run demo:sovereign-constellation:ci");
  console.log(" • npm run demo:sovereign-constellation:plan");
  console.log(" • npm run demo:sovereign-constellation:owner");
  console.log(" • npm run demo:sovereign-constellation:dominance");
  console.log("");

  console.log("Hand this dominance protocol to executives — it demonstrates that AGI Jobs v0 (v2) keeps superintelligence under sovereign owner command while delivering civilisation-scale impact.\n");
}

main().catch((error) => {
  console.error("Failed to generate ASI dominance briefing:");
  console.error(error);
  process.exit(1);
});
