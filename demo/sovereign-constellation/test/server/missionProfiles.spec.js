const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../config/missionProfiles.json");
const payload = JSON.parse(fs.readFileSync(file, "utf8"));

assert.ok(Array.isArray(payload), "missionProfiles.json should contain an array");
const flagship = payload.find((profile) => profile?.id === "meta-agentic-alpha-agi-orchestration");
assert.ok(flagship, "flagship mission profile should be present");
assert.equal(flagship.playbookId, "asi-takes-off", "flagship profile should reference the ASI Takes Off playbook");
console.log("✅ missionProfiles.json contains the ASI Takes Off flagship entry");
