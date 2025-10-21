import {
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString
} from 'graphql';
import { GraphStore } from './graph.js';

export function buildSchema(store: GraphStore): GraphQLSchema {
  const artifactType = new GraphQLObjectType({
    name: 'Artifact',
    fields: () => ({
      id: { type: new GraphQLNonNull(GraphQLInt) },
      author: { type: new GraphQLNonNull(GraphQLString) },
      kind: { type: new GraphQLNonNull(GraphQLString) },
      cid: { type: new GraphQLNonNull(GraphQLString) },
      parentId: { type: GraphQLInt },
      cites: { type: new GraphQLList(GraphQLInt) },
      citedBy: { type: new GraphQLList(GraphQLInt) },
      createdAt: { type: new GraphQLNonNull(GraphQLInt) },
      influence: { type: new GraphQLNonNull(GraphQLFloat) }
    })
  });

  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: () => ({
      artifact: {
        type: artifactType,
        args: { id: { type: new GraphQLNonNull(GraphQLInt) } },
        resolve: (_root, args: { id: number }) => store.getArtifact(args.id)
      },
      artifacts: {
        type: new GraphQLList(artifactType),
        args: { limit: { type: GraphQLInt } },
        resolve: (_root, args: { limit?: number }) => {
          const list = store.listArtifacts();
          if (args.limit) {
            return list.slice(0, args.limit);
          }
          return list;
        }
      },
      topInfluential: {
        type: new GraphQLList(artifactType),
        args: { limit: { type: GraphQLInt } },
        resolve: (_root, args: { limit?: number }) => store.getTopInfluential(args.limit ?? 10)
      },
      lineage: {
        type: new GraphQLList(artifactType),
        args: { id: { type: new GraphQLNonNull(GraphQLInt) } },
        resolve: (_root, args: { id: number }) => store.getLineage(args.id)
      }
    })
  });

  return new GraphQLSchema({ query: queryType });
}
