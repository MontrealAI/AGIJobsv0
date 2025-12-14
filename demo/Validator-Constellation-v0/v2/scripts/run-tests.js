#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

/**
 * Thin Vitest wrapper that tolerates Jest-style flags (e.g. --runInBand) so
 * developers can reuse familiar commands without tripping CAC's unknown option
 * errors. When requested, tests are forced into single-thread mode to mirror
 * Jest's serial execution semantics.
 */
const rawArgs = process.argv.slice(2);
const translatedArgs = [];
let requestSerial = false;

for (const arg of rawArgs) {
  if (['--runInBand', '--run-in-band', '-i'].includes(arg)) {
    requestSerial = true;
    continue;
  }
  translatedArgs.push(arg);
}

if (requestSerial) {
  translatedArgs.push('--pool', 'threads', '--poolOptions.threads.singleThread', 'true');
}

const result = spawnSync('npx', ['vitest', 'run', ...translatedArgs], {
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});

process.exit(result.status ?? 1);
