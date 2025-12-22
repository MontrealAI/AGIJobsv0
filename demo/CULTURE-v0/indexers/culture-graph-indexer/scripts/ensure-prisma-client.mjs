import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const clientIndex = path.join(projectRoot, 'node_modules', '.prisma', 'client', 'index.js');
const clientPackage = path.join(projectRoot, 'node_modules', '@prisma', 'client', 'index.js');
const defaultDbPath = path.join(projectRoot, '.tmp', 'dev.db');
const databaseUrl = process.env.DATABASE_URL ?? `file:${defaultDbPath}`;
const requireFromProject = createRequire(import.meta.url);

function prismaClientExists() {
  try {
    if (fs.existsSync(clientIndex) || fs.existsSync(clientPackage)) {
      return true;
    }
    requireFromProject.resolve('@prisma/client');
    return true;
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
  execSync('npx prisma generate', {
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
