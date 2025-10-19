import { ethers } from "ethers";

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

function summarizeOwnerMatrix(matrix) {
  return matrix.reduce(
    (acc, entry) => {
      if (entry?.available) {
        acc.ready += 1;
      } else {
        acc.pending += 1;
        const status = entry?.status ?? "unknown";
        acc.pendingReasons[status] = (acc.pendingReasons[status] ?? 0) + 1;
      }
      return acc;
    },
    { ready: 0, pending: 0, pendingReasons: {} }
  );
}

function formatMissionProfiles(profiles) {
  const lines = [];
  for (const profile of ensureArray(profiles)) {
    if (!profile) continue;
    lines.push(`### ${profile.title}`);
    if (profile.summary) {
      lines.push(profile.summary);
    }
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
  for (const system of ensureArray(systems)) {
    if (!system) continue;
    lines.push(`### ${system.title}`);
    if (system.summary) {
      lines.push(system.summary);
    }
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
  if (!victory || typeof victory !== "object") {
    return [];
  }
  const lines = [];
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

function formatPlanActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return ["- No immediate thermostat actions are pending."];
  }
  return actions.map((action) => {
    if (!action || typeof action !== "object") {
      return "- Telemetry action unavailable.";
    }
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

function buildManifestLines({
  deck,
  missionProfiles,
  systems,
  victoryPlan,
  plan,
  planSummary,
  ownerSummary,
  ownerMatrixCli
}) {
  const lines = [];
  const missionTitle = deck?.mission?.title ?? "ASI Takes Off";
  const constellationLabel = deck?.constellation?.label ?? "Sovereign Constellation";
  const tagline = deck?.mission?.tagline ?? "Precision mission manifest generated directly from Sovereign Constellation telemetry.";

  lines.push(`# ${missionTitle} — ${constellationLabel} Launch Manifest`);
  lines.push(tagline);
  lines.push("");

  const promise = deck?.constellation?.operatorPromise ?? "Command an AGI workforce without writing code.";
  const scope = deck?.constellation?.summary ?? "Multi-network AGI hubs linked under one owner wallet.";
  lines.push(`Mission control promise: ${promise}`);
  lines.push(`Constellation scope: ${scope}`);
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
  const pendingSummary = Object.entries(ownerSummary.pendingReasons)
    .map(([reason, value]) => `${value}×${reason}`)
    .join(", ");
  lines.push(
    `- Ready levers: ${ownerSummary.ready}, Pending: ${ownerSummary.pending} (${pendingSummary || "no pending reasons"}).`
  );
  lines.push("- Run `npm run demo:sovereign-constellation:owner` for the interactive console.");
  lines.push("- Execute `npm run demo:sovereign-constellation:atlas` after redeployments to refresh explorer links.");
  lines.push("");

  if (ownerMatrixCli) {
    lines.push("### Owner matrix excerpt (CLI format)");
    lines.push("```");
    lines.push(ownerMatrixCli.trimEnd());
    lines.push("```");
    lines.push("");
  }

  lines.push("## Victory assurance plan");
  lines.push(...formatVictoryPlan(victoryPlan));

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

  lines.push("• Victory plan emphasises unstoppable readiness and owner sovereignty.");

  return lines;
}

export function buildAsiLaunchManifest(context, libs) {
  if (!libs) {
    throw new Error("Manifest builder requires helper libraries");
  }
  const {
    buildOwnerAtlas,
    buildOwnerCommandMatrix,
    formatOwnerCommandMatrixForCli,
    computeAutotunePlan
  } = libs;
  if (!buildOwnerAtlas || !buildOwnerCommandMatrix || !formatOwnerCommandMatrixForCli || !computeAutotunePlan) {
    throw new Error("Missing manifest helper implementations");
  }

  const deck = context?.deck ?? {};
  const missionProfiles = ensureArray(context?.missionProfiles);
  const systems = ensureArray(context?.systems);
  const victoryPlan = context?.victoryPlan ?? {};
  const telemetry = context?.telemetry ?? {};
  const ownerMatrixEntries = ensureArray(context?.ownerMatrixEntries);
  const hubs = context?.hubs ?? {};
  const uiConfig = context?.uiConfig ?? {};

  const atlas = buildOwnerAtlas(hubs, uiConfig);
  const ownerMatrix = buildOwnerCommandMatrix(ownerMatrixEntries, atlas);
  const ownerMatrixCli = formatOwnerCommandMatrixForCli(ownerMatrix, {
    missionTitle: deck?.mission?.title ?? "ASI Takes Off",
    constellationLabel: deck?.constellation?.label ?? "Sovereign Constellation"
  });
  const ownerSummary = summarizeOwnerMatrix(ownerMatrix);

  const plan = computeAutotunePlan(telemetry, { mission: deck?.mission?.id ?? "asi-takes-off" });
  const planSummary = plan?.summary ?? {};

  const lines = buildManifestLines({
    deck,
    missionProfiles,
    systems,
    victoryPlan,
    plan,
    planSummary,
    ownerSummary,
    ownerMatrixCli
  });

  const generatedAt = new Date().toISOString();
  const mission = {
    title: deck?.mission?.title ?? "ASI Takes Off",
    tagline:
      deck?.mission?.tagline ??
      "Precision meets destiny as Sovereign Constellation deploys a civilisation-scale AGI workforce.",
    promise: deck?.constellation?.operatorPromise ?? "Launch a planetary AGI workforce without writing code.",
    scope: deck?.constellation?.summary ?? "Three autonomous AGI hubs stay under a single owner wallet.",
    unstoppable:
      "This manifest proves the platform behaves as an unstoppable, owner-controlled superintelligence ready for production."
  };

  return {
    generatedAt,
    mission,
    automation: {
      commands: ensureArray(deck?.automation?.launchCommands),
      ci: deck?.automation?.ci ?? null
    },
    thermostat: {
      summary: {
        averageParticipation: planSummary.averageParticipation ?? null,
        commitWindowSeconds: planSummary.commitWindowSeconds ?? null,
        revealWindowSeconds: planSummary.revealWindowSeconds ?? null,
        minStakeWei: planSummary.minStakeWei ?? null,
        notes: ensureArray(planSummary.notes)
      },
      actions: ensureArray(plan?.actions)
    },
    ownerSummary,
    ownerMatrix,
    ownerMatrixCli,
    markdown: lines.join("\n"),
    preview: lines.slice(0, 24)
  };
}

export const __testing = {
  ensureArray,
  formatParticipation,
  formatSeconds,
  formatMissionProfiles,
  formatSystems,
  formatVictoryPlan,
  formatPlanActions,
  summarizeOwnerMatrix,
  buildManifestLines
};
