import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadMissionConfig, runMetaSynthesis } from "../synthesisEngine";

const MISSION_PATH = path.resolve(__dirname, "..", "..", "config", "mission.meta-agentic-program-synthesis.json");

test("ledger summary reaches accepted consensus with slashing before rewards", async () => {
  const { mission } = await loadMissionConfig(MISSION_PATH);
  const run = runMetaSynthesis(mission);
  const ledger = run.tasks[0]?.ledger;
  assert.ok(ledger, "ledger data should be present");
  assert.equal(ledger.summary.finalConsensus, "accepted");
  assert.ok(ledger.summary.totalSlashed > 0, "expected at least one slashing event");
  assert.ok(ledger.summary.validatorRewards > 0, "validator rewards should be positive");
  const slashIndex = ledger.timeline.findIndex((event) => event.type === "slash_applied");
  const rewardIndex = ledger.timeline.findIndex((event) => event.type === "reward_distributed");
  assert.notEqual(slashIndex, -1, "slash event should exist");
  assert.notEqual(rewardIndex, -1, "reward event should exist");
  assert.ok(slashIndex < rewardIndex, "slash must precede reward distribution");
});

test("ledger simulation is deterministic for identical missions", async () => {
  const { mission } = await loadMissionConfig(MISSION_PATH);
  const first = runMetaSynthesis(mission);
  const second = runMetaSynthesis(mission);
  assert.deepEqual(first.aggregate.ledger, second.aggregate.ledger);
  first.tasks.forEach((task, index) => {
    assert.deepEqual(task.ledger.summary, second.tasks[index]?.ledger.summary);
  });
});

test("ledger reward and slashing accounting is conserved", async () => {
  const { mission } = await loadMissionConfig(MISSION_PATH);
  const run = runMetaSynthesis(mission);
  run.tasks.forEach((task) => {
    const rewardFromAttempts = task.ledger.attempts.reduce((acc, attempt) => acc + attempt.rewardEarned, 0);
    const rewardFromValidators = task.ledger.validators.reduce((acc, validator) => acc + validator.rewardEarned, 0);
    assert.equal(
      rewardFromAttempts + rewardFromValidators,
      task.ledger.summary.totalRewardPaid,
      "total rewards should equal solver + validator payouts",
    );
    const slashedFromAttempts = task.ledger.attempts.reduce((acc, attempt) => acc + attempt.slashApplied, 0);
    assert.equal(
      slashedFromAttempts,
      task.ledger.summary.totalSlashed,
      "summary slashed value should match attempt totals",
    );
  });
});
