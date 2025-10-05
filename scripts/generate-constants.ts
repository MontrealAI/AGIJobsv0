import { main } from './generate-constants-impl';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
