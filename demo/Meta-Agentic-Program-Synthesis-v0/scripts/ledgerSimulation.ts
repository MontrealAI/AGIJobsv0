import { createHash } from "crypto";
import type {
  CandidateRecord,
  LedgerAttempt,
  LedgerVote,
  MissionConfig,
  TaskDefinition,
  TaskLedger,
  TaskLedgerSummary,
} from "./types";
import { DeterministicRandom } from "./random";

interface LedgerAgent {
  id: string;
  baseStake: number;
  reputation: number;
}

interface LedgerValidator extends LedgerAgent {
  reliability: number;
}

interface TimelineEvent {
  offset: number;
  type: "job_posted" | "solver_selected" | "result_committed" | "vote_commit" | "vote_reveal" | "consensus_finalised" | "reward_distributed" | "slash_applied" | "requeue";
  details: Record<string, unknown>;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2147483647;
  }
  return hash === 0 ? 1 : hash;
}

function deterministicId(prefix: string, seed: number, rng: DeterministicRandom): string {
  const base = `${prefix}-${Math.abs(seed)}-${Math.floor(rng.next() * 10_000)}`;
  return createHash("sha1").update(base).digest("hex").slice(0, 16);
}

function buildValidators(task: TaskDefinition, mission: MissionConfig, seed: number): LedgerValidator[] {
  const rng = new DeterministicRandom(seed + 577);
  const validatorCount = Math.max(3, Math.min(6, 3 + Math.floor(rng.next() * 3)));
  const validators: LedgerValidator[] = [];
  for (let index = 0; index < validatorCount; index += 1) {
    validators.push({
      id: `validator-${deterministicId(task.id, seed + index * 19, rng)}`,
      baseStake: Math.floor(task.owner.stake * (0.35 + rng.next() * 0.2)),
      reputation: 0.85 + rng.next() * 0.1,
      reliability: 0.88 + rng.next() * 0.09,
    });
  }
  // ensure deterministic ordering
  validators.sort((a, b) => a.id.localeCompare(b.id));
  return validators;
}

function buildSolverCandidates(task: TaskDefinition, seed: number): LedgerAgent[] {
  const rng = new DeterministicRandom(seed + 113);
  const agents: LedgerAgent[] = [];
  const baseStake = Math.max(task.owner.stake, 120_000);
  for (let index = 0; index < 2; index += 1) {
    agents.push({
      id: `solver-${deterministicId(task.id, seed + index * 97, rng)}`,
      baseStake,
      reputation: 0.75 + rng.next() * 0.15,
    });
  }
  return agents;
}

function encodeCommitment(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function scheduleEvents(baseTimestamp: number, events: TimelineEvent[]): {
  timeline: { timestamp: string; type: TimelineEvent["type"]; details: Record<string, unknown> }[];
} {
  const sorted = [...events].sort((a, b) => a.offset - b.offset);
  return {
    timeline: sorted.map((entry) => ({
      timestamp: new Date(baseTimestamp + entry.offset * 1000).toISOString(),
      type: entry.type,
      details: entry.details,
    })),
  };
}

export function simulateLedger(
  task: TaskDefinition,
  mission: MissionConfig,
  candidate: CandidateRecord,
  seed: number,
): TaskLedger {
  const baseSeed = hashString(`${task.id}|${mission.meta.ownerAddress}|${mission.parameters.seed}`) + Math.abs(seed) * 13;
  const rng = new DeterministicRandom(baseSeed);
  const validators = buildValidators(task, mission, baseSeed);
  const solvers = buildSolverCandidates(task, baseSeed);
  const baseTimestamp = Date.UTC(2042, 0, 1) + Math.floor(rng.next() * 86_400) * 1000;

  const attempts: LedgerAttempt[] = [];
  const timeline: TimelineEvent[] = [];
  const validatorSummaries = validators.map((validator) => ({
    validatorId: validator.id,
    stakeBefore: validator.baseStake,
    stakeAfter: validator.baseStake,
    rewardEarned: 0,
    slashed: 0,
    participationRate: 0,
    participations: 0,
  }));

  const requiredStake = task.owner.stake;
  const rewardPool = task.owner.reward;
  const treasuryReturn = Math.floor(rewardPool * 0.06);

  timeline.push({
    offset: 0,
    type: "job_posted",
    details: {
      jobId: task.owner.jobId,
      reward: rewardPool,
      stakeRequired: requiredStake,
      description: task.narrative,
    },
  });

  const failingSolver = solvers[0];
  const successfulSolver = solvers[1] ?? solvers[0];

  let offset = 45;
  timeline.push({
    offset,
    type: "solver_selected",
    details: { solverId: failingSolver.id, stakePosted: failingSolver.baseStake },
  });

  const failingCommit = encodeCommitment(`${failingSolver.id}|${baseSeed}|misaligned`);
  offset += 35;
  timeline.push({ offset, type: "result_committed", details: { solverId: failingSolver.id, commit: failingCommit } });

  const failingVotes: LedgerVote[] = [];
  let failYesVotes = 0;
  validators.forEach((validator, index) => {
    const participates = rng.next() <= validator.reliability;
    if (!participates) {
      return;
    }
    const commitment = encodeCommitment(`${validator.id}|${failingCommit}|attempt0`);
    offset += 8 + Math.floor(rng.next() * 5);
    timeline.push({ offset, type: "vote_commit", details: { validator: validator.id, commitment } });
    const voteYes = index === 0 && rng.next() > 0.6 ? true : rng.next() > 0.65;
    const vote = voteYes ? "yes" : "no";
    failYesVotes += voteYes ? validator.baseStake : 0;
    offset += 10 + Math.floor(rng.next() * 6);
    timeline.push({ offset, type: "vote_reveal", details: { validator: validator.id, vote } });
    const summary = validatorSummaries.find((entry) => entry.validatorId === validator.id);
    if (summary) {
      summary.participations += 1;
    }
    failingVotes.push({
      validatorId: validator.id,
      commitment,
      revealed: vote,
      weight: validator.baseStake,
      rewardEarned: 0,
      slashed: voteYes ? 0 : 0,
      notes: vote === "no" ? "Detected thermodynamic drift" : undefined,
    });
  });

  const failConsensus = failYesVotes > validators.reduce((acc, validator) => acc + validator.baseStake, 0) * 0.66;
  const failSlash = Math.floor(requiredStake * 0.12);
  offset += 16;
  timeline.push({
    offset,
    type: "consensus_finalised",
    details: {
      attempt: 1,
      solverId: failingSolver.id,
      consensus: failConsensus ? "accepted" : "rejected",
      yesWeight: failYesVotes,
    },
  });

  if (!failConsensus) {
    timeline.push({
      offset: offset + 6,
      type: "slash_applied",
      details: { solverId: failingSolver.id, amount: failSlash, reason: "Failed consensus" },
    });
  }

  attempts.push({
    attemptId: `${task.id}-attempt-1`,
    solverId: failingSolver.id,
    status: failConsensus ? "accepted" : "slashed",
    commitHash: failingCommit,
    reveal: "insufficient-delta",
    consensus: failConsensus ? "accepted" : "rejected",
    rewardEarned: failConsensus ? Math.floor(rewardPool * 0.25) : 0,
    slashApplied: failConsensus ? 0 : failSlash,
    latencySeconds: offset,
    energyObserved: candidate.metrics.energy * 0.8,
    notes: failConsensus
      ? "Legacy agent squeaked through but below thermodynamic target; improvement mandated."
      : "Consensus rejected misaligned agent – stake partially slashed and job requeued.",
    votes: failingVotes,
  });

  if (!failConsensus) {
    timeline.push({
      offset: offset + 18,
      type: "requeue",
      details: {
        solverId: successfulSolver.id,
        reason: "Meta-architect escalated to evolved agent",
      },
    });
    offset += 22;
  } else {
    offset += 28;
  }

  timeline.push({
    offset,
    type: "solver_selected",
    details: { solverId: successfulSolver.id, stakePosted: successfulSolver.baseStake },
  });

  const successCommit = encodeCommitment(`${successfulSolver.id}|${baseSeed}|${candidate.id}`);
  offset += 32;
  timeline.push({
    offset,
    type: "result_committed",
    details: {
      solverId: successfulSolver.id,
      commit: successCommit,
      operations: candidate.operations.length,
    },
  });

  const successVotes: LedgerVote[] = [];
  let yesWeight = 0;
  validators.forEach((validator) => {
    const commitment = encodeCommitment(`${validator.id}|${successCommit}|attempt1`);
    offset += 7 + Math.floor(rng.next() * 5);
    timeline.push({ offset, type: "vote_commit", details: { validator: validator.id, commitment } });
    offset += 9 + Math.floor(rng.next() * 5);
    timeline.push({ offset, type: "vote_reveal", details: { validator: validator.id, vote: "yes" } });
    yesWeight += validator.baseStake;
    const summary = validatorSummaries.find((entry) => entry.validatorId === validator.id);
    if (summary) {
      summary.participations += 1;
    }
    const rewardEarned = Math.floor((rewardPool * 0.12) / validators.length);
    successVotes.push({
      validatorId: validator.id,
      commitment,
      revealed: "yes",
      weight: validator.baseStake,
      rewardEarned,
      slashed: 0,
      notes: "Validated evolved solver output",
    });
  });

  offset += 14;
  timeline.push({
    offset,
    type: "consensus_finalised",
    details: {
      attempt: attempts.length + 1,
      solverId: successfulSolver.id,
      consensus: "accepted",
      yesWeight,
    },
  });

  const solverReward = rewardPool - treasuryReturn - successVotes.reduce((acc, vote) => acc + vote.rewardEarned, 0);
  offset += 12;
  timeline.push({
    offset,
    type: "reward_distributed",
    details: {
      solverId: successfulSolver.id,
      solverReward,
      validatorRewards: successVotes.reduce((acc, vote) => acc + vote.rewardEarned, 0),
      treasuryReturn,
    },
  });

  attempts.push({
    attemptId: `${task.id}-attempt-2`,
    solverId: successfulSolver.id,
    status: "accepted",
    commitHash: successCommit,
    reveal: candidate.id,
    consensus: "accepted",
    rewardEarned: solverReward,
    slashApplied: 0,
    latencySeconds: offset,
    energyObserved: candidate.metrics.energy,
    notes: "Meta-agentic evolved solver achieved consensus and claimed rewards.",
    votes: successVotes,
  });

  let totalParticipation = 0;
  validatorSummaries.forEach((summary) => {
    const totalVotes = attempts.reduce((acc, attempt) => acc + attempt.votes.filter((vote) => vote.validatorId === summary.validatorId).length, 0);
    totalParticipation += totalVotes > 0 ? 1 : 0;
    summary.rewardEarned = attempts.reduce(
      (acc, attempt) =>
        acc + attempt.votes.filter((vote) => vote.validatorId === summary.validatorId).reduce((sum, vote) => sum + vote.rewardEarned, 0),
      0,
    );
    summary.slashed = attempts.reduce(
      (acc, attempt) =>
        acc + attempt.votes.filter((vote) => vote.validatorId === summary.validatorId).reduce((sum, vote) => sum + vote.slashed, 0),
      0,
    );
    summary.stakeAfter = summary.stakeBefore + summary.rewardEarned - summary.slashed;
    summary.participationRate = attempts.length > 0 ? summary.participations / attempts.length : 0;
  });

  const { timeline: resolvedTimeline } = scheduleEvents(baseTimestamp, timeline);

  const totalRewardPaid = attempts.reduce((acc, attempt) => acc + attempt.rewardEarned, 0) + successVotes.reduce((acc, vote) => acc + vote.rewardEarned, 0);
  const totalSlashed = attempts.reduce((acc, attempt) => acc + attempt.slashApplied, 0);
  const validatorRewards = successVotes.reduce((acc, vote) => acc + vote.rewardEarned, 0);
  const averageLatency = attempts.length === 0 ? 0 : attempts.reduce((acc, attempt) => acc + attempt.latencySeconds, 0) / attempts.length;
  const participationRate = validatorSummaries.length === 0
    ? 0
    : validatorSummaries.reduce((acc, summary) => acc + summary.participationRate, 0) / validatorSummaries.length;

  const summary: TaskLedgerSummary = {
    finalConsensus: "accepted",
    totalRewardPaid,
    totalSlashed,
    validatorRewards,
    treasuryReturn,
    averageLatencySeconds: averageLatency,
    participationRate,
    commitRevealIntegrity: totalSlashed > 0 ? "verified" : "attention",
    attempts: attempts.length,
  };

  return {
    jobId: task.owner.jobId,
    missionSeed: baseSeed,
    requiredStake,
    reward: rewardPool,
    attempts,
    timeline: resolvedTimeline,
    validators: validatorSummaries.map(({ participations, ...rest }) => rest),
    summary,
  };
}

export type { TaskLedger, TaskLedgerSummary } from "./types";
