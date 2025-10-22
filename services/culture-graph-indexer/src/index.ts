import { loadConfig } from './config.js';
import { prisma } from './db/prisma.js';
import { createServer } from './server.js';
import { InfluenceService } from './services/influence-service.js';
import { EventIngestionService } from './services/event-ingestion-service.js';
import { NetworkXInfluenceValidator } from './services/networkx-validator.js';
import { DataIntegrityService } from './services/data-integrity-service.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const validator = new NetworkXInfluenceValidator({
    toleranceMultiplier: config.influenceValidationMultiplier,
  });
  const influence = new InfluenceService(
    prisma,
    {
      dampingFactor: config.influenceDampingFactor,
      maxIterations: config.influenceIterations,
      tolerance: config.influenceTolerance,
    },
    validator
  );
  const eventIngestion = new EventIngestionService(prisma, influence, {
    rpcUrl: config.rpcUrl,
    cultureRegistryAddress: config.cultureRegistryAddress,
    selfPlayArenaAddress: config.selfPlayArenaAddress,
    pollIntervalMs: config.pollIntervalMs,
    blockBatchSize: config.blockBatchSize,
    finalityDepth: config.finalityDepth,
  });
  const integrity = new DataIntegrityService(eventIngestion, prisma, {
    backfillIntervalMs: config.backfillIntervalMs,
    checksumIntervalMs: config.checksumIntervalMs,
  });

  await influence.recompute();
  await eventIngestion.start();
  integrity.start();
  await integrity.runChecksums().catch(() => undefined);

  const { app } = await createServer(prisma, {
    rateLimitMax: config.rateLimitMax,
    rateLimitWindow: config.rateLimitWindow,
    integrityStatusProvider: () => integrity.getStatus(),
    validationStatusProvider: () => influence.getLastValidation(),
  });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Culture graph indexer listening on port ${config.port}`);

  const shutdown = async () => {
    console.log('Shutting down culture graph indexer');
    await eventIngestion.stop();
    integrity.stop();
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
