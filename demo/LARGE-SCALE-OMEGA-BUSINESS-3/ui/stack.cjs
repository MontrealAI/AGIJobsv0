'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { ROOT } = require('../lib/scenario.cjs');
const { stopTree } = require('../lib/processes.cjs');
function definitions(env = process.env) {
  const values = [
    ['owner-console', 'apps/console', env.OWNER_CONSOLE_PORT || '3000', 'vite'],
    [
      'enterprise-portal',
      'apps/enterprise-portal',
      env.ENTERPRISE_PORTAL_PORT || '3001',
      'next',
    ],
    [
      'validator-desk',
      'apps/validator-ui',
      env.VALIDATOR_DASHBOARD_PORT || '3002',
      'next',
    ],
  ];
  const ports = new Set();
  return values.map(([id, app, port, kind]) => {
    if (
      !/^[1-9][0-9]{0,4}$/.test(String(port)) ||
      Number(port) > 65535 ||
      ports.has(Number(port))
    )
      throw new Error('UI ports must be distinct integers from 1 to 65535');
    ports.add(Number(port));
    const args = [
      '--prefix',
      app,
      'run',
      'dev',
      '--',
      kind === 'vite' ? '--host' : '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ];
    if (kind === 'vite') args.push('--strictPort');
    return { id, port: Number(port), command: 'npm', args };
  });
}
function available(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () =>
      reject(new Error(`Port ${port} is occupied; choose a free port`))
    );
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
async function supervise(
  defs,
  { timeoutMs = 90000, cwd = ROOT, env = process.env } = {}
) {
  if (process.platform === 'win32')
    throw new Error(
      'The advanced app supervisor requires Linux, macOS or WSL for process-group cleanup'
    );
  for (const def of defs) await available(def.port);
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-ui-'));
  fs.chmodSync(logDir, 0o700);
  const children = [];
  let stopping = false,
    failure,
    resolveStopped;
  const stopped = new Promise((resolve) => {
    resolveStopped = resolve;
  });
  const stop = (error) => {
    if (stopping) return;
    stopping = true;
    failure = error;
    for (const child of children) stopTree(child);
    const timer = setTimeout(() => {
      for (const child of children) stopTree(child, 'SIGKILL');
      resolveStopped();
    }, 1000);
    timer.unref();
    Promise.all(
      children.map((child) =>
        child.exitCode !== null || child.signalCode
          ? Promise.resolve()
          : new Promise((resolve) => child.once('close', resolve))
      )
    ).then(() => {
      for (const child of children) stopTree(child, 'SIGKILL');
      clearTimeout(timer);
      resolveStopped();
    });
  };
  const signal = () => stop();
  process.once('SIGINT', signal);
  process.once('SIGTERM', signal);
  try {
    for (const def of defs) {
      const fd = fs.openSync(path.join(logDir, def.id + '.log'), 'wx', 0o600);
      const child = spawn(def.command, def.args, {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', fd, fd],
      });
      fs.closeSync(fd);
      children.push(child);
      child.once('error', () =>
        stop(new Error(`${def.id} failed to start; inspect ${logDir}`))
      );
      child.once('exit', (code, signal) => {
        if (!stopping)
          stop(
            new Error(
              `${def.id} stopped (${code ?? signal}); inspect ${logDir}`
            )
          );
      });
    }
    console.log(`Starting configured applications. Logs: ${logDir}`);
    const deadline = Date.now() + timeoutMs;
    const pending = new Set(defs);
    while (pending.size && !stopping) {
      await Promise.all(
        [...pending].map(async (def) => {
          try {
            const r = await fetch(`http://127.0.0.1:${def.port}/`, {
              signal: AbortSignal.timeout(1000),
              redirect: 'manual',
            });
            await r.body?.cancel();
            if (r.status < 400) pending.delete(def);
          } catch {}
        })
      );
      if (Date.now() > deadline) {
        stop(new Error(`UI readiness timed out; inspect ${logDir}`));
        break;
      }
      if (pending.size)
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!stopping)
      console.log(
        defs.map((d) => `${d.id}: http://127.0.0.1:${d.port}`).join('\n') +
          '\nReady. These are separately configured apps; no Omega personas are automatically loaded. Ctrl+C stops all services.'
      );
    await stopped;
    if (failure) throw failure;
    return { logDir };
  } finally {
    process.removeListener('SIGINT', signal);
    process.removeListener('SIGTERM', signal);
    for (const child of children) stopTree(child, 'SIGKILL');
  }
}
module.exports = { definitions, available, supervise };
if (require.main === module) {
  if (process.argv.length > 2) {
    console.error(
      'Use port environment variables; --stack takes no extra arguments'
    );
    process.exitCode = 1;
  } else
    supervise(definitions()).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
