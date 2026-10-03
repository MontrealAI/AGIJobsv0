import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
const keys = [
  'INDEXER_PORT',
  'RPC_URL',
  'CULTURE_REGISTRY_ADDRESS',
  'SELF_PLAY_ARENA_ADDRESS',
  'DATABASE_URL',
  'SQLITE_PATH',
  'POLL_INTERVAL_MS',
  'BLOCK_BATCH_SIZE',
  'FINALITY_DEPTH',
  'INFLUENCE_DAMPING_FACTOR',
  'INFLUENCE_ITERATIONS',
  'INFLUENCE_TOLERANCE',
  'INFLUENCE_VALIDATION_MULTIPLIER',
  'CULTURE_WEEKLY_METRICS',
  'CULTURE_ANALYTICS_EXPORT',
  'CULTURE_NETWORK',
  'HARDHAT_NETWORK',
  'API_RATE_LIMIT_MAX',
  'API_RATE_LIMIT_WINDOW',
  'BACKFILL_INTERVAL_MS',
  'CHECKSUM_INTERVAL_MS',
];
afterEach(() => vi.unstubAllEnvs());
function clean() {
  for (const key of keys) {
    vi.stubEnv(key, '');
    delete process.env[key];
  }
}
it('loads safe defaults and documented aliases', () => {
  clean();
  expect(loadConfig()).toMatchObject({
    port: 4100,
    networkName: 'local',
    databaseUrl: 'file:./data/culture-graph.db',
  });
  clean();
  vi.stubEnv('SQLITE_PATH', 'file:/tmp/culture-config-test.db');
  vi.stubEnv('CULTURE_ANALYTICS_EXPORT', 'metrics.json');
  vi.stubEnv('HARDHAT_NETWORK', 'sepolia');
  expect(loadConfig()).toMatchObject({
    databaseUrl: 'file:/tmp/culture-config-test.db',
    weeklyMetricsOutput: 'metrics.json',
    networkName: 'sepolia',
  });
  expect(process.env.DATABASE_URL).toBe('file:/tmp/culture-config-test.db');
});
it('parses runtime overrides and rejects invalid scoring/polling bounds', () => {
  clean();
  for (const [key, value] of Object.entries({
    INDEXER_PORT: '0',
    RPC_URL: 'http://localhost:8545',
    CULTURE_REGISTRY_ADDRESS: '0x1',
    SELF_PLAY_ARENA_ADDRESS: '0x2',
    DATABASE_URL: 'file:/tmp/db',
    POLL_INTERVAL_MS: '10',
    BLOCK_BATCH_SIZE: '50',
    FINALITY_DEPTH: '6',
    INFLUENCE_DAMPING_FACTOR: '0.9',
    INFLUENCE_ITERATIONS: '100',
    INFLUENCE_TOLERANCE: '0.001',
    INFLUENCE_VALIDATION_MULTIPLIER: '2',
    CULTURE_WEEKLY_METRICS: 'weekly.json',
    CULTURE_NETWORK: 'test',
    API_RATE_LIMIT_MAX: '25',
    API_RATE_LIMIT_WINDOW: '1 minute',
    BACKFILL_INTERVAL_MS: '20',
    CHECKSUM_INTERVAL_MS: '30',
  }))
    vi.stubEnv(key, value);
  expect(loadConfig()).toMatchObject({
    port: 0,
    pollIntervalMs: 10,
    blockBatchSize: 50,
    finalityDepth: 6,
    influenceDampingFactor: 0.9,
    influenceIterations: 100,
    influenceTolerance: 0.001,
    rateLimitMax: 25,
    backfillIntervalMs: 20,
    checksumIntervalMs: 30,
  });
  vi.stubEnv('INFLUENCE_DAMPING_FACTOR', '1.1');
  expect(() => loadConfig()).toThrow('Invalid configuration');
  vi.stubEnv('INFLUENCE_DAMPING_FACTOR', '0.85');
  vi.stubEnv('BLOCK_BATCH_SIZE', '0');
  expect(() => loadConfig()).toThrow('Invalid configuration');
});
