const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "../../../..");
const result = spawnSync("node", ["demo/sovereign-constellation/bin/asi-empowerment.mjs"], {
  cwd: repoRoot,
  encoding: "utf8"
});

assert.equal(result.status, 0, `empowerment CLI should exit cleanly (stderr: ${result.stderr})`);
assert.ok(result.stdout.includes("ASI Empowerment Deck"), "Output should label the empowerment deck");
assert.ok(result.stdout.toLowerCase().includes("unstoppable"), "Output should emphasise unstoppable readiness");
assert.ok(result.stdout.includes("Owner atlas summary"), "Output should include owner atlas synopsis");
assert.ok(result.stdout.includes("Meta-Agentic α-AGI Orchestration"), "Meta-agentic section should be present");
assert.ok(result.stdout.includes("Winning the AI Race"), "Winning the AI Race section should be present");

console.log("✅ ASI empowerment CLI renders non-technical briefing");
