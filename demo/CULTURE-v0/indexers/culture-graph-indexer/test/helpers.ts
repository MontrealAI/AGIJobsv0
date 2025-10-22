import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterEach } from 'vitest';

interface TestPrismaContext {
  readonly prisma: PrismaClient;
  readonly disconnect: () => Promise<void>;
}

export function createPrismaTestContext(): TestPrismaContext {
  const dir = mkdtempSync(join(tmpdir(), 'culture-graph-'));
  const dbPath = join(dir, 'test.db');
  const databaseUrl = `file:${dbPath}`;

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const cleanup = async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  };

  afterEach(async () => {
    await cleanup().catch(() => undefined);
  });

  return {
    prisma,
    disconnect: cleanup,
  };
}
