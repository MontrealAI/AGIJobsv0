import http from 'node:http';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import promClient from 'prom-client';
import { WebSocketServer } from 'ws';
import { buildRouter } from './router.js';
import { ArenaService } from './arena.service.js';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';

const port = Number(process.env.ORCHESTRATOR_PORT ?? 4005);
const targetSuccessRate = Number(process.env.TARGET_SUCCESS_RATE ?? 0.6);
const maxStep = Number(process.env.MAX_DIFFICULTY_STEP ?? 2);
const minDifficulty = Number(process.env.MIN_DIFFICULTY ?? 1);
const maxDifficulty = Number(process.env.MAX_DIFFICULTY ?? 9);
const roundTimeoutMs = Number(process.env.ROUND_TIMEOUT_MS ?? 15 * 60_000);
const operationTimeoutMs = Number(process.env.OPERATION_TIMEOUT_MS ?? 10_000);
const maxRetries = Number(process.env.OPERATION_MAX_RETRIES ?? 3);

const service = new ArenaService({
  targetSuccessRate,
  maxDifficultyStep: maxStep,
  minDifficulty,
  maxDifficulty,
  initialDifficulty: minDifficulty,
  proportionalGain: 4,
  integralGain: Number(process.env.DIFFICULTY_KI ?? 0.25),
  derivativeGain: Number(process.env.DIFFICULTY_KD ?? 0.1),
  integralDecay: Number(process.env.DIFFICULTY_INTEGRAL_DECAY ?? 0.5),
  maxIntegral: Number(process.env.DIFFICULTY_MAX_INTEGRAL ?? 5),
  roundTimeoutMs,
  operationTimeoutMs,
  maxRetries,
  elo: {
    kFactor: Number(process.env.ELO_K_FACTOR ?? 32),
    defaultRating: Number(process.env.ELO_DEFAULT_RATING ?? 1200),
    floor: Number(process.env.ELO_MIN_RATING ?? 800),
    ceiling: Number(process.env.ELO_MAX_RATING ?? 2000)
  },
  persistencePath: process.env.ELO_STATE_PATH
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
