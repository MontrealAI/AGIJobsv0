import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const configSchema = z.object({
  port: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().nonnegative())
    .default('4100')
    .catch(4100),
  rpcUrl: z.string().min(1, 'RPC_URL is required').optional(),
  cultureRegistryAddress: z.string().min(1, 'CULTURE_REGISTRY_ADDRESS is required').optional(),
  selfPlayArenaAddress: z.string().optional(),
  databaseUrl: z.string().default('file:./data/culture-graph.db'),
  pollIntervalMs: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive())
    .optional(),
  blockBatchSize: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive())
    .optional(),
  finalityDepth: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().nonnegative())
    .optional(),
  influenceDampingFactor: z
    .string()
    .transform((value) => Number.parseFloat(value))
    .pipe(z.number().positive())
    .optional(),
  influenceIterations: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive())
    .optional(),
  influenceTolerance: z
    .string()
    .transform((value) => Number.parseFloat(value))
    .pipe(z.number().positive())
    .optional(),
  influenceValidationMultiplier: z
    .string()
    .transform((value) => Number.parseFloat(value))
    .pipe(z.number().positive())
    .optional(),
  weeklyMetricsOutput: z.string().default('demo/CULTURE-v0/data/analytics/culture-graph-indexer.latest.json'),
  networkName: z.string().default('local'),
  rateLimitMax: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive())
    .optional(),
  rateLimitWindow: z.string().optional(),
  backfillIntervalMs: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive())
    .optional(),
  checksumIntervalMs: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive())
    .optional(),
});

export type IndexerConfig = z.infer<typeof configSchema>;

export function loadConfig(): IndexerConfig {
  const result = configSchema.safeParse({
    port: process.env.INDEXER_PORT,
    rpcUrl: process.env.RPC_URL,
    cultureRegistryAddress: process.env.CULTURE_REGISTRY_ADDRESS,
    selfPlayArenaAddress: process.env.SELF_PLAY_ARENA_ADDRESS,
    databaseUrl: process.env.DATABASE_URL ?? process.env.SQLITE_PATH,
    pollIntervalMs: process.env.POLL_INTERVAL_MS,
    blockBatchSize: process.env.BLOCK_BATCH_SIZE,
    finalityDepth: process.env.FINALITY_DEPTH,
    influenceDampingFactor: process.env.INFLUENCE_DAMPING_FACTOR,
    influenceIterations: process.env.INFLUENCE_ITERATIONS,
    influenceTolerance: process.env.INFLUENCE_TOLERANCE,
    influenceValidationMultiplier: process.env.INFLUENCE_VALIDATION_MULTIPLIER,
    weeklyMetricsOutput: process.env.CULTURE_WEEKLY_METRICS ?? process.env.CULTURE_ANALYTICS_EXPORT,
    networkName: process.env.CULTURE_NETWORK ?? process.env.HARDHAT_NETWORK ?? 'local',
    rateLimitMax: process.env.API_RATE_LIMIT_MAX,
    rateLimitWindow: process.env.API_RATE_LIMIT_WINDOW,
    backfillIntervalMs: process.env.BACKFILL_INTERVAL_MS,
    checksumIntervalMs: process.env.CHECKSUM_INTERVAL_MS,
  });

  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  const config = result.data;

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = config.databaseUrl;
  }

  return config;
}
