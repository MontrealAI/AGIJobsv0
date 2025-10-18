const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../config/asiTakesOffFlightPlan.json");
const payload = JSON.parse(fs.readFileSync(file, "utf8"));

assert.equal(payload.id, "asi-takes-off-flight-plan", "Flight plan id must match the flagship mission");
assert.ok(Array.isArray(payload.phases), "Flight plan phases must be an array");
assert.ok(payload.phases.length >= 5, "Flight plan should cover all five ASI pillars");

const metaPhase = payload.phases.find((phase) => phase.id === "meta-agentic-prelaunch");
assert.ok(metaPhase, "Meta-agentic prelaunch phase must exist");
assert.ok(
  (metaPhase.nonTechnicalSteps || []).some((step) => step.includes("npm run demo:sovereign-constellation")),
  "Meta-agentic phase should instruct the non-technical operator to launch the console"
);

const governancePhase = payload.phases.find((phase) => phase.id === "alpha-governance-command");
assert.ok(governancePhase, "α-AGI governance phase must be documented");
assert.ok(
  (governancePhase.ownerLevers || []).some((lever) => lever.module === "SystemPause"),
  "Governance phase should include the SystemPause owner lever"
);

const victoryPhase = payload.phases.find((phase) => phase.id === "victory-assurance");
assert.ok(victoryPhase, "Victory assurance phase must be present");
assert.ok(
  (victoryPhase.verification || []).some((signal) => signal.signal.includes("CI dashboard")),
  "Victory phase must verify CI guardrails"
);

console.log("✅ ASI Takes Off flight plan is fully specified for non-technical operators");
