const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const payloadPath = path.join(root, "config/asiTakesOffSuperintelligence.json");
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

assert.ok(payload.summary, "Superintelligence summary must exist");
assert.ok(payload.summary.headline, "Summary requires headline");
assert.ok(payload.summary.valueProposition, "Summary requires value proposition");
assert.ok(payload.summary.outcome, "Summary requires outcome");
assert.ok(
  /superintelligent/i.test(payload.summary.headline) || /superintelligent/i.test(payload.summary.outcome),
  "Summary should emphasise superintelligent capability"
);
assert.ok(
  /wallet/i.test(payload.summary.nonTechnicalPromise),
  "Summary must promise wallet-first usability"
);

assert.ok(Array.isArray(payload.capabilities), "Capabilities collection required");
assert.equal(payload.capabilities.length, 5, "All five flagship pillars must be documented");
payload.capabilities.forEach((capability) => {
  assert.ok(capability.id && capability.title, "Capability entries require id/title");
  assert.ok(capability.description, `Capability ${capability.id} needs description`);
  assert.ok(capability.operatorFocus, `Capability ${capability.id} needs operator focus narrative`);
  assert.ok(capability.ownerAuthority, `Capability ${capability.id} must highlight owner authority`);
  assert.ok(capability.autonomyLoop, `Capability ${capability.id} must describe autonomy loop`);
  assert.ok(Array.isArray(capability.proof) && capability.proof.length >= 3, "Each capability lists proof artefacts");
});

assert.ok(Array.isArray(payload.ownerControls) && payload.ownerControls.length >= 4, "Owner controls must list core levers");
payload.ownerControls.forEach((control) => {
  assert.ok(control.module && control.method, "Owner controls require module/method");
  assert.ok(control.command, "Owner controls require automation command");
  assert.ok(control.verification, "Owner controls require verification guidance");
});

assert.ok(Array.isArray(payload.automation) && payload.automation.length >= 3, "Automation entries should cover guardrails");
payload.automation.forEach((entry) => {
  assert.ok(entry.command && entry.effect, "Automation entries require command/effect description");
});

assert.ok(Array.isArray(payload.readinessSignals) && payload.readinessSignals.length >= 3, "Readiness signals must be defined");
payload.readinessSignals.forEach((signal) => {
  assert.ok(signal.signal && signal.source, "Readiness signal requires name and source");
  assert.ok(/ci|atlas|plan/i.test(signal.description), "Signals should reference CI, atlas, or plan artefacts");
});

console.log("✅ asiTakesOffSuperintelligence.json schema validated");
