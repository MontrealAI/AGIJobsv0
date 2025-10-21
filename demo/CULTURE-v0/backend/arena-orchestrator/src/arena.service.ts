import { EventEmitter } from 'node:events';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';
import { DifficultyConfig, DifficultyController } from './difficulty.js';
import { EloEngine, EloPlayer } from './elo.js';
import { computeDiversityMetrics } from './qd.js';
import { jobRegistry, JobRecord } from './agijobs.js';
import { pinJSON } from './ipfs.js';
import { buildTeacherPrompt, TeacherPrompt } from './prompt.js';
import { ensureContentSafe, SafetyReport } from './safety.js';
import { jsonFileAdapter } from './persistence.js';
import { lockStake, releaseStake, slashStake } from './stake-manager.js';

export type AgentRole = 'teacher' | 'student' | 'validator';

export interface ArenaConfig extends DifficultyConfig {
  readonly initialDifficulty: number;
  readonly roundTimeoutMs: number;
  readonly operationTimeoutMs: number;
  readonly maxRetries: number;
  readonly elo: {
    readonly kFactor: number;
    readonly defaultRating: number;
    readonly floor?: number;
    readonly ceiling?: number;
  };
  readonly persistencePath?: string;
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

interface ParticipantState {
  address: string;
  jobId: number;
  status: 'pending' | 'submitted' | 'validated' | 'failed' | 'timeout';
  submissionCid?: string;
  lastUpdate: Date;
  attempts: number;
}

interface ValidatorState extends ParticipantState {
  verdict?: 'approved' | 'rejected';
}

interface RoundState {
  id: number;
  artifactId: number;
  teacher: ParticipantState;
  students: ParticipantState[];
  validators: ValidatorState[];
  startedAt: Date;
  closedAt?: Date;
  finalizedAt?: Date;
  winners: string[];
  status: 'open' | 'closed' | 'finalized' | 'failed';
  difficulty: number;
  difficultyDelta: number;
  successRate: number;
  snapshotCid?: string;
  teacherPrompt: TeacherPrompt;
  safetyReport: SafetyReport;
  jobMetadata: JobRecord[];
  deadlineAt: Date;
}

interface ScoreboardSnapshot {
  readonly agents: Array<{ address: string; rating: number; stats: EloPlayer }>;
  readonly rounds: Array<Pick<RoundState, 'id' | 'difficulty' | 'difficultyDelta' | 'successRate' | 'status' | 'winners' | 'snapshotCid' | 'startedAt' | 'closedAt' | 'finalizedAt'>>;
  readonly currentDifficulty: number;
  readonly difficultyWindow: DifficultyConfig;
  readonly updatedAt: Date;
}

interface ArenaEvents {
  readonly 'scoreboard:update': (scoreboard: ScoreboardSnapshot) => void;
  readonly 'round:update': (round: RoundState) => void;
}

type ArenaEventNames = keyof ArenaEvents;

class ArenaEmitter extends EventEmitter {
  override on<T extends ArenaEventNames>(event: T, listener: ArenaEvents[T]): this {
    return super.on(event, listener) as this;
  }

  override emit<T extends ArenaEventNames>(event: T, ...args: Parameters<ArenaEvents[T]>): boolean {
    return super.emit(event, ...args);
  }
}

export class ArenaService extends ArenaEmitter {
  private readonly rounds = new Map<number, RoundState>();
  private readonly difficultyController: DifficultyController;
  private readonly eloEngine: EloEngine;
  private readonly ready: Promise<void>;
  private nextRoundId = 1;
  private currentDifficulty: number;

  constructor(private readonly config: ArenaConfig) {
    super();
    this.currentDifficulty = config.initialDifficulty;
    this.difficultyController = new DifficultyController(config);
    const persistence = jsonFileAdapter<Record<string, EloPlayer>>(
      config.persistencePath ?? 'storage/culture/state/elo.json',
      {}
    );
    this.eloEngine = new EloEngine(config.elo, persistence);
    this.ready = this.eloEngine.load().catch((error) => {
      console.warn('Failed to load Elo ratings; starting fresh.', error);
    });

    jobRegistry.on('job:finalized', () => {
      this.emit('scoreboard:update', this.getScoreboard());
    });
  }

  async startRound(input: StartArenaInput): Promise<RoundState> {
    await this.ready;
    const difficulty = input.difficultyOverride ?? this.currentDifficulty;
    const roundId = this.nextRoundId++;

    const prompt = await buildTeacherPrompt({
      artifactId: input.artifactId,
      difficulty,
      roundId
    });
    const safetyReport = ensureContentSafe(prompt.prompt, [prompt.metadata.summary]);

    const teacherState = await this.createParticipant(roundId, input.artifactId, {
      address: input.teacher,
      role: 'teacher'
    });
    const studentStates = await Promise.all(
      input.students.map((address) =>
        this.createParticipant(roundId, input.artifactId, { address, role: 'student' })
      )
    );
    const validatorStates = await Promise.all(
      input.validators.map((address) =>
        this.createParticipant(roundId, input.artifactId, { address, role: 'validator' })
      )
    );

    const round: RoundState = {
      id: roundId,
      artifactId: input.artifactId,
      teacher: teacherState,
      students: studentStates,
      validators: validatorStates,
      startedAt: new Date(),
      winners: [],
      status: 'open',
      difficulty,
      difficultyDelta: 0,
      successRate: 0,
      teacherPrompt: prompt,
      safetyReport,
      jobMetadata: jobRegistry.listJobsByRound(roundId),
      deadlineAt: new Date(Date.now() + this.config.roundTimeoutMs)
    };

    this.rounds.set(round.id, round);
    this.log('round-started', {
      roundId: round.id,
      artifactId: round.artifactId,
      difficulty
    });
    this.emit('round:update', round);
    this.emit('scoreboard:update', this.getScoreboard());
    return round;
  }

  closeRound(roundId: number): RoundState {
    const round = this.requireRound(roundId);
    if (round.status !== 'open') {
      return round;
    }
    round.status = 'closed';
    round.closedAt = new Date();
    this.emit('round:update', round);
    return round;
  }

  async recordSubmission(roundId: number, participant: string, cid: string): Promise<void> {
    const round = this.requireRound(roundId);
    const normalised = participant.toLowerCase();
    const collection = [round.teacher, ...round.students, ...round.validators];
    const target = collection.find((entry) => entry.address === normalised);
    if (!target) {
      throw new Error(`Participant ${participant} not found in round ${roundId}`);
    }
    await jobRegistry.markSubmitted(target.jobId, cid);
    target.status = 'submitted';
    target.submissionCid = cid;
    target.lastUpdate = new Date();
    target.attempts += 1;
    this.emit('round:update', round);
  }

  async finalizeRound(roundId: number, winners: readonly string[]): Promise<RoundSummary> {
    await this.ready;
    const round = this.requireRound(roundId);
    if (round.status !== 'closed') {
      throw new Error('Round must be closed before finalisation');
    }

    const winnerSet = new Set(winners.map((winner) => winner.toLowerCase()));
    round.winners = Array.from(winnerSet);

    await Promise.all(
      round.students.map((student) => this.finalizeParticipant(round, student, winnerSet))
    );
    await Promise.all(
      round.validators.map((validator) => this.finalizeParticipant(round, validator, winnerSet))
    );
    await this.finalizeParticipant(round, round.teacher, winnerSet, true);

    const successRate = round.students.length === 0 ? 0 : winnerSet.size / round.students.length;
    round.successRate = successRate;
    const difficultyResult = this.difficultyController.update(round.difficulty, successRate);
    this.currentDifficulty = difficultyResult.nextDifficulty;
    round.difficultyDelta = difficultyResult.delta;

    this.eloEngine.applyRoundOutcome(
      round.teacher.address,
      round.students.map((s) => s.address),
      winnerSet
    );
    await this.eloEngine.save();

    const diversity = computeDiversityMetrics(
      round.winners,
      round.students.map((s) => s.address)
    );

    const snapshot = await pinJSON({
      roundId,
      artifactId: round.artifactId,
      difficulty: round.difficulty,
      difficultyDelta: difficultyResult.delta,
      winners: round.winners,
      successRate,
      diversity,
      teacherPrompt: round.teacherPrompt,
      timestamp: new Date().toISOString()
    });

    round.status = 'finalized';
    round.finalizedAt = new Date();
    round.snapshotCid = snapshot.cid;

    this.emit('round:update', round);
    this.emit('scoreboard:update', this.getScoreboard());
    this.log('round-finalized', {
      roundId: round.id,
      winners: round.winners,
      snapshotCid: snapshot.cid,
      difficultyDelta: difficultyResult.delta
    });

    return {
      roundId,
      difficulty: round.difficulty,
      winners: round.winners,
      difficultyDelta: difficultyResult.delta,
      observedSuccessRate: successRate,
      snapshotCid: snapshot.cid
    };
  }

  getScoreboard(): ScoreboardSnapshot {
    const agentEntries: Array<{ address: string; rating: number; stats: EloPlayer }> = [];
    const snapshot = this.eloEngine.snapshot();
    for (const [address, stats] of Object.entries(snapshot)) {
      agentEntries.push({ address, rating: stats.rating, stats });
    }

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
      agents: agentEntries,
      rounds,
      currentDifficulty: this.currentDifficulty,
      difficultyWindow: {
        targetSuccessRate: this.config.targetSuccessRate,
        minDifficulty: this.config.minDifficulty,
        maxDifficulty: this.config.maxDifficulty,
        maxStep: this.config.maxStep,
        proportionalGain: this.config.proportionalGain,
        integralGain: this.config.integralGain,
        derivativeGain: this.config.derivativeGain,
        integralDecay: this.config.integralDecay,
        maxIntegral: this.config.maxIntegral
      },
      updatedAt: new Date()
    };
  }

  getRound(roundId: number): RoundState {
    return this.requireRound(roundId);
  }

  private async createParticipant(
    roundId: number,
    artifactId: number,
    input: { address: string; role: AgentRole }
  ): Promise<ParticipantState> {
    const address = input.address.toLowerCase();
    const handle = await this.executeWithRetry(() =>
      jobRegistry.createJob({
        description: `${input.role} assignment for artifact ${artifactId}`,
        roundId,
        role: input.role,
        participant: address,
        artifactId
      })
    );

    await lockStake({
      roundId,
      participant: address,
      role: input.role,
      amount: BigInt(Math.max(1, Math.round(this.currentDifficulty)))
    });

    return {
      address,
      jobId: handle.jobId,
      status: 'pending',
      lastUpdate: new Date(),
      attempts: 0
    };
  }

  private async finalizeParticipant(
    round: RoundState,
    participant: ParticipantState,
    winnerSet: Set<string>,
    isTeacher = false
  ): Promise<void> {
    const hasWon = winnerSet.has(participant.address);
    if (!isTeacher && participant.status !== 'submitted') {
      if (participant.status === 'pending') {
        participant.status = 'timeout';
        await slashStake({
          roundId: round.id,
          participant: participant.address,
          role: 'student',
          amount: BigInt(1),
          reason: 'No submission before deadline'
        });
      }
      return;
    }
    await jobRegistry.finalizeJob(participant.jobId);
    if (!isTeacher) {
      if (hasWon) {
        participant.status = 'validated';
        await releaseStake({
          roundId: round.id,
          participant: participant.address,
          role: 'student',
          amount: BigInt(1)
        });
      } else {
        participant.status = 'failed';
        await slashStake({
          roundId: round.id,
          participant: participant.address,
          role: 'student',
          amount: BigInt(1),
          reason: 'Failed validator quorum'
        });
      }
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, label = 'operation'): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await this.withTimeout(operation(), label);
      } catch (error) {
        attempt += 1;
        if (attempt > this.config.maxRetries) {
          this.log('operation-failed', { label, attempt, error: (error as Error).message });
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} timed out after ${this.config.operationTimeoutMs}ms`)),
          this.config.operationTimeoutMs
        )
      )
    ]);
  }

  private requireRound(roundId: number): RoundState {
    const round = this.rounds.get(roundId);
    if (!round) {
      throw new Error(`Round ${roundId} not found`);
    }
    return round;
  }

  private log(action: string, details: Record<string, unknown>): void {
    const log = buildStructuredLogRecord({
      component: 'arena-service',
      action,
      details
    });
    console.log(JSON.stringify(log));
  }
}
