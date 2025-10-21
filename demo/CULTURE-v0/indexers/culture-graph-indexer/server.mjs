import http from "http";
import { buildSchema, graphql } from "graphql";

const schema = buildSchema(`
  type Artifact {
    id: ID!
    author: String!
    kind: String!
    cid: String!
    createdAt: String!
    parentId: ID
    cites: [ID!]!
    influence: Float!
  }

  type Query {
    artifact(id: ID!): Artifact
    artifacts(kind: String, limit: Int, offset: Int): [Artifact!]!
    topInfluential(limit: Int): [Artifact!]!
  }
`);

function seedArtifacts() {
  const now = new Date().toISOString();
  return new Map([
    [
      "1",
      {
        id: "1",
        author: "0xTeacher",
        kind: "book",
        cid: "bafybook1",
        createdAt: now,
        cites: [],
        influence: 0.42,
      },
    ],
    [
      "2",
      {
        id: "2",
        author: "0xStudent",
        kind: "book",
        cid: "bafybook2",
        createdAt: now,
        parentId: "1",
        cites: ["1"],
        influence: 0.66,
      },
    ],
  ]);
}

const artifacts = seedArtifacts();

const rootValue = {
  artifact: ({ id }) => artifacts.get(String(id)) ?? null,
  artifacts: ({ kind, limit, offset }) => {
    const values = Array.from(artifacts.values());
    const filtered = kind ? values.filter((artifact) => artifact.kind === kind) : values;
    const start = offset ?? 0;
    const size = limit ?? 25;
    return filtered.slice(start, start + size);
  },
  topInfluential: ({ limit }) => {
    const size = limit ?? 10;
    return Array.from(artifacts.values())
      .sort((a, b) => b.influence - a.influence)
      .slice(0, size);
  },
};

const port = Number(process.env.CULTURE_INDEXER_PORT ?? process.env.INDEXER_PORT ?? 8000);
const host = "0.0.0.0";

const server = http.createServer(async (req, res) => {
  const path = req?.url?.split("?")[0] ?? "/";
  if (req?.method === "GET" && (path === "/health" || path === "/healthz")) {
    res.setHeader("content-type", "application/json");
    res.setHeader("access-control-allow-origin", "*");
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req?.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "POST,OPTIONS" );
    res.setHeader("access-control-allow-headers", "content-type");
    res.writeHead(204);
    res.end();
    return;
  }

  if (req?.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    res.setHeader("content-type", "application/json");
    res.setHeader("access-control-allow-origin", "*");
    res.writeHead(400);
    res.end(JSON.stringify({ errors: [{ message: "Invalid JSON body" }] }));
    return;
  }

  const result = await graphql({
    schema,
    source: payload.query,
    rootValue,
    variableValues: payload.variables,
  });

  res.setHeader("content-type", "application/json");
  res.setHeader("access-control-allow-origin", "*");
  res.writeHead(200);
  res.end(JSON.stringify(result));
});

server.listen(port, host, () => {
  console.log(`Culture graph indexer listening on ${host}:${port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
