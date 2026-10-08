import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll } from 'vitest';

const require = createRequire(import.meta.url);
const contexts = new Set<() => Promise<void>>();
let templateDir: string;
let templatePath: string;

// Run the real migrations once per test file, outside the five-second test
// deadline. Each context still gets its own database and Prisma connection.
beforeAll(() => {
  templateDir = mkdtempSync(join(tmpdir(), 'culture-graph-template-'));
  templatePath = join(templateDir, 'template.db');
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${templatePath}` },
      stdio: 'inherit',
      timeout: 20_000,
    },
  );
}, 30_000);

afterEach(async () => {
  for (const cleanup of contexts) await cleanup();
});

afterAll(() => {
  if (templateDir) rmSync(templateDir, { recursive: true, force: true });
});

interface TestPrismaContext {
  readonly prisma: PrismaClient;
  readonly disconnect: () => Promise<void>;
}

export function createPrismaTestContext(): TestPrismaContext {
  const dir = mkdtempSync(join(tmpdir(), 'culture-graph-'));
  const dbPath = join(dir, 'test.db');
  const databaseUrl = `file:${dbPath}`;

  copyFileSync(templatePath, dbPath);

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  // Prisma exposes methods through a proxy; restoring a test spy can remove the
  // proxied property. Keep the actual disconnect operation for fixture cleanup.
  const disconnect = prisma.$disconnect.bind(prisma);

  const cleanup = async () => {
    await disconnect();
    rmSync(dir, { recursive: true, force: true });
    contexts.delete(cleanup);
  };
  contexts.add(cleanup);

  return {
    prisma,
    disconnect: cleanup,
  };
}
