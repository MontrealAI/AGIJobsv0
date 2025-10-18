#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..", "");

function loadJson(relPath) {
  const file = path.join(root, relPath);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function printList(items, formatter) {
  for (const [index, item] of items.entries()) {
    formatter(item, index);
  }
}

async function main() {
  console.log("\n🎖️  Sovereign Constellation — ASI Takes Off Flight Plan\n");
  const plan = loadJson("config/asiTakesOffFlightPlan.json");
  console.log(plan.summary);
  console.log(plan.operatorPromise);
  console.log("");

  printList(plan.phases ?? [], (phase, idx) => {
    const phaseNumber = idx + 1;
    console.log(`${phaseNumber}. ${phase.title}`);
    console.log(`   Objective: ${phase.objective}`);
    if (Array.isArray(phase.nonTechnicalSteps) && phase.nonTechnicalSteps.length > 0) {
      console.log("   Non-technical steps:");
      phase.nonTechnicalSteps.forEach((step, stepIdx) => {
        console.log(`     ${phaseNumber}.${stepIdx + 1} ${step}`);
      });
    }
    if (Array.isArray(phase.ownerLevers) && phase.ownerLevers.length > 0) {
      console.log("   Owner levers:");
      phase.ownerLevers.forEach((lever) => {
        console.log(`     - ${lever.module} :: ${lever.action}`);
        console.log(`       ${lever.description}`);
      });
    }
    if (Array.isArray(phase.automation) && phase.automation.length > 0) {
      console.log("   Automation spine:");
      phase.automation.forEach((entry) => {
        console.log(`     - ${entry.command}`);
        console.log(`       ${entry.outcome}`);
      });
    }
    if (Array.isArray(phase.verification) && phase.verification.length > 0) {
      console.log("   Verification signals:");
      phase.verification.forEach((entry) => {
        console.log(`     - ${entry.signal}: ${entry.method}`);
        console.log(`       Source: ${entry.source}`);
      });
    }
    console.log("");
  });

  console.log("Run npm run demo:sovereign-constellation:asi-takes-off:launch after completing the phases to regenerate the launch manifesto.\n");
}

main().catch((err) => {
  console.error("Failed to generate ASI Takes Off flight plan:\n", err);
  process.exit(1);
});
