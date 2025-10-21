import type { OperationInstance } from "./operations";

export interface MissionMeta {
  version: string;
  title: string;
  subtitle?: string;
  description: string;
  ownerAddress: string;
  treasuryAddress: string;
  timelockSeconds: number;
  governance?: {
    council?: string[];
    sentinels?: string[];
    ownerScripts?: string[];
  };
}

export interface MissionParameters {
  seed: number;
  generations: number;
  populationSize: number;
  eliteCount: number;
  crossoverRate: number;
  mutationRate: number;
  maxOperations: number;
  energyBudget: number;
  successThreshold: number;
  noveltyTarget: number;
}

export interface QualityDiversityConfig {
  complexityBuckets: number[];
  noveltyBuckets: number[];
  energyBuckets: number[];
}

export interface TaskExample {
  label: string;
  input: number[];
  expected: number[];
}

export interface TaskConstraints {
  maxOperations?: number;
  preferredOperations?: string[];
  expectedEnergy?: number;
}

export interface TaskOwnerMeta {
  jobId: string;
  stake: number;
  reward: number;
  thermodynamicTarget: number;
}

export interface TaskDefinition {
  id: string;
  label: string;
  narrative: string;
  mode: "vector";
  pipelineHint?: string[];
  constraints?: TaskConstraints;
  examples: TaskExample[];
  owner: TaskOwnerMeta;
}

export interface CiRequirement {
  workflow: string;
  requiredJobs: Array<{ id: string; name: string }>;
  minCoverage: number;
  concurrency: string;
}

export interface OwnerCapability {
  category: string;
  label: string;
  command: string;
  verification: string;
}

export interface MissionOwnerControls {
  capabilities: OwnerCapability[];
}

export interface OwnerControlCoverage {
  requiredCategories: string[];
  satisfiedCategories: string[];
  missingCategories: string[];
  readiness: "ready" | "attention" | "blocked";
}

export interface MissionConfig {
  meta: MissionMeta;
  parameters: MissionParameters;
  qualityDiversity: QualityDiversityConfig;
  tasks: TaskDefinition[];
  ci: CiRequirement;
  ownerControls: MissionOwnerControls;
}

export interface CandidateMetrics {
  score: number;
  accuracy: number;
  error: number;
  energy: number;
  novelty: number;
  coverage: number;
  operationsUsed: number;
}

export interface CandidateRecord {
  id: string;
  operations: OperationInstance[];
  metrics: CandidateMetrics;
  produced: number[][];
  generation: number;
}

export interface VerificationPerspective {
  id: string;
  label: string;
  method: string;
  passed: boolean;
  confidence: number;
  scoreDelta?: number;
  accuracyDelta?: number;
  noveltyDelta?: number;
  energyDelta?: number;
  notes?: string;
}

export interface TriangulationReport {
  candidateId: string;
  consensus: "confirmed" | "attention" | "rejected";
  confidence: number;
  passed: number;
  total: number;
  perspectives: VerificationPerspective[];
}

export interface GenerationSnapshot {
  generation: number;
  bestScore: number;
  meanScore: number;
  medianScore: number;
  diversity: number;
  eliteScore: number;
  timestamp: string;
}

export interface ArchiveCell {
  key: string;
  features: { complexity: number; novelty: number; energy: number };
  candidate: CandidateRecord;
}

export interface TaskResult {
  task: TaskDefinition;
  bestCandidate: CandidateRecord;
  elites: CandidateRecord[];
  history: GenerationSnapshot[];
  archive: ArchiveCell[];
  triangulation: TriangulationReport;
}

export interface SynthesisRun {
  mission: MissionConfig;
  generatedAt: string;
  parameters: MissionParameters;
  tasks: TaskResult[];
  ownerCoverage: OwnerControlCoverage;
  aggregate: {
    globalBestScore: number;
    averageAccuracy: number;
    energyUsage: number;
    noveltyScore: number;
    coverageScore: number;
    triangulationConfidence: number;
    consensus: {
      confirmed: number;
      attention: number;
      rejected: number;
    };
  };
}
