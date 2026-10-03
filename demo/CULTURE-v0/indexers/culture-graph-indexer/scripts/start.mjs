import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { databaseUrl } from './database-url.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
loadEnv();
process.env.DATABASE_URL = databaseUrl(process.env, root);
const file = process.env.DATABASE_URL.slice(5);
await mkdir(dirname(file), { recursive: true });
const migration = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/prisma/build/index.js', import.meta.url)
    ),
    'migrate',
    'deploy',
    '--schema',
    'prisma/schema.prisma',
  ],
  { cwd: root, env: process.env, stdio: 'inherit' }
);
if (migration.error) throw migration.error;
if (migration.status !== 0)
  throw new Error('Database migration failed; indexer startup stopped');
await import('../dist/index.js');
