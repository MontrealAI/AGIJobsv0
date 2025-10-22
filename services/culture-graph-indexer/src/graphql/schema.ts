import { gql } from 'graphql-tag';

export const typeDefs = gql`
  enum CitationDirection {
    INCOMING
    OUTGOING
  }

  type Artifact {
    id: ID!
    author: String!
    kind: String!
    cid: String!
    parentId: ID
    blockNumber: Int!
    blockHash: String!
    logIndex: Int!
    timestamp: String!
    influenceScore: Float!
    citationCount: Int!
    lineageDepth: Int!
    citations(direction: CitationDirection = OUTGOING): [Citation!]!
  }

  type Citation {
    id: ID!
    from: Artifact!
    to: Artifact!
    blockNumber: Int!
    blockHash: String!
    logIndex: Int!
  }

  type LineageNode {
    depth: Int!
    artifact: Artifact!
  }

  type CultureStats {
    artifactCount: Int!
    citationCount: Int!
    roundCount: Int!
    averageInfluence: Float!
    maxLineageDepth: Int!
    latestFinalizedRound: String
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type ArtifactEdge {
    cursor: String!
    node: Artifact!
  }

  type ArtifactConnection {
    totalCount: Int!
    edges: [ArtifactEdge!]!
    pageInfo: PageInfo!
  }

  type Query {
    artifact(id: ID!): Artifact
    artifacts(limit: Int = 20, offset: Int = 0, kind: String): [Artifact!]!
    artifactsConnection(first: Int = 20, after: String, kind: String): ArtifactConnection!
    citations(artifactId: ID!, direction: CitationDirection = OUTGOING): [Citation!]!
    lineage(artifactId: ID!): [LineageNode!]!
    topInfluential(limit: Int = 10): [Artifact!]!
    influencers(first: Int = 10, after: String): ArtifactConnection!
    cultureStats: CultureStats!
  }
`;
