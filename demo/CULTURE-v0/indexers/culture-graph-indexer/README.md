# Culture Graph Indexer

The Culture graph indexer ingests on-chain activity from `CultureRegistry` and
`SelfPlayArena`, stores it in a SQLite database via Prisma, computes influence
metrics, and exposes the results through a Fastify + Apollo GraphQL server.

## Features

- **Ethers.js ingestion** – streams `ArtifactMinted`, `ArtifactCited`, and
  `RoundFinalized` events and keeps an incremental cursor for recovery.
- **Incremental influence analytics** – recomputes PageRank-style scores using
  previously persisted values as the starting state, and derives lineage depth
  for each artifact.
- **GraphQL API** – provides queries for artifacts, citations, lineage, top
  influencers, and aggregate culture statistics.
- **Weekly metrics CLI** – generates JSON snapshots that plug directly into the
  CULTURE reporting pipeline (Subtask F) and can be scheduled through cron.

## Installation

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

The indexer defaults to the SQLite database at `./data/culture-graph.db`. Set
`DATABASE_URL` to override.

## Running the indexer

```bash
npm run build
node dist/index.js
```

Environment variables:

| Variable | Description |
| --- | --- |
| `INDEXER_PORT` | Port for the Fastify server (default `4100`). |
| `RPC_URL` | Ethereum RPC endpoint used for event ingestion. |
| `CULTURE_REGISTRY_ADDRESS` | Deployed `CultureRegistry` contract address. |
| `SELF_PLAY_ARENA_ADDRESS` | Optional `SelfPlayArena` contract address. |
| `DATABASE_URL` | SQLite connection string (default `file:./data/culture-graph.db`). |
| `INFLUENCE_DAMPING_FACTOR` | Override for PageRank damping (default `0.85`). |
| `INFLUENCE_ITERATIONS` | Max PageRank iterations (default `25`). |
| `INFLUENCE_TOLERANCE` | Early-exit threshold for PageRank. |
| `CULTURE_WEEKLY_METRICS` | Output path for weekly metrics JSON export. |

## GraphQL API

The GraphQL server is available at `http://localhost:4100/graphql` by default.
The schema exposes the following queries:

- `artifact(id: ID!)` – fetch a single artifact with influence metrics.
- `artifacts(limit, offset, kind)` – paginate artifacts, optionally filtered by
  kind.
- `citations(artifactId, direction)` – list incoming or outgoing citations.
- `lineage(artifactId)` – return the ancestor chain with depth annotations.
- `topInfluential(limit)` – rank artifacts by influence score.
- `cultureStats` – aggregate counts and the most recent finalized round.

A simple query example:

```graphql
query TopInfluence {
  topInfluential(limit: 5) {
    id
    kind
    author
    influenceScore
    citationCount
  }
}
```

## Weekly metrics CLI

Generate a metrics snapshot that integrates with the CULTURE weekly reports:

```bash
npm exec ts-node --esm src/cli/generate-weekly-metrics.ts --output demo/CULTURE-v0/data/analytics/culture-graph-indexer.latest.json
```

The CLI recomputes influence scores before exporting and writes a JSON payload
containing totals, lineage depth, a Gini coefficient, and the top influential
artifacts. Schedule the command via cron to refresh the analytics pipeline.
