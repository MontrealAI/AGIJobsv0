import type { Artifact, Citation, InfluenceMetric, PrismaClient, RoundFinalization } from '@prisma/client';

type Context = {
  readonly prisma: PrismaClient;
};

type ArtifactGraphRecord = Artifact & {
  readonly influence: InfluenceMetric | null;
};

type CitationWithArtifacts = Citation & {
  readonly from: ArtifactGraphRecord;
  readonly to: ArtifactGraphRecord;
};

type QueryResolvers = {
  readonly artifact: (_: unknown, args: { id: string }, context: Context) => Promise<ArtifactDTO | null>;
  readonly artifacts: (
    _: unknown,
    args: { limit?: number; offset?: number; kind?: string | null },
    context: Context
  ) => Promise<ArtifactDTO[]>;
  readonly artifactsConnection: (
    _: unknown,
    args: { first?: number | null; after?: string | null; kind?: string | null },
    context: Context
  ) => Promise<ArtifactConnectionDTO>;
  readonly citations: (
    _: unknown,
    args: { artifactId: string; direction?: 'INCOMING' | 'OUTGOING' },
    context: Context
  ) => Promise<CitationDTO[]>;
  readonly lineage: (_: unknown, args: { artifactId: string }, context: Context) => Promise<LineageNodeDTO[]>;
  readonly topInfluential: (_: unknown, args: { limit?: number }, context: Context) => Promise<ArtifactDTO[]>;
  readonly influencers: (
    _: unknown,
    args: { first?: number | null; after?: string | null },
    context: Context
  ) => Promise<ArtifactConnectionDTO>;
  readonly cultureStats: (_: unknown, args: Record<string, never>, context: Context) => Promise<CultureStatsDTO>;
};

type ArtifactDTO = {
  readonly id: string;
  readonly author: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId: string | null;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
  readonly timestamp: string;
  readonly influenceScore: number;
  readonly citationCount: number;
  readonly lineageDepth: number;
};

type CitationDTO = {
  readonly id: string;
  readonly from: ArtifactDTO;
  readonly to: ArtifactDTO;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
};

type LineageNodeDTO = {
  readonly depth: number;
  readonly artifact: ArtifactDTO;
};

type CultureStatsDTO = {
  readonly artifactCount: number;
  readonly citationCount: number;
  readonly roundCount: number;
  readonly averageInfluence: number;
  readonly maxLineageDepth: number;
  readonly latestFinalizedRound: string | null;
};

type PageInfoDTO = {
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly startCursor: string | null;
  readonly endCursor: string | null;
};

type ArtifactEdgeDTO = {
  readonly cursor: string;
  readonly node: ArtifactDTO;
};

type ArtifactConnectionDTO = {
  readonly totalCount: number;
  readonly edges: ArtifactEdgeDTO[];
  readonly pageInfo: PageInfoDTO;
};

type ArtifactFieldResolvers = {
  readonly citations: (
    parent: ArtifactDTO,
    args: { direction?: 'INCOMING' | 'OUTGOING' },
    context: Context
  ) => Promise<CitationDTO[]>;
};

export const resolvers: { Query: QueryResolvers; Artifact: ArtifactFieldResolvers } = {
  Query: {
    async artifact(_parent, args, context) {
      const record = await fetchArtifact(context.prisma, args.id);
      return record ? mapArtifact(record) : null;
    },

    async artifacts(_parent, args, context) {
      const limit = args.limit ?? 20;
      const offset = args.offset ?? 0;
      const where = args.kind ? { kind: args.kind } : undefined;
      const records = await context.prisma.artifact.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        include: { influence: true },
      });
      return records.map(mapArtifact);
    },

    async artifactsConnection(_parent, args, context) {
      const first = Math.min(Math.max(args.first ?? 20, 1), 100);
      const kindFilter = args.kind ? { kind: args.kind } : undefined;
      const cursor = args.after ? decodeArtifactCursor(args.after) : null;

      const where = buildArtifactCursorWhere(kindFilter, cursor);

      const records = await context.prisma.artifact.findMany({
        where,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: first + 1,
        include: { influence: true },
      });

      const totalCount = await context.prisma.artifact.count({ where: kindFilter });

      const edges = records.slice(0, first).map((record) => ({
        cursor: encodeArtifactCursor(record),
        node: mapArtifact(record),
      }));

      const hasNextPage = records.length > first;
      const pageInfo: PageInfoDTO = {
        hasNextPage,
        hasPreviousPage: Boolean(cursor),
        startCursor: edges.length > 0 ? edges[0].cursor : null,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      };

      return { totalCount, edges, pageInfo };
    },

    async citations(_parent, args, context) {
      const direction = args.direction ?? 'OUTGOING';
      const where = direction === 'INCOMING' ? { toId: args.artifactId } : { fromId: args.artifactId };
      const citations = await context.prisma.citation.findMany({
        where,
        orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
        include: citationInclude,
      });
      return citations.map(mapCitation);
    },

    async lineage(_parent, args, context) {
      const nodes: LineageNodeDTO[] = [];
      let currentId: string | null = args.artifactId;
      let depth = 0;

      while (currentId) {
        const artifact = await fetchArtifact(context.prisma, currentId);
        if (!artifact) {
          break;
        }
        nodes.push({ depth, artifact: mapArtifact(artifact) });
        currentId = artifact.parentId;
        depth += 1;
      }

      return nodes;
    },

    async topInfluential(_parent, args, context) {
      const limit = args.limit ?? 10;
      const records = await context.prisma.artifact.findMany({
        take: limit,
        include: { influence: true },
        orderBy: {
          influence: {
            score: 'desc',
          },
        },
      });
      return records.map(mapArtifact);
    },

    async influencers(_parent, args, context) {
      const first = Math.min(Math.max(args.first ?? 10, 1), 100);
      const cursor = args.after ? decodeInfluencerCursor(args.after) : null;

      const where = cursor
        ? {
            OR: [
              { score: { lt: cursor.score } },
              { score: cursor.score, artifactId: { gt: cursor.artifactId } },
            ],
          }
        : undefined;

      const metrics = await context.prisma.influenceMetric.findMany({
        where,
        orderBy: [{ score: 'desc' }, { artifactId: 'asc' }],
        take: first + 1,
        include: {
          artifact: {
            include: { influence: true },
          },
        },
      });

      const totalCount = await context.prisma.influenceMetric.count();

      const edges = metrics.slice(0, first).map((metric) => ({
        cursor: encodeInfluencerCursor(metric),
        node: mapArtifact(metric.artifact as ArtifactGraphRecord),
      }));

      const hasNextPage = metrics.length > first;
      const pageInfo: PageInfoDTO = {
        hasNextPage,
        hasPreviousPage: Boolean(cursor),
        startCursor: edges.length > 0 ? edges[0].cursor : null,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      };

      return { totalCount, edges, pageInfo };
    },

    async cultureStats(_parent, _args, context) {
      const [artifactCount, citationCount, roundCount, influenceAggregate, latestRound] = await Promise.all([
        context.prisma.artifact.count(),
        context.prisma.citation.count(),
        context.prisma.roundFinalization.count(),
        context.prisma.influenceMetric.aggregate({ _avg: { score: true }, _max: { lineageDepth: true } }),
        context.prisma.roundFinalization.findFirst({
          orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
        }),
      ]);

      return {
        artifactCount,
        citationCount,
        roundCount,
        averageInfluence: influenceAggregate._avg.score ?? 0,
        maxLineageDepth: influenceAggregate._max.lineageDepth ?? 0,
        latestFinalizedRound: latestRound ? formatRound(latestRound) : null,
      };
    },
  },
  Artifact: {
    async citations(parent, args, context) {
      const direction = args.direction ?? 'OUTGOING';
      const where = direction === 'INCOMING' ? { toId: parent.id } : { fromId: parent.id };
      const citations = await context.prisma.citation.findMany({
        where,
        orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
        include: citationInclude,
      });
      return citations.map(mapCitation);
    },
  },
};

function mapArtifact(record: ArtifactGraphRecord): ArtifactDTO {
  return {
    id: record.id,
    author: record.author,
    kind: record.kind,
    cid: record.cid,
    parentId: record.parentId,
    blockNumber: record.blockNumber,
    blockHash: record.blockHash,
    logIndex: record.logIndex,
    timestamp: record.timestamp.toISOString(),
    influenceScore: record.influence?.score ?? 0,
    citationCount: record.influence?.citationCount ?? 0,
    lineageDepth: record.influence?.lineageDepth ?? 0,
  };
}

function mapCitation(record: CitationWithArtifacts): CitationDTO {
  return {
    id: record.id.toString(),
    from: mapArtifact(record.from),
    to: mapArtifact(record.to),
    blockNumber: record.blockNumber,
    blockHash: record.blockHash,
    logIndex: record.logIndex,
  };
}

function formatRound(round: RoundFinalization): string {
  return [
    round.roundId,
    round.newDifficulty,
    round.difficultyDelta >= 0 ? `+${round.difficultyDelta}` : `${round.difficultyDelta}`,
    round.finalizedAt.toISOString(),
  ].join(':');
}

const citationInclude = {
  from: { include: { influence: true } },
  to: { include: { influence: true } },
} as const;

async function fetchArtifact(prisma: PrismaClient, id: string): Promise<ArtifactGraphRecord | null> {
  const record = await prisma.artifact.findUnique({
    where: { id },
    include: { influence: true },
  });
  return record as ArtifactGraphRecord | null;
}

export const contextFactory = (prisma: PrismaClient) => async () => ({ prisma });

export type ResolverContextFactory = ReturnType<typeof contextFactory>;

export type GraphQLContext = Context;

function encodeArtifactCursor(record: ArtifactGraphRecord): string {
  const payload = JSON.stringify({
    id: record.id,
    timestamp: record.timestamp.toISOString(),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeArtifactCursor(cursor: string): { id: string; timestamp: Date } | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { id: string; timestamp: string };
    return { id: payload.id, timestamp: new Date(payload.timestamp) };
  } catch {
    return null;
  }
}

function buildArtifactCursorWhere(
  kindFilter: { kind: string } | undefined,
  cursor: { id: string; timestamp: Date } | null
) {
  if (!cursor) {
    return kindFilter;
  }

  const clauses: object[] = [];
  if (kindFilter) {
    clauses.push(kindFilter);
  }

  clauses.push({
    OR: [
      { timestamp: { lt: cursor.timestamp } },
      { timestamp: cursor.timestamp, id: { lt: cursor.id } },
    ],
  });

  return { AND: clauses };
}

function encodeInfluencerCursor(metric: InfluenceMetric & { artifactId: string }): string {
  const payload = JSON.stringify({
    artifactId: metric.artifactId,
    score: metric.score,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeInfluencerCursor(cursor: string): { artifactId: string; score: number } | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { artifactId: string; score: number };
    return { artifactId: payload.artifactId, score: payload.score };
  } catch {
    return null;
  }
}
