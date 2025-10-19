const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "../../../..");
const cliPath = path.join(repoRoot, "demo/sovereign-constellation/bin/asi-dominance.mjs");

const result = spawnSync("node", [cliPath], { cwd: repoRoot, encoding: "utf8" });

assert.equal(result.status, 0, `ASI dominance CLI should exit successfully (stderr: ${result.stderr})`);
assert.ok(result.stdout.includes("Dominance Protocol"), "CLI output must title the dominance protocol");
assert.ok(/AI race/i.test(result.stdout), "CLI output should emphasise winning the AI race");
assert.ok(/Owner supremacy/i.test(result.stdout), "CLI output must highlight owner supremacy");
assert.ok(result.stdout.includes("Ready levers"), "CLI output should report owner readiness counts");
assert.ok(/Thermostat/i.test(result.stdout), "CLI output should mention thermostat telemetry");
assert.ok(/CI:/i.test(result.stdout), "CLI output must document CI guardrails");

console.log("✅ ASI Dominance CLI briefing renders");
