import express, { type Express } from 'express';
import asyncHandler from 'express-async-handler';
import { z, ZodError } from 'zod';
import { initObservability } from './observability.js';
import { getPrisma } from './database.js';
import { DifficultyController } from './difficulty.js';
import { Snapshotter } from './ipfs.js';
import { JobsClient } from './jobs.client.js';
import { ArenaService } from './arena.service.js';
import { startRoundSchema, commitSchema, revealSchema } from './validators.js';

initObservability();

export interface AppDependencies {
  arenaService?: ArenaService;
}

export function buildArenaService(): ArenaService {
  const prisma = getPrisma();
  const difficulty = new DifficultyController({ targetSeconds: 600 });
  const snapshotter = new Snapshotter(true);
  const jobsClient = new JobsClient({ endpoint: process.env.AGI_JOBS_ENDPOINT ?? 'https://jobs.invalid' });
  return new ArenaService(prisma, difficulty, snapshotter, jobsClient, {
    moderationEndpoint: process.env.MODERATION_ENDPOINT
  });
}

export function createApp(deps: AppDependencies = {}): { app: Express; arenaService: ArenaService } {
  const arenaService = deps.arenaService ?? buildArenaService();
  const app = express();
  app.use(express.json());

  app.post(
    '/arena/start',
    asyncHandler(async (req, res) => {
      const data = startRoundSchema.parse(req.body);
      const round = await arenaService.startRound(data);
      res.status(201).json(round);
    })
  );

  app.post(
    '/arena/commit',
    asyncHandler(async (req, res) => {
      const data = commitSchema.parse(req.body);
      await arenaService.commitSubmission(data);
      res.status(204).send();
    })
  );

  app.post(
    '/arena/reveal',
    asyncHandler(async (req, res) => {
      const data = revealSchema.parse(req.body);
      await arenaService.revealSubmission(data);
      res.status(204).send();
    })
  );

  app.post(
    '/arena/close/:roundId',
    asyncHandler(async (req, res) => {
      const { roundId } = req.params;
      const round = await arenaService.closeRound(roundId);
      res.json(round);
    })
  );

  app.get(
    '/arena/scoreboard',
    asyncHandler(async (req, res) => {
      const limit = z.coerce.number().int().min(1).max(50).optional().parse(req.query.limit);
      const agents = await arenaService.getScoreboard(limit ?? 10);
      res.json({ agents });
    })
  );

  app.get(
    '/arena/status/:roundId',
    asyncHandler(async (req, res) => {
      const { roundId } = req.params;
      const round = await arenaService.getStatus(roundId);
      res.json(round);
    })
  );

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  });

  return { app, arenaService };
}

const { app } = createApp();

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT ?? 8080);
  app.listen(port, () => {
    console.log(`Arena service listening on :${port}`);
  });
}

export { app };
