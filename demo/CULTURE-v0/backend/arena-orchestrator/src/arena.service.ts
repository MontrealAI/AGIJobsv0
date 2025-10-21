import { computeNextDifficulty, DifficultyConfig } from './difficulty.js';
import { eloUpdate } from './elo.js';
import { computeDiversityMetrics } from './qd.js';
import { createJob, finalizeJob } from './agijobs.js';
import { pinJSON } from './ipfs.js';

export type AgentRole = 'teacher' | 'student' | 'validator';

export interface ArenaConfig {
  readonly targetSuccessRate: number;
  readonly maxDifficultyStep: number;
  readonly minDifficulty: number;
  readonly maxDifficulty: number;
  readonly initialDifficulty: number;
  readonly proportionalGain: number;
}

export interface StartArenaInput {
  readonly artifactId: number;
  readonly teacher: string;
  readonly students: readonly string[];
  readonly validators: readonly string[];
  readonly difficultyOverride?: number;
}

export interface RoundSummary {
  readonly roundId: number;
  readonly difficulty: number;
  readonly winners: readonly string[];
  readonly difficultyDelta: number;
  readonly observedSuccessRate: number;
  readonly snapshotCid: string;
}

interface AgentStats {
  rating: number;
  wins: number;
  losses: number;
  role: AgentRole;
}

interface ParticipantState {
  address: string;
  jobId: number;
}

interface RoundState {
  id: number;
  artifactId: number;
  teacher: ParticipantState;
  students: ParticipantState[];
  validators: ParticipantState[];
  startedAt: Date;
  closedAt?: Date;
  finalizedAt?: Date;
  winners: string[];
  status: 'open' | 'closed' | 'finalized';
  difficulty: number;
  difficultyDelta: number;
  successRate: number;
  snapshotCid?: string;
}

export class ArenaService {
  private readonly rounds = new Map<number, RoundState>();
  private readonly agentStats = new Map<string, AgentStats>();
  private nextRoundId = 1;
  private currentDifficulty: number;

  constructor(private readonly config: ArenaConfig) {
    this.currentDifficulty = config.initialDifficulty;
  }

  async startRound(input: StartArenaInput): Promise<RoundState> {
    const difficulty = input.difficultyOverride ?? this.currentDifficulty;
    const teacherJob = await createJob(`Teacher round for artifact ${input.artifactId} at difficulty ${difficulty}`);

    const studentStates: ParticipantState[] = [];
    for (const student of input.students) {
      const job = await createJob(`Student challenge for artifact ${input.artifactId}`);
      studentStates.push({ address: normalise(student), jobId: job.jobId });
      this.ensureAgent(normalise(student), 'student');
    }

    const validatorStates: ParticipantState[] = [];
    for (const validator of input.validators) {
      const job = await createJob(`Validator review for artifact ${input.artifactId}`);
      validatorStates.push({ address: normalise(validator), jobId: job.jobId });
      this.ensureAgent(normalise(validator), 'validator');
    }

    const teacherState: ParticipantState = { address: normalise(input.teacher), jobId: teacherJob.jobId };
    this.ensureAgent(teacherState.address, 'teacher');

    const round: RoundState = {
      id: this.nextRoundId++,
      artifactId: input.artifactId,
      teacher: teacherState,
      students: studentStates,
      validators: validatorStates,
      startedAt: new Date(),
      winners: [],
      status: 'open',
      difficulty,
      difficultyDelta: 0,
      successRate: 0
    };

    this.rounds.set(round.id, round);
    return round;
  }

  closeRound(roundId: number): RoundState {
    const round = this.requireRound(roundId);
    if (round.status !== 'open') {
      return round;
    }
    round.status = 'closed';
    round.closedAt = new Date();
    return round;
  }

  async finalizeRound(roundId: number, winners: readonly string[]): Promise<RoundSummary> {
    const round = this.requireRound(roundId);
    if (round.status !== 'closed') {
      throw new Error('Round must be closed before finalisation');
    }

    for (const student of round.students) {
      await finalizeJob(student.jobId);
    }
    for (const validator of round.validators) {
      await finalizeJob(validator.jobId);
    }
    await finalizeJob(round.teacher.jobId);

    const winnerSet = new Set(winners.map((winner) => normalise(winner)));
    round.winners = Array.from(winnerSet);

    const successRate = round.students.length === 0 ? 0 : round.winners.length / round.students.length;

    const difficultyResult = computeNextDifficulty(round.difficulty, successRate, this.difficultyConfig());
    this.currentDifficulty = difficultyResult.nextDifficulty;

    this.updateRatings(round.teacher.address, round.students.map((s) => s.address), winnerSet);

    const diversity = computeDiversityMetrics(round.winners, round.students.map((s) => s.address));

    const snapshot = await pinJSON({
      roundId,
      artifactId: round.artifactId,
      difficulty: round.difficulty,
      difficultyDelta: difficultyResult.delta,
      winners: round.winners,
      successRate,
      diversity,
      timestamp: new Date().toISOString()
    });

    round.status = 'finalized';
    round.finalizedAt = new Date();
    round.successRate = successRate;
    round.difficultyDelta = difficultyResult.delta;
    round.snapshotCid = snapshot.cid;

    return {
      roundId,
      difficulty: round.difficulty,
      winners: round.winners,
      difficultyDelta: difficultyResult.delta,
      observedSuccessRate: successRate,
      snapshotCid: snapshot.cid
    };
  }

  getScoreboard() {
    const agents = Array.from(this.agentStats.entries()).map(([address, stats]) => ({
      address,
      ...stats
    }));

    const rounds = Array.from(this.rounds.values()).map((round) => ({
      id: round.id,
      difficulty: round.difficulty,
      difficultyDelta: round.difficultyDelta,
      successRate: round.successRate,
      status: round.status,
      winners: round.winners,
      snapshotCid: round.snapshotCid,
      startedAt: round.startedAt,
      closedAt: round.closedAt,
      finalizedAt: round.finalizedAt
    }));

    return {
      agents,
      rounds,
      currentDifficulty: this.currentDifficulty
    };
  }

  getRound(roundId: number): RoundState {
    return this.requireRound(roundId);
  }

  private ensureAgent(address: string, role: AgentRole): void {
    if (!this.agentStats.has(address)) {
      this.agentStats.set(address, { rating: 1200, wins: 0, losses: 0, role });
    }
  }

  private updateRatings(teacherAddress: string, students: string[], winners: Set<string>): void {
    const teacherStats = this.agentStats.get(teacherAddress);
    if (!teacherStats) throw new Error('Unknown teacher');

    let teacherRating = teacherStats.rating;
    let teacherWins = 0;
    let teacherLosses = 0;

    const updatedStudents: Array<[string, AgentStats]> = [];

    for (const studentAddress of students) {
      const studentStats = this.agentStats.get(studentAddress);
      if (!studentStats) continue;

      const studentWon = winners.has(studentAddress);
      const score: 0 | 0.5 | 1 = studentWon ? 1 : 0;

      const { ratingA, ratingB } = eloUpdate(studentStats.rating, teacherRating, score);
      studentStats.rating = ratingA;
      if (studentWon) {
        studentStats.wins += 1;
        teacherLosses += 1;
      } else {
        studentStats.losses += 1;
        teacherWins += 1;
      }

      updatedStudents.push([studentAddress, studentStats]);
      teacherRating = ratingB;
    }

    teacherStats.rating = teacherRating;
    teacherStats.wins += teacherWins;
    teacherStats.losses += teacherLosses;

    if (winners.size === 0) {
      teacherStats.wins += 1;
    } else {
      teacherStats.losses += 1;
    }

    // Basic validator scoring: reward if at least one winner and validators exist.
    if (winners.size > 0) {
      for (const [address, stats] of this.agentStats.entries()) {
        if (stats.role === 'validator') {
          stats.rating += 5;
        }
      }
    }
  }

  private difficultyConfig(): DifficultyConfig {
    return {
      targetSuccessRate: this.config.targetSuccessRate,
      maxStep: this.config.maxDifficultyStep,
      minDifficulty: this.config.minDifficulty,
      maxDifficulty: this.config.maxDifficulty,
      proportionalGain: this.config.proportionalGain
    };
  }

  private requireRound(roundId: number): RoundState {
    const round = this.rounds.get(roundId);
    if (!round) {
      throw new Error(`Round ${roundId} not found`);
    }
    return round;
  }
}

function normalise(address: string): string {
  return address.toLowerCase();
}
