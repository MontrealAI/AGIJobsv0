import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
process.env.DATABASE_URL ??= `file:${resolve(root, 'data/culture-graph.db')}`;
if (!process.env.DATABASE_URL.startsWith('file:')) throw new Error('CULTURE indexer requires a SQLite file URL');
const file = process.env.DATABASE_URL.slice(5);
if (!file.startsWith('/')) throw new Error('Use an absolute SQLite path in DATABASE_URL');
await mkdir(dirname(file), { recursive: true });
const migration = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)),
  'migrate', 'deploy', '--schema', 'prisma/schema.prisma'
], { cwd: root, env: process.env, stdio: 'inherit' });
if (migration.error) throw migration.error;
if (migration.status !== 0) throw new Error('Database migration failed; indexer startup stopped');
await import('../dist/index.js');
