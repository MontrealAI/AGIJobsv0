import { EventEmitter } from 'node:events';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';
import { DifficultyConfig, DifficultyController } from './difficulty.js';
import { EloEngine, EloPlayer } from './elo.js';
import { computeDiversityMetrics } from './qd.js';
import {
  jobRegistry as defaultJobRegistry,
  JobRecord,
  JobRegistryClient,
  SubmissionUpdate
} from './agijobs.js';
import { pinJSON as defaultPinJSON, PinResult } from './ipfs.js';
import { buildTeacherPrompt, TeacherPrompt } from './prompt.js';
import { ensureContentSafe as defaultEnsureContentSafe, SafetyReport } from './safety.js';
import { jsonFileAdapter, PersistenceAdapter } from './persistence.js';
import { lockStake, releaseStake, slashStake } from './stake-manager.js';
import { SelfPlayArenaClient, InMemorySelfPlayArenaClient } from './selfplay-arena.js';

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
  readonly roundStatePath?: string;
}

export interface ArenaDependencies {
  readonly arenaContract?: SelfPlayArenaClient;
  readonly jobRegistry?: JobRegistryClient;
  readonly pinJSON?: typeof defaultPinJSON;
  readonly ensureContentSafe?: typeof defaultEnsureContentSafe;
  readonly eloPersistence?: PersistenceAdapter<Record<string, EloPlayer>>;
  readonly roundPersistence?: PersistenceAdapter<SerializedArenaState>;
  readonly slashRecipient?: string;
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
  role: AgentRole;
  status: 'pending' | 'submitted' | 'validated' | 'failed' | 'timeout';
  submissionCid?: string;
  lastUpdate: Date;
  attempts: number;
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
  status: 'open' | 'closed' | 'finalized' | 'failed';
  difficulty: number;
  difficultyDelta: number;
  successRate: number;
  snapshotCid?: string;
  teacherPrompt: TeacherPrompt;
  safetyReport: SafetyReport;
  deadlineAt: Date;
}

interface ScoreboardSnapshot {
  readonly agents: Array<{ address: string; rating: number; stats: EloPlayer }>;
  readonly rounds: Array<Pick<RoundState, 'id' | 'difficulty' | 'difficultyDelta' | 'successRate' | 'status' | 'winners' | 'snapshotCid' | 'startedAt' | 'closedAt' | 'finalizedAt'>>;
  readonly currentDifficulty: number;
  readonly difficultyWindow: DifficultyConfig;
  readonly updatedAt: Date;
}

interface SerializedArenaState {
  readonly currentDifficulty: number;
  readonly nextRoundId: number;
  readonly rounds: SerializedRoundState[];
}

interface SerializedRoundState {
  readonly id: number;
  readonly artifactId: number;
  readonly teacher: SerializedParticipantState;
  readonly students: SerializedParticipantState[];
  readonly validators: SerializedParticipantState[];
  readonly startedAt: string;
  readonly closedAt?: string;
  readonly finalizedAt?: string;
  readonly winners: string[];
  readonly status: RoundState['status'];
  readonly difficulty: number;
  readonly difficultyDelta: number;
  readonly successRate: number;
  readonly snapshotCid?: string;
  readonly teacherPrompt: TeacherPrompt;
  readonly safetyReport: SafetyReport;
  readonly deadlineAt: string;
}

interface SerializedParticipantState {
  readonly address: string;
  readonly jobId: number;
  readonly role: AgentRole;
  readonly status: ParticipantState['status'];
  readonly submissionCid?: string;
  readonly lastUpdate: string;
  readonly attempts: number;
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

const DEFAULT_ROUND_STATE: SerializedArenaState = {
  currentDifficulty: 1,
  nextRoundId: 1,
  rounds: []
};

export class ArenaService extends ArenaEmitter {
  private readonly arenaClient: SelfPlayArenaClient;
  private readonly jobRegistry: JobRegistryClient;
  private readonly pinJSON: typeof defaultPinJSON;
  private readonly ensureContentSafe: typeof defaultEnsureContentSafe;
  private readonly roundPersistence: PersistenceAdapter<SerializedArenaState>;
  private readonly eloEngine: EloEngine;
  private readonly difficultyController: DifficultyController;
  private readonly slashRecipient?: string;

  private readonly ready: Promise<void>;
  private readonly rounds = new Map<number, RoundState>();

  private currentDifficulty: number;
  private nextRoundId = 1;

  constructor(private readonly config: ArenaConfig, dependencies: ArenaDependencies = {}) {
    super();
    this.arenaClient = dependencies.arenaContract ?? new InMemorySelfPlayArenaClient();
    this.jobRegistry = dependencies.jobRegistry ?? defaultJobRegistry;
    this.pinJSON = dependencies.pinJSON ?? defaultPinJSON;
    this.ensureContentSafe = dependencies.ensureContentSafe ?? defaultEnsureContentSafe;
    this.slashRecipient = dependencies.slashRecipient;

    const eloPersistence = dependencies.eloPersistence ??
      jsonFileAdapter<Record<string, EloPlayer>>(config.persistencePath ?? 'storage/culture/state/elo.json', {});
    this.roundPersistence = dependencies.roundPersistence ??
      jsonFileAdapter<SerializedArenaState>(config.roundStatePath ?? 'storage/culture/state/rounds.json', {
        ...DEFAULT_ROUND_STATE,
        currentDifficulty: config.initialDifficulty
      });

    this.eloEngine = new EloEngine(config.elo, eloPersistence);
    this.difficultyController = new DifficultyController(config);
    this.currentDifficulty = config.initialDifficulty;

    this.ready = this.initialise();

    this.jobRegistry.on('job:submitted', (update) => {
      void this.onJobSubmitted(update);
    });
    this.jobRegistry.on('job:finalized', (record) => {
      void this.onJobFinalized(record);
    });
  }

  async startRound(input: StartArenaInput): Promise<RoundState> {
    await this.ready;
    const difficulty = input.difficultyOverride ?? this.currentDifficulty;
    const reservedRoundId = this.nextRoundId;

    const prompt = await buildTeacherPrompt({
      artifactId: input.artifactId,
      difficulty,
      roundId: reservedRoundId
    });
    const safetyReport = this.ensureContentSafe(prompt.prompt, [prompt.metadata.summary]);

    const teacher = await this.createParticipant(reservedRoundId, input.artifactId, {
      address: input.teacher,
      role: 'teacher'
    });

    const actualRoundId = await this.executeWithRetry(
      () => this.arenaClient.startRound(teacher.jobId, teacher.address, difficulty),
      'selfplay:startRound'
    );

    if (actualRoundId !== reservedRoundId) {
      this.log('round-id-mismatch', { reservedRoundId, actualRoundId });
      this.nextRoundId = actualRoundId + 1;
    } else {
      this.nextRoundId = reservedRoundId + 1;
    }

    if (actualRoundId !== reservedRoundId) {
      this.jobRegistry.updateRound(teacher.jobId, actualRoundId);
    }

    const students: ParticipantState[] = [];
    for (const studentAddress of input.students) {
      const state = await this.createParticipant(actualRoundId, input.artifactId, {
        address: studentAddress,
        role: 'student'
      });
      await this.executeWithRetry(
        () => this.arenaClient.registerStudent(actualRoundId, state.jobId, state.address),
        'selfplay:registerStudent'
      );
      students.push(state);
    }

    const validators: ParticipantState[] = [];
    for (const validatorAddress of input.validators) {
      const state = await this.createParticipant(actualRoundId, input.artifactId, {
        address: validatorAddress,
        role: 'validator'
      });
      await this.executeWithRetry(
        () => this.arenaClient.registerValidator(actualRoundId, state.jobId, state.address),
        'selfplay:registerValidator'
      );
      validators.push(state);
    }

    const round: RoundState = {
      id: actualRoundId,
      artifactId: input.artifactId,
      teacher,
      students,
      validators,
      startedAt: new Date(),
      winners: [],
      status: 'open',
      difficulty,
      difficultyDelta: 0,
      successRate: 0,
      teacherPrompt: prompt,
      safetyReport,
      deadlineAt: new Date(Date.now() + this.config.roundTimeoutMs)
    };

    this.rounds.set(round.id, round);
    await this.persistRounds();
    this.emit('round:update', round);
    this.emit('scoreboard:update', this.getScoreboard());
    void this.monitorRound(round);
    this.log('round-started', { roundId: round.id, difficulty, artifactId: input.artifactId });
    return round;
  }

  async closeRound(roundId: number): Promise<RoundState> {
    await this.ready;
    const round = this.requireRound(roundId);
    if (round.status !== 'open') {
      return round;
    }
    await this.executeWithRetry(() => this.arenaClient.closeRound(round.id), 'selfplay:closeRound');
    round.status = 'closed';
    round.closedAt = new Date();
    await this.persistRounds();
    this.emit('round:update', round);
    this.emit('scoreboard:update', this.getScoreboard());
    this.log('round-closed', { roundId: round.id });
    return round;
  }

  async recordSubmission(roundId: number, participant: string, cid: string): Promise<void> {
    await this.ready;
    const round = this.requireRound(roundId);
    const normalised = participant.toLowerCase();
    const collection = [round.teacher, ...round.students, ...round.validators];
    const target = collection.find((entry) => entry.address === normalised);
    if (!target) {
      throw new Error(`Participant ${participant} not found in round ${roundId}`);
    }
    await this.jobRegistry.markSubmitted(target.jobId, cid);
    this.log('submission-recorded', { roundId, participant: normalised, cid });
  }

  async finalizeRound(roundId: number, winners?: readonly string[]): Promise<RoundSummary> {
    await this.ready;
    const round = this.requireRound(roundId);
    if (round.status !== 'closed') {
      throw new Error('Round must be closed before finalisation');
    }

    const winnerSet = new Set((winners && winners.length > 0 ? winners : this.computeAutomaticWinners(round)).map((w) => w.toLowerCase()));
    round.winners = Array.from(winnerSet);

    await Promise.all(
      round.students.map((student) => this.finalizeParticipant(round, student, winnerSet))
    );
    await Promise.all(
      round.validators.map((validator) => this.finalizeParticipant(round, validator, new Set()))
    );
    await this.finalizeParticipant(round, round.teacher, winnerSet, true);

    const successRate = round.students.length === 0 ? 0 : round.winners.length / round.students.length;
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

    const snapshot = await this.pinSnapshot(round, difficultyResult.delta, diversity);
    round.snapshotCid = snapshot.cid;
    round.status = 'finalized';
    round.finalizedAt = new Date();

    await this.executeWithRetry(
      () => this.arenaClient.finalizeRound(round.id, difficultyResult.delta, [], BigInt(0), this.slashRecipient),
      'selfplay:finalizeRound'
    );

    await this.persistRounds();
    this.emit('round:update', round);
    this.emit('scoreboard:update', this.getScoreboard());
    this.log('round-finalized', {
      roundId: round.id,
      winners: round.winners,
      difficultyDelta: difficultyResult.delta,
      snapshotCid: snapshot.cid
    });

    return {
      roundId: round.id,
      difficulty: round.difficulty,
      winners: round.winners,
      difficultyDelta: difficultyResult.delta,
      observedSuccessRate: successRate,
      snapshotCid: snapshot.cid
    };
  }

  getScoreboard(): ScoreboardSnapshot {
    const agents: Array<{ address: string; rating: number; stats: EloPlayer }> = [];
    const snapshot = this.eloEngine.snapshot();
    for (const [address, stats] of Object.entries(snapshot)) {
      agents.push({ address, rating: stats.rating, stats });
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
      agents,
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

  private async initialise(): Promise<void> {
    await this.eloEngine.load().catch((error) => {
      this.log('elo-load-failed', { message: (error as Error).message });
    });

    const persisted = await this.roundPersistence.load();
    this.currentDifficulty = persisted.currentDifficulty ?? this.config.initialDifficulty;
    this.nextRoundId = Math.max(persisted.nextRoundId ?? 1, 1);
    for (const serialized of persisted.rounds ?? []) {
      const round = deserializeRound(serialized);
      this.rounds.set(round.id, round);
    }

    const onChainTotal = await this.arenaClient
      .getTotalRounds()
      .catch(() => Math.max(this.nextRoundId - 1, 0));
    const highestRound = Math.max(onChainTotal, this.getHighestRoundId());
    if (highestRound + 1 > this.nextRoundId) {
      this.nextRoundId = highestRound + 1;
    }
    await this.persistRounds();
    this.emit('scoreboard:update', this.getScoreboard());
  }

  private async monitorRound(round: RoundState): Promise<void> {
    try {
      await this.jobRegistry.waitForSubmission(round.teacher.jobId, this.config.roundTimeoutMs);
      this.log('teacher-submitted', { roundId: round.id, jobId: round.teacher.jobId });
    } catch (error) {
      this.log('teacher-submission-timeout', {
        roundId: round.id,
        error: (error as Error).message
      });
      return;
    }

    const studentPromises = round.students.map((student) =>
      this.jobRegistry
        .waitForSubmission(student.jobId, this.config.roundTimeoutMs)
        .then(() => student.address)
        .catch(() => undefined)
    );

    const results = await Promise.all(studentPromises);
    const winners = round.students
      .filter((student) => student.status === 'submitted' || results.includes(student.address))
      .map((student) => student.address);

    if (winners.length > 0) {
      round.winners = Array.from(new Set(winners.map((winner) => winner.toLowerCase())));
      round.successRate = round.students.length === 0 ? 0 : round.winners.length / round.students.length;
      await this.persistRounds();
      this.emit('round:update', round);
    }
  }

  private computeAutomaticWinners(round: RoundState): string[] {
    return round.students
      .filter((student) => student.status === 'submitted' || student.status === 'validated')
      .map((student) => student.address);
  }

  private async createParticipant(
    roundId: number,
    artifactId: number,
    input: { address: string; role: AgentRole }
  ): Promise<ParticipantState> {
    const address = input.address.toLowerCase();
    const handle = await this.executeWithRetry(
      () =>
        this.jobRegistry.createJob({
          description: `${input.role} assignment for artifact ${artifactId}`,
          roundId,
          role: input.role,
          participant: address,
          artifactId
        }),
      'jobs:create'
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
      role: input.role,
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
    if (!isTeacher && participant.status !== 'submitted' && participant.status !== 'validated') {
      if (participant.status === 'pending') {
        participant.status = 'timeout';
        await slashStake({
          roundId: round.id,
          participant: participant.address,
          role: participant.role,
          amount: BigInt(1),
          reason: 'No submission before deadline'
        });
      }
      return;
    }

    await this.jobRegistry.finalizeJob(participant.jobId);
    if (!isTeacher) {
      if (hasWon) {
        participant.status = 'validated';
        await releaseStake({
          roundId: round.id,
          participant: participant.address,
          role: participant.role,
          amount: BigInt(1)
        });
      } else {
        participant.status = 'failed';
        await slashStake({
          roundId: round.id,
          participant: participant.address,
          role: participant.role,
          amount: BigInt(1),
          reason: 'Failed validator quorum'
        });
      }
    }
  }

  private async onJobSubmitted(update: SubmissionUpdate): Promise<void> {
    const job = this.jobRegistry.getJob(update.jobId);
    const round = this.rounds.get(job.roundId);
    if (!round) {
      return;
    }
    const participant = this.findParticipant(round, job.participant, job.role);
    participant.status = 'submitted';
    participant.submissionCid = update.cid;
   participant.lastUpdate = update.submittedAt;
   participant.attempts += 1;
   await this.persistRounds();
   this.emit('round:update', round);
    this.emit('scoreboard:update', this.getScoreboard());
  }

  private async onJobFinalized(record: JobRecord): Promise<void> {
    const round = this.rounds.get(record.roundId);
    if (!round) {
      return;
    }
    const participant = this.findParticipant(round, record.participant, record.role);
    participant.status = participant.status === 'pending' ? 'failed' : participant.status;
    participant.lastUpdate = new Date();
    await this.persistRounds();
    this.emit('round:update', round);
    this.emit('scoreboard:update', this.getScoreboard());
  }

  private findParticipant(round: RoundState, address: string, role: AgentRole): ParticipantState {
    const normalised = address.toLowerCase();
    if (role === 'teacher' && round.teacher.address === normalised) {
      return round.teacher;
    }
    if (role === 'student') {
      const target = round.students.find((entry) => entry.address === normalised);
      if (target) return target;
    }
    if (role === 'validator') {
      const target = round.validators.find((entry) => entry.address === normalised);
      if (target) return target;
    }
    throw new Error(`Participant ${address} with role ${role} not found in round ${round.id}`);
  }

  private async pinSnapshot(round: RoundState, difficultyDelta: number, diversity: unknown): Promise<PinResult> {
    return await this.pinJSON({
      roundId: round.id,
      artifactId: round.artifactId,
      difficulty: round.difficulty,
      difficultyDelta,
      winners: round.winners,
      successRate: round.successRate,
      diversity,
      teacherPrompt: round.teacherPrompt,
      timestamp: new Date().toISOString()
    });
  }

  private requireRound(roundId: number): RoundState {
    const round = this.rounds.get(roundId);
    if (!round) {
      throw new Error(`Round ${roundId} not found`);
    }
    return round;
  }

  private getHighestRoundId(): number {
    let highest = 0;
    for (const id of this.rounds.keys()) {
      if (id > highest) highest = id;
    }
    return highest;
  }

  private async persistRounds(): Promise<void> {
    const serialized: SerializedArenaState = {
      currentDifficulty: this.currentDifficulty,
      nextRoundId: this.nextRoundId,
      rounds: Array.from(this.rounds.values()).map(serializeRound)
    };
    await this.roundPersistence.save(serialized);
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

  private log(action: string, details: Record<string, unknown>): void {
    const log = buildStructuredLogRecord({
      component: 'arena-service',
      action,
      details
    });
    console.log(JSON.stringify(log));
  }
}

function serializeRound(round: RoundState): SerializedRoundState {
  return {
    id: round.id,
    artifactId: round.artifactId,
    teacher: serializeParticipant(round.teacher),
    students: round.students.map(serializeParticipant),
    validators: round.validators.map(serializeParticipant),
    startedAt: round.startedAt.toISOString(),
    closedAt: round.closedAt?.toISOString(),
    finalizedAt: round.finalizedAt?.toISOString(),
    winners: round.winners,
    status: round.status,
    difficulty: round.difficulty,
    difficultyDelta: round.difficultyDelta,
    successRate: round.successRate,
    snapshotCid: round.snapshotCid,
    teacherPrompt: round.teacherPrompt,
    safetyReport: round.safetyReport,
    deadlineAt: round.deadlineAt.toISOString()
  };
}

function serializeParticipant(participant: ParticipantState): SerializedParticipantState {
  return {
    address: participant.address,
    jobId: participant.jobId,
    role: participant.role,
    status: participant.status,
    submissionCid: participant.submissionCid,
    lastUpdate: participant.lastUpdate.toISOString(),
    attempts: participant.attempts
  };
}

function deserializeRound(serialized: SerializedRoundState): RoundState {
  return {
    id: serialized.id,
    artifactId: serialized.artifactId,
    teacher: deserializeParticipant(serialized.teacher),
    students: serialized.students.map(deserializeParticipant),
    validators: serialized.validators.map(deserializeParticipant),
    startedAt: new Date(serialized.startedAt),
    closedAt: serialized.closedAt ? new Date(serialized.closedAt) : undefined,
    finalizedAt: serialized.finalizedAt ? new Date(serialized.finalizedAt) : undefined,
    winners: [...serialized.winners],
    status: serialized.status,
    difficulty: serialized.difficulty,
    difficultyDelta: serialized.difficultyDelta,
    successRate: serialized.successRate,
    snapshotCid: serialized.snapshotCid,
    teacherPrompt: serialized.teacherPrompt,
    safetyReport: serialized.safetyReport,
    deadlineAt: new Date(serialized.deadlineAt)
  };
}

function deserializeParticipant(serialized: SerializedParticipantState): ParticipantState {
  return {
    address: serialized.address,
    jobId: serialized.jobId,
    role: serialized.role,
    status: serialized.status,
    submissionCid: serialized.submissionCid,
    lastUpdate: new Date(serialized.lastUpdate),
    attempts: serialized.attempts
  };
}
