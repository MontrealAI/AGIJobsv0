import { setTimeout as sleep } from 'node:timers/promises';

import { SentinelMonitor } from '../src/sentinel';
import { agentIdentities } from '../src/config';
import { runScenario } from './shared/scenarioRunner';

async function main(): Promise<void> {
  console.log('\n🚀 Launching Validator Constellation Demo');
  const sentinel = new SentinelMonitor(1.05);
  sentinel.on('alert', (alert) => {
    console.log('\n⚠️  Sentinel Alert');
    console.table(alert);
  });

  console.log('Priming sentinel monitors...');
  await sleep(250);

  for (const agent of agentIdentities) {
    sentinel.evaluateBudget({ agent: agent.ensName, domain: 'orbital', spent: 1200n, budget: 1000n });
  }

  console.log('\nExecuting on-chain scenario...');
  const result = await runScenario();
  console.log(`\n✅ Scenario executed. Domain pause engaged: ${result.domainPaused}`);
  console.log(`Round ${result.roundId} finalised with ${result.slashEvents.length} slashing event(s).`);
  console.table(result.slashEvents);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
