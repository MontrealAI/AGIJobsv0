import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { GraphQLSchema } from 'graphql';
import type {
  GraphStore,
  ArtifactRecord,
  LineagePath,
  ArenaUsageStats,
  CitationRecord
} from './graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function toGraphQLArtifact(record: ArtifactRecord) {
  return {
    ...record,
    createdAt: new Date(record.createdAt).toISOString()
  };
}

type GraphQLArtifact = ReturnType<typeof toGraphQLArtifact>;

function toGraphQLCitation(record: CitationRecord) {
  return {
    id: record.id,
    fromId: record.fromId,
    toId: record.toId
  };
}

function toGraphQLLineage(path: LineagePath | null) {
  if (!path) return null;
  return {
    depth: path.depth,
    artifacts: path.artifacts.map(toGraphQLArtifact)
  };
}

export function buildSchema(store: GraphStore): GraphQLSchema {
  const typeDefs = readFileSync(join(__dirname, 'schema.graphql'), 'utf8');

  const resolvers = {
    Query: {
      artifact: (_: unknown, args: { id: string }) => {
        const record = store.getArtifact(String(args.id));
        return record ? toGraphQLArtifact(record) : null;
      },
      artifacts: (
        _: unknown,
        args: { kind?: string; limit?: number; offset?: number }
      ) => store.listArtifacts(args).map(toGraphQLArtifact),
      topInfluencers: (_: unknown, args: { limit?: number }) =>
        store.getTopInfluencers(args.limit ?? 10).map(toGraphQLArtifact),
      lineage: (_: unknown, args: { id: string }) => toGraphQLLineage(store.getLineage(String(args.id))),
      citations: (
        _: unknown,
        args: { fromId?: string; toId?: string }
      ) => store.getCitations({
        fromId: args.fromId ? String(args.fromId) : undefined,
        toId: args.toId ? String(args.toId) : undefined
      }).map(toGraphQLCitation),
      arenaUsage: () => store.getArenaUsage()
    },
    Artifact: {
      parent: (artifact: GraphQLArtifact) => {
        if (!artifact.parentId) return null;
        const record = store.getArtifact(artifact.parentId);
        return record ? toGraphQLArtifact(record) : null;
      },
      createdAt: (artifact: GraphQLArtifact) => artifact.createdAt,
      citations: (artifact: GraphQLArtifact) =>
        store.getOutgoingCitations(artifact.id).map(toGraphQLCitation),
      citedBy: (artifact: GraphQLArtifact) =>
        store.getIncomingCitations(artifact.id).map(toGraphQLCitation)
    },
    LineagePath: {
      artifacts: (path: LineagePath) => path.artifacts.map(toGraphQLArtifact)
    },
    ArenaUsageStats: {
      winCounts: (stats: ArenaUsageStats) => stats.winCounts
    }
  };

  return makeExecutableSchema({ typeDefs, resolvers });
}
