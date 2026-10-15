import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluate, parseScenario } from './engine.mjs';
try {
  if (process.argv.length > 3)
    throw Error('Usage: node demo/zenith-sapience/run.mjs [scenario.json]');
  const file = await open(
    process.argv[2] ??
      fileURLToPath(new URL('./scenario.json', import.meta.url)),
    constants.O_RDONLY | (constants.O_NONBLOCK ?? 0)
  );
  let bytes;
  try {
    if (!(await file.stat()).isFile())
      throw Error('Scenario must be a regular file');
    const buffer = Buffer.alloc(1000001);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        total,
        buffer.length - total,
        null
      );
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > 1000000) throw Error('Scenario exceeds1MB');
    bytes = buffer.subarray(0, total);
  } finally {
    await file.close();
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const result = evaluate(parseScenario(text));
  result.scenarioSha256 = createHash('sha256').update(bytes).digest('hex');
  console.log(JSON.stringify(result, null, 2));
  if (result.proposalHoldReasons.length || result.uncoveredDeficitUnits !== '0')
    process.exitCode = 1;
} catch (error) {
  console.error(`Cannot reconcile regional budgets: ${error.message}`);
  process.exitCode = 2;
}
