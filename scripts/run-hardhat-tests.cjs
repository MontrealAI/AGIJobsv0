#!/usr/bin/env node
const { spawnSync } = require('child_process');

// Accept invocations from npm/yarn that tack on testing flags meant for Jest
// or other runners (for example "--runInBand" or "--maxWorkers=50"). Hardhat
// rejects non-lowercase CLI params, so we filter out any arguments that are not
// meaningful for Hardhat to keep the test harness robust.
const passthroughArgs = [];
const ignoredPrefixes = ['--runinband', '--maxworkers', '--silent', '--listtests'];
let shouldSkipHardhat = false;
let reporterOption;

for (let i = 0; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--reporter' || arg === '-R') {
    const value = process.argv[i + 1];
    if (value) {
      process.env.MOCHA_REPORTER = value;
      i += 1;
      continue;
    }
  }
  if (arg && arg.startsWith('--reporter=')) {
    process.env.MOCHA_REPORTER = arg.split('=')[1];
    continue;
  }
  if (arg === '--reporter-options') {
    reporterOption = process.argv[i + 1];
    i += 1;
    continue;
  }
  if (arg && arg.startsWith('--reporter-options=')) {
    reporterOption = arg.split('=')[1];
    continue;
  }
  if (i < 2) {
    // Skip the node binary and script path
    continue;
  }

  if (arg === '--') {
    // Ignore bare argument separators passed through npm/node runners
    continue;
  }

  const normalised = arg.toLowerCase();
  if (ignoredPrefixes.some((prefix) => normalised.startsWith(prefix))) {
    if (normalised.startsWith('--listtests')) {
      shouldSkipHardhat = true;
    }
    // Drop Jest/npm convenience flags that Hardhat doesn't understand
    if (arg.includes('=') === false && process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) {
      // If the ignored flag expects a value (e.g. --maxWorkers 4), skip the next token too
      i += 1;
    }
    continue;
  }

  passthroughArgs.push(arg);
}

if (reporterOption) {
  process.env.MOCHA_REPORTER_OPTIONS = reporterOption;
}

if (shouldSkipHardhat) {
  console.log('Skipping Hardhat test run because --listTests is a Jest-only flag.');
  process.exit(0);
}

const env = { ...process.env };

// Prevent accidental infinite hangs by enforcing a hard timeout on the
// Hardhat test runner. Developers can override this via HARDHAT_TEST_TIMEOUT_MS
// if they need a longer window on constrained machines. A generous default is
// required because first-time Solidity compilation can legitimately take
// several minutes on shared CI hosts; giving Hardhat 10 minutes by default
// avoids spurious ETIMEDOUT failures while still protecting against runaway
// jobs.
const hardhatTimeoutMs = Number.parseInt(env.HARDHAT_TEST_TIMEOUT_MS ?? '600000', 10);

// Speed up test-time compilation by allowing the Solidity optimizer and viaIR
// settings to be relaxed when HARDHAT_FAST_COMPILE is set. Default to the
// faster profile during CI/unit runs to keep the suite responsive.
if (!env.HARDHAT_FAST_COMPILE) {
  env.HARDHAT_FAST_COMPILE = '1';
}

const displayedArgs = passthroughArgs.length === 0 ? '(none)' : passthroughArgs.join(' ');
console.log(
  `Running Hardhat tests with HARDHAT_FAST_COMPILE=${env.HARDHAT_FAST_COMPILE} and timeout ${hardhatTimeoutMs}ms (args: ${displayedArgs})`,
);

const result = spawnSync(
  'npx',
  ['hardhat', 'test', '--no-compile', ...passthroughArgs],
  {
    stdio: 'inherit',
    env,
    timeout: hardhatTimeoutMs,
  }
);

if (result.error) {
  console.error(result.error.message);
}

if (result.signal === 'SIGTERM' || result.signal === 'SIGKILL') {
  console.error(`Hardhat test run exceeded ${hardhatTimeoutMs}ms and was terminated.`);
}

process.exit(result.status ?? 1);
