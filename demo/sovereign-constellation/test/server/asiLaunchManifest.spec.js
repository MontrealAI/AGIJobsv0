const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");

async function main() {
  const deck = JSON.parse(fs.readFileSync(path.join(root, "config/asiTakesOffMatrix.json"), "utf8"));
  const missionProfiles = JSON.parse(fs.readFileSync(path.join(root, "config/missionProfiles.json"), "utf8"));
  const systems = JSON.parse(fs.readFileSync(path.join(root, "config/asiTakesOffSystems.json"), "utf8"));
  const victoryPlan = JSON.parse(fs.readFileSync(path.join(root, "config/asiTakesOffVictoryPlan.json"), "utf8"));
  const telemetry = JSON.parse(fs.readFileSync(path.join(root, "config/autotune.telemetry.json"), "utf8"));
  const ownerMatrixEntries = JSON.parse(fs.readFileSync(path.join(root, "config/asiTakesOffOwnerMatrix.json"), "utf8"));
  const hubs = JSON.parse(fs.readFileSync(path.join(root, "config/constellation.hubs.json"), "utf8"));
  const uiConfig = JSON.parse(fs.readFileSync(path.join(root, "config/constellation.ui.config.json"), "utf8"));

  const [ownerAtlasModule, ownerMatrixModule, autotuneModule, manifestModule] = await Promise.all([
    import("../../shared/ownerAtlas.mjs"),
    import("../../shared/ownerMatrix.mjs"),
    import("../../shared/autotune.mjs"),
    import("../../shared/launchManifest.mjs")
  ]);

  const manifest = manifestModule.buildAsiLaunchManifest(
    {
      deck,
      missionProfiles,
      systems,
      victoryPlan,
      telemetry,
      ownerMatrixEntries,
      hubs,
      uiConfig
    },
    {
      buildOwnerAtlas: ownerAtlasModule.buildOwnerAtlas,
      buildOwnerCommandMatrix: ownerMatrixModule.buildOwnerCommandMatrix,
      formatOwnerCommandMatrixForCli: ownerMatrixModule.formatOwnerCommandMatrixForCli,
      computeAutotunePlan: autotuneModule.computeAutotunePlan
    }
  );

  assert.ok(manifest.markdown.includes("ASI Takes Off"), "Manifest should include mission title");
  assert.ok(/unstoppable/i.test(manifest.markdown), "Manifest must emphasise unstoppable readiness");
  assert.ok(Array.isArray(manifest.preview) && manifest.preview.length > 0, "Manifest preview should render");
  assert.ok(manifest.ownerSummary.ready >= 0, "Owner readiness should be reported");
  assert.ok(Array.isArray(manifest.ownerMatrix), "Owner matrix should be included");
  assert.ok(Array.isArray(manifest.thermostat.actions), "Thermostat actions should be listed");

  console.log("✅ ASI launch manifest builder exports unstoppable dataset");
}

main().catch((error) => {
  console.error("asiLaunchManifest.spec.js failure");
  console.error(error);
  process.exit(1);
});
