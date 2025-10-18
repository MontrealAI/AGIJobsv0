const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "../../../..");
const outputFile = path.join(__dirname, "../../asi-takes-off-demo/output/asi-takes-off-launch.md");

if (fs.existsSync(outputFile)) {
  fs.unlinkSync(outputFile);
}

const result = spawnSync("node", ["demo/sovereign-constellation/asi-takes-off-demo/launch.mjs"], {
  cwd: repoRoot,
  encoding: "utf8"
});

assert.equal(result.status, 0, `launcher should exit successfully (stdout: ${result.stdout}\nstderr: ${result.stderr})`);
assert.ok(result.stdout.includes("Sovereign Constellation"), "launcher stdout should reference the Sovereign Constellation");
assert.ok(fs.existsSync(outputFile), "launch manifest should be written to disk");

const manifest = fs.readFileSync(outputFile, "utf8");
assert.ok(manifest.includes("## Thermostat autotune summary"), "manifest includes thermostat summary");
assert.ok(manifest.includes("Meta-Agentic α-AGI Orchestration"), "manifest references flagship mission pillar");
assert.ok(manifest.toLowerCase().includes("unstoppable"), "manifest should emphasise unstoppable readiness");

console.log("✅ ASI Takes Off launcher exports a non-technical manifest");
