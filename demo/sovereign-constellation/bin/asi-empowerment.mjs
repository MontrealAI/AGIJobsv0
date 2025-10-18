#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const demoRoot = path.join(__dirname, "..", "");

function loadJson(relPath) {
  const file = path.join(demoRoot, relPath);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  console.log("\n🚀  Sovereign Constellation — ASI Empowerment Deck\n");
  const empowerment = loadJson("config/asiTakesOffEmpowerment.json");
  const hubs = loadJson("config/constellation.hubs.json");
  const uiConfig = loadJson("config/constellation.ui.config.json");
  const ownerMatrixSource = loadJson("config/asiTakesOffOwnerMatrix.json");

  const [{ buildOwnerAtlas }, { buildOwnerCommandMatrix }] = await Promise.all([
    import("../shared/ownerAtlas.mjs"),
    import("../shared/ownerMatrix.mjs")
  ]);

  const atlas = buildOwnerAtlas(hubs, uiConfig);
  const ownerMatrix = buildOwnerCommandMatrix(ownerMatrixSource, atlas);
  const matrixById = new Map(ownerMatrix.map((entry) => [entry.id, entry]));

  console.log(empowerment.summary.headline);
  console.log(empowerment.summary.unstoppable);
  console.log(`Owner supremacy: ${empowerment.summary.ownerSovereignty}`);
  console.log(`Promise to operators: ${empowerment.summary.userPromise}`);
  console.log("");

  if (Array.isArray(empowerment.summary.immediateActions) && empowerment.summary.immediateActions.length > 0) {
    console.log("Immediate actions for mission directors:");
    for (const action of empowerment.summary.immediateActions) {
      console.log(` • ${action}`);
    }
    console.log("");
  }

  for (const section of empowerment.sections ?? []) {
    console.log(`=== ${section.title} ===`);
    console.log(section.promise);
    console.log(section.empowerment);
    if (Array.isArray(section.operatorJourney) && section.operatorJourney.length > 0) {
      console.log("Operator journey:");
      for (const step of section.operatorJourney) {
        console.log(` • ${step}`);
      }
    }
    if (Array.isArray(section.ownerPowers) && section.ownerPowers.length > 0) {
      console.log("Owner powers:");
      for (const power of section.ownerPowers) {
        const resolved = matrixById.get(power.matrixId);
        if (resolved) {
          console.log(` • ${resolved.title} (${resolved.module} :: ${resolved.method})`);
          console.log(`   ${power.description}`);
          console.log(`   Expectation: ${power.expectation}`);
          if (resolved.explorerWriteUrl) {
            console.log(`   Explorer writeContract: ${resolved.explorerWriteUrl}`);
          }
          console.log(`   Status: ${resolved.available ? "READY" : resolved.status}`);
        } else {
          console.log(` • ${power.matrixId} — control pending (update constellation.hubs.json addresses).`);
          console.log(`   ${power.description}`);
          console.log(`   Expectation: ${power.expectation}`);
        }
      }
    }
    if (Array.isArray(section.automation) && section.automation.length > 0) {
      console.log("Automation spine:");
      for (const automation of section.automation) {
        console.log(` • ${automation.label}: ${automation.command}`);
        console.log(`   Impact: ${automation.impact}`);
      }
    }
    if (Array.isArray(section.verification) && section.verification.length > 0) {
      console.log("Verification cues:");
      for (const verification of section.verification) {
        console.log(` • ${verification.artifact}: ${verification.check}`);
      }
    }
    console.log(`Unstoppable signal: ${section.unstoppableSignal}`);
    console.log("");
  }

  console.log("Owner atlas summary:");
  for (const hub of atlas.atlas ?? []) {
    console.log(` • ${hub.label} (${hub.networkName}) :: owner ${hub.owner}`);
    if (Array.isArray(hub.modules)) {
      for (const module of hub.modules) {
        console.log(`   - ${module.module}: ${module.actions.length} owner actions`);
      }
    }
  }
  console.log("");

  console.log("All insights above are sourced from repository configuration and audited AGI Jobs v0 (v2) modules. \nNon-technical leadership can act immediately using only wallet prompts and the documented commands.\n");
}

main().catch((error) => {
  console.error("Failed to render ASI empowerment deck:");
  console.error(error);
  process.exit(1);
});
