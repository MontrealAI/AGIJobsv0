import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => ({
  getBlockNumber: vi.fn(),
  getLogs: vi.fn(),
  getBlock: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  destroy: vi.fn(),
  pollingInterval: 0,
}));
vi.mock('ethers', async (original) => ({
  ...(await original<typeof import('ethers')>()),
  JsonRpcProvider: class {
    constructor() {
      return rpc;
    }
  },
}));
import { Interface } from 'ethers';
import { cultureRegistryAbi, selfPlayArenaAbi } from '../src/contracts.js';
import { EventIngestionService } from '../src/services/event-ingestion-service.js';
import { InfluenceService } from '../src/services/influence-service.js';
import { createPrismaTestContext } from './helpers.js';
const registry = '0x0000000000000000000000000000000000000010';
const arena = '0x0000000000000000000000000000000000000020';
const author = '0x0000000000000000000000000000000000000030';
const culture = new Interface(cultureRegistryAbi);
const arenaSource = readFileSync(
  new URL('../../../contracts/SelfPlayArena.sol', import.meta.url),
  'utf8',
);
const roundDeclaration = arenaSource.match(
  /event RoundFinalized\(([\s\S]*?)\);/,
)![1];
const rounds = new Interface([`event RoundFinalized(${roundDeclaration})`]);
function log(
  iface: Interface,
  event: string,
  values: unknown[],
  blockNumber: number,
  index: number,
  address = registry,
) {
  return {
    ...iface.encodeEventLog(iface.getEvent(event)!, values),
    blockNumber,
    index,
    address,
    blockHash: `hash-${blockNumber}`,
  };
}
function seedLogs() {
  const logs = [
    log(culture, 'ArtifactMinted', [1, author, 'book', 'cid-1', 0], 1, 0),
    log(culture, 'ArtifactMinted', [2, author, 'dataset', 'cid-2', 1], 2, 0),
    log(culture, 'ArtifactCited', [2, 1], 2, 1),
    log(
      rounds,
      'RoundFinalized',
      [1, 3, 2, 5, 8000, 1000, 42, true, 100],
      3,
      0,
      arena,
    ),
  ];
  rpc.getLogs.mockImplementation(async (filter) =>
    logs.filter(
      (x) =>
        x.topics[0] === filter.topics[0] &&
        x.blockNumber >= filter.fromBlock &&
        x.blockNumber <= filter.toBlock,
    ),
  );
  return logs;
}
function setup(extra = {}) {
  const { prisma } = createPrismaTestContext();
  const influence = new InfluenceService(prisma);
  const ingestion = new EventIngestionService(prisma, influence, {
    rpcUrl: 'http://rpc',
    cultureRegistryAddress: registry,
    selfPlayArenaAddress: arena,
    blockBatchSize: 2,
    pollIntervalMs: 100,
    ...extra,
  });
  return { prisma, influence, ingestion };
}
beforeEach(() => {
  vi.clearAllMocks();
  rpc.getBlockNumber.mockResolvedValue(3);
  rpc.getBlock.mockResolvedValue({ timestamp: 100 });
  rpc.getLogs.mockResolvedValue([]);
  rpc.removeAllListeners.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('Historical and live event ingestion', () => {
  it('matches the real contract event ABI and restores ordered, idempotent history', async () => {
    expect(
      new Interface(selfPlayArenaAbi).getEvent('RoundFinalized')!.topicHash,
    ).toBe(rounds.getEvent('RoundFinalized')!.topicHash);
    seedLogs();
    const { prisma, ingestion } = setup();
    await ingestion.start();
    expect(rpc.pollingInterval).toBe(100);
    expect(await prisma.artifact.count()).toBe(2);
    expect(await prisma.citation.count()).toBe(1);
    expect(await prisma.roundFinalization.findFirst()).toMatchObject({
      roundId: '1',
      previousDifficulty: 3,
      difficultyDelta: 2,
      newDifficulty: 5,
      finalizedAt: new Date(100000),
    });
    expect(
      await prisma.eventCursor.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ blockNumber: 3, logIndex: 0 });
    await ingestion.backfillHistoricalEvents();
    await ingestion.backfillHistoricalEvents({ force: true });
    expect(await prisma.artifact.count()).toBe(2);
    expect(await prisma.citation.count()).toBe(1);
    expect(await prisma.roundFinalization.count()).toBe(1);
    await ingestion.stop();
    await ingestion.stop();
    expect(rpc.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(rpc.destroy).toHaveBeenCalledTimes(1);
  });
  it('stops at a failed log and retries it before later events', async () => {
    seedLogs();
    const { prisma, influence, ingestion } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const recompute = vi
      .spyOn(influence, 'recompute')
      .mockRejectedValueOnce(new Error('temporarily unavailable'));
    await expect(ingestion.start()).rejects.toThrow('temporarily unavailable');
    expect(await prisma.eventCursor.count()).toBe(0);
    expect(await prisma.artifact.count()).toBe(1);
    recompute.mockRestore();
    await ingestion.start();
    expect(await prisma.artifact.count()).toBe(2);
    expect(await prisma.roundFinalization.count()).toBe(1);
    await ingestion.stop();
  });
  it('respects finality, coalesces concurrent backfills, and handles future cursors', async () => {
    seedLogs();
    const { prisma, ingestion } = setup({
      finalityDepth: 1,
      selfPlayArenaAddress: undefined,
    });
    await ingestion.start();
    expect(await prisma.roundFinalization.count()).toBe(0);
    expect(rpc.on).toHaveBeenCalledTimes(1);
    rpc.getLogs.mockClear();
    await Promise.all([
      ingestion.backfillHistoricalEvents(),
      ingestion.backfillHistoricalEvents(),
    ]);
    expect(rpc.getLogs).toHaveBeenCalledTimes(4);
    await prisma.eventCursor.update({
      where: { id: 1 },
      data: { blockNumber: 99 },
    });
    rpc.getLogs.mockClear();
    await ingestion.backfillHistoricalEvents();
    expect(rpc.getLogs).not.toHaveBeenCalled();
    await ingestion.stop();
    const offline = new EventIngestionService(
      prisma,
      new InfluenceService(prisma),
      {},
    );
    await offline.start();
    await offline.backfillHistoricalEvents();
    await offline.stop();
  });
  it('uses ordered, confirmed RPC history for live updates and retries failures', async () => {
    const { prisma, influence, ingestion } = setup({ finalityDepth: 2 });
    await ingestion.start();
    expect(rpc.on.mock.calls[0][0]).toBe('block');
    const tick = rpc.on.mock.calls[0][1];
    const logs = seedLogs();
    rpc.getBlockNumber.mockResolvedValue(4);
    await tick(4);
    expect(await prisma.artifact.count()).toBe(2);
    expect(await prisma.roundFinalization.count()).toBe(0);
    rpc.getBlockNumber.mockResolvedValue(5);
    await tick(5);
    expect(await prisma.roundFinalization.count()).toBe(1);
    logs.push(
      log(culture, 'ArtifactMinted', [3, author, 'book', 'new', 2], 4, 0),
    );
    logs.push(
      log(
        rounds,
        'RoundFinalized',
        [2, 3, 1, 4, 8000, 100, 42, true, 200],
        5,
        0,
        arena,
      ),
    );
    rpc.getBlockNumber.mockResolvedValue(7);
    const original = influence.recompute.bind(influence);
    const recompute = vi
      .spyOn(influence, 'recompute')
      .mockImplementation(async (affected) => {
        if (affected?.includes('3')) throw new Error('validator unavailable');
        return original(affected);
      });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await tick(7);
    expect(error).toHaveBeenCalled();
    expect(await prisma.roundFinalization.count()).toBe(1);
    recompute.mockRestore();
    await tick(7);
    expect(await prisma.roundFinalization.count()).toBe(2);
    expect(await prisma.artifact.count()).toBe(3);
    await ingestion.stop();
    await tick(8);
    expect(await prisma.artifact.count()).toBe(3);
  });
  it('retries unavailable blocks instead of inventing event timestamps', async () => {
    seedLogs();
    const { prisma, ingestion } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.getBlock.mockResolvedValueOnce(null);
    await expect(ingestion.start()).rejects.toThrow('Event block unavailable');
    expect(await prisma.artifact.count()).toBe(0);
    await ingestion.start();
    expect(await prisma.artifact.count()).toBe(2);
    await ingestion.stop();
  });
});
