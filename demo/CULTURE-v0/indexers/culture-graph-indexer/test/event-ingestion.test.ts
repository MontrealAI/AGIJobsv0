import { describe, expect, it } from 'vitest';
import { createPrismaTestContext } from './helpers.js';
import { InfluenceService } from '../src/services/influence-service.js';
import { NoopInfluenceValidator } from '../src/services/networkx-validator.js';
import { EventIngestionService } from '../src/services/event-ingestion-service.js';

describe('Event ingestion', () => {
  it('persists artifacts, citations, and recomputes influence metrics', async () => {
    const { prisma } = createPrismaTestContext();
    const influence = new InfluenceService(
      prisma,
      { maxIterations: 10, tolerance: 1e-8 },
      new NoopInfluenceValidator()
    );
    const ingestion = new EventIngestionService(prisma, influence, {});

    const now = new Date();
    await ingestion.handleArtifactMinted({
      artifactId: '1',
      author: '0xAuthorA',
      kind: 'book',
      cid: 'ipfs://cid-a',
      parentId: null,
      blockNumber: 1,
      blockHash: '0xhash1',
      logIndex: 0,
      timestamp: now,
    });

    await ingestion.handleArtifactMinted({
      artifactId: '2',
      author: '0xAuthorB',
      kind: 'curriculum',
      cid: 'ipfs://cid-b',
      parentId: '1',
      blockNumber: 2,
      blockHash: '0xhash2',
      logIndex: 0,
      timestamp: new Date(now.getTime() + 1_000),
    });

    await ingestion.handleArtifactCited({
      fromArtifactId: '2',
      toArtifactId: '1',
      blockNumber: 3,
      blockHash: '0xhash3',
      logIndex: 0,
    });

    const artifacts = await prisma.artifact.findMany({
      include: { influence: true },
      orderBy: { id: 'asc' },
    });
    expect(artifacts).toHaveLength(2);
    const [first, second] = artifacts;
    expect(first.influence?.citationCount).toBe(1);
    expect(second.influence?.lineageDepth).toBe(1);
    expect((first.influence?.score ?? 0) > (second.influence?.score ?? 0)).toBe(true);

    const citations = await prisma.citation.findMany();
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({ fromId: '2', toId: '1' });
  });
});
