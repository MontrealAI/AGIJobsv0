#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.join(__dirname, "..", "");

function loadJson(relPath) {
  const fullPath = path.join(demoRoot, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

async function main() {
  const [deck, ownerEntries, hubs, uiConfig] = [
    loadJson("config/asiTakesOffMatrix.json"),
    loadJson("config/asiTakesOffOwnerMatrix.json"),
    loadJson("config/constellation.hubs.json"),
    loadJson("config/constellation.ui.config.json")
  ];

  const [{ buildOwnerAtlas }, { buildOwnerCommandMatrix, formatOwnerCommandMatrixForCli }] = await Promise.all([
    import("../shared/ownerAtlas.mjs"),
    import("../shared/ownerMatrix.mjs")
  ]);

  const atlas = buildOwnerAtlas(hubs, uiConfig);
  const matrix = buildOwnerCommandMatrix(ownerEntries, atlas);
  const banner = formatOwnerCommandMatrixForCli(matrix, {
    missionTitle: deck?.mission?.title ?? "ASI Takes Off",
    constellationLabel: deck?.constellation?.label ?? "Sovereign Constellation"
  });

  console.log(banner);
}

main().catch((error) => {
  console.error("Failed to generate Sovereign Constellation owner command matrix:");
  console.error(error);
  process.exit(1);
});
