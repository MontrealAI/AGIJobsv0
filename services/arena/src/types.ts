import type { RoundState, CommitteeRole } from '@prisma/client';

export interface StartRoundInput {
  roundMetadata?: Record<string, unknown>;
  targetDurationSeconds?: number;
  contestantIds: string[];
  validatorIds: string[];
}

export interface CommitPayload {
  roundId: string;
  agentId: string;
  commitHash: string;
}

export interface RevealPayload {
  roundId: string;
  agentId: string;
  submission: unknown;
  proof: string;
}

export interface ArenaState {
  id: string;
  state: RoundState;
  commitDeadline?: Date | null;
  revealDeadline?: Date | null;
  difficultyScore: number;
}

export interface ModerationResult {
  flagged: boolean;
  reason?: string;
}

export interface JobsTask {
  id: string;
  prompt: string;
  deadline: string;
  reward: string;
}

export interface JobsClientConfig {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface QDScore {
  fitness: number;
  diversity: number;
}

export interface DifficultySnapshot {
  timestamp: Date;
  error: number;
  newScore: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureAt?: number;
  openUntil?: number;
}

export interface SnapshotArtifact {
  cid: string;
  bytes: number;
}

export type CommitteeComposition = {
  roundId: string;
  agentId: string;
  role: CommitteeRole;
};
