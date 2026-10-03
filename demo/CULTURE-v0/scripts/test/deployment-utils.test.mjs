import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});
const { loadCultureConfig, updateEnvFile } = require('../utils.ts');

test('loads the shipped config with normalized rewards and orchestrator roles from another directory', async () => {
  const old = process.cwd();
  try {
    process.chdir(tmpdir());
    const config = await loadCultureConfig();
    assert.equal(config.arena.teacherReward, '1000000000000000000');
    assert.equal(config.arena.targetSuccessRateBps, 6000);
    assert.equal(config.orchestrators.length, 1);
    assert.equal(config.dependencies.identityRegistry, '');
  } finally {
    process.chdir(old);
  }
});

test('environment updates preserve comments and unrelated values, including quoted JSON', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'culture-env-'));
  const file = path.join(directory, '.env.local');
  try {
    const original =
      '# Keep this deployment note\nUNCHANGED=value\nRPC_URL=old\n';
    await writeFile(file, original);
    await updateEnvFile(file, {
      RPC_URL: 'http://localhost:8545',
      AGI_JOBS_CORE_ADDRESSES: '{"identityRegistry":"0x123"}',
    });
    const result = await readFile(file, 'utf8');
    assert.ok(
      result.startsWith('# Keep this deployment note\nUNCHANGED=value\n')
    );
    assert.ok(result.includes('RPC_URL=http://localhost:8545\n'));
    assert.ok(
      result.includes('AGI_JOBS_CORE_ADDRESSES={"identityRegistry":"0x123"}\n')
    );
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await updateEnvFile(file, { RPC_URL: 'http://localhost:9545' });
    assert.equal((await readFile(file, 'utf8')).match(/^RPC_URL=/gm).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
