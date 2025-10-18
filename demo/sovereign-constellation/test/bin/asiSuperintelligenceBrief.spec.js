const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "../../../..");
const cliPath = path.join(repoRoot, "demo/sovereign-constellation/bin/asi-superintelligence.mjs");

const result = spawnSync("node", [cliPath], { cwd: repoRoot, encoding: "utf8" });

assert.equal(result.status, 0, `ASI superintelligence CLI should exit successfully (stderr: ${result.stderr})`);
assert.ok(result.stdout.toLowerCase().includes("superintelligence"), "CLI output must emphasise superintelligence");
assert.ok(result.stdout.includes("unstoppable"), "CLI output should highlight unstoppable readiness");
assert.ok(result.stdout.includes("Ready levers"), "CLI output should report owner lever readiness");
assert.ok(result.stdout.includes("Thermostat guidance"), "CLI output should surface thermostat telemetry");

console.log("✅ ASI Superintelligence CLI briefing renders");
