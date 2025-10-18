export type AutotuneTelemetry = {
  baseline?: {
    commitWindowSeconds?: number;
    revealWindowSeconds?: number;
    minStakeWei?: string | number | bigint;
  };
  missions?: Array<{
    id?: string;
    hub?: string;
    validators?: {
      participation?: number | string;
      avgRevealLatencySeconds?: number | string;
      avgCommitLatencySeconds?: number | string;
    };
  }>;
  economics?: {
    slashingEvents?: number | string;
  };
  recommendations?: {
    disputeModule?: string;
  };
  alerts?: Array<{
    hub?: string;
    type?: string;
    severity?: string;
  }>;
};

export type AutotuneAction = {
  action: string;
  hubs?: string | string[];
  hub?: string;
  commitWindowSeconds?: number;
  revealWindowSeconds?: number;
  minStakeWei?: string;
  module?: string;
  reason: string;
};

export type AutotunePlan = {
  summary: {
    averageParticipation: number;
    commitWindowSeconds: number;
    revealWindowSeconds: number;
    minStakeWei: string;
    actionsRecommended: number;
    avgRevealLatencySeconds: number;
    avgCommitLatencySeconds: number;
    notes: string[];
  };
  actions: AutotuneAction[];
  analytics: {
    totalMissions: number;
    totalSlashingEvents: number;
    criticalAlerts: number;
    participationLower: number;
    participationUpper: number;
  };
};

export function computeAutotunePlan(
  telemetry: AutotuneTelemetry,
  options?: {
    defaultCommitWindowSeconds?: number;
    defaultRevealWindowSeconds?: number;
    defaultMinStakeWei?: string | number | bigint;
    defaultParticipation?: number;
    participationLower?: number;
    participationUpper?: number;
    slashingThreshold?: number;
    disputeModuleFallback?: string;
    revealLatencyCeil?: number;
    commitLatencyCeil?: number;
  }
): AutotunePlan;
