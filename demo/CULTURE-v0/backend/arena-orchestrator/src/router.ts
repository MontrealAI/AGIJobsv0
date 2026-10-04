import express from 'express';
import { z } from 'zod';
import {
  ArenaInputError,
  ArenaNotFoundError,
  ArenaService,
} from './arena.service.js';
import { asyncHandler } from './async-handler.js';
import { requireWriteToken } from './auth.js';
import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';

const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .refine((value) => !/^0x0{40}$/.test(value), 'Use a nonzero address');
const identifier = z.coerce.number().int().positive().safe();
const startSchema = z
  .object({
    artifactId: z.number().int().positive().safe(),
    teacher: address,
    students: z.array(address).min(1).max(32),
    validators: z.array(address).max(16).default([]),
    difficultyOverride: z
      .number()
      .int()
      .nonnegative()
      .max(4294967295)
      .optional(),
  })
  .strict();

const finalizeSchema = z
  .object({
    winners: z.array(address).max(32),
  })
  .strict();

const submissionSchema = z
  .object({
    participant: address,
    cid: z.string().trim().min(5).max(512),
  })
  .strict();

export function buildRouter(
  service: ArenaService,
  apiToken?: string,
  onChain = false,
) {
  const router = express.Router();
  router.use(requireWriteToken(apiToken));

  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/capabilities', (_req, res) =>
    res.json({
      mode: onChain ? 'hybrid-on-chain' : 'local-adapters',
      generation: false,
      upload: false,
      mint: false,
      derivativeJobs: false,
      ownerControls: false,
    }),
  );

  router.post(
    '/arena/start',
    asyncHandler(async (req, res, next) => {
      try {
        const payload = startSchema.parse(req.body);
        const round = await service.startRound(payload);
        res.status(201).json({ round });
      } catch (error) {
        next(error);
      }
    }),
  );

  router.post(
    '/arena/close/:roundId',
    asyncHandler(async (req, res, next) => {
      try {
        const roundId = identifier.parse(req.params.roundId);
        const round = await service.closeRound(roundId);
        res.json({ round });
      } catch (error) {
        next(error);
      }
    }),
  );

  router.post(
    '/arena/submit/:roundId',
    asyncHandler(async (req, res, next) => {
      try {
        const roundId = identifier.parse(req.params.roundId);
        const payload = submissionSchema.parse(req.body);
        await service.recordSubmission(
          roundId,
          payload.participant,
          payload.cid,
        );
        res.json({ status: 'ok' });
      } catch (error) {
        next(error);
      }
    }),
  );

  router.post(
    '/arena/finalize/:roundId',
    asyncHandler(async (req, res, next) => {
      try {
        const roundId = identifier.parse(req.params.roundId);
        const payload = finalizeSchema.parse(req.body);
        const summary = await service.finalizeRound(roundId, payload.winners);
        res.json(summary);
      } catch (error) {
        next(error);
      }
    }),
  );

  router.get('/arena/scoreboard', (_req, res) => {
    res.json(service.getScoreboard());
  });

  router.get('/arena/status/:roundId', (req, res, next) => {
    try {
      const roundId = identifier.parse(req.params.roundId);
      res.json(service.getRound(roundId));
    } catch (error) {
      next(error);
    }
  });

  router.use(
    (
      error: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const log = buildStructuredLogRecord({
        component: 'arena-router',
        action: 'error',
        level: 'error',
        details: {
          path: req.path,
          method: req.method,
          message: error instanceof Error ? error.message : 'unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      console.error(JSON.stringify(log));

      if (error instanceof ArenaNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ArenaInputError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: 'validation_error', details: error.flatten() });
        return;
      }
      if (error instanceof Error) {
        res.status(500).json({ error: 'internal_error' });
        return;
      }
      res.status(500).json({ error: 'unknown_error' });
    },
  );

  return router;
}
