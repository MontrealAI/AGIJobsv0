import { ethers } from "ethers";

const DEFAULTS = {
  commitWindowSeconds: 3600,
  revealWindowSeconds: 1800,
  minStakeWei: "1000000000000000000",
  participationLower: 0.75,
  participationUpper: 0.95,
  slashingThreshold: 1,
  revealLatencyCeil: 0.7,
  commitLatencyCeil: 0.5
};

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBigIntString(value, fallback = DEFAULTS.minStakeWei) {
  try {
    const bigint = BigInt(value ?? fallback);
    return bigint.toString();
  } catch {
    return BigInt(fallback).toString();
  }
}

function mean(values, fallback = 0) {
  const list = values.filter((value) => Number.isFinite(value));
  if (list.length === 0) {
    return fallback;
  }
  return list.reduce((acc, value) => acc + value, 0) / list.length;
}

function normalizeAddress(address) {
  if (!address || typeof address !== "string") {
    return undefined;
  }
  if (!ethers.isAddress(address)) {
    return undefined;
  }
  const formatted = ethers.getAddress(address);
  if (formatted === ethers.ZeroAddress) {
    return undefined;
  }
  return formatted;
}

function computeParticipation(missions, fallback) {
  if (!Array.isArray(missions) || missions.length === 0) {
    return fallback;
  }
  const participation = missions.map((mission) => {
    const value = mission?.validators?.participation;
    return Number.isFinite(Number(value)) ? Number(value) : undefined;
  });
  const filtered = participation.filter((value) => value !== undefined);
  if (filtered.length === 0) {
    return fallback;
  }
  return mean(filtered, fallback);
}

function computeLatency(missions, key) {
  if (!Array.isArray(missions) || missions.length === 0) {
    return 0;
  }
  const latencies = missions
    .map((mission) => toNumber(mission?.validators?.[key]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (latencies.length === 0) {
    return 0;
  }
  return mean(latencies, 0);
}

export function computeAutotunePlan(telemetry, options = {}) {
  const missions = Array.isArray(telemetry?.missions) ? telemetry.missions : [];
  const baseline = telemetry?.baseline ?? {};
  const averageParticipation = computeParticipation(
    missions,
    options.defaultParticipation ?? DEFAULTS.participationUpper
  );

  const participationLower = options.participationLower ?? DEFAULTS.participationLower;
  const participationUpper = options.participationUpper ?? DEFAULTS.participationUpper;

  let commitWindow = toNumber(
    baseline.commitWindowSeconds,
    options.defaultCommitWindowSeconds ?? DEFAULTS.commitWindowSeconds
  );
  let revealWindow = toNumber(
    baseline.revealWindowSeconds,
    options.defaultRevealWindowSeconds ?? DEFAULTS.revealWindowSeconds
  );
  let minStakeWei = BigInt(
    toBigIntString(baseline.minStakeWei, options.defaultMinStakeWei ?? DEFAULTS.minStakeWei)
  );

  const actions = [];
  const notes = [];

  if (averageParticipation < participationLower) {
    const newCommit = Math.round(commitWindow * 1.4);
    const newReveal = Math.round(revealWindow * 1.25);
    commitWindow = Math.max(newCommit, commitWindow + 300);
    revealWindow = Math.max(newReveal, revealWindow + 240);
    actions.push({
      action: "validation.setCommitRevealWindows",
      hubs: "*",
      commitWindowSeconds: commitWindow,
      revealWindowSeconds: revealWindow,
      reason: `Average validator participation ${averageParticipation.toFixed(2)} below ${participationLower.toFixed(2)}`
    });
    notes.push("Extended commit/reveal windows to absorb validator throughput variance.");
  } else if (averageParticipation > participationUpper) {
    const newCommit = Math.max(Math.round(commitWindow * 0.9), 600);
    const newReveal = Math.max(Math.round(revealWindow * 0.9), 600);
    if (newCommit !== commitWindow || newReveal !== revealWindow) {
      commitWindow = newCommit;
      revealWindow = newReveal;
      actions.push({
        action: "validation.setCommitRevealWindows",
        hubs: "*",
        commitWindowSeconds: commitWindow,
        revealWindowSeconds: revealWindow,
        reason: `Average validator participation ${averageParticipation.toFixed(2)} above ${participationUpper.toFixed(2)}`
      });
      notes.push("Tightened commit/reveal cadence to speed up mission throughput.");
    }
  }

  const totalSlashing = toNumber(telemetry?.economics?.slashingEvents, 0);
  const slashingThreshold = options.slashingThreshold ?? DEFAULTS.slashingThreshold;
  if (totalSlashing > slashingThreshold) {
    minStakeWei = (minStakeWei * BigInt(12)) / BigInt(10);
    actions.push({
      action: "stakeManager.setMinStake",
      hubs: "*",
      minStakeWei: minStakeWei.toString(),
      reason: `Detected ${totalSlashing} slashing events exceeding threshold ${slashingThreshold}`
    });
    notes.push("Raised minimum stake to increase validator collateral coverage.");
  }

  const recommendedModule = normalizeAddress(telemetry?.recommendations?.disputeModule);
  if (recommendedModule) {
    actions.push({
      action: "jobRegistry.setDisputeModule",
      hubs: "*",
      module: recommendedModule,
      reason: "Telemetry recommends escalation-grade dispute module"
    });
    notes.push("Prepared dispute module rotation using telemetry recommendation.");
  } else if (options.disputeModuleFallback) {
    const fallbackModule = normalizeAddress(options.disputeModuleFallback);
    if (fallbackModule) {
      actions.push({
        action: "jobRegistry.setDisputeModule",
        hubs: "*",
        module: fallbackModule,
        reason: "Fallback dispute module supplied by configuration"
      });
      notes.push("Fallback dispute module ready for deployment.");
    }
  }

  const alerts = Array.isArray(telemetry?.alerts) ? telemetry.alerts : [];
  const criticalPauses = alerts
    .filter((alert) => String(alert?.type).toLowerCase() === "pause")
    .filter((alert) => String(alert?.severity).toLowerCase() === "critical")
    .map((alert) => alert?.hub)
    .filter(Boolean);
  const uniqueCriticalHubs = Array.from(new Set(criticalPauses));
  for (const hub of uniqueCriticalHubs) {
    actions.push({
      action: "systemPause.pause",
      hub,
      reason: "Critical telemetry alert"
    });
  }
  if (uniqueCriticalHubs.length > 0) {
    notes.push("Telemetry flagged hubs requiring immediate pause commands.");
  }

  const avgRevealLatency = computeLatency(missions, "avgRevealLatencySeconds");
  const avgCommitLatency = computeLatency(missions, "avgCommitLatencySeconds");
  const latencyWarnings = [];
  const revealCeil = (options.revealLatencyCeil ?? DEFAULTS.revealLatencyCeil) * revealWindow;
  const commitCeil = (options.commitLatencyCeil ?? DEFAULTS.commitLatencyCeil) * commitWindow;
  if (avgRevealLatency > revealCeil) {
    latencyWarnings.push(
      `Reveal latency ${avgRevealLatency.toFixed(0)}s exceeds ${(revealCeil).toFixed(0)}s budget`
    );
  }
  if (avgCommitLatency > commitCeil) {
    latencyWarnings.push(
      `Commit latency ${avgCommitLatency.toFixed(0)}s exceeds ${(commitCeil).toFixed(0)}s budget`
    );
  }
  notes.push(...latencyWarnings);

  const plan = {
    summary: {
      averageParticipation: Number(averageParticipation.toFixed(4)),
      commitWindowSeconds: commitWindow,
      revealWindowSeconds: revealWindow,
      minStakeWei: minStakeWei.toString(),
      actionsRecommended: actions.length,
      avgRevealLatencySeconds: Number(avgRevealLatency.toFixed(2)),
      avgCommitLatencySeconds: Number(avgCommitLatency.toFixed(2)),
      notes: notes.filter(Boolean)
    },
    actions,
    analytics: {
      totalMissions: missions.length,
      totalSlashingEvents: totalSlashing,
      criticalAlerts: uniqueCriticalHubs.length,
      participationLower,
      participationUpper
    }
  };

  return plan;
}
