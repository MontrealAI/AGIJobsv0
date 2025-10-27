import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { runScenario } from './shared/scenarioRunner';

async function main(): Promise<void> {
  console.log('\n🛰️  Validator Constellation Operator Console');
  const rl = createInterface({ input, output });
  const answer = await rl.question('Run the end-to-end validation, ZK attestation and sentinel drill? (Y/n) ');
  rl.close();
  if (answer.trim().toLowerCase() === 'n') {
    console.log('Operation aborted by operator.');
    return;
  }

  const result = await runScenario();
  console.log('\nMission Complete. Outputs:');
  console.table(result.slashEvents);
  console.log(`Domain paused: ${result.domainPaused}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
