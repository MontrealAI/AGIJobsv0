import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  PlanetaryOrchestratorFabric,
  runFabricScenario,
} from "../scripts/lib/orchestrator";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "fabric-ci-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("10k job run stays above unstoppable floor", () => {
  withTempDir((dir) => {
    const configPath = join(__dirname, "..", "config", "fabric.manifest.json");
    const checkpointPath = join(dir, "checkpoint.json");
    const result = runFabricScenario(configPath, {
      totalJobs: 10000,
      checkpointPath,
      deterministicSeed: 1337,
      outputPath: join(dir, "report.json"),
      uiDataPath: undefined,
    });

    assert.equal(result.completedJobs, 10000);
    assert.equal(result.failedJobs, 0);
    assert.ok(result.unstoppableScore >= result.ownerControls.unstoppableScoreFloor);
    const worstFailure = Math.max(...result.shardSummaries.map((shard) => shard.failureRate));
    assert.ok(worstFailure < 0.02);
    const reassignmentRatio = result.reassignments / 10000;
    assert.ok(reassignmentRatio <= 0.02);
  });
});

test("checkpoint resume restores queue state", () => {
  withTempDir((dir) => {
    const configPath = join(__dirname, "..", "config", "fabric.manifest.json");
    const checkpointPath = join(dir, "checkpoint.json");
    const partial = runFabricScenario(configPath, {
      totalJobs: 10000,
      checkpointPath,
      simulateKillAfterJobs: 4800,
      deterministicSeed: 2025,
      outputPath: undefined,
      uiDataPath: undefined,
    });

    assert.ok(partial.completedJobs < 10000);

    const resumed = runFabricScenario(configPath, {
      totalJobs: 10000,
      checkpointPath,
      resume: true,
      deterministicSeed: 2025,
      outputPath: join(dir, "resume.json"),
      uiDataPath: undefined,
    });

    assert.equal(resumed.completedJobs, 10000);
    assert.equal(resumed.failedJobs, 0);
    assert.ok(resumed.unstoppableScore >= resumed.ownerControls.unstoppableScoreFloor);
  });
});
