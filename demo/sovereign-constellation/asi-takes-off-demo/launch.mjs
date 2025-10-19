#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.join(__dirname, "..", "");
const outputDir = path.join(__dirname, "output");
const outputFile = path.join(outputDir, "asi-takes-off-launch.md");

function loadJson(relPath, fallback) {
  try {
    const fullPath = path.join(demoRoot, relPath);
    const contents = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

const formatPercent = (value) => {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(2)}%`;
};

const formatSeconds = (value) => {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
};

async function main() {
  const deck = loadJson("config/asiTakesOffMatrix.json", {});
  const missionProfiles = loadJson("config/missionProfiles.json", []);
  const systems = loadJson("config/asiTakesOffSystems.json", []);
  const victory = loadJson("config/asiTakesOffVictoryPlan.json", {});
  const telemetry = loadJson("config/autotune.telemetry.json", {});
  const ownerMatrixEntries = loadJson("config/asiTakesOffOwnerMatrix.json", []);
  const hubs = loadJson("config/constellation.hubs.json", {});
  const uiConfig = loadJson("config/constellation.ui.config.json", {});

  const [ownerAtlasModule, ownerMatrixModule, autotuneModule, manifestModule] = await Promise.all([
    import("../shared/ownerAtlas.mjs"),
    import("../shared/ownerMatrix.mjs"),
    import("../shared/autotune.mjs"),
    import("../shared/launchManifest.mjs")
  ]);

  const manifest = manifestModule.buildAsiLaunchManifest(
    {
      deck,
      missionProfiles,
      systems,
      victoryPlan: victory,
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

  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(outputFile, manifest.markdown, "utf8");

  const participation = formatPercent(manifest.thermostat.summary.averageParticipation ?? Number.NaN);
  const commitWindow = formatSeconds(manifest.thermostat.summary.commitWindowSeconds ?? Number.NaN);

  console.log("🎖️  Sovereign Constellation — ASI Takes Off launcher");
  console.log("Manifest generated successfully. Key excerpts:");
  console.log(` • Output: ${path.relative(process.cwd(), outputFile)}`);
  console.log(` • Owner levers ready: ${manifest.ownerSummary.ready}`);
  console.log(` • Thermostat participation: ${participation}`);
  console.log(` • Recommended commit window: ${commitWindow}`);
  console.log(" • Victory plan emphasises unstoppable readiness and owner sovereignty.");
  console.log("Hand this manifest to the mission director — no code changes required.\n");
}

main().catch((error) => {
  console.error("Failed to generate ASI Takes Off launch manifest.");
  console.error(error);
  process.exit(1);
});
