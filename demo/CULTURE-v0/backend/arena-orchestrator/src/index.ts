import http from 'node:http';
import express from 'express';
import cors from 'cors';
import promClient from 'prom-client';
import { WebSocketServer } from 'ws';
import { buildRouter } from './router.js';
import { asyncHandler } from './async-handler.js';
import { ArenaService } from './arena.service.js';
import { loadEnvironment } from './env.js';
import {
  InMemorySelfPlayArenaClient,
  OnChainSelfPlayArenaClient,
} from './selfplay-arena.js';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';

const env = loadEnvironment();
const port = env.port;

const arenaClient =
  env.arenaAddress && env.operatorKey
    ? new OnChainSelfPlayArenaClient(
        env.arenaAddress,
        env.rpcUrl,
        env.operatorKey,
      )
    : new InMemorySelfPlayArenaClient();

if (!env.arenaAddress || !env.operatorKey) {
  const log = buildStructuredLogRecord({
    component: 'arena-server',
    action: 'configuration-warning',
    level: 'warn',
    details: {
      message:
        'SELFPLAY_ARENA_ADDRESS and ORCHESTRATOR_PRIVATE_KEY not configured; using in-memory client.',
    },
  });
  console.warn(JSON.stringify(log));
}

const service = new ArenaService(env.arena, {
  arenaContract: arenaClient,
  slashRecipient: env.slashRecipient,
});
await service.waitUntilReady();

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.studioOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(buildRouter(service, env.apiToken, !!env.arenaAddress));

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

app.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  }),
);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/arena' });

function broadcastScoreboard(): void {
  const payload = JSON.stringify({
    type: 'scoreboard',
    data: service.getScoreboard(),
  });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (socket) => {
  const log = buildStructuredLogRecord({
    component: 'arena-ws',
    action: 'connection',
    details: { totalClients: wss.clients.size },
  });
  console.log(JSON.stringify(log));
  socket.send(
    JSON.stringify({ type: 'scoreboard', data: service.getScoreboard() }),
  );
});

service.on('scoreboard:update', () => broadcastScoreboard());

server.listen(port, env.host, () => {
  const log = buildStructuredLogRecord({
    component: 'arena-server',
    action: 'started',
    details: { port },
  });
  console.log(JSON.stringify(log));
});

function shutdown(): void {
  const log = buildStructuredLogRecord({
    component: 'arena-server',
    action: 'shutdown',
  });
  console.log(JSON.stringify(log));
  for (const client of wss.clients) client.terminate();
  wss.close();
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
