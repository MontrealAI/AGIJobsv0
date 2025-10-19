const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const dominancePath = path.join(root, "config/asiTakesOffDominance.json");
const payload = JSON.parse(fs.readFileSync(dominancePath, "utf8"));

assert.ok(payload.mission, "Dominance mission metadata required");
assert.ok(/AI race/i.test(payload.mission.tagline), "Tagline must emphasise winning the AI race");
assert.ok(/owner/i.test(payload.mission.ownerSupremacy), "Owner supremacy copy required");
assert.ok(/ci/i.test(payload.mission.ciGuardrail), "CI guardrail description required");

assert.ok(Array.isArray(payload.vectors), "Dominance vectors must be defined");
assert.equal(payload.vectors.length, 5, "All five dominance vectors required");
for (const vector of payload.vectors) {
  assert.ok(vector.id && vector.title, "Vector id/title required");
  assert.ok(vector.description, `Vector ${vector.id} requires description`);
  assert.ok(vector.operatorFocus, `Vector ${vector.id} must guide operators`);
  assert.ok(vector.ownerLever, `Vector ${vector.id} must highlight owner lever`);
  assert.ok(Array.isArray(vector.automation), `Vector ${vector.id} automation entries must be array`);
  assert.ok(vector.automation.length >= 1, `Vector ${vector.id} should include automation commands`);
  assert.ok(Array.isArray(vector.proofs) && vector.proofs.length >= 3, `Vector ${vector.id} needs proof artefacts`);
}

assert.ok(Array.isArray(payload.indicators) && payload.indicators.length >= 3, "Dominance indicators required");
for (const indicator of payload.indicators) {
  assert.ok(indicator.metric && indicator.signal, "Indicator metric/signal required");
  assert.ok(indicator.target, "Indicator target required");
  assert.ok(indicator.source, "Indicator source required");
  assert.ok(indicator.verification, "Indicator verification required");
}

assert.ok(Array.isArray(payload.ownerDirectives) && payload.ownerDirectives.length >= 3, "Owner directives required");
for (const directive of payload.ownerDirectives) {
  assert.ok(directive.action && directive.command, "Owner directive requires action/command");
  assert.ok(/explorer|console|atlas/i.test(directive.proof), "Owner directive proof must reference verifiable artefact");
  assert.ok(directive.impact, "Owner directive impact required");
}

assert.ok(payload.automation, "Automation guardrails required");
assert.ok(Array.isArray(payload.automation.commands) && payload.automation.commands.length >= 2, "Automation commands list required");
for (const cmd of payload.automation.commands) {
  assert.ok(cmd.label && cmd.command && cmd.purpose, "Automation command entries need label/command/purpose");
}
assert.ok(payload.automation.ci, "CI guardrail required");
assert.ok(/Sovereign Constellation/i.test(payload.automation.ci.job), "CI job should reference Sovereign Constellation");

console.log("✅ asiTakesOffDominance.json schema validated");
