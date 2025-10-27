import { strict as assert } from 'node:assert';

import { runScenario } from '../scripts/shared/scenarioRunner';

async function run(): Promise<void> {
  const result = await runScenario();
  assert.ok(BigInt(result.roundId) > 0n, 'round id should be positive');
  assert.ok(result.slashEvents.length >= 1, 'at least one validator should be slashed');
  const slashed = result.slashEvents.find((event) => event.penalty !== '0');
  assert.ok(slashed, 'slashing penalty should be emitted');
  assert.equal(typeof result.domainPaused, 'boolean');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
