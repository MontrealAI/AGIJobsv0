#!/usr/bin/env ts-node

import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { PlanetaryOrchestratorFabric, runFabricScenario } from "./lib/orchestrator";

const FABRIC_ROOT = resolve(__dirname, "..");
const CONFIG_PATH = join(FABRIC_ROOT, "config", "fabric.manifest.json");
const CHECKPOINT_PATH = join(FABRIC_ROOT, "output", "fabric.ci.checkpoint.json");
const OUTPUT_PATH = join(FABRIC_ROOT, "output", "fabric-ci-report.json");
const UI_PATH = join(FABRIC_ROOT, "ui", "data", "fabric-ci.json");
const README_PATH = join(FABRIC_ROOT, "README.md");
const RUNBOOK_PATH = join(FABRIC_ROOT, "RUNBOOK.md");

function verifyReadme() {
  const readme = readFileSync(README_PATH, "utf8");
  const requiredHeadings = [
    "## 🚀 Planetary mission quickstart",
    "## 🧭 Owner omnipotence",
    "## 🛰️ Sharded registry & routing fabric",
    "## 🤝 Node marketplace & container bazaar",
    "## ♻️ Checkpoint & recovery lattice",
    "## 🌐 Cross-shard spillover choreography",
    "## 📊 Telemetry dashboards",
    "## 🛡️ Security & unstoppable guarantees",
    "## 🧪 CI evidence",
  ];
  for (const heading of requiredHeadings) {
    assert(readme.includes(heading), `README missing heading: ${heading}`);
  }
  const mermaidCount = (readme.match(/```mermaid/g) || []).length;
  assert(mermaidCount >= 3, "README must include at least three mermaid diagrams");
}

function verifyRunbook() {
  const runbook = readFileSync(RUNBOOK_PATH, "utf8");
  const mustContain = [
    "Step 1 — Prepare the manifest",
    "Step 2 — Launch the planetary fabric",
    "Step 3 — Validate unstoppable metrics",
    "Step 4 — Publish the cinematic dashboard",
  ];
  for (const section of mustContain) {
    assert(runbook.includes(section), `RUNBOOK missing required section: ${section}`);
  }
}

function main() {
  verifyReadme();
  verifyRunbook();

  const config = PlanetaryOrchestratorFabric.loadConfig(CONFIG_PATH);
  const totalJobs = 10000;
  const partial = runFabricScenario(CONFIG_PATH, {
    totalJobs,
    checkpointPath: CHECKPOINT_PATH,
    checkpointInterval: config.checkpoint.intervalJobs,
    simulateKillAfterJobs: Math.floor(totalJobs / 2),
    deterministicSeed: 424242,
    outputPath: undefined,
    uiDataPath: undefined,
    baseTimestamp: Date.now(),
  });

  assert(partial.completedJobs < totalJobs, "Partial run should stop early");
  assert(partial.checkpointPath === CHECKPOINT_PATH, "Checkpoint path mismatch");

  const resumed = runFabricScenario(CONFIG_PATH, {
    totalJobs,
    checkpointPath: CHECKPOINT_PATH,
    resume: true,
    checkpointInterval: config.checkpoint.intervalJobs,
    deterministicSeed: 424242,
    outputPath: OUTPUT_PATH,
    uiDataPath: UI_PATH,
    baseTimestamp: Date.now(),
  });

  const successRate = resumed.totalJobsRequested === 0
    ? 1
    : (resumed.completedJobs - resumed.failedJobs) / resumed.totalJobsRequested;

  assert(resumed.completedJobs === totalJobs, "Resume run must finish all jobs");
  assert(successRate >= 0.98, `Success rate below requirement: ${(successRate * 100).toFixed(2)}%`);
  assert(
    resumed.unstoppableScore >= config.owner.controls.unstoppableScoreFloor,
    `Unstoppable score below floor ${config.owner.controls.unstoppableScoreFloor}`
  );

  const worstFailureRate = Math.max(
    ...resumed.shardSummaries.map((shard) => shard.failureRate)
  );
  assert(worstFailureRate <= 0.02, `Shard failure rate above 2% (${(worstFailureRate * 100).toFixed(2)}%)`);

  const crossShardRatio = resumed.crossShardTransfers / totalJobs;
  assert(
    crossShardRatio <= 0.06,
    `Cross-shard overflow too high (${(crossShardRatio * 100).toFixed(2)}%)`
  );

  const maxQueue = Math.max(...resumed.shardSummaries.map((shard) => shard.maxQueueDepth));
  assert(
    maxQueue <= totalJobs * 2,
    `Queue depth exploded (${maxQueue}) – investigate manifest spillover thresholds.`
  );

  assert(resumed.reassignments <= totalJobs * 0.02, "Reassignments should remain under 2% for stability");

  console.log("✅ Planetary Orchestrator Fabric CI verification complete");
  console.log(`   Success rate     : ${(successRate * 100).toFixed(2)}%`);
  console.log(`   Unstoppable score: ${(resumed.unstoppableScore * 100).toFixed(2)}%`);
  console.log(`   Worst shard fail : ${(worstFailureRate * 100).toFixed(2)}%`);
  console.log(`   Reassignments    : ${resumed.reassignments}`);
  console.log(`   Cross-shard flow : ${(crossShardRatio * 100).toFixed(2)}% (${resumed.crossShardTransfers})`);
}

main();
