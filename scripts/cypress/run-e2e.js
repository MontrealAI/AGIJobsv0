#!/usr/bin/env node

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const PREVIEW_COMMAND = ['npm', ['--prefix', 'apps/console', 'run', 'preview', '--', '--host', '0.0.0.0', '--port', '4173']];
const PREVIEW_URL = 'http://127.0.0.1:4173';
const PREVIEW_TIMEOUT_MS = 120_000;
const PREVIEW_POLL_INTERVAL_MS = 1_000;

function sanitizeEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().includes('cypress_install_binary')) {
      env[key] = '';
    }
  }
  return env;
}

async function waitForServer(url, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch (error) {
      // Ignore connection errors until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url} to become available`);
}

function spawnProcess(command, args, options) {
  const child = spawn(command, args, options);
  child.on('error', (error) => {
    console.error(`Failed to start ${command}:`, error);
  });
  return child;
}

function resolveCypressCli() {
  const pkgDir = path.dirname(require.resolve('cypress/package.json'));
  return path.join(pkgDir, 'bin', 'cypress');
}

function hasXvfb() {
  try {
    const result = spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' });
    return result.status === 0 || result.status === 1;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function getCypressInvocation() {
  const cypressCli = resolveCypressCli();
  if (hasXvfb()) {
    return {
      command: 'xvfb-run',
      args: ['-a', process.execPath, cypressCli, 'run', '--config-file', 'cypress.config.ts'],
    };
  }
  return {
    command: process.execPath,
    args: [cypressCli, 'run', '--config-file', 'cypress.config.ts'],
  };
}

(async () => {
  const env = sanitizeEnv();
  const server = spawnProcess(PREVIEW_COMMAND[0], PREVIEW_COMMAND[1], {
    env,
    stdio: 'inherit',
  });

  const serverClosed = new Promise((_, reject) => {
    server.once('exit', (code, signal) => {
      reject(new Error(`Preview server exited early (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`));
    });
  });

  try {
    await Promise.race([
      waitForServer(PREVIEW_URL, PREVIEW_TIMEOUT_MS, PREVIEW_POLL_INTERVAL_MS),
      serverClosed,
    ]);
  } catch (error) {
    server.kill('SIGTERM');
    throw error;
  }

  let cypressExitCode = 1;
  const { command, args } = getCypressInvocation();
  const cypress = spawnProcess(command, args, {
    env,
    stdio: 'inherit',
  });

  const handleSignal = (signal) => {
    if (!cypress.killed) {
      cypress.kill(signal);
    }
    if (!server.killed) {
      server.kill(signal);
    }
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    cypressExitCode = await new Promise((resolve) => {
      cypress.once('exit', (code, signal) => {
        if (typeof code === 'number') {
          resolve(code);
        } else {
          resolve(signal ? 1 : 0);
        }
      });
    });
  } finally {
    if (!server.killed) {
      server.kill('SIGTERM');
    }
    await new Promise((resolve) => {
      server.once('exit', () => resolve());
      setTimeout(resolve, 10_000);
    });
  }

  process.exit(cypressExitCode);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
