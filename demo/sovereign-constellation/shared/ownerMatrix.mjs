function formatTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
  return `${formatter.format(date)} UTC`;
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => ({
    ...entry,
    automation: Array.isArray(entry.automation) ? entry.automation : [],
    notes: Array.isArray(entry.notes) ? entry.notes : []
  }));
}

function indexAtlas(atlas) {
  const collection = Array.isArray(atlas?.atlas) ? atlas.atlas : Array.isArray(atlas) ? atlas : [];
  const index = new Map();
  for (const hub of collection) {
    if (!hub) continue;
    if (hub.hubId) {
      index.set(hub.hubId, hub);
    }
    if (hub.label) {
      index.set(hub.label, hub);
    }
  }
  return { index };
}

function findModule(hub, moduleName) {
  if (!hub || !Array.isArray(hub.modules)) {
    return undefined;
  }
  return hub.modules.find((module) => module.module === moduleName);
}

function findAction(module, method) {
  if (!module || !Array.isArray(module.actions)) {
    return undefined;
  }
  return module.actions.find((action) => action.method === method);
}

export function buildOwnerCommandMatrix(entries, atlas) {
  const normalizedEntries = normalizeEntries(entries);
  const { index } = indexAtlas(atlas);
  return normalizedEntries.map((entry) => {
    const hub = index.get(entry.hub) ?? index.get(entry.hub?.trim?.());
    const module = findModule(hub, entry.module);
    const action = findAction(module, entry.method);
    const available = Boolean(action);
    const status = available
      ? "ready"
      : !hub
        ? "hub-missing"
        : !module
          ? "module-missing"
          : "action-missing";
    return {
      ...entry,
      hubLabel: hub?.label ?? entry.hub,
      networkName: hub?.networkName,
      contractAddress: module?.address,
      explorerWriteUrl: action?.explorerWriteUrl,
      available,
      status,
      resolvedAt: new Date().toISOString(),
      atlasModules: hub?.modules?.map((item) => item.module) ?? [],
      atlasActions: module?.actions?.map((item) => item.method) ?? []
    };
  });
}

export function summarizeAvailability(matrix) {
  const totals = matrix.reduce(
    (acc, entry) => {
      if (entry.available) {
        acc.ready += 1;
      } else {
        acc.pending += 1;
        acc.pendingReasons[entry.status] = (acc.pendingReasons[entry.status] ?? 0) + 1;
      }
      return acc;
    },
    { ready: 0, pending: 0, pendingReasons: {} }
  );
  return totals;
}

function formatAutomation(commands) {
  if (!commands || commands.length === 0) {
    return "  Automation: (manual execution via explorer)";
  }
  const lines = ["  Automation:"];
  for (const command of commands) {
    lines.push(`   • ${command}`);
  }
  return lines.join("\n");
}

function formatNotes(notes) {
  if (!notes || notes.length === 0) {
    return [];
  }
  const lines = ["  Notes:"];
  for (const note of notes) {
    lines.push(`   • ${note}`);
  }
  return lines;
}

export function formatOwnerCommandMatrixForCli(matrix, options = {}) {
  const lines = [];
  const timestamp = formatTimestamp();
  const missionTitle = options.missionTitle ?? "ASI Takes Off";
  const constellationLabel = options.constellationLabel ?? "Sovereign Constellation";
  lines.push(`🎚️  Owner Command Center — ${missionTitle}`);
  lines.push(`${constellationLabel} :: mission director control deck`);
  lines.push(`Generated ${timestamp}.`);
  lines.push("");

  const summary = summarizeAvailability(matrix);
  lines.push(
    `Matrix status: ${summary.ready} ready levers, ${summary.pending} pending (${Object.entries(summary.pendingReasons)
      .map(([key, value]) => `${value}×${key}`)
      .join(", ") || "no pending items"}).`
  );
  lines.push("All actions stay inside the owner's wallet — review, sign, confirm.");
  lines.push("");

  for (const entry of matrix) {
    const statusLabel = entry.available ? "READY" : `PENDING — ${entry.status}`;
    lines.push(`• ${entry.title}`);
    lines.push(`  Pillar: ${entry.pillarId}`);
    lines.push(`  Hub: ${entry.hubLabel}${entry.networkName ? ` (${entry.networkName})` : ""}`);
    lines.push(`  Module: ${entry.module} :: ${entry.method}`);
    lines.push(`  Status: ${statusLabel}`);
    lines.push(`  Owner move: ${entry.ownerAction}`);
    lines.push(`  Operator signal: ${entry.operatorSignal}`);
    lines.push(`  Proof artefact: ${entry.proof}`);
    if (entry.available) {
      lines.push(`  Explorer write panel: ${entry.explorerWriteUrl}`);
    } else {
      lines.push("  Explorer write panel: pending (populate constellation.hubs.json addresses to activate)");
    }
    lines.push(formatAutomation(entry.automation));
    lines.push(...formatNotes(entry.notes));
    lines.push("");
  }

  lines.push("Run npm run demo:sovereign-constellation:atlas after every deployment to refresh explorer links.");
  lines.push("Review the Thermostat plan (npm run demo:sovereign-constellation:plan) before applying cadence changes.");
  lines.push("");
  return lines.join("\n");
}
