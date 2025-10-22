import { describe, expect, it } from 'vitest';
import { createPrismaTestContext } from './helpers.js';
import { InfluenceService } from '../src/services/influence-service.js';

describe('InfluenceService', () => {
  it('computes stable PageRank scores and lineage depths', async () => {
    const { prisma } = createPrismaTestContext();
    const influence = new InfluenceService(prisma, { maxIterations: 30, tolerance: 1e-9 });

    const baseTime = new Date();
    await prisma.artifact.createMany({
      data: [
        {
          id: 'A',
          author: '0xA',
          kind: 'book',
          cid: 'cid-A',
          parentId: null,
          blockNumber: 1,
          blockHash: '0x1',
          logIndex: 0,
          timestamp: baseTime,
        },
        {
          id: 'B',
          author: '0xB',
          kind: 'book',
          cid: 'cid-B',
          parentId: 'A',
          blockNumber: 2,
          blockHash: '0x2',
          logIndex: 0,
          timestamp: new Date(baseTime.getTime() + 1_000),
        },
        {
          id: 'C',
          author: '0xC',
          kind: 'dataset',
          cid: 'cid-C',
          parentId: 'B',
          blockNumber: 3,
          blockHash: '0x3',
          logIndex: 0,
          timestamp: new Date(baseTime.getTime() + 2_000),
        },
      ],
    });

    await prisma.citation.createMany({
      data: [
        { fromId: 'A', toId: 'B', blockNumber: 4, blockHash: '0x4', logIndex: 0 },
        { fromId: 'B', toId: 'C', blockNumber: 5, blockHash: '0x5', logIndex: 0 },
        { fromId: 'C', toId: 'A', blockNumber: 6, blockHash: '0x6', logIndex: 0 },
        { fromId: 'C', toId: 'B', blockNumber: 6, blockHash: '0x6', logIndex: 1 },
      ],
    });

    await influence.recompute();

    const metrics = await prisma.influenceMetric.findMany({ orderBy: { score: 'desc' } });
    expect(metrics).toHaveLength(3);
    expect(metrics[0].artifactId).toBe('B');
    const lineage = new Map(metrics.map((metric) => [metric.artifactId, metric.lineageDepth]));
    expect(lineage.get('A')).toBe(0);
    expect(lineage.get('B')).toBe(1);
    expect(lineage.get('C')).toBe(2);

    const citationCounts = new Map(metrics.map((metric) => [metric.artifactId, metric.citationCount]));
    expect(citationCounts.get('B')).toBe(2);
    expect(citationCounts.get('A')).toBe(1);
    expect(citationCounts.get('C')).toBe(1);

    const totalScore = metrics.reduce((sum, metric) => sum + metric.score, 0);
    expect(totalScore).toBeGreaterThan(0.9);
    expect(totalScore).toBeLessThan(1.1);
  });
});
