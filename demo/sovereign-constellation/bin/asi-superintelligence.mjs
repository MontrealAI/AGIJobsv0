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
  console.log("\n👁️✨  ASI Superintelligence Assurance — Sovereign Constellation\n");
  const superintelligence = loadJson("config/asiTakesOffSuperintelligence.json");
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

  console.log(superintelligence.summary.headline);
  console.log(superintelligence.summary.valueProposition);
  console.log(superintelligence.summary.outcome);
  console.log(superintelligence.summary.nonTechnicalPromise);
  console.log("\nThis briefing confirms the constellation operates as a sovereign, unstoppable superintelligence that any wallet-first director can command.\n");

  console.log("Capabilities — pillars that prove ASI dominance:");
  for (const capability of superintelligence.capabilities ?? []) {
    console.log(` • ${capability.title}`);
    console.log(`   ${capability.description}`);
    console.log(`   Operator focus: ${capability.operatorFocus}`);
    console.log(`   Owner authority: ${capability.ownerAuthority}`);
    console.log(`   Autonomy loop: ${capability.autonomyLoop}`);
    for (const proof of capability.proof ?? []) {
      console.log(`     - Proof: ${proof}`);
    }
  }
  console.log("");

  console.log("Owner sovereignty controls (ready vs pending):");
  console.log(` • Ready levers: ${readyLevers}`);
  console.log(` • Pending levers: ${pendingLevers}`);
  for (const control of superintelligence.ownerControls ?? []) {
    console.log(` • ${control.module} :: ${control.method}`);
    console.log(`   Impact: ${control.impact}`);
    console.log(`   Command: ${control.command}`);
    console.log(`   Verification: ${control.verification}`);
  }
  console.log("");

  console.log("Automation spine and unstoppable guardrails:");
  for (const automation of superintelligence.automation ?? []) {
    console.log(` • ${automation.label}`);
    console.log(`   Command: ${automation.command}`);
    console.log(`   Effect: ${automation.effect}`);
  }
  if (plan?.summary) {
    console.log(
      ` • Thermostat guidance: ${(plan.summary.averageParticipation * 100).toFixed(2)}% participation, ` +
        `${plan.summary.commitWindowSeconds}s commit / ${plan.summary.revealWindowSeconds}s reveal windows`
    );
  }
  console.log("");

  console.log("Readiness signals to prove unstoppable deployment:");
  for (const signal of superintelligence.readinessSignals ?? []) {
    console.log(` • ${signal.signal} — ${signal.description} (${signal.source})`);
  }
  console.log("");

  console.log("To regenerate proofs and matrix:");
  console.log(" • npm run demo:sovereign-constellation:atlas");
  console.log(" • npm run demo:sovereign-constellation:plan");
  console.log(" • npm run demo:sovereign-constellation:ci");
  console.log("");

  console.log("Hand this briefing to any executive or mission director; signing the prepared transactions keeps them in full control of the superintelligent platform.\n");
}

main().catch((error) => {
  console.error("Failed to generate ASI superintelligence briefing:");
  console.error(error);
  process.exit(1);
});
