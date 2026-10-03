import { afterEach, expect, it, vi } from 'vitest';
import { createPrismaTestContext } from './helpers.js';
import { InfluenceService } from '../src/services/influence-service.js';
import { NetworkXInfluenceValidator } from '../src/services/networkx-validator.js';
afterEach(() => vi.restoreAllMocks());
it('handles empty graphs, dangling nodes, lineage cycles, and repeat computations', async () => {
  const { prisma } = createPrismaTestContext();
  const service = new InfluenceService(prisma);
  expect(await service.recompute()).toBeNull();
  expect(service.getLastValidation()).toBeNull();
  await prisma.artifact.createMany({
    data: ['1', '2', '3'].map((id, i) => ({
      id,
      author: id,
      kind: 'book',
      cid: id,
      parentId: i === 0 ? '2' : i === 1 ? '1' : 'missing',
      timestamp: new Date(),
      blockNumber: 1,
      blockHash: 'h',
      logIndex: i,
    })),
  });
  const result = await service.recompute();
  expect([...result!.scores.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(
    1,
    6,
  );
  expect(result!.lineageDepths.get('3')).toBe(1);
  expect((await service.recompute())!.scores).toEqual(result!.scores);
});
it('keeps previous metrics when independent validation disagrees, and exposes unavailable validators', async () => {
  const { prisma } = createPrismaTestContext();
  await prisma.artifact.create({
    data: {
      id: '1',
      author: 'a',
      kind: 'book',
      cid: 'cid',
      parentId: null,
      timestamp: new Date(),
      blockNumber: 1,
      blockHash: 'h',
      logIndex: 0,
    },
  });
  await new InfluenceService(prisma).recompute();
  const prior = await prisma.influenceMetric.findUnique({
    where: { artifactId: '1' },
  });
  const validate = vi.fn().mockResolvedValue({
    ok: false,
    skipped: false,
    engine: 'networkx',
    maxDelta: 0.1,
    externalScores: null,
  });
  const service = new InfluenceService(prisma, {}, { validate });
  await expect(service.recompute()).rejects.toThrow(
    'Influence validation failed',
  );
  expect(
    await prisma.influenceMetric.findUnique({ where: { artifactId: '1' } }),
  ).toEqual(prior);
  validate.mockResolvedValue({
    ok: false,
    skipped: false,
    error: 'disagreement',
    engine: 'x',
    maxDelta: 0.2,
    externalScores: null,
  });
  await expect(service.recompute()).rejects.toThrow('disagreement');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  validate.mockRejectedValue(new Error('python unavailable'));
  await expect(service.recompute()).rejects.toThrow('python unavailable');
  expect(service.getLastValidation()).toMatchObject({
    ok: false,
    skipped: true,
    error: 'python unavailable',
  });
  validate.mockRejectedValue('unknown');
  await expect(service.recompute()).rejects.toThrow(
    'Unknown influence validation error',
  );
  expect(service.getLastValidation()?.error).toBe(
    'Unknown influence validation error',
  );
  validate.mockResolvedValue({
    ok: false,
    skipped: true,
    error: 'timeout',
    engine: null,
    maxDelta: 0,
    externalScores: null,
  });
  await expect(service.recompute()).rejects.toThrow('timeout');
  expect(
    await prisma.influenceMetric.findUnique({ where: { artifactId: '1' } }),
  ).toEqual(prior);
});

it('keeps scores normalized and independently validated as new artifacts and citations arrive', async () => {
  const { prisma } = createPrismaTestContext();
  const service = new InfluenceService(
    prisma,
    {},
    new NetworkXInfluenceValidator(),
  );
  for (const id of ['1', '2', '3']) {
    await prisma.artifact.create({
      data: {
        id,
        author: 'a',
        kind: 'book',
        cid: id,
        parentId: null,
        timestamp: new Date(),
        blockNumber: Number(id),
        blockHash: id,
        logIndex: 0,
      },
    });
    const result = await service.recompute();
    expect(
      [...result!.scores.values()].reduce((sum, score) => sum + score, 0),
    ).toBeCloseTo(1, 8);
    expect(service.getLastValidation()).toMatchObject({
      ok: true,
      skipped: false,
    });
    if (id !== '1') {
      await prisma.citation.create({
        data: {
          fromId: id,
          toId: '1',
          blockNumber: Number(id),
          blockHash: id,
          logIndex: 1,
        },
      });
      await service.recompute();
      expect(service.getLastValidation()?.ok).toBe(true);
    }
  }
});
