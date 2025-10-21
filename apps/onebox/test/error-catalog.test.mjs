import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const catalogPath = path.join(repoRoot, 'storage', 'errors', 'onebox.json');

const loadCatalog = async () => {
  const raw = await readFile(catalogPath, 'utf8');
  const data = JSON.parse(raw);
  assert.equal(typeof data, 'object');
  return data;
};

test('friendly error catalog exposes orchestrator UI guidance', async () => {
  const catalog = await loadCatalog();

  for (const key of [
    'ORCHESTRATOR_NOT_CONFIGURED',
    'API_TOKEN_MISSING',
    'API_TOKEN_INVALID',
    'ESCROW_BALANCE_LOW',
    'RUN_FAILED',
    'SYSTEM_PAUSED',
    'PLAN_GUARDRAILS',
    'PLAN_MISSING_INFO',
    'SIMULATION_BLOCKED',
    'EXECUTION_REVERTED',
    'STATUS_UNREACHABLE'
  ]) {
    assert.equal(
      typeof catalog[key],
      'string',
      `expected catalog entry for ${key}`
    );
    assert.notEqual(catalog[key].trim(), '', `${key} should have guidance`);
  }
});


test('friendly error catalog includes orchestrator backend codes', async () => {
  const catalog = await loadCatalog();

  for (const key of [
    'REQUEST_EMPTY',
    'AUTH_MISSING',
    'PLAN_HASH_REQUIRED',
    'REWARD_INVALID',
    'UNKNOWN'
  ]) {
    assert.equal(
      typeof catalog[key],
      'string',
      `expected catalog entry for ${key}`
    );
    assert.notEqual(catalog[key].trim(), '', `${key} should have guidance`);
  }
});
