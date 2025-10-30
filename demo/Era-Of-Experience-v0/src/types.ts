export interface AgentProfile {
  id: string;
  skill: number;
  speed: number;
  reliability: number;
  cost: number;
  adaptivity: number;
  stake: number;
}

export interface ScenarioConfig {
  name: string;
  description: string;
  seed: number;
  jobs: JobDistributionConfig;
  agents: AgentProfile[];
  market: MarketDynamics;
  reward?: Partial<RewardWeights>;
  policy?: Partial<PolicyConfig>;
}

export interface JobDistributionConfig {
  count: number;
  valueRange: [number, number];
  complexityRange: [number, number];
  deadlineRange: [number, number];
  criticalMass: number;
  enterpriseMix: number;
}

export interface MarketDynamics {
  volatility: number;
  demandPulse: number;
  regulatoryFriction: number;
}

export interface RewardWeights {
  successWeight: number;
  valueWeight: number;
  latencyWeight: number;
  costWeight: number;
  satisfactionWeight: number;
  longTermCompoundingWeight: number;
  latencyReference: number;
  costReference: number;
  satisfactionReference: number;
}

export interface PolicyConfig {
  learningRate: number;
  batchSize: number;
  experienceWindow: number;
  explorationEpsilon: number;
  temperature: number;
  entropyWeight: number;
}

export interface Job {
  id: string;
  value: number;
  complexity: number;
  deadlineHours: number;
  enterprise: boolean;
  critical: boolean;
  theme: JobTheme;
}

export type JobTheme = 'innovation' | 'compliance' | 'velocity';

export interface AssignmentContext {
  job: Job;
  market: MarketDynamics;
  agents: AgentProfile[];
}

export interface AssignmentOutcome {
  agent: AgentProfile;
  success: boolean;
  durationHours: number;
  cost: number;
  satisfaction: number;
  reward: number;
  experience: Experience;
}

export interface Experience {
  jobId: string;
  state: number[][]; // features per agent
  action: number;
  probabilities: number[];
  reward: number;
  metrics: {
    success: boolean;
    durationHours: number;
    cost: number;
    satisfaction: number;
    value: number;
  };
}

export interface RunMetrics {
  gmv: number;
  cost: number;
  successes: number;
  failures: number;
  averageLatency: number;
  averageSatisfaction: number;
  roi: number;
  autonomyLift: number;
  rewardAverage: number;
  rewardVolatility: number;
  learningSignalDensity: number;
}

export interface RunResult {
  label: string;
  metrics: RunMetrics;
  trajectory: TrajectoryPoint[];
}

export interface TrajectoryPoint {
  jobId: string;
  cumulativeGMV: number;
  cumulativeCost: number;
  runningROI: number;
  success: boolean;
  selectedAgent: string;
  reward: number;
}

export interface DemoResult {
  scenario: ScenarioConfig;
  baseline: RunResult;
  learning: RunResult;
  delta: Record<string, number>;
}

export interface DemoRunOptions {
  scenarioPath: string;
  rewardPath?: string;
  outputDir?: string;
  uiDataPath?: string;
  writeReports?: boolean;
  jobCountOverride?: number;
  seedOverride?: number;
}
