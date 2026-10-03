import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createPrismaTestContext } from './helpers.js';
import { computeMetrics, main } from '../src/cli/generate-weekly-metrics.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('uses ISO week years and meaningful empty/default aggregates', async () => {
  const { prisma } = createPrismaTestContext();
  const empty = await computeMetrics(
    'test',
    prisma,
    new Date('2021-01-01T00:00:00Z'),
  );
  expect(empty).toMatchObject({
    week: '2020-W53',
    network: 'test',
    artifacts: {
      total: 0,
      averageCitations: 0,
      maxLineageDepth: 0,
      byKind: {},
    },
    influence: { cultureMaturityScore: 0, influenceGini: 0 },
    rounds: { finalizedThisWeek: 0, latestFinalizedAt: null },
  });
  await prisma.artifact.create({
    data: {
      id: '1',
      author: 'author',
      kind: 'book',
      cid: 'cid',
      parentId: null,
      blockNumber: 1,
      blockHash: 'hash',
      logIndex: 0,
      timestamp: new Date('2021-01-01'),
    },
  });
  expect(
    (await computeMetrics('test', prisma, new Date('2021-01-04')))
      .topArtifacts[0],
  ).toMatchObject({ influence: 0, citations: 0 });
  await prisma.influenceMetric.create({
    data: { artifactId: '1', score: 0, citationCount: 0, lineageDepth: 0 },
  });
  expect(
    (await computeMetrics('test', prisma, new Date('2021-01-04'))).influence
      .influenceGini,
  ).toBe(0);
});
it('computes inequality across the full graph while displaying only the top ten artifacts', async () => {
  const { prisma } = createPrismaTestContext();
  const now = new Date('2026-10-03');
  for (let i = 0; i < 20; i++) {
    await prisma.artifact.create({
      data: {
        id: String(i),
        author: 'author',
        kind: i < 10 ? 'book' : 'dataset',
        cid: String(i),
        parentId: i ? '0' : null,
        blockNumber: i + 1,
        blockHash: 'h',
        logIndex: 0,
        timestamp: now,
        influence: {
          create: {
            score: i < 10 ? 0.1 : 0,
            citationCount: 2,
            lineageDepth: i,
          },
        },
      },
    });
  }
  await prisma.roundFinalization.create({
    data: {
      roundId: '1',
      previousDifficulty: 3,
      difficultyDelta: 1,
      newDifficulty: 4,
      finalizedAt: now,
      blockNumber: 22,
      blockHash: 'h',
      logIndex: 0,
    },
  });
  const report = await computeMetrics('local', prisma, now);
  expect(report.artifacts).toMatchObject({
    total: 20,
    mintedLast7Days: 20,
    derivatives: 19,
    byKind: { book: 10, dataset: 10 },
  });
  expect(report.topArtifacts).toHaveLength(10);
  expect(report.influence.influenceGini).toBeCloseTo(0.5, 6);
  expect(report.influence.cultureMaturityScore).toBe(100);
  expect(report.rounds).toEqual({
    finalizedThisWeek: 1,
    latestFinalizedAt: now.toISOString(),
  });
});
it('writes a CLI export and always disconnects on filesystem failure', async () => {
  const { prisma } = createPrismaTestContext();
  const dir = mkdtempSync(join(tmpdir(), 'culture-weekly-'));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  vi.stubEnv('CULTURE_NETWORK', 'integration');
  const target = join(dir, 'nested', 'weekly.json');
  const disconnect = vi.spyOn(prisma, '$disconnect');
  await main(['--output', target], prisma);
  expect(JSON.parse(readFileSync(target, 'utf8'))).toMatchObject({
    network: 'integration',
    artifacts: { total: 0 },
  });
  expect(disconnect).toHaveBeenCalledOnce();
  const { prisma: other } = createPrismaTestContext();
  const cleanup = vi.spyOn(other, '$disconnect');
  writeFileSync(join(dir, 'file'), 'x');
  await expect(
    main(['--output', join(dir, 'file', 'weekly.json')], other),
  ).rejects.toThrow();
  expect(cleanup).toHaveBeenCalledOnce();
});
