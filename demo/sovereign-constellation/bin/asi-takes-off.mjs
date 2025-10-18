#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.join(__dirname, "..", "");

function loadJson(relPath) {
  const fullPath = path.join(demoRoot, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

async function main() {
  console.log("\n🎖️  ASI Takes Off — Sovereign Constellation Mission Briefing\n");
  const deck = loadJson("config/asiTakesOffMatrix.json");
  const hubs = loadJson("config/constellation.hubs.json");
  const uiConfig = loadJson("config/constellation.ui.config.json");
  const telemetry = loadJson("config/autotune.telemetry.json");

  const [{ buildOwnerAtlas }, { computeAutotunePlan }] = await Promise.all([
    import("../shared/ownerAtlas.mjs"),
    import("../shared/autotune.mjs")
  ]);

  const atlas = buildOwnerAtlas(hubs, uiConfig);
  const plan = computeAutotunePlan(telemetry, { mission: deck?.mission?.id ?? "asi-takes-off" });

  console.log(`Mission: ${deck.mission.title}`);
  console.log(deck.mission.tagline);
  console.log("");
  console.log(`Constellation: ${deck.constellation.label}`);
  console.log(deck.constellation.summary);
  console.log(`Promise: ${deck.constellation.operatorPromise}`);
  console.log("");

  console.log("Pillars of deployment:");
  for (const pillar of deck.pillars ?? []) {
    console.log(` • ${pillar.title}: ${pillar.headline}`);
    console.log(`   Operator focus: ${pillar.operatorAction}`);
    console.log(`   Owner supremacy: ${pillar.ownerLever}`);
  }
  console.log("");

  console.log("Owner assurances:");
  console.log(` • Pausing: ${deck.ownerAssurances.pausing}`);
  console.log(` • Upgrades: ${deck.ownerAssurances.upgrades}`);
  console.log(` • Emergency response: ${deck.ownerAssurances.emergencyResponse}`);
  console.log("");

  console.log("Automation spine (run in order):");
  for (const command of deck.automation.launchCommands ?? []) {
    console.log(` • ${command.label}`);
    console.log(`   ${command.run}`);
  }
  console.log("");
  console.log(`CI guardrail: ${deck.automation.ci.description}`);
  console.log(`Owner visibility: ${deck.automation.ci.ownerVisibility}`);
  console.log("");

  console.log("Thermostat recommendations:");
  if (plan?.summary) {
    console.log(
      ` • Avg participation ${(plan.summary.averageParticipation * 100).toFixed(2)}% with commit/reveal ` +
        `${plan.summary.commitWindowSeconds}s/${plan.summary.revealWindowSeconds}s`
    );
    const minStakeDisplay = plan.summary.minStakeWei
      ? `${ethers.formatEther(plan.summary.minStakeWei)} AGIA`
      : String(plan.summary.minStakeWei);
    console.log(` • Minimum stake: ${minStakeDisplay}`);
    if (Array.isArray(plan.summary.notes) && plan.summary.notes.length > 0) {
      for (const note of plan.summary.notes) {
        console.log(`   - ${note}`);
      }
    }
  } else {
    console.log(" • Telemetry not available. Run npm run demo:sovereign-constellation:plan first.");
  }
  console.log("");

  console.log("Owner atlas synopsis:");
  for (const hub of atlas.atlas ?? []) {
    console.log(` • ${hub.label} (${hub.networkName}) owner ${hub.owner} governance ${hub.governance}`);
    for (const module of hub.modules ?? []) {
      console.log(`   - ${module.module}: ${module.actions.length} actionable controls`);
    }
  }
  console.log("");

  console.log("To open the full console:");
  console.log(" • npm run demo:sovereign-constellation");
  console.log("");
  console.log("All instructions above are sourced from repository config. Non-technical directors can hand this briefing to a wallet operator and launch immediately.\n");
}

main().catch((error) => {
  console.error("Failed to generate ASI Takes Off briefing:");
  console.error(error);
  process.exit(1);
});
