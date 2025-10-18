import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { buildOwnerAtlas, formatOwnerAtlasMarkdown } from "../shared/ownerAtlas.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");
const repoRoot = path.join(root, "..", "..");

function loadJson(relativePath) {
  const file = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const uiConfig = loadJson("config/constellation.ui.config.json");
const hubs = loadJson("config/constellation.hubs.json");
const { atlas } = buildOwnerAtlas(hubs, uiConfig);
const markdown = formatOwnerAtlasMarkdown(atlas, {
  network: uiConfig.network,
  generatedAt: new Date()
});

const outDir = path.join(repoRoot, "reports", "sovereign-constellation");
ensureDir(outDir);
const outFile = path.join(outDir, "owner-atlas.md");
fs.writeFileSync(outFile, `${markdown}\n`);
console.log(`🛰️ Sovereign Constellation owner atlas generated at ${outFile}`);
