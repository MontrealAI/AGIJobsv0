#!/usr/bin/env node
const { spawn } = require('child_process');

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

const startedAt = Date.now();

console.log(
  '⏳ Launching Hardhat tests (first-time Solidity compilation can take a few minutes)...',
);

function runHardhatWithHeartbeat(timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['hardhat', 'test', '--no-compile', ...passthroughArgs], {
      stdio: 'inherit',
      env,
    });

    const heartbeatIntervalMs = Number.parseInt(process.env.HARDHAT_HEARTBEAT_MS ?? '60000', 10);
    let elapsed = 0;
    const heartbeat = setInterval(() => {
      elapsed += heartbeatIntervalMs;
      console.log(
        `⏱️  Hardhat tests still running after ${Math.round(elapsed / 1000)}s... ` +
          `timeout in ${Math.max(timeoutMs - elapsed, 0)}ms`,
      );
    }, heartbeatIntervalMs);

    const killTimer = setTimeout(() => {
      console.error(`Hardhat test run exceeded ${timeoutMs}ms. Sending SIGTERM...`);
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('exit', (code, signal) => {
      clearInterval(heartbeat);
      clearTimeout(killTimer);
      resolve({ status: code, signal });
    });

    child.on('error', (error) => {
      clearInterval(heartbeat);
      clearTimeout(killTimer);
      console.error(error.message);
      resolve({ status: 1, signal: null });
    });
  });
}

runHardhatWithHeartbeat(hardhatTimeoutMs).then(({ status, signal }) => {
  const durationMs = Date.now() - startedAt;

  if (signal === 'SIGTERM' || signal === 'SIGKILL') {
    console.error(`Hardhat test run exceeded ${hardhatTimeoutMs}ms and was terminated.`);
  }

  if (status !== 0) {
    console.error(
      `Hardhat tests failed after ${durationMs}ms (exit code ${status ?? 'unknown'}).`,
    );
  }

  console.log(`⏱️ Hardhat test runner completed in ${Math.round(durationMs / 1000)}s.`);

  process.exit(status ?? 1);
});
