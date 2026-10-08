import { expect, it, vi } from 'vitest';
import { createPrismaTestContext } from './helpers.js';

it('clones migrated schema without sharing records or disconnecting other contexts', async () => {
  const first = createPrismaTestContext();
  const second = createPrismaTestContext();
  await first.prisma.eventCursor.create({
    data: { id: 1, blockNumber: 7, logIndex: 2 },
  });
  await first.prisma.datasetChecksum.create({
    data: { key: 'fixture', hash: 'first-only' },
  });
  expect(await second.prisma.eventCursor.count()).toBe(0);
  expect(await second.prisma.datasetChecksum.count()).toBe(0);
  vi.spyOn(first.prisma, '$disconnect').mockRestore();
  await first.disconnect();
  await first.disconnect();
  await second.prisma.eventCursor.create({
    data: { id: 1, blockNumber: 9, logIndex: 0 },
  });
  expect(
    await second.prisma.eventCursor.findUnique({ where: { id: 1 } }),
  ).toMatchObject({ blockNumber: 9 });
});

it('starts a later context from the empty migrated template', async () => {
  const { prisma } = createPrismaTestContext();
  expect(await prisma.eventCursor.count()).toBe(0);
  expect(await prisma.datasetChecksum.count()).toBe(0);
});
