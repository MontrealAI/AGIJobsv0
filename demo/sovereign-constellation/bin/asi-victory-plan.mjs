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

function printSection(title) {
  console.log(`\n${title}`);
  console.log("".padEnd(title.length, "="));
}

function printListItem(label, value) {
  console.log(` • ${label}`);
  if (value) {
    console.log(`   ${value}`);
  }
}

function main() {
  const plan = loadJson("config/asiTakesOffVictoryPlan.json");

  console.log("\n🏆  ASI Takes Off — Victory Assurance Plan\n");
  console.log(`${plan.title}`);
  console.log(plan.summary);
  console.log(`Promise: ${plan.operatorPromise}`);

  printSection("Objectives");
  for (const objective of plan.objectives ?? []) {
    console.log(` • ${objective.title} (${objective.id})`);
    console.log(`   Outcome: ${objective.outcome}`);
    console.log(`   Verification: ${objective.verification}`);
  }

  printSection("Owner Controls");
  for (const control of plan.ownerControls ?? []) {
    console.log(` • ${control.module} :: ${control.action}`);
    console.log(`   Command: ${control.command}`);
    console.log(`   Verification: ${control.verification}`);
  }

  printSection("CI Gates");
  for (const gate of plan.ciGates ?? []) {
    printListItem(`${gate.name}`, gate.description);
    console.log(`   Command: ${gate.command}`);
  }

  printSection("Telemetry Metrics");
  console.log(plan.telemetry?.overview ?? "Telemetry overview unavailable.");
  for (const metric of plan.telemetry?.metrics ?? []) {
    console.log(` • ${metric.metric} → target ${metric.target}`);
    console.log(`   Source: ${metric.source}`);
    console.log(`   Verification: ${metric.verification}`);
  }

  printSection("Assurance Statements");
  console.log(` • Unstoppable readiness: ${plan.assurance?.unstoppable}`);
  console.log(` • Owner sovereignty: ${plan.assurance?.ownerSovereignty}`);
  console.log(` • Readiness criteria: ${plan.assurance?.readiness}`);

  console.log("\nNext steps:");
  console.log(" • Run npm run demo:sovereign-constellation to launch the constellation.");
  console.log(" • Execute npm run demo:sovereign-constellation:ci before merging mission changes.");
  console.log(" • Apply thermostat recommendations with npm run demo:sovereign-constellation:plan.\n");
}

try {
  main();
} catch (error) {
  console.error("Failed to render victory assurance plan:");
  console.error(error);
  process.exit(1);
}
