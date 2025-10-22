import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? 'file:./data/culture-graph.db';

if (url.startsWith('file:')) {
  const path = url.slice('file:'.length);
  if (path !== ':memory:' && !path.startsWith(':')) {
    const target = path.startsWith('.') ? resolve(path) : path;
    mkdirSync(dirname(target), { recursive: true });
  }
}

export const prisma = new PrismaClient();

export type PrismaClientType = typeof prisma;
