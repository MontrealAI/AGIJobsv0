#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

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

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatParticipation(value) {
  if (!Number.isFinite(value)) {
    return "not available";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatSeconds(value) {
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
}

function formatPlanActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return ["- No immediate thermostat actions are pending."];
  }
  return actions.map((action) => {
    if (action.action === "validation.setCommitRevealWindows") {
      return `- Retune commit/reveal windows to ${formatSeconds(action.commitWindowSeconds)} / ${formatSeconds(action.revealWindowSeconds)} (${action.reason}).`;
    }
    if (action.action === "stakeManager.setMinStake") {
      const stake = action.minStakeWei ? `${ethers.formatEther(action.minStakeWei)} AGIA` : "unspecified";
      return `- Raise minimum stake to ${stake} (${action.reason}).`;
    }
    if (action.action === "jobRegistry.setDisputeModule") {
      return `- Rotate dispute module to ${action.module} (${action.reason}).`;
    }
    if (action.action === "systemPause.pause") {
      return `- Execute emergency pause on ${action.hub ?? "target hub"} (${action.reason}).`;
    }
    return `- ${action.action} :: ${action.reason ?? "telemetry recommendation"}.`;
  });
}

function formatMissionProfiles(profiles) {
  const lines = [];
  for (const profile of profiles) {
    lines.push(`### ${profile.title}`);
    lines.push(profile.summary);
    if (Array.isArray(profile.highlights) && profile.highlights.length > 0) {
      lines.push("");
      lines.push("Key highlights:");
      for (const highlight of profile.highlights) {
        lines.push(`- ${highlight}`);
      }
    }
    lines.push("");
  }
  return lines;
}

function formatSystems(systems) {
  const lines = [];
  for (const system of systems) {
    lines.push(`### ${system.title}`);
    lines.push(system.summary);
    if (Array.isArray(system.operatorWorkflow) && system.operatorWorkflow.length > 0) {
      lines.push("Operator workflow:");
      for (const step of system.operatorWorkflow) {
        lines.push(`- ${step}`);
      }
    }
    if (Array.isArray(system.ownerControls) && system.ownerControls.length > 0) {
      lines.push("Owner supremacy:");
      for (const control of system.ownerControls) {
        lines.push(`- ${control.module} :: ${control.action} — ${control.description}`);
      }
    }
    if (Array.isArray(system.automation) && system.automation.length > 0) {
      lines.push("Automation spine:");
      for (const entry of system.automation) {
        lines.push(`- ${entry.label}: ${entry.command}`);
        if (entry.impact) {
          lines.push(`  ${entry.impact}`);
        }
      }
    }
    if (Array.isArray(system.verification) && system.verification.length > 0) {
      lines.push("Verification artefacts:");
      for (const verification of system.verification) {
        lines.push(`- ${verification.artifact} — ${verification.description}`);
      }
    }
    if (system.assurance) {
      lines.push(`Assurance: ${system.assurance}`);
    }
    lines.push("");
  }
  return lines;
}

function formatVictoryPlan(victory) {
  const lines = [];
  if (!victory || typeof victory !== "object") {
    return lines;
  }
  if (victory.summary) {
    lines.push(victory.summary);
    lines.push("");
  }
  if (Array.isArray(victory.objectives) && victory.objectives.length > 0) {
    lines.push("Objectives:");
    for (const objective of victory.objectives) {
      lines.push(`- ${objective.title}: ${objective.outcome} (verify via ${objective.verification}).`);
    }
    lines.push("");
  }
  if (Array.isArray(victory.ownerControls) && victory.ownerControls.length > 0) {
    lines.push("Owner control drills:");
    for (const control of victory.ownerControls) {
      lines.push(`- ${control.module} :: ${control.action} — run ${control.command} and confirm ${control.verification}.`);
    }
    lines.push("");
  }
  if (Array.isArray(victory.ciGates) && victory.ciGates.length > 0) {
    lines.push("CI guardrails:");
    for (const gate of victory.ciGates) {
      lines.push(`- ${gate.name}: ${gate.command} — ${gate.description}`);
    }
    lines.push("");
  }
  if (victory.telemetry) {
    lines.push("Telemetry metrics:");
    for (const metric of ensureArray(victory.telemetry.metrics)) {
      lines.push(`- ${metric.metric} target ${metric.target} (source ${metric.source}; verify ${metric.verification}).`);
    }
    lines.push("");
  }
  if (victory.assurance) {
    lines.push("Assurance pillars:");
    for (const [key, description] of Object.entries(victory.assurance)) {
      lines.push(`- ${key}: ${description}`);
    }
    lines.push("");
  }
  return lines;
}

async function main() {
  const deck = loadJson("config/asiTakesOffMatrix.json", {});
  const missionProfiles = ensureArray(loadJson("config/missionProfiles.json", []));
  const systems = ensureArray(loadJson("config/asiTakesOffSystems.json", []));
  const victory = loadJson("config/asiTakesOffVictoryPlan.json", {});
  const telemetry = loadJson("config/autotune.telemetry.json", {});
  const ownerMatrixEntries = ensureArray(loadJson("config/asiTakesOffOwnerMatrix.json", []));
  const hubs = loadJson("config/constellation.hubs.json", {});
  const uiConfig = loadJson("config/constellation.ui.config.json", {});

  const [ownerAtlasModule, ownerMatrixModule, autotuneModule] = await Promise.all([
    import("../shared/ownerAtlas.mjs"),
    import("../shared/ownerMatrix.mjs"),
    import("../shared/autotune.mjs")
  ]);

  const atlas = ownerAtlasModule.buildOwnerAtlas(hubs, uiConfig);
  const ownerMatrix = ownerMatrixModule.buildOwnerCommandMatrix(ownerMatrixEntries, atlas);
  const ownerMatrixCli = ownerMatrixModule.formatOwnerCommandMatrixForCli(ownerMatrix, {
    missionTitle: deck?.mission?.title ?? "ASI Takes Off",
    constellationLabel: deck?.constellation?.label ?? "Sovereign Constellation"
  });

  const plan = autotuneModule.computeAutotunePlan(telemetry, {
    mission: deck?.mission?.id ?? "asi-takes-off"
  });

  const planSummary = plan?.summary ?? {};
  const lines = [];

  lines.push(`# ${deck?.mission?.title ?? "ASI Takes Off"} — Sovereign Constellation Launch Manifest`);
  lines.push(deck?.mission?.tagline ?? "Precision mission manifest generated directly from Sovereign Constellation telemetry.");
  lines.push("");

  lines.push(`Mission control promise: ${deck?.constellation?.operatorPromise ?? "Command an AGI workforce without writing code."}`);
  lines.push(`Constellation scope: ${deck?.constellation?.summary ?? "Multi-network AGI hubs linked under one owner wallet."}`);
  lines.push("");

  lines.push("## Launch sequence for non-technical directors");
  for (const command of ensureArray(deck?.automation?.launchCommands)) {
    lines.push(`- ${command.label}: ${command.run}`);
  }
  if (deck?.automation?.ci) {
    lines.push(`- CI Guardrail: ${deck.automation.ci.description}`);
    lines.push(`  Owner visibility: ${deck.automation.ci.ownerVisibility}`);
  }
  lines.push("");

  lines.push("## Pillars of deployment");
  lines.push(...formatMissionProfiles(missionProfiles));

  lines.push("## Systems matrix — Sovereign Constellation");
  lines.push(...formatSystems(systems));

  lines.push("## Thermostat autotune summary");
  lines.push(`- Average participation: ${formatParticipation(planSummary.averageParticipation ?? Number.NaN)}`);
  lines.push(`- Recommended commit window: ${formatSeconds(planSummary.commitWindowSeconds ?? Number.NaN)}`);
  lines.push(`- Recommended reveal window: ${formatSeconds(planSummary.revealWindowSeconds ?? Number.NaN)}`);
  if (planSummary.minStakeWei) {
    lines.push(`- Minimum stake: ${ethers.formatEther(planSummary.minStakeWei)} AGIA`);
  }
  if (Array.isArray(planSummary.notes)) {
    for (const note of planSummary.notes) {
      lines.push(`  • ${note}`);
    }
  }
  lines.push(...formatPlanActions(plan?.actions));
  lines.push("");

  lines.push("## Owner command center status");
  const ownerSummary = ownerMatrixModule.summarizeAvailability(ownerMatrix);
  lines.push(
    `- Ready levers: ${ownerSummary.ready}, Pending: ${ownerSummary.pending} (${Object.entries(ownerSummary.pendingReasons)
      .map(([reason, value]) => `${value}×${reason}`)
      .join(", ") || "no pending reasons"}).`
  );
  lines.push("- Run `npm run demo:sovereign-constellation:owner` for the interactive console.");
  lines.push("- Execute `npm run demo:sovereign-constellation:atlas` after redeployments to refresh explorer links.");
  lines.push("");

  lines.push("### Owner matrix excerpt (CLI format)");
  lines.push("```");
  lines.push(ownerMatrixCli.trimEnd());
  lines.push("```");
  lines.push("");

  lines.push("## Victory assurance plan");
  lines.push(...formatVictoryPlan(victory));

  lines.push("## Owner assurances");
  if (deck?.ownerAssurances) {
    for (const [label, description] of Object.entries(deck.ownerAssurances)) {
      lines.push(`- ${label}: ${description}`);
    }
  }
  lines.push("");

  lines.push("## Next actions");
  lines.push("1. Open the Sovereign Constellation console (`npm run demo:sovereign-constellation`).");
  lines.push("2. Follow the launch sequence above; every wallet prompt arrives pre-tagged with its target network.");
  lines.push("3. Apply thermostat recommendations via the owner console and confirm telemetry metrics.");
  lines.push("4. Execute owner control drills and CI guardrails to prove readiness.");
  lines.push("5. Archive this manifest with mission artefacts to document the launch.");
  lines.push("");

  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(outputFile, lines.join("\n"), "utf8");

  console.log("🎖️  Sovereign Constellation — ASI Takes Off launcher");
  console.log("Manifest generated successfully. Key excerpts:");
  console.log(` • Output: ${path.relative(process.cwd(), outputFile)}`);
  console.log(` • Owner levers ready: ${ownerSummary.ready}`);
  console.log(` • Thermostat participation: ${formatParticipation(planSummary.averageParticipation ?? Number.NaN)}`);
  console.log(" • Victory plan emphasises unstoppable recovery and owner sovereignty.");
  console.log("Hand this manifest to the mission director — no code changes required.\n");
}

main().catch((error) => {
  console.error("Failed to generate ASI Takes Off launch manifest.");
  console.error(error);
  process.exit(1);
});
