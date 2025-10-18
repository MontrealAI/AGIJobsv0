const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const matrixFile = path.join(root, "config/asiTakesOffMatrix.json");
const payload = JSON.parse(fs.readFileSync(matrixFile, "utf8"));

assert.equal(payload.mission.id, "asi-takes-off", "ASI deck must describe the flagship mission");
assert.ok(Array.isArray(payload.pillars) && payload.pillars.length === 5, "All five mission pillars must be listed");
payload.pillars.forEach((pillar) => {
  assert.ok(pillar.headline, `Pillar ${pillar.id} requires a headline`);
  assert.ok(pillar.operatorAction, `Pillar ${pillar.id} requires an operator action narrative`);
  assert.ok(pillar.ownerLever, `Pillar ${pillar.id} must highlight owner supremacy`);
});

assert.ok(payload.automation?.launchCommands?.length >= 3, "Automation spine should include all launch commands");
const commandRuns = payload.automation.launchCommands.map((item) => item.run);
assert.ok(
  commandRuns.includes("npm run demo:sovereign-constellation"),
  "Launch commands should reference the single-command constellation bootstrap"
);
assert.ok(
  commandRuns.includes("npm run demo:sovereign-constellation:ci"),
  "Launch commands must cover the CI enforcement script"
);
assert.ok(
  commandRuns.includes("npm run demo:sovereign-constellation:plan"),
  "Launch commands must include the thermostat planning step"
);

assert.ok(payload.ownerAssurances?.pausing, "Owner assurances should describe pausing guarantees");
assert.ok(payload.ownerAssurances?.upgrades, "Owner assurances should document upgrade control");
assert.ok(payload.ownerAssurances?.emergencyResponse, "Owner assurances should surface emergency response levers");

const cliPath = path.join(root, "bin/asi-takes-off.mjs");
const result = spawnSync("node", [cliPath], { encoding: "utf8" });
assert.equal(result.status, 0, `ASI Takes Off CLI should exit cleanly. stderr: ${result.stderr}`);
assert.ok(result.stdout.includes("ASI Takes Off"), "CLI briefing should mention ASI Takes Off");
assert.ok(result.stdout.includes("Automation spine"), "CLI output should enumerate automation spine instructions");
console.log("✅ asiTakesOffMatrix.json schema validated and CLI briefing renders");
