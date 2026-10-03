import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localStackEnv } from '../local-stack-env.mjs';
import { databaseUrl } from '../../indexers/culture-graph-indexer/scripts/database-url.mjs';

test('local Compose excludes inherited fixture values while retaining system tools', () => {
  const example = readFileSync(
    new URL('../../.env.example', import.meta.url),
    'utf8'
  );
  const compose = readFileSync(
    new URL('../../docker-compose.yml', import.meta.url),
    'utf8'
  );
  const result = localStackEnv(
    {
      PATH: '/tools',
      RPC_URL: 'https://remote.invalid',
      CHAIN_ID: '1',
      ORCHESTRATOR_PRIVATE_KEY: 'production-secret',
      CULTURE_REGISTRY_ADDRESS: 'remote',
      COMPOSE_FILE: '/remote-compose.yml',
      DATABASE_URL: 'file:/remote.db',
      CULTURE_ENV_FILE: 'production.env',
      LOCAL_UID: '0',
    },
    example,
    'DATABASE_URL=file:/fixture.db',
    compose
  );
  assert.equal(result.PATH, '/tools');
  for (const key of [
    'RPC_URL',
    'CHAIN_ID',
    'ORCHESTRATOR_PRIVATE_KEY',
    'CULTURE_REGISTRY_ADDRESS',
    'COMPOSE_FILE',
    'DATABASE_URL',
  ]) {
    assert.equal(result[key], undefined, key);
  }
  assert.equal(result.CULTURE_ENV_FILE, '.env.local');
  assert.equal(result.CULTURE_LOCAL_FIXTURES, '1');
  assert.equal(result.LOCAL_UID, String(process.getuid?.() ?? 1000));
});

test('database selection preserves explicit URL and resolves the supported SQLite alias', () => {
  assert.equal(
    databaseUrl(
      { DATABASE_URL: 'file:/operator/db', SQLITE_PATH: '/ignored' },
      '/app'
    ),
    'file:/operator/db'
  );
  assert.equal(
    databaseUrl({ SQLITE_PATH: '/persistent/db' }, '/app'),
    'file:/persistent/db'
  );
  assert.equal(
    databaseUrl({ SQLITE_PATH: 'file:./data/custom.db' }, '/app'),
    'file:/app/data/custom.db'
  );
  assert.equal(databaseUrl({}, '/app'), 'file:/app/data/culture-graph.db');
  assert.throws(
    () => databaseUrl({ DATABASE_URL: 'postgres://remote' }, '/app'),
    /absolute SQLite/
  );
  assert.throws(
    () => databaseUrl({ DATABASE_URL: 'file:relative.db' }, '/app'),
    /absolute SQLite/
  );
});
