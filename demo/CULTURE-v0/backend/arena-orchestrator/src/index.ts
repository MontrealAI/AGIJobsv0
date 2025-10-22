import http from 'node:http';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import promClient from 'prom-client';
import { WebSocketServer } from 'ws';
import { buildRouter } from './router.js';
import { ArenaService } from './arena.service.js';
import { loadEnvironment } from './env.js';
import { InMemorySelfPlayArenaClient, OnChainSelfPlayArenaClient } from './selfplay-arena.js';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';

const env = loadEnvironment();
const port = env.port;

const arenaClient = env.arenaAddress && env.operatorKey
  ? new OnChainSelfPlayArenaClient(env.arenaAddress, env.rpcUrl, env.operatorKey)
  : new InMemorySelfPlayArenaClient();

if (!env.arenaAddress || !env.operatorKey) {
  const log = buildStructuredLogRecord({
    component: 'arena-server',
    action: 'configuration-warning',
    level: 'warn',
    details: {
      message: 'SELFPLAY_ARENA_ADDRESS and ORCHESTRATOR_PRIVATE_KEY not configured; using in-memory client.'
    }
  });
  console.warn(JSON.stringify(log));
}

const service = new ArenaService(env.arena, {
  arenaContract: arenaClient,
  slashRecipient: env.slashRecipient
});

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(buildRouter(service));

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/arena' });

function broadcastScoreboard(): void {
  const payload = JSON.stringify({ type: 'scoreboard', data: service.getScoreboard() });
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
    details: { totalClients: wss.clients.size }
  });
  console.log(JSON.stringify(log));
  socket.send(JSON.stringify({ type: 'scoreboard', data: service.getScoreboard() }));
});

service.on('scoreboard:update', () => broadcastScoreboard());

server.listen(port, () => {
  const log = buildStructuredLogRecord({
    component: 'arena-server',
    action: 'started',
    details: { port }
  });
  console.log(JSON.stringify(log));
});

process.on('SIGINT', () => {
  const log = buildStructuredLogRecord({ component: 'arena-server', action: 'shutdown' });
  console.log(JSON.stringify(log));
  server.close(() => process.exit(0));
});
