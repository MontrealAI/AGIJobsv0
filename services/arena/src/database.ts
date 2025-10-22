import { PrismaClient } from '@prisma/client';

const prismaSingletonKey = Symbol.for('arena.prisma');

type GlobalScope = typeof globalThis & {
  [prismaSingletonKey]?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  const globalScope = globalThis as GlobalScope;
  if (!globalScope[prismaSingletonKey]) {
    globalScope[prismaSingletonKey] = new PrismaClient();
  }
  return globalScope[prismaSingletonKey]!;
}
