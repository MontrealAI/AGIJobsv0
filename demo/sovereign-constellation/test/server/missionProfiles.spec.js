const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../config/missionProfiles.json");
const payload = JSON.parse(fs.readFileSync(file, "utf8"));

assert.ok(Array.isArray(payload), "missionProfiles.json should contain an array");
const flagship = payload.find((profile) => profile?.id === "meta-agentic-alpha-agi-orchestration");
assert.ok(flagship, "flagship mission profile should be present");
assert.equal(flagship.playbookId, "asi-takes-off", "flagship profile should reference the ASI Takes Off playbook");

const configFile = path.join(__dirname, "../../config/constellation.ui.config.json");
const uiConfig = JSON.parse(fs.readFileSync(configFile, "utf8"));
assert.ok(Array.isArray(uiConfig.launchSequence), "launchSequence must be present in constellation UI config");
assert.ok(uiConfig.launchSequence.length >= 4, "launchSequence should enumerate the complete ASI Takes Off workflow");
uiConfig.launchSequence.forEach((step) => {
  assert.ok(step.id && typeof step.id === "string", "each launch step requires an id");
  assert.ok(step.title && typeof step.title === "string", "each launch step requires a title");
  assert.ok(step.objective && typeof step.objective === "string", "each launch step requires an objective");
  assert.ok(Array.isArray(step.commands), "each launch step must define commands for the operator");
  step.commands.forEach((command) => {
    assert.ok(command.label && typeof command.label === "string", "command label must be descriptive");
    assert.ok(command.run && typeof command.run === "string", "command run text must be provided");
  });
  assert.ok(step.successSignal && typeof step.successSignal === "string", "success signals guide non-technical operators");
  assert.ok(step.ownerLever && typeof step.ownerLever === "string", "owner lever text documents governance control");
});

const igniteStep = uiConfig.launchSequence.find((step) => step.id === "ignite-constellation");
assert.ok(igniteStep, "ignite-constellation step should be defined");
assert.ok(
  igniteStep.commands.some((command) => command.run.includes("npm run demo:sovereign-constellation")),
  "ignite-constellation must instruct the operator to run the single-command constellation launcher"
);
console.log("✅ missionProfiles.json contains the ASI Takes Off flagship entry");
console.log("✅ constellation.ui.config.json documents the non-technical ASI Takes Off launch sequence");
