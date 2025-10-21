import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { graphqlHTTP } from 'express-graphql';
import { GraphStore } from './graph.js';
import { buildSchema } from './schema.js';
import { CultureGraphIndexer } from './indexer.js';
import { logger } from './logger.js';

const port = Number(process.env.INDEXER_PORT ?? 4100);
const recomputeIntervalMs = Number(process.env.INFLUENCE_JOB_INTERVAL ?? 60_000);

const store = new GraphStore(process.env.SQLITE_PATH);
const schema = buildSchema(store);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

app.use('/graphql', graphqlHTTP({
  schema,
  graphiql: true
}));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const rpcUrl = process.env.RPC_URL;
const cultureRegistryAddress = process.env.CULTURE_REGISTRY_ADDRESS;
const selfPlayArenaAddress = process.env.SELF_PLAY_ARENA_ADDRESS;
const startBlock = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : undefined;
const finalityDepth = process.env.FINALITY_DEPTH ? Number(process.env.FINALITY_DEPTH) : undefined;
const pollInterval = process.env.POLL_INTERVAL_MS ? Number(process.env.POLL_INTERVAL_MS) : undefined;
const blockBatchSize = process.env.BLOCK_BATCH_SIZE ? Number(process.env.BLOCK_BATCH_SIZE) : undefined;
const reorgBuffer = process.env.REORG_BUFFER ? Number(process.env.REORG_BUFFER) : undefined;

let indexer: CultureGraphIndexer | null = null;

if (rpcUrl && cultureRegistryAddress) {
  indexer = new CultureGraphIndexer(store, {
    rpcUrl,
    cultureRegistryAddress,
    selfPlayArenaAddress,
    startBlock,
    finalityDepth,
    pollIntervalMs: pollInterval,
    blockBatchSize,
    reorgBuffer
  });
  indexer
    .start()
    .then(() => logger.info('Indexer is running'))
    .catch((error) => logger.error({ err: error }, 'Failed to start indexer'));
} else {
  logger.warn('RPC_URL and CULTURE_REGISTRY_ADDRESS must be set to enable chain indexing');
}

const recompute = () => {
  try {
    store.recomputeInfluence();
  } catch (error) {
    logger.error({ err: error }, 'Failed to recompute influence metrics');
  }
};

recompute();
setInterval(recompute, recomputeIntervalMs).unref();

app.listen(port, () => {
  logger.info(`Culture graph indexer listening on :${port}`);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down');
  if (indexer) {
    await indexer.stop();
  }
  store.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down');
  if (indexer) {
    await indexer.stop();
  }
  store.close();
  process.exit(0);
});
