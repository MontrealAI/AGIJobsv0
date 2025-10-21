import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import promClient from 'prom-client';
import { buildRouter } from './router.js';
import { ArenaService } from './arena.service.js';

const port = Number(process.env.ORCHESTRATOR_PORT ?? 4005);
const targetSuccessRate = Number(process.env.TARGET_SUCCESS_RATE ?? 0.6);
const maxStep = Number(process.env.MAX_DIFFICULTY_STEP ?? 2);
const minDifficulty = Number(process.env.MIN_DIFFICULTY ?? 1);
const maxDifficulty = Number(process.env.MAX_DIFFICULTY ?? 9);

const service = new ArenaService({
  targetSuccessRate,
  maxDifficultyStep: maxStep,
  minDifficulty,
  maxDifficulty,
  initialDifficulty: minDifficulty,
  proportionalGain: 4
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

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Culture arena orchestrator listening on :${port}`);
});
