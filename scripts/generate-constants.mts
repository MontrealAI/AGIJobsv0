import { main } from './generate-constants-impl.ts';

try {
  await main();
} catch (error) {
  console.error('generate-constants failed', error);
  process.exitCode = 1;
}
