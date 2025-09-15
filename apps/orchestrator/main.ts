import { config as loadEnv } from 'dotenv';
import { MetaOrchestrator } from './service';

loadEnv();

async function main(): Promise<void> {
  const orchestrator = new MetaOrchestrator();
  await orchestrator.bootstrap();
  orchestrator.start();

  const shutdown = () => {
    orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Meta orchestrator failed to start', err);
  process.exit(1);
});
