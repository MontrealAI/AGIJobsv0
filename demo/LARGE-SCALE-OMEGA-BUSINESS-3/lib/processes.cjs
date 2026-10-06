'use strict';
const { spawn } = require('node:child_process');
function stopTree(child, signal = 'SIGTERM') {
  if (!child.pid) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function runPhase(
  definition,
  {
    cwd,
    env = process.env,
    timeoutMs = 300000,
    maxOutputBytes = 8 * 1024 * 1024,
    output,
  } = {}
) {
  return new Promise((resolve) => {
    const started = Date.now();
    let error = null,
      timedOut = false,
      closed = false,
      killer,
      bytes = 0;
    const child = spawn(definition.command, definition.args, {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (chunk) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        if (!error) {
          error = 'Phase output exceeded limit';
          stop();
        }
        return;
      }
      if (output) output.write(chunk);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const stop = () => {
      if (killer) return;
      stopTree(child);
      killer = setTimeout(() => stopTree(child, 'SIGKILL'), 1000);
      killer.unref();
    };
    const outputError = () => {
      error = 'Could not write phase log';
      stop();
    };
    if (output) output.on('error', outputError);
    const cancel = () => {
      error = 'Interrupted by operator';
      stop();
    };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    const timer = setTimeout(() => {
      timedOut = true;
      error = 'Phase timed out';
      stop();
    }, timeoutMs);
    child.on('error', (cause) => {
      error = cause.message;
    });
    child.on('close', (code, signal) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      // A child can exit while its descendants survive; clean the whole process group.
      stopTree(child, 'SIGKILL');
      if (killer) clearTimeout(killer);
      if (output) output.removeListener('error', outputError);
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      resolve({
        id: definition.id,
        label: definition.label,
        status: code === 0 && !error ? 'success' : 'failed',
        exitCode: code ?? -1,
        signal,
        timedOut,
        error,
        durationMs: Date.now() - started,
      });
    });
  });
}
module.exports = { stopTree, runPhase };
