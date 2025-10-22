import { jest } from '@jest/globals';
import { ArenaService, type ArenaConfig } from '../src/arena.service.js';
import type { SelfPlayArenaClient } from '../src/selfplay-arena.js';
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
    }
  };
}

class MockArenaClient implements SelfPlayArenaClient {
  total = 0;
  readonly startRound = jest.fn(async (_jobId: number, _teacher: string, _difficulty: number) => {
    this.total += 1;
    return this.total;
  });
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
      ceiling: 1_600
    },
    persistencePath: undefined,
    roundStatePath: undefined
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

  beforeEach(async () => {
    arenaClient = new MockArenaClient();
    jobRegistry = new JobRegistryClient();
    pinJSON = jest.fn(async () => ({ cid: 'test-cid' }));
    const eloPersistence = createMemoryPersistence<Record<string, any>>({});
    const roundPersistence = createMemoryPersistence<any>({
      currentDifficulty: config.initialDifficulty,
      nextRoundId: 1,
      rounds: []
    });
    service = new ArenaService(config, {
      arenaContract: arenaClient,
      jobRegistry,
      pinJSON,
      eloPersistence,
      roundPersistence
    });
    await flushPromises();
  });

  it('starts a round and registers participants', async () => {
    const round = await service.startRound({
      artifactId: 7,
      teacher: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      students: ['0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'],
      validators: ['0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc']
    });

    expect(arenaClient.startRound).toHaveBeenCalledTimes(1);
    expect(arenaClient.registerStudent).toHaveBeenCalledTimes(1);
    expect(arenaClient.registerValidator).toHaveBeenCalledTimes(1);
    expect(round.status).toBe('open');
    expect(service.getRound(round.id).teacher.address).toBe(round.teacher.address);

    await service.recordSubmission(round.id, round.teacher.address, 'cid:teacher');
    await service.recordSubmission(round.id, round.students[0]!.address, 'cid:student');
    await flushPromises();
    await service.closeRound(round.id);
    await service.finalizeRound(round.id, [round.students[0]!.address]);
  });

  it('finalizes a round with computed winners and updates Elo', async () => {
    const teacher = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
    const students = [
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
      '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'
    ];
    const round = await service.startRound({
      artifactId: 12,
      teacher,
      students,
      validators: []
    });

    await flushPromises();
    await service.recordSubmission(round.id, teacher, 'cid:teacher');
    for (const student of students) {
      await service.recordSubmission(round.id, student, `cid:${student}`);
    }
    await flushPromises();

    await service.closeRound(round.id);
    const summary = await service.finalizeRound(round.id);

    expect(summary.winners.length).toBeGreaterThan(0);
    expect(arenaClient.finalizeRound).toHaveBeenCalledTimes(1);
    expect(pinJSON).toHaveBeenCalled();

    const scoreboard = service.getScoreboard();
    expect(scoreboard.agents.length).toBeGreaterThan(0);
    expect(service.getRound(round.id).status).toBe('finalized');
  });
});
