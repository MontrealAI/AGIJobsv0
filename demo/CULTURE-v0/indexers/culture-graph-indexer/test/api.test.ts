import { afterEach, describe, expect, it } from 'vitest';
import { createPrismaTestContext } from './helpers.js';
import { createServer } from '../src/server.js';
import { resolvers, contextFactory } from '../src/graphql/resolvers.js';
import { InfluenceService } from '../src/services/influence-service.js';

async function fixture() {
  const { prisma } = createPrismaTestContext();
  const timestamp = new Date('2026-01-02T00:00:00Z');
  await prisma.artifact.createMany({
    data: ['1', '2', '3'].map((id, i) => ({
      id,
      author: `author-${id}`,
      kind: i === 2 ? 'dataset' : 'book',
      cid: `cid-${id}`,
      parentId: i ? String(i) : null,
      timestamp,
      blockNumber: i + 1,
      blockHash: `hash-${id}`,
      logIndex: 0,
    })),
  });
  await prisma.citation.create({
    data: {
      fromId: '3',
      toId: '1',
      blockNumber: 4,
      blockHash: 'hash-4',
      logIndex: 0,
    },
  });
  await new InfluenceService(prisma).recompute();
  return { prisma, context: { prisma } };
}

describe('Culture graph API', () => {
  it('serves GraphQL, health, metrics, and enforces HTTP rate limits', async () => {
    const { prisma } = await fixture();
    const { app, apollo } = await createServer(prisma, { rateLimitMax: 4 });
    afterEach(async () => {
      await apollo.stop();
      await app.close();
    });
    const response = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query:
          '{ artifact(id:"1") { id author citations(direction:INCOMING) { from { id } } } cultureStats { artifactCount citationCount } }',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        artifact: { id: '1', citations: [{ from: { id: '3' } }] },
        cultureStats: { artifactCount: 3, citationCount: 1 },
      },
    });
    expect((await app.inject('/healthz')).json()).toMatchObject({
      status: 'ok',
      influenceValidation: null,
    });
    expect((await app.inject('/metrics')).body).toContain(
      'process_cpu_user_seconds_total',
    );
    await app.inject('/healthz');
    expect((await app.inject('/healthz')).statusCode).toBe(429);
  });

  it('paginates tied timestamps without gaps and filters by kind', async () => {
    const { context } = await fixture();
    const first = await resolvers.Query.artifactsConnection(
      null,
      { first: 1, kind: 'book' },
      context,
    );
    expect(first.edges.map((x) => x.node.id)).toEqual(['2']);
    expect(first.totalCount).toBe(2);
    expect(first.pageInfo.hasNextPage).toBe(true);
    const second = await resolvers.Query.artifactsConnection(
      null,
      { first: 1, kind: 'book', after: first.pageInfo.endCursor },
      context,
    );
    expect(second.edges.map((x) => x.node.id)).toEqual(['1']);
    expect(second.pageInfo).toMatchObject({
      hasNextPage: false,
      hasPreviousPage: true,
    });
    const empty = await resolvers.Query.artifactsConnection(
      null,
      { after: second.pageInfo.endCursor },
      context,
    );
    expect(empty.edges).toEqual([]);
    expect(empty.pageInfo.startCursor).toBeNull();
    expect(
      (await resolvers.Query.artifactsConnection(null, {}, context)).edges,
    ).toHaveLength(3);
    expect(
      (
        await resolvers.Query.artifacts(
          null,
          { kind: 'dataset', limit: 500, offset: -10 },
          context,
        )
      ).map((x) => x.id),
    ).toEqual(['3']);
    expect(
      await resolvers.Query.artifacts(null, { offset: 99 }, context),
    ).toEqual([]);
    expect(await resolvers.Query.artifacts(null, {}, context)).toHaveLength(3);
  });

  it('paginates influence scores and rejects malformed cursors', async () => {
    const { context } = await fixture();
    const seen: string[] = [];
    let after: string | null = null;
    for (let i = 0; i < 3; i++) {
      const page = await resolvers.Query.influencers(
        null,
        { first: 1, after },
        context,
      );
      seen.push(page.edges[0].node.id);
      after = page.pageInfo.endCursor;
      expect(page.totalCount).toBe(3);
    }
    expect(new Set(seen).size).toBe(3);
    expect(
      (await resolvers.Query.influencers(null, { after }, context)).edges,
    ).toEqual([]);
    expect(
      (await resolvers.Query.influencers(null, {}, context)).edges,
    ).toHaveLength(3);
    expect(
      (await resolvers.Query.topInfluential(null, {}, context))[0].id,
    ).toBe(seen[0]);
    expect(
      await resolvers.Query.topInfluential(null, { limit: -1 }, context),
    ).toHaveLength(1);
    for (const value of [
      'not-json',
      Buffer.from('{}').toString('base64url'),
      Buffer.from(
        '{"id":"1","timestamp":"bad","artifactId":"1","score":"NaN"}',
      ).toString('base64url'),
    ]) {
      await expect(
        resolvers.Query.artifactsConnection(null, { after: value }, context),
      ).rejects.toThrow('Invalid artifact cursor');
      await expect(
        resolvers.Query.influencers(null, { after: value }, context),
      ).rejects.toThrow('Invalid influence cursor');
    }
  });

  it('returns lineage, both citation directions, and bounded empty/default data', async () => {
    const { prisma, context } = await fixture();
    expect(
      (await resolvers.Query.lineage(null, { artifactId: '3' }, context)).map(
        (x) => [x.depth, x.artifact.id],
      ),
    ).toEqual([
      [0, '3'],
      [1, '2'],
      [2, '1'],
    ]);
    expect(
      await resolvers.Query.lineage(null, { artifactId: 'missing' }, context),
    ).toEqual([]);
    expect(
      await resolvers.Query.artifact(null, { id: 'missing' }, context),
    ).toBeNull();
    const one = (await resolvers.Query.artifact(null, { id: '1' }, context))!;
    const three = (await resolvers.Query.artifact(null, { id: '3' }, context))!;
    expect(
      await resolvers.Query.citations(
        null,
        { artifactId: '1', direction: 'INCOMING' },
        context,
      ),
    ).toHaveLength(1);
    expect(
      await resolvers.Query.citations(null, { artifactId: '3' }, context),
    ).toHaveLength(1);
    expect(
      await resolvers.Artifact.citations(
        one,
        { direction: 'INCOMING' },
        context,
      ),
    ).toHaveLength(1);
    expect(await resolvers.Artifact.citations(three, {}, context)).toHaveLength(
      1,
    );
    await prisma.artifact.update({
      where: { id: '1' },
      data: { parentId: '3' },
    });
    await expect(
      resolvers.Query.lineage(null, { artifactId: '3' }, context),
    ).rejects.toThrow('cycle');
    await prisma.influenceMetric.deleteMany();
    expect(
      await resolvers.Query.artifact(null, { id: '1' }, context),
    ).toMatchObject({ influenceScore: 0, citationCount: 0, lineageDepth: 0 });
    expect(await resolvers.Query.cultureStats(null, {}, context)).toMatchObject(
      { averageInfluence: 0, maxLineageDepth: 0, latestFinalizedRound: null },
    );
    for (const delta of [2, -2]) {
      await prisma.roundFinalization.create({
        data: {
          roundId: String(delta),
          previousDifficulty: 3,
          difficultyDelta: delta,
          newDifficulty: 3 + delta,
          finalizedAt: new Date('2026-01-03'),
          blockNumber: 10 - delta,
          blockHash: 'round',
          logIndex: 0,
        },
      });
      expect(
        (await resolvers.Query.cultureStats(null, {}, context))
          .latestFinalizedRound,
      ).toContain(delta > 0 ? '+2' : '-2');
    }
    expect(await contextFactory(prisma)()).toEqual(context);
  });

  it('exposes integrity failures in health responses without leaking full validator scores', async () => {
    const { prisma } = createPrismaTestContext();
    const { app, apollo } = await createServer(prisma, {
      integrityStatusProvider: () => ({
        lastBackfill: { at: 'now', durationMs: 1, error: 'RPC unavailable' },
      }),
      validationStatusProvider: () => ({
        ok: false,
        skipped: false,
        engine: 'networkx',
        maxDelta: 0.1,
        externalScores: new Map([['secret', 1]]),
      }),
    });
    afterEach(async () => {
      await apollo.stop();
      await app.close();
    });
    const response = (await app.inject('/healthz')).json();
    expect(response.integrity.lastBackfill.error).toBe('RPC unavailable');
    expect(response.influenceValidation).toEqual({
      ok: false,
      skipped: false,
      engine: 'networkx',
      maxDelta: 0.1,
      error: null,
    });
  });
});
