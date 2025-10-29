export interface AgentProfile {
  id: string;
  name: string;
  specialization: string[];
  reliability: number; // 0-1
  velocity: number; // jobs per day equivalent speed factor
  operatingCost: number; // base cost per job in tokens
  adaptability: number; // ability to learn new tasks quickly (0-1)
  energyFootprint: number; // cost multiplier for sustainability checks
}

export interface JobDefinition {
  id: string;
  category: string;
  complexity: number; // 1-10
  value: number; // GMV equivalent tokens
  reward: number; // payout to agent
  latencyTargetHours: number;
  criticality: number; // 0-1 importance weight
  experienceRequired: number; // 0-1 proportion of mastery required
  sustainabilityTarget: number; // 0-1 max energy footprint proportion
}

export interface JobOutcome {
  jobId: string;
  agentId: string;
  success: boolean;
  durationHours: number;
  cost: number;
  rating: number; // 0-5 user feedback proxy
  valueCaptured: number;
  penalties: number;
  rewardPaid: number;
}

export interface ExperienceRecord {
  stateId: string;
  actionId: string;
  reward: number;
  timestamp: number;
  nextStateId: string | null;
  terminal: boolean;
  details: {
    job: JobDefinition;
    agent: AgentProfile;
    outcome: JobOutcome;
  };
}

export interface RewardConfig {
  successBonus: number;
  failurePenalty: number;
  gmvWeight: number;
  latencyWeight: number;
  costWeight: number;
  ratingWeight: number;
  sustainabilityWeight: number;
  latencyReferenceHours: number;
}

export interface SimulationConfig {
  horizon: number;
  epsilon: number;
  learningRate: number;
  discountFactor: number;
  bufferSize: number;
  batchSize: number;
  checkpointsToKeep: number;
  ownerControlsPath: string;
  replaySeed?: string;
  checkpointInterval?: number;
  postTrainingEpochs?: number;
}

export interface OwnerControlState {
  exploration: number;
  paused: boolean;
  rewardOverrides?: Partial<RewardConfig>;
  notes?: string;
}

export interface PolicySnapshot {
  id: string;
  createdAt: string;
  description: string;
  qValues: Record<string, Record<string, number>>;
}

export interface SimulationReport {
  baseline: SimulationRunSummary;
  rlEnhanced: SimulationRunSummary;
  improvement: {
    gmvDelta: number;
    gmvLiftPct: number;
    roiDelta: number;
    successRateDelta: number;
    avgLatencyDelta: number;
  };
  experienceLogSample: ExperienceRecord[];
  policySnapshots: PolicySnapshot[];
  mermaidFlow: string;
  mermaidValueStream: string;
  ownerConsole: OwnerConsoleSnapshot;
}

export interface SimulationRunSummary {
  label: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  grossMerchandiseValue: number;
  totalRewardPaid: number;
  averageLatencyHours: number;
  averageCost: number;
  averageRating: number;
  roi: number;
  successRate: number;
  sustainabilityScore: number;
  timeline: Array<{
    jobId: string;
    agentId: string;
    reward: number;
    rewardSignal: number;
    success: boolean;
  }>;
}

export interface OwnerConsoleSnapshot {
  controls: OwnerControlState;
  recommendedActions: string[];
  safeguardStatus: {
    failureRate: number;
    gmvTrend: number;
    latencyTrend: number;
    sentinelActivated: boolean;
    sustainabilityScore: number;
  };
  actionableMermaid: string;
}
