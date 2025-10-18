const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const planFile = path.join(root, "config/asiTakesOffVictoryPlan.json");
const payload = JSON.parse(fs.readFileSync(planFile, "utf8"));

assert.equal(payload.id, "asi-takes-off-victory", "Victory plan must be keyed to the flagship mission");
assert.ok(payload.title && payload.summary, "Victory plan requires title and summary");
assert.ok(Array.isArray(payload.objectives) && payload.objectives.length >= 3, "Victory plan needs at least three objectives");
payload.objectives.forEach((objective) => {
  assert.ok(objective.id, "Objectives require ids");
  assert.ok(objective.title, `Objective ${objective.id} requires a title`);
  assert.ok(objective.outcome, `Objective ${objective.id} needs an outcome description`);
  assert.ok(objective.verification, `Objective ${objective.id} needs a verification step`);
});

assert.ok(Array.isArray(payload.ownerControls) && payload.ownerControls.length >= 3, "Victory plan must surface owner controls");
payload.ownerControls.forEach((control) => {
  assert.ok(control.module && control.action, "Owner controls must include module and action");
  assert.ok(control.command, "Owner controls require executable command guidance");
  assert.ok(control.verification, "Owner controls must cite verification narrative");
});

assert.ok(Array.isArray(payload.ciGates) && payload.ciGates.length >= 3, "Victory plan must document CI gates");
payload.ciGates.forEach((gate) => {
  assert.ok(gate.name && gate.command, "CI gates need names and commands");
  assert.ok(gate.description, "CI gate entries must describe enforcement");
});

assert.ok(payload.telemetry?.overview, "Telemetry overview required for readiness");
assert.ok(Array.isArray(payload.telemetry?.metrics) && payload.telemetry.metrics.length >= 3, "Telemetry metrics required");
payload.telemetry.metrics.forEach((metric) => {
  assert.ok(metric.metric, "Telemetry metric entries need identifiers");
  assert.ok(metric.target, "Telemetry metric entries require targets");
  assert.ok(metric.source, "Telemetry metric entries require source references");
  assert.ok(metric.verification, "Telemetry metric entries require verification guidance");
});

assert.ok(payload.assurance?.unstoppable, "Assurance narrative must mention unstoppable readiness");
assert.ok(payload.assurance?.ownerSovereignty, "Assurance narrative must mention owner sovereignty");
assert.ok(payload.assurance?.readiness, "Assurance narrative must mention readiness criteria");

const cliPath = path.join(root, "bin/asi-victory-plan.mjs");
const result = spawnSync("node", [cliPath], { encoding: "utf8" });
assert.equal(result.status, 0, `Victory CLI should exit cleanly. stderr: ${result.stderr}`);
assert.ok(result.stdout.includes("Victory Assurance Plan"), "Victory CLI should include heading");
assert.ok(result.stdout.includes("Unstoppable readiness"), "Victory CLI should surface unstoppable assurance");
assert.ok(result.stdout.includes("CI Gates"), "Victory CLI should enumerate CI gates");

console.log("✅ asiTakesOffVictoryPlan.json schema validated and CLI renders");
