const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..", "..");
const configFile = path.join(root, "config/asiTakesOffOwnerMatrix.json");
const entries = JSON.parse(fs.readFileSync(configFile, "utf8"));

assert.ok(Array.isArray(entries) && entries.length >= 5, "Owner matrix must enumerate at least five sovereignty controls");
const pillarSet = new Set(entries.map((entry) => entry.pillarId));
["meta-agentic-alpha-agi-orchestration", "alpha-agi-governance", "making-the-chain-disappear", "recursive-self-improvement", "winning-the-ai-race"].forEach((pillar) => {
  assert.ok(pillarSet.has(pillar), `Owner matrix should contain pillar ${pillar}`);
});

entries.forEach((entry) => {
  assert.ok(entry.id && entry.title, "Owner matrix entries require ids and titles");
  assert.ok(entry.hub && entry.module && entry.method, "Owner matrix entries must reference a hub/module/method");
  assert.ok(entry.ownerAction && entry.operatorSignal, "Owner matrix entries must describe owner and operator signals");
});

(async () => {
  const moduleUrl = pathToFileURL(path.join(root, "shared/ownerMatrix.mjs"));
  const { buildOwnerCommandMatrix, summarizeAvailability } = await import(moduleUrl.href);

  function makeAddress(seed) {
    return `0x${seed.toString(16).padStart(40, "0")}`;
  }

  const atlas = {
    atlas: entries.reduce((acc, entry, index) => {
      let hub = acc.find((item) => item.hubId === entry.hub);
      if (!hub) {
        hub = {
          hubId: entry.hub,
          label: `${entry.hub} (simulated)`,
          networkName: "ConstellationTestnet",
          modules: []
        };
        acc.push(hub);
      }
      let module = hub.modules.find((item) => item.module === entry.module);
      if (!module) {
        module = {
          module: entry.module,
          address: makeAddress(index + 1),
          actions: []
        };
        hub.modules.push(module);
      }
      if (!module.actions.find((action) => action.method === entry.method)) {
        module.actions.push({
          method: entry.method,
          description: `Mock action for ${entry.method}`,
          explorerWriteUrl: `https://explorer.test/${entry.hub}/${entry.module}/${entry.method}`,
          contractAddress: module.address
        });
      }
      return acc;
    }, [])
  };

  const matrix = buildOwnerCommandMatrix(entries, atlas);
  assert.equal(matrix.length, entries.length, "Resolved owner matrix should mirror entry count");
  matrix.forEach((item) => {
    assert.equal(item.status, "ready", "Mock atlas should resolve all entries");
    assert.ok(item.explorerWriteUrl, "Explorer write URL should be populated when module exists");
  });

  const summary = summarizeAvailability(matrix);
  assert.equal(summary.ready, entries.length, "All entries should be ready in the simulated atlas");
  assert.equal(summary.pending, 0, "No entries should be pending in the simulated atlas");

  const cliPath = path.join(root, "bin/asi-owner-matrix.mjs");
  const result = spawnSync("node", [cliPath], { encoding: "utf8" });
  assert.equal(result.status, 0, `Owner command center CLI should exit with status 0. stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes("Owner Command Center"), "CLI output should include owner command center heading");
  assert.ok(result.stdout.includes("Matrix status"), "CLI output should summarise matrix status");
  console.log("✅ Owner matrix dataset validated and CLI briefing renders");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
