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
  readonly citations: (
    _: unknown,
    args: { artifactId: string; direction?: 'INCOMING' | 'OUTGOING' },
    context: Context
  ) => Promise<CitationDTO[]>;
  readonly lineage: (_: unknown, args: { artifactId: string }, context: Context) => Promise<LineageNodeDTO[]>;
  readonly topInfluential: (_: unknown, args: { limit?: number }, context: Context) => Promise<ArtifactDTO[]>;
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
