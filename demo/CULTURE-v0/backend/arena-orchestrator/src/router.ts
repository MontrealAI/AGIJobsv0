import express from 'express';
import { z } from 'zod';
import { ArenaService } from './arena.service.js';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';

const startSchema = z.object({
  artifactId: z.number().int().nonnegative(),
  teacher: z.string().min(1),
  students: z.array(z.string().min(1)).default([]),
  validators: z.array(z.string().min(1)).default([]),
  difficultyOverride: z.number().int().optional()
});

const finalizeSchema = z.object({
  winners: z.array(z.string().min(1)).default([])
});

const submissionSchema = z.object({
  participant: z.string().min(1),
  cid: z.string().min(5)
});

export function buildRouter(service: ArenaService) {
  const router = express.Router();

  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.post('/arena/start', async (req, res, next) => {
    try {
      const payload = startSchema.parse(req.body);
      const round = await service.startRound(payload);
      res.status(201).json({ round });
    } catch (error) {
      next(error);
    }
  });

  router.post('/arena/close/:roundId', async (req, res, next) => {
    try {
      const roundId = Number(req.params.roundId);
      const round = await service.closeRound(roundId);
      res.json({ round });
    } catch (error) {
      next(error);
    }
  });

  router.post('/arena/submit/:roundId', async (req, res, next) => {
    try {
      const roundId = Number(req.params.roundId);
      const payload = submissionSchema.parse(req.body);
      await service.recordSubmission(roundId, payload.participant, payload.cid);
      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/arena/finalize/:roundId', async (req, res, next) => {
    try {
      const roundId = Number(req.params.roundId);
      const payload = finalizeSchema.parse(req.body);
      const summary = await service.finalizeRound(roundId, payload.winners);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get('/arena/scoreboard', (_req, res) => {
    res.json(service.getScoreboard());
  });

  router.get('/arena/status/:roundId', (req, res, next) => {
    try {
      const roundId = Number(req.params.roundId);
      res.json(service.getRound(roundId));
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const log = buildStructuredLogRecord({
      component: 'arena-router',
      action: 'error',
      level: 'error',
      details: {
        path: req.path,
        method: req.method,
        message: error instanceof Error ? error.message : 'unknown',
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    console.error(JSON.stringify(log));

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'validation_error', details: error.flatten() });
      return;
    }
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'unknown_error' });
  });

  return router;
}
