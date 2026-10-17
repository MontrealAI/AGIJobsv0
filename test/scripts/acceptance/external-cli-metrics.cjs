'use strict';
// Test-only observational preload. No provider, signer, source, or transaction hooks.
const fs = require('node:fs');
const path = require('node:path');
const directory = process.env.JOBS_CLI_METRICS_DIRECTORY;
if (directory) {
  process.umask(0o077);
  const label = process.env.JOBS_CLI_METRICS_LABEL || 'unknown';
  if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid metrics label');
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077 ||
    fs.realpathSync(directory) !== directory
  )
    throw Error('Private metrics directory required');
  const file = path.join(directory, `${label}-${process.pid}.json`);
  const fd = fs.openSync(file, 'wx', 0o600);
  // Test-only observation of Hardhat's actual fork close status. The exact
  // returned ChildProcess, arguments, environment and close result are untouched.
  // No child arguments, provider details, signed bytes or exception text is saved.
  const forkFd = fs.openSync(
    path.join(directory, `${label}-${process.pid}-forks.jsonl`),
    'wx',
    0o600
  );
  const forkObservations = { spawned: 0, closed: 0, writeErrors: 0 };
  const childProcess = require('node:child_process');
  const originalFork = childProcess.fork;
  childProcess.fork = function (...args) {
    const child = Reflect.apply(originalFork, this, args);
    const childPid = Number.isSafeInteger(child.pid) ? child.pid : null;
    forkObservations.spawned++;
    child.once('close', (code, signal) => {
      forkObservations.closed++;
      try {
        const record = {
          schema: 'jobs-external-cli-child-close-v1',
          label,
          parentPid: process.pid,
          childPid,
          code: Number.isInteger(code) ? code : null,
          signal:
            typeof signal === 'string' && /^SIG[A-Z0-9]+$/.test(signal)
              ? signal
              : null,
          closedAt: new Date().toISOString(),
        };
        const bytes = Buffer.from(JSON.stringify(record) + '\n');
        let offset = 0;
        while (offset < bytes.length) {
          const written = fs.writeSync(
            forkFd,
            bytes,
            offset,
            bytes.length - offset
          );
          if (written <= 0) throw Error('Metrics write did not advance');
          offset += written;
        }
        fs.fsyncSync(forkFd);
      } catch {
        // A failed observation must not change the original fork/close behavior.
        forkObservations.writeErrors++;
      }
    });
    return child;
  };
  const startedAt = new Date().toISOString();
  const peaks = {};
  let samples = 0;
  function sample(final = false) {
    const usage = process.memoryUsage();
    for (const [key, value] of Object.entries(usage))
      peaks[key] = Math.max(peaks[key] || 0, value);
    samples++;
    const record = {
      schema: 'jobs-external-cli-process-metrics-v1',
      pid: process.pid,
      parentPid: process.ppid,
      label,
      entrypoint: path.basename(process.argv[1] || ''),
      node: process.version,
      startedAt,
      sampledAt: new Date().toISOString(),
      final,
      samples,
      memoryUsageBytes: usage,
      peakSampledMemoryBytes: peaks,
      resourceUsage: process.resourceUsage(),
      uptimeSeconds: process.uptime(),
      heapLimitMiB: 256,
      forkObservations,
    };
    const bytes = Buffer.from(JSON.stringify(record) + '\n');
    fs.writeSync(fd, bytes, 0, bytes.length, 0);
    fs.ftruncateSync(fd, bytes.length);
  }
  sample();
  const interval = setInterval(() => sample(), 1000);
  interval.unref();
  process.on('exit', () => {
    clearInterval(interval);
    sample(true);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.closeSync(forkFd);
  });
}
