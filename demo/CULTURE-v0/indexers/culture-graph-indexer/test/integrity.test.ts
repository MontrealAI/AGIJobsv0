import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrismaTestContext } from './helpers.js';
import { ChecksumService } from '../src/services/checksum-service.js';
import { DataIntegrityService } from '../src/services/data-integrity-service.js';
import { EventIngestionService } from '../src/services/event-ingestion-service.js';
import { InfluenceService } from '../src/services/influence-service.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Indexer recovery and data integrity', () => {
  it('detects changed artifacts/citations, stable retries, and failures', async () => {
    const { prisma } = createPrismaTestContext();
    const influence = new InfluenceService(prisma);
    const ingestion = new EventIngestionService(prisma, influence, {});
    const checksums = new ChecksumService(prisma);
    expect((await checksums.verify()).every((x) => x.changed)).toBe(true);
    expect((await checksums.verify()).every((x) => !x.changed)).toBe(true);
    const artifact = {
      artifactId: '1',
      author: 'author',
      kind: 'book',
      cid: 'cid',
      parentId: null,
      blockNumber: 1,
      blockHash: 'hash',
      logIndex: 0,
      timestamp: new Date(),
    };
    await ingestion.handleArtifactMinted(artifact);
    await ingestion.handleArtifactMinted({
      ...artifact,
      artifactId: '2',
      parentId: '1',
      blockNumber: 2,
    });
    await ingestion.handleArtifactCited({
      fromArtifactId: '2',
      toArtifactId: '1',
      blockNumber: 3,
      blockHash: 'hash3',
      logIndex: 0,
    });
    expect((await checksums.verify()).every((x) => x.changed)).toBe(true);
    expect((await checksums.verify()).every((x) => !x.changed)).toBe(true);
    const integrity = new DataIntegrityService(ingestion, prisma);
    await integrity.runBackfill();
    await integrity.runChecksums();
    expect(integrity.getStatus().lastChecksum?.results).toHaveLength(3);
    expect(integrity.getStatus().lastBackfill?.error).toBeUndefined();
    const failure = vi
      .spyOn(ingestion, 'backfillHistoricalEvents')
      .mockRejectedValue(new Error('RPC outage'));
    await expect(integrity.runBackfill()).rejects.toThrow('RPC outage');
    expect(integrity.getStatus().lastBackfill?.error).toBe('RPC outage');
    failure.mockRejectedValue('offline');
    await expect(integrity.runBackfill()).rejects.toBe('offline');
    expect(integrity.getStatus().lastBackfill?.error).toBe(
      'Unknown backfill failure',
    );
    const checksumFailure = vi
      .spyOn(prisma.artifact, 'findMany')
      .mockRejectedValue(new Error('disk unavailable'));
    await expect(integrity.runChecksums()).rejects.toThrow('disk unavailable');
    expect(integrity.getStatus().lastChecksum?.error).toBe('disk unavailable');
    checksumFailure.mockRejectedValue('offline');
    await expect(integrity.runChecksums()).rejects.toBe('offline');
    expect(integrity.getStatus().lastChecksum?.error).toBe(
      'Unknown checksum failure',
    );
  });

  it('starts periodic checks once, reports their failures, and stops every timer', async () => {
    const { prisma } = createPrismaTestContext();
    const ingestion = new EventIngestionService(
      prisma,
      new InfluenceService(prisma),
      {},
    );
    const integrity = new DataIntegrityService(ingestion, prisma, {
      backfillIntervalMs: 20,
      checksumIntervalMs: 30,
    });
    vi.useFakeTimers();
    const backfill = vi
      .spyOn(integrity, 'runBackfill')
      .mockRejectedValue(new Error('RPC down'));
    const checksums = vi
      .spyOn(integrity, 'runChecksums')
      .mockRejectedValue(new Error('database down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    integrity.start();
    integrity.start();
    await vi.advanceTimersByTimeAsync(60);
    expect(backfill).toHaveBeenCalledTimes(3);
    expect(checksums).toHaveBeenCalledTimes(2);
    expect(errors).toHaveBeenCalledTimes(5);
    integrity.stop();
    integrity.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(backfill).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not advance the cursor when influence computation fails and permits idempotent recovery', async () => {
    const { prisma } = createPrismaTestContext();
    const influence = new InfluenceService(prisma);
    const ingestion = new EventIngestionService(prisma, influence, {});
    const recompute = vi
      .spyOn(influence, 'recompute')
      .mockRejectedValueOnce(new Error('validation mismatch'));
    const artifact = {
      artifactId: '1',
      author: 'author',
      kind: 'book',
      cid: 'cid',
      parentId: null,
      blockNumber: 7,
      blockHash: 'hash',
      logIndex: 2,
      timestamp: new Date(),
    };
    await expect(ingestion.handleArtifactMinted(artifact)).rejects.toThrow(
      'validation mismatch',
    );
    expect(
      await prisma.eventCursor.findUnique({ where: { id: 1 } }),
    ).toBeNull();
    recompute.mockRestore();
    await ingestion.handleArtifactMinted(artifact);
    expect(await prisma.artifact.count()).toBe(1);
    expect(
      await prisma.eventCursor.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ blockNumber: 7, logIndex: 2 });
    await ingestion.handleArtifactMinted({ ...artifact, artifactId: '2' });
    const cite = {
      fromArtifactId: '2',
      toArtifactId: '1',
      blockNumber: 8,
      blockHash: 'hash8',
      logIndex: 0,
    };
    vi.spyOn(influence, 'recompute').mockRejectedValueOnce(
      new Error('retry citation'),
    );
    await expect(ingestion.handleArtifactCited(cite)).rejects.toThrow(
      'retry citation',
    );
    expect(
      await prisma.eventCursor.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ blockNumber: 7 });
    await ingestion.handleArtifactCited(cite);
    expect(await prisma.citation.count()).toBe(1);
    expect(
      await prisma.eventCursor.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ blockNumber: 8 });
  });
});
