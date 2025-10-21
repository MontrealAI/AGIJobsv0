import path from "path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadMissionConfig, runMetaSynthesis } from "../synthesisEngine";
import { ensureMissionValidity } from "../validation";

const missionPath = path.resolve(
  __dirname,
  "..",
  "..",
  "config",
  "mission.meta-agentic-program-synthesis.json",
);

function within(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Number.isFinite(actual), `Expected a finite value but received ${actual}`);
  const delta = Math.abs(actual - expected);
  assert.ok(
    delta <= tolerance,
    `Expected ${actual} to be within ±${tolerance} of ${expected} (delta ${delta}).`,
  );
}

test("meta-agentic synthesis remains deterministic and mission-aligned", async () => {
  const { mission, coverage } = await loadMissionConfig(missionPath);
  assert.equal(coverage.readiness, "ready");
  assert.deepEqual(
    [...coverage.satisfiedCategories].sort(),
    ["Compliance", "Emergency Pause", "Thermostat", "Treasury", "Upgrade"].sort(),
  );
  assert.equal(coverage.missingCategories.length, 0);

  const run = runMetaSynthesis(mission, coverage);
  assert.equal(run.tasks.length, mission.tasks.length);

  within(run.aggregate.globalBestScore, 140.38164328854776);
  within(run.aggregate.averageAccuracy, 1);
  within(run.aggregate.energyUsage, 73.33333333333333);
  within(run.aggregate.noveltyScore, 0.7776289047454377);
  within(run.aggregate.coverageScore, 1);
  within(run.aggregate.triangulationConfidence, 0.5333333333333333);

  assert.equal(run.aggregate.consensus.confirmed, 1);
  assert.equal(run.aggregate.consensus.attention, 0);
  assert.equal(run.aggregate.consensus.rejected, 2);

  const arc = run.tasks.find((task) => task.task.id === "arc-sentinel");
  assert.ok(arc, "ARC Sentinel task missing from synthesis run");
  within(arc.bestCandidate.metrics.score, 140.38164328854776);
  within(arc.bestCandidate.metrics.accuracy, 1);
  assert.equal(arc.triangulation.consensus, "confirmed");
  assert.equal(arc.thermodynamics.status, "aligned");
});

test("mission validation enforces owner coverage and canonical addresses", async () => {
  const { mission } = await loadMissionConfig(missionPath);

  const missingCategoryMission = JSON.parse(JSON.stringify(mission));
  missingCategoryMission.ownerControls.capabilities = mission.ownerControls.capabilities.filter(
    (capability) => capability.category !== "Compliance",
  );
  assert.throws(
    () => ensureMissionValidity(missingCategoryMission),
    /Owner capabilities missing required categories/i,
  );

  const invalidAddressMission = JSON.parse(JSON.stringify(mission));
  invalidAddressMission.meta.ownerAddress = "0x123";
  assert.throws(() => ensureMissionValidity(invalidAddressMission), /Owner address must be a valid Ethereum address/i);
});
