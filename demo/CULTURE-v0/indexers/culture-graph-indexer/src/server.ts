import { createServer } from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildSchema, graphql } from "graphql";
import { ArtifactStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaSDL = readFileSync(join(__dirname, "schema.graphql"), "utf8");
const schema = buildSchema(schemaSDL);
const store = new ArtifactStore();

const rootValue = {
  artifact: ({ id }: { id: string }) => store.getArtifact(id),
  artifacts: ({ kind, limit, offset }: { kind?: string; limit?: number; offset?: number }) =>
    store.listArtifacts({ kind, limit, offset }),
  topInfluential: ({ limit }: { limit?: number }) => store.topInfluential(limit ?? 10),
};

createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const result = await graphql({ schema, source: payload.query, rootValue, variableValues: payload.variables });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(result));
}).listen(Number(process.env.INDEXER_PORT) || 4100);
