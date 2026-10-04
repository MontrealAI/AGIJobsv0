import 'dotenv/config';
import { z } from 'zod';
import type { ArenaConfig } from './arena.service.js';

const addressRegex = /^0x[a-fA-F0-9]{40}$/;
const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;

const envSchema = z.object({
  ORCHESTRATOR_PORT: z.coerce
    .number()
    .int()
    .positive()
    .max(65535)
    .default(4005),
  ORCHESTRATOR_HOST: z.string().default('127.0.0.1'),
  STUDIO_ORIGINS: z
    .string()
    .default('http://localhost:4173,http://127.0.0.1:4173'),
  ORCHESTRATOR_API_TOKEN: z.string().min(32).optional(),
  TARGET_SUCCESS_RATE: z.coerce.number().min(0).max(1).default(0.6),
  MAX_DIFFICULTY_STEP: z.coerce.number().int().nonnegative().default(2),
  MIN_DIFFICULTY: z.coerce.number().int().nonnegative().default(1),
  MAX_DIFFICULTY: z.coerce.number().int().min(1).default(9),
  ROUND_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),
  OPERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  OPERATION_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  DIFFICULTY_KI: z.coerce.number().finite().optional(),
  DIFFICULTY_KD: z.coerce.number().finite().optional(),
  DIFFICULTY_INTEGRAL_DECAY: z.coerce.number().finite().optional(),
  DIFFICULTY_MAX_INTEGRAL: z.coerce.number().finite().optional(),
  ELO_K_FACTOR: z.coerce.number().int().positive().default(32),
  ELO_DEFAULT_RATING: z.coerce.number().int().positive().default(1200),
  ELO_MIN_RATING: z.coerce.number().int().optional(),
  ELO_MAX_RATING: z.coerce.number().int().optional(),
  ELO_STATE_PATH: z.string().default('storage/culture/state/elo.json'),
  ROUND_STATE_PATH: z.string().default('storage/culture/state/rounds.json'),
  RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  SELFPLAY_ARENA_ADDRESS: z
    .string()
    .regex(addressRegex, 'SELFPLAY_ARENA_ADDRESS must be a valid address')
    .optional(),
  ORCHESTRATOR_PRIVATE_KEY: z
    .string()
    .regex(
      privateKeyRegex,
      'ORCHESTRATOR_PRIVATE_KEY must be a 32-byte hex key',
    )
    .optional(),
  SLASH_RECIPIENT: z.string().regex(addressRegex).optional(),
});

export interface EnvironmentConfig {
  readonly port: number;
  readonly host: string;
  readonly studioOrigins: string[];
  readonly arena: ArenaConfig;
  readonly rpcUrl: string;
  readonly operatorKey?: string;
  readonly apiToken?: string;
  readonly arenaAddress?: string;
  readonly slashRecipient?: string;
  readonly persistence: {
    readonly eloPath: string;
    readonly roundPath: string;
  };
}

export function loadEnvironment(): EnvironmentConfig {
  const canonicalAddress = process.env.SELF_PLAY_ARENA_ADDRESS || undefined;
  const legacyAddress = process.env.SELFPLAY_ARENA_ADDRESS || undefined;
  if (
    canonicalAddress &&
    legacyAddress &&
    canonicalAddress.toLowerCase() !== legacyAddress.toLowerCase()
  ) {
    throw new Error(
      'SELF_PLAY_ARENA_ADDRESS and SELFPLAY_ARENA_ADDRESS disagree',
    );
  }
  const parsed = envSchema.safeParse({
    ...process.env,
    SELFPLAY_ARENA_ADDRESS: canonicalAddress ?? legacyAddress,
    ORCHESTRATOR_PRIVATE_KEY: process.env.ORCHESTRATOR_PRIVATE_KEY || undefined,
    ORCHESTRATOR_API_TOKEN: process.env.ORCHESTRATOR_API_TOKEN || undefined,
  });
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const message = JSON.stringify(flattened.fieldErrors, null, 2);
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  const values = parsed.data;
  if (
    Boolean(values.SELFPLAY_ARENA_ADDRESS) !==
    Boolean(values.ORCHESTRATOR_PRIVATE_KEY)
  ) {
    throw new Error(
      'Configure both SELF_PLAY_ARENA_ADDRESS and ORCHESTRATOR_PRIVATE_KEY, or neither for the local simulation',
    );
  }
  if (values.ORCHESTRATOR_PRIVATE_KEY && !values.ORCHESTRATOR_API_TOKEN) {
    throw new Error(
      'On-chain operation requires ORCHESTRATOR_API_TOKEN (at least 32 characters)',
    );
  }
  if (
    values.SELFPLAY_ARENA_ADDRESS ===
    '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error(
      'SELF_PLAY_ARENA_ADDRESS must be a deployed, nonzero arena address',
    );
  }
  if (values.MIN_DIFFICULTY > values.MAX_DIFFICULTY)
    throw new Error('MIN_DIFFICULTY must not exceed MAX_DIFFICULTY');
  if (
    values.ELO_MIN_RATING !== undefined &&
    values.ELO_MAX_RATING !== undefined &&
    values.ELO_MIN_RATING > values.ELO_MAX_RATING
  )
    throw new Error('ELO_MIN_RATING must not exceed ELO_MAX_RATING');
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(values.ORCHESTRATOR_HOST) &&
    !values.ORCHESTRATOR_API_TOKEN
  )
    throw new Error('Non-loopback listeners require ORCHESTRATOR_API_TOKEN');
  const studioOrigins = values.STUDIO_ORIGINS.split(',').map(
    (value) => new URL(value.trim()).origin,
  );
  const arena: ArenaConfig = {
    targetSuccessRate: values.TARGET_SUCCESS_RATE,
    maxStep: values.MAX_DIFFICULTY_STEP,
    minDifficulty: values.MIN_DIFFICULTY,
    maxDifficulty: values.MAX_DIFFICULTY,
    initialDifficulty: values.MIN_DIFFICULTY,
    proportionalGain: 4,
    integralGain: values.DIFFICULTY_KI ?? 0.25,
    derivativeGain: values.DIFFICULTY_KD ?? 0.1,
    integralDecay: values.DIFFICULTY_INTEGRAL_DECAY ?? 0.5,
    maxIntegral: values.DIFFICULTY_MAX_INTEGRAL ?? 5,
    roundTimeoutMs: values.ROUND_TIMEOUT_MS,
    operationTimeoutMs: values.OPERATION_TIMEOUT_MS,
    maxRetries: values.OPERATION_MAX_RETRIES,
    elo: {
      kFactor: values.ELO_K_FACTOR,
      defaultRating: values.ELO_DEFAULT_RATING,
      floor: values.ELO_MIN_RATING,
      ceiling: values.ELO_MAX_RATING,
    },
    persistencePath: values.ELO_STATE_PATH,
    roundStatePath: values.ROUND_STATE_PATH,
  };

  return {
    port: values.ORCHESTRATOR_PORT,
    host: values.ORCHESTRATOR_HOST,
    studioOrigins,
    arena,
    rpcUrl: values.RPC_URL,
    operatorKey: values.ORCHESTRATOR_PRIVATE_KEY,
    apiToken: values.ORCHESTRATOR_API_TOKEN,
    arenaAddress: values.SELFPLAY_ARENA_ADDRESS,
    slashRecipient: values.SLASH_RECIPIENT,
    persistence: {
      eloPath: values.ELO_STATE_PATH,
      roundPath: values.ROUND_STATE_PATH,
    },
  };
}
