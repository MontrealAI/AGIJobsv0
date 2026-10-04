import { jest } from '@jest/globals';
import { ArenaService, type ArenaConfig } from '../src/arena.service.js';
import {
  InMemorySelfPlayArenaClient,
  type SelfPlayArenaClient,
} from '../src/selfplay-arena.js';
import { JobRegistryClient } from '../src/agijobs.js';
import type { PersistenceAdapter } from '../src/persistence.js';

function createMemoryPersistence<T>(initial: T): PersistenceAdapter<T> {
  let state = structuredClone(initial);
  return {
    async load(): Promise<T> {
      return structuredClone(state);
    },
    async save(data: T): Promise<void> {
      state = structuredClone(data);
    },
  };
}

class MockArenaClient implements SelfPlayArenaClient {
  total = 0;
  readonly startRound = jest.fn(
    async (_jobId: number, _teacher: string, _difficulty: number) => {
      this.total += 1;
      return this.total;
    },
  );
  readonly registerStudent = jest.fn(async () => {});
  readonly registerValidator = jest.fn(async () => {});
  readonly closeRound = jest.fn(async () => {});
  readonly finalizeRound = jest.fn(async () => {});

  async getTotalRounds(): Promise<number> {
    return this.total;
  }
}

function buildConfig(): ArenaConfig {
  return {
    targetSuccessRate: 0.6,
    minDifficulty: 1,
    maxDifficulty: 9,
    maxStep: 2,
    proportionalGain: 4,
    integralGain: 0.25,
    derivativeGain: 0.1,
    integralDecay: 0.5,
    maxIntegral: 5,
    initialDifficulty: 2,
    roundTimeoutMs: 1_000,
    operationTimeoutMs: 1_000,
    maxRetries: 1,
    elo: {
      kFactor: 16,
      defaultRating: 1_200,
      floor: 800,
      ceiling: 1_600,
    },
    persistencePath: undefined,
    roundStatePath: undefined,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ArenaService', () => {
  const config = buildConfig();
  let arenaClient: MockArenaClient;
  let jobRegistry: JobRegistryClient;
  let pinJSON: jest.MockedFunction<any>;
  let service: ArenaService;
  let roundPersistence: PersistenceAdapter<any>;

  beforeEach(async () => {
    arenaClient = new MockArenaClient();
    jobRegistry = new JobRegistryClient();
    pinJSON = jest.fn(async () => ({ cid: 'test-cid' }));
    const eloPersistence = createMemoryPersistence<Record<string, any>>({});
    roundPersistence = createMemoryPersistence<any>({
      currentDifficulty: config.initialDifficulty,
      nextRoundId: 1,
      rounds: [],
    });
    service = new ArenaService(config, {
      arenaContract: arenaClient,
      jobRegistry,
      pinJSON,
      eloPersistence,
      roundPersistence,
    });
    await flushPromises();
  });
  afterEach(() => jest.restoreAllMocks());

  it('starts a round and registers participants', async () => {
    const round = await service.startRound({
      artifactId: 7,
      teacher: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      students: ['0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'],
      validators: ['0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'],
    });

    expect(arenaClient.startRound).toHaveBeenCalledTimes(1);
    expect(arenaClient.registerStudent).toHaveBeenCalledTimes(1);
    expect(arenaClient.registerValidator).toHaveBeenCalledTimes(1);
    expect(round.status).toBe('open');
    expect(service.getRound(round.id).teacher.address).toBe(
      round.teacher.address,
    );

    await service.recordSubmission(
      round.id,
      round.teacher.address,
      'cid:teacher',
    );
    await service.recordSubmission(
      round.id,
      round.students[0]!.address,
      'cid:student',
    );
    await flushPromises();
    await service.closeRound(round.id);
    await service.finalizeRound(round.id, [round.students[0]!.address]);
  });

  it('finalizes a round with reviewed winners and updates Elo', async () => {
    const teacher = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
    const students = [
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
      '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
    ];
    const round = await service.startRound({
      artifactId: 12,
      teacher,
      students,
      validators: [],
    });

    await flushPromises();
    await service.recordSubmission(round.id, teacher, 'cid:teacher');
    for (const student of students) {
      await service.recordSubmission(round.id, student, `cid:${student}`);
    }
    await flushPromises();

    await service.closeRound(round.id);
    const summary = await service.finalizeRound(round.id, students);

    expect(summary.winners.length).toBeGreaterThan(0);
    expect(arenaClient.finalizeRound).toHaveBeenCalledTimes(1);
    expect(arenaClient.finalizeRound).toHaveBeenCalledWith(
      round.id,
      summary.difficultyDelta,
      10_000,
      0,
      false,
      [],
    );
    expect(pinJSON).toHaveBeenCalled();

    const scoreboard = service.getScoreboard();
    expect(scoreboard.agents.length).toBeGreaterThan(0);
    expect(service.getRound(round.id).status).toBe('finalized');
  });
  const participantInput = {
    artifactId: 1,
    teacher: `0x${'11'.repeat(20)}`,
    students: [`0x${'22'.repeat(20)}`],
    validators: [],
  };
  it('rejects invalid, duplicate and out-of-range participants before side effects', async () => {
    for (const input of [
      { ...participantInput, difficultyOverride: 10 },
      { ...participantInput, artifactId: 0 },
      { ...participantInput, teacher: 'invalid' },
      { ...participantInput, students: [participantInput.teacher] },
      { ...participantInput, students: [] },
    ]) {
      await expect(service.startRound(input)).rejects.toThrow();
    }
    expect(arenaClient.startRound).not.toHaveBeenCalled();
  });
  it('serializes concurrent starts and rejects unsubmitted or foreign winners', async () => {
    const [first, second] = await Promise.all([
      service.startRound(participantInput),
      service.startRound(participantInput),
    ]);
    expect([first.id, second.id]).toEqual([1, 2]);
    await service.closeRound(first.id);
    await expect(service.finalizeRound(first.id, [])).rejects.toThrow(
      'Teacher evidence',
    );
    await expect(
      service.recordSubmission(first.id, participantInput.teacher, 'cid:late'),
    ).rejects.toThrow('open round');
    await service.recordSubmission(
      second.id,
      participantInput.teacher,
      'cid:teacher',
    );
    await expect(
      service.recordSubmission(
        second.id,
        participantInput.teacher,
        'cid:duplicate',
      ),
    ).rejects.toThrow('already');
    await service.closeRound(second.id);
    await expect(
      service.finalizeRound(second.id, participantInput.students),
    ).rejects.toThrow('submitted students');
    await expect(
      service.finalizeRound(second.id, [`0x${'44'.repeat(20)}`]),
    ).rejects.toThrow('submitted students');
    expect(arenaClient.finalizeRound).not.toHaveBeenCalled();
  });
  it('does not retry ambiguous chain finalization, report success, or change Elo', async () => {
    const round = await service.startRound(participantInput);
    await service.recordSubmission(
      round.id,
      participantInput.teacher,
      'cid:teacher',
    );
    await service.recordSubmission(
      round.id,
      participantInput.students[0]!,
      'cid:student',
    );
    await service.closeRound(round.id);
    arenaClient.finalizeRound.mockRejectedValue(new Error('ambiguous receipt'));
    await expect(
      service.finalizeRound(round.id, participantInput.students),
    ).rejects.toThrow('ambiguous receipt');
    expect(arenaClient.finalizeRound).toHaveBeenCalledTimes(1);
    expect(service.getRound(round.id).status).toBe('failed');
    expect(service.getScoreboard().agents).toEqual([]);
    expect(service.getScoreboard().currentDifficulty).toBe(
      config.initialDifficulty,
    );
    expect(service.getRound(round.id).difficultyDelta).toBe(0);
    await expect(
      service.finalizeRound(round.id, participantInput.students),
    ).rejects.toThrow('closed');
    expect(arenaClient.finalizeRound).toHaveBeenCalledTimes(1);
  });
  it('enforces the same absolute deadline for teacher and student evidence', async () => {
    const round = await service.startRound(participantInput);
    jest.spyOn(Date, 'now').mockReturnValue(round.deadlineAt.getTime());
    for (const address of [
      participantInput.teacher,
      ...participantInput.students,
    ]) {
      await expect(
        service.recordSubmission(round.id, address, 'cid:late'),
      ).rejects.toThrow('deadline');
    }
    expect(jobRegistry.getJob(round.teacher.jobId).status).toBe('created');
    expect(jobRegistry.getJob(round.students[0]!.jobId).status).toBe('created');
  });
  it('never infers validation or winners from the presence of submissions', async () => {
    const round = await service.startRound(participantInput);
    await service.recordSubmission(
      round.id,
      participantInput.teacher,
      'cid:teacher',
    );
    await service.recordSubmission(
      round.id,
      participantInput.students[0]!,
      'cid:student',
    );
    await flushPromises();
    expect(service.getRound(round.id).winners).toEqual([]);
    expect(service.getRound(round.id).successRate).toBe(0);
    await service.closeRound(round.id);
    await expect(service.finalizeRound(round.id)).rejects.toThrow(
      'Explicit reviewed winners',
    );
    expect(arenaClient.finalizeRound).not.toHaveBeenCalled();
    expect((await service.finalizeRound(round.id, [])).winners).toEqual([]);
  });
  it('ignores late provider events after closing or after the deadline', async () => {
    const closed = await service.startRound(participantInput);
    await service.closeRound(closed.id);
    await jobRegistry.markSubmitted(closed.teacher.jobId, 'cid:late');
    const expired = await service.startRound(participantInput);
    jest.spyOn(Date, 'now').mockReturnValue(expired.deadlineAt.getTime());
    await jobRegistry.markSubmitted(expired.teacher.jobId, 'cid:expired');
    await flushPromises();
    expect(service.getRound(closed.id).teacher.status).toBe('pending');
    expect(service.getRound(expired.id).teacher.status).toBe('pending');
  });
  it('serializes provider events and ignores their replay without rewriting evidence', async () => {
    const round = await service.startRound(participantInput);
    await jobRegistry.markSubmitted(round.teacher.jobId, 'cid:original');
    await flushPromises();
    const original = service.getRound(round.id).teacher;
    const update = {
      jobId: round.teacher.jobId,
      cid: 'cid:forged',
      submittedAt: new Date(),
    };
    jobRegistry.emit('job:submitted', update);
    await flushPromises();
    expect(service.getRound(round.id).teacher).toEqual(original);
    expect(original.attempts).toBe(1);
  });
  it('does not acknowledge a submission until its snapshot is saved', async () => {
    const round = await service.startRound(participantInput);
    const save = roundPersistence.save.bind(roundPersistence);
    let release!: () => void;
    let saving!: () => void;
    const started = new Promise<void>((resolve) => {
      saving = resolve;
    });
    jest
      .spyOn(roundPersistence, 'save')
      .mockImplementationOnce(async (data) => {
        saving();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await save(data);
      });
    let acknowledged = false;
    const pending = service
      .recordSubmission(round.id, participantInput.teacher, 'cid:teacher')
      .then(() => {
        acknowledged = true;
      });
    await started;
    expect(acknowledged).toBe(false);
    release();
    await pending;
    expect(
      (await roundPersistence.load()).rounds[0].teacher.submissionCid,
    ).toBe('cid:teacher');
    expect(service.getRound(round.id).teacher.attempts).toBe(1);
  });
  it('fails a round closed when submission persistence fails', async () => {
    const round = await service.startRound(participantInput);
    jest
      .spyOn(roundPersistence, 'save')
      .mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(
      service.recordSubmission(
        round.id,
        participantInput.teacher,
        'cid:teacher',
      ),
    ).rejects.toThrow('disk unavailable');
    await flushPromises();
    expect(service.getRound(round.id).status).toBe('failed');
    await expect(
      service.recordSubmission(
        round.id,
        participantInput.students[0]!,
        'cid:student',
      ),
    ).rejects.toThrow('open round');
    expect(service.getScoreboard().agents).toEqual([]);
  });
  it('handles background persistence errors without an unhandled rejection', async () => {
    const round = await service.startRound(participantInput);
    jest
      .spyOn(roundPersistence, 'save')
      .mockRejectedValueOnce(new Error('disk unavailable'));
    const logs = jest.spyOn(console, 'log').mockImplementation(() => {});
    await jobRegistry.markSubmitted(round.teacher.jobId, 'cid:teacher');
    await flushPromises();
    expect(service.getRound(round.id).status).toBe('failed');
    expect(
      logs.mock.calls.some(([message]) =>
        String(message).includes('job-event-rejected'),
      ),
    ).toBe(true);
  });
  it('prevents duplicate concurrent acknowledgements', async () => {
    const round = await service.startRound(participantInput);
    const results = await Promise.allSettled([
      service.recordSubmission(round.id, participantInput.teacher, 'cid:first'),
      service.recordSubmission(
        round.id,
        participantInput.teacher,
        'cid:second',
      ),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(service.getRound(round.id).teacher.submissionCid).toBe('cid:first');
    expect(service.getRound(round.id).teacher.attempts).toBe(1);
  });
  it('fails closed after ambiguous closure and never retries it', async () => {
    const round = await service.startRound(participantInput);
    arenaClient.closeRound.mockRejectedValue(new Error('ambiguous close'));
    await expect(service.closeRound(round.id)).rejects.toThrow(
      'ambiguous close',
    );
    expect(service.getRound(round.id).status).toBe('failed');
    await service.closeRound(round.id);
    expect(arenaClient.closeRound).toHaveBeenCalledTimes(1);
    await expect(
      service.recordSubmission(round.id, participantInput.teacher, 'cid:late'),
    ).rejects.toThrow('open round');
  });
  it('returns isolated snapshots that cannot mutate lifecycle state', async () => {
    service.on('round:update', (round) => {
      round.teacher.status = 'validated';
    });
    const round = await service.startRound(participantInput);
    round.status = 'finalized';
    service.getRound(round.id).winners.push(participantInput.students[0]!);
    service.getScoreboard().rounds[0]!.startedAt.setFullYear(1990);
    expect(service.getRound(round.id).status).toBe('open');
    expect(service.getRound(round.id).teacher.status).toBe('pending');
    expect(service.getRound(round.id).winners).toEqual([]);
    expect(service.getRound(round.id).startedAt.getFullYear()).not.toBe(1990);
  });
  it('preserves history and avoids reusing round IDs after local restart', async () => {
    const persistence = createMemoryPersistence<any>({
      currentDifficulty: 2,
      nextRoundId: 1,
      rounds: [],
    });
    const dependencies = {
      roundPersistence: persistence,
      eloPersistence: createMemoryPersistence<Record<string, any>>({}),
      jobRegistry: new JobRegistryClient(),
    };
    const firstService = new ArenaService(config, dependencies);
    const first = await firstService.startRound(participantInput);
    const restarted = new ArenaService(config, {
      ...dependencies,
      arenaContract: new InMemorySelfPlayArenaClient(),
    });
    await restarted.waitUntilReady();
    expect(restarted.getRound(first.id).status).toBe('failed');
    const next = await restarted.startRound(participantInput);
    expect(next.id).toBe(first.id + 1);
    expect(restarted.getScoreboard().rounds).toHaveLength(2);
    await expect(
      restarted.recordSubmission(
        first.id,
        participantInput.teacher,
        'cid:stale',
      ),
    ).rejects.toThrow('open round');
  });
});
