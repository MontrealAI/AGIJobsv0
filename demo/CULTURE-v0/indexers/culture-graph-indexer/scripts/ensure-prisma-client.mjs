import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const defaultDbPath = path.join(projectRoot, '.tmp', 'dev.db');
const databaseUrl = process.env.DATABASE_URL ?? `file:${defaultDbPath}`;
const requireFromProject = createRequire(import.meta.url);

function prismaClientExists() {
  try {
    const { Prisma, PrismaClient } = requireFromProject('@prisma/client');
    return typeof PrismaClient === 'function' &&
      Array.isArray(Prisma?.dmmf?.datamodel?.models) &&
      Prisma.dmmf.datamodel.models.some((model) => model.name === 'Artifact');
  } catch {
    return false;
  }
}

function ensureDefaultDbDir() {
  try {
    const dir = path.dirname(defaultDbPath);
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Best effort; prisma will surface any path errors during generation.
  }
}

function generatePrismaClient() {
  console.log('→ Prisma client artifacts missing; generating with prisma generate...');
  ensureDefaultDbDir();
  execFileSync(process.execPath, [requireFromProject.resolve('prisma/build/index.js'), 'generate'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CI: process.env.CI ?? '1',
    },
  });
}

if (!prismaClientExists()) {
  generatePrismaClient();
} else if (process.env.DEBUG?.toLowerCase() === 'true') {
  console.log('→ Prisma client already present; skipping generate.');
}
