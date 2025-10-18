const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "../../../..");
const cliPath = path.join(repoRoot, "demo/sovereign-constellation/bin/asi-flight-plan.mjs");

const result = spawnSync("node", [cliPath], { cwd: repoRoot, encoding: "utf8" });

assert.equal(result.status, 0, `Flight plan CLI should exit successfully (stderr: ${result.stderr})`);
assert.ok(result.stdout.includes("Flight Plan"), "CLI output should highlight the flight plan heading");
assert.ok(result.stdout.includes("Meta-Agentic"), "CLI output should list the meta-agentic ignition phase");
assert.ok(result.stdout.includes("CI dashboard"), "CLI output should reference CI guardrail verification");

console.log("✅ ASI Takes Off flight plan CLI briefing renders");
