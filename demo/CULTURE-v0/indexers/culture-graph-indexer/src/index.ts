import { loadConfig } from './config.js';
import { prisma } from './db/prisma.js';
import { createServer } from './server.js';
import { InfluenceService } from './services/influence-service.js';
import { EventIngestionService } from './services/event-ingestion-service.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const influence = new InfluenceService(prisma, {
    dampingFactor: config.influenceDampingFactor,
    maxIterations: config.influenceIterations,
    tolerance: config.influenceTolerance,
  });
  const eventIngestion = new EventIngestionService(prisma, influence, {
    rpcUrl: config.rpcUrl,
    cultureRegistryAddress: config.cultureRegistryAddress,
    selfPlayArenaAddress: config.selfPlayArenaAddress,
    pollIntervalMs: config.pollIntervalMs,
    blockBatchSize: config.blockBatchSize,
    finalityDepth: config.finalityDepth,
  });

  await influence.recompute();
  await eventIngestion.start();

  const { app } = await createServer(prisma);
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Culture graph indexer listening on port ${config.port}`);

  const shutdown = async () => {
    console.log('Shutting down culture graph indexer');
    await eventIngestion.stop();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('Failed to start culture graph indexer', error);
  process.exit(1);
});
