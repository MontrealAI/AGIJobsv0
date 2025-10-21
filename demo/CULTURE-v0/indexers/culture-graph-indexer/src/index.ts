import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { graphqlHTTP } from 'express-graphql';
import { GraphStore } from './graph.js';
import { buildSchema } from './schema.js';

const port = Number(process.env.INDEXER_PORT ?? 4100);
const recomputeIntervalMs = Number(process.env.INFLUENCE_JOB_INTERVAL ?? 60_000);

const store = new GraphStore();
const schema = buildSchema(store);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

app.use('/graphql', graphqlHTTP({
  schema,
  graphiql: true
}));

app.post('/admin/event', (req, res) => {
  const { type, payload } = req.body ?? {};
  if (type === 'artifactMinted') {
    store.upsertArtifact({
      id: payload.id,
      author: payload.author,
      kind: payload.kind,
      cid: payload.cid,
      parentId: payload.parentId,
      timestamp: payload.timestamp ?? Date.now()
    });
  }
  if (type === 'artifactCited') {
    store.addCitation(payload.id, payload.citedId);
  }
  res.status(204).end();
});

app.post('/admin/recompute', (_req, res) => {
  store.recomputeInfluence();
  res.status(200).json({ status: 'ok' });
});

setInterval(() => {
  store.recomputeInfluence();
}, recomputeIntervalMs).unref();

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Culture graph indexer listening on :${port}`);
});
