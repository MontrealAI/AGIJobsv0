#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const contractsDir = path.join(repoRoot, 'contracts');
const buildInfoDir = path.join(repoRoot, 'artifacts', 'build-info');

function getLatestMtime(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return null;
  }

  const queue = [rootPath];
  let latest = 0;

  while (queue.length > 0) {
    const current = queue.pop();
    let stats;

    try {
      stats = fs.statSync(current);
    } catch (error) {
      console.warn(`⚠️  Skipping path ${current}: ${error.message}`);
      continue;
    }

    if (stats.isDirectory()) {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        queue.push(path.join(current, entry.name));
      }
      continue;
    }

    latest = Math.max(latest, stats.mtimeMs);
  }

  return latest === 0 ? null : latest;
}

// Accept invocations from npm/yarn that tack on testing flags meant for Jest
// or other runners (for example "--runInBand" or "--maxWorkers=50"). Hardhat
// rejects non-lowercase CLI params, so we filter out any arguments that are not
// meaningful for Hardhat to keep the test harness robust.
const passthroughArgs = [];
const ignoredPrefixes = ['--runinband', '--maxworkers', '--silent', '--listtests'];
const translatedArgs = [];
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

  if (normalised.startsWith('--runtestsbypath')) {
    // Jest forwards --runTestsByPath to filter JS/TS suites; translate this to
    // Hardhat's --test-files flag so developers can scope Solidity runs
    // without tripping Hardhat's lowercase-only parser.
    const value = arg.includes('=') ? arg.split('=')[1] : process.argv[i + 1];
    if (!arg.includes('=') && value && !value.startsWith('-')) {
      i += 1;
    }

    if (value) {
      // Hardhat accepts test file globs as positional arguments.
      translatedArgs.push(value);
    }
    continue;
  }

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

  if (arg.startsWith('-')) {
    // Hardhat insists on lowercase flag names but values can be case-sensitive
    // (for example Mocha grep patterns or file paths). Preserve the original
    // casing after any '=' delimiter while lowercasing only the flag name.
    const [flag, ...rest] = arg.split('=');
    const loweredFlag = flag.toLowerCase();
    passthroughArgs.push(rest.length > 0 ? `${loweredFlag}=${rest.join('=')}` : loweredFlag);
  } else {
    // Positional arguments should retain their original casing.
    passthroughArgs.push(arg);
  }
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
// several minutes on shared CI hosts; giving Hardhat 15 minutes by default
// avoids spurious ETIMEDOUT failures on slower builders while still protecting
// against runaway jobs.
const hardhatTimeoutMs = Number.parseInt(env.HARDHAT_TEST_TIMEOUT_MS ?? '900000', 10);

// Speed up test-time compilation by allowing the Solidity optimizer and viaIR
// settings to be relaxed when HARDHAT_FAST_COMPILE is set. Default to the
// faster profile during CI/unit runs to keep the suite responsive.
if (!env.HARDHAT_FAST_COMPILE) {
  env.HARDHAT_FAST_COMPILE = '1';
}

let skipCompile = env.HARDHAT_SKIP_COMPILE === '1';

if (!skipCompile && env.CI !== 'true') {
  const latestSourceMtime = getLatestMtime(contractsDir);
  const latestBuildMtime = getLatestMtime(buildInfoDir);

  if (latestSourceMtime && latestBuildMtime && latestBuildMtime >= latestSourceMtime) {
    skipCompile = true;
    env.HARDHAT_SKIP_COMPILE = '1';
    console.log(
      '⚡️ Detected up-to-date Solidity artifacts; enabling HARDHAT_SKIP_COMPILE=1 for this run.',
    );
  }
}

const allArgs = [...passthroughArgs, ...translatedArgs];
const displayedArgs = allArgs.length === 0 ? '(none)' : allArgs.join(' ');

const phase8PlaywrightRoot = path.join(
  repoRoot,
  'demo',
  'Phase-8-Universal-Value-Dominance',
);
const phase8PlaywrightTests = path.join(phase8PlaywrightRoot, 'tests');

const playwrightSpecs = allArgs
  .map((arg) => path.resolve(repoRoot, arg))
  .filter((resolved) => resolved.startsWith(phase8PlaywrightTests));

if (playwrightSpecs.length > 0) {
  const configPath = path.join(phase8PlaywrightRoot, 'playwright.config.ts');
  const cmd = [
    'npx',
    'playwright',
    'test',
    '--config',
    configPath,
    ...playwrightSpecs,
  ];
  console.log(
    '🎭 Detected Playwright demo selection; delegating to Playwright test runner.',
  );
  console.log('⬇️  Ensuring Playwright Chromium binary is installed...');
  const installResult = spawnSync('npx', ['playwright', 'install', '--with-deps', 'chromium'], {
    stdio: 'inherit',
    env,
  });
  if (installResult.status !== 0) {
    console.error('❌ Failed to install Playwright browsers.');
    process.exit(installResult.status ?? 1);
  }
  console.log(`→ ${cmd.join(' ')}`);
  const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', env });
  child.on('close', (code) => {
    process.exit(code ?? 1);
  });
  child.on('error', (error) => {
    console.error('❌ Failed to launch Playwright tests:', error);
    process.exit(1);
  });
  return;
}
console.log(
  `Running Hardhat tests with HARDHAT_FAST_COMPILE=${env.HARDHAT_FAST_COMPILE} and timeout ${hardhatTimeoutMs}ms (args: ${displayedArgs})`,
);
console.log(skipCompile
  ? '⚡️ HARDHAT_SKIP_COMPILE=1 detected: assuming existing artifacts and skipping compilation.'
  : '🧰 Compilation is enabled to ensure artifacts are fresh before running tests.');

const startedAt = Date.now();

console.log(
  '⏳ Launching Hardhat tests (first-time Solidity compilation can take a few minutes)...',
);

function runHardhatWithHeartbeat(timeoutMs) {
  return new Promise((resolve) => {
    const args = ['hardhat', 'test'];

    const hasNoCompileFlag = passthroughArgs.some((arg) => arg === '--no-compile');

    if (skipCompile && !hasNoCompileFlag) {
      args.push('--no-compile');
    }

    args.push(...passthroughArgs, ...translatedArgs);

    const child = spawn('npx', args, {
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
