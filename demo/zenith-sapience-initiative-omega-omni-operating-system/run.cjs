#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const hashSource = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ROOT = path.resolve(__dirname, '../..');
const REPORTS = path.join(ROOT, 'reports', 'omega-local-pipeline');
const MAX_BYTES = 1000000;
function sourcePins() {
  return Object.fromEntries(
    [
      'engine.cjs',
      'run.cjs',
      '../One-Box/computer-work/review.cjs',
      '../One-Box/computer-work/quotes.json',
    ].map((p) => [p, hashSource(fs.readFileSync(path.resolve(__dirname, p)))])
  );
}
const LOADED_SOURCE_PINS = sourcePins();
for (const relative of [
  'engine.cjs',
  '../One-Box/computer-work/review.cjs',
  '../One-Box/computer-work/quotes.json',
]) {
  if (require.cache[require.resolve(path.resolve(__dirname, relative))])
    throw Error(
      'Start the source-bound pipeline in a fresh process; dependency already cached'
    );
}
const { STAGES, executeStage, digest } = require('./engine.cjs');
function assertSourcesUnchanged() {
  if (JSON.stringify(sourcePins()) !== JSON.stringify(LOADED_SOURCE_PINS))
    throw Error(
      'Loaded pipeline source changed on disk; start a new process and run'
    );
}
assertSourcesUnchanged();
function safeDirectory(directory) {
  const info = fs.lstatSync(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    fs.realpathSync(directory) !== directory
  )
    throw Error('Reports must use real local directories without symlinks');
}
function readRecord(file) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES)
      throw Error('Invalid or oversized checkpoint');
    const data = Buffer.alloc(MAX_BYTES + 1);
    let n = 0;
    while (n < data.length) {
      const count = fs.readSync(fd, data, n, data.length - n, null);
      if (!count) break;
      n += count;
    }
    if (n > MAX_BYTES) throw Error('Checkpoint grew beyond limit');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      data.subarray(0, n)
    );
  } finally {
    fs.closeSync(fd);
  }
}
function atomicRecord(file, text) {
  const temporary = path.join(path.dirname(file), `.pending-${randomUUID()}`);
  fs.writeFileSync(temporary, text, { flag: 'wx' });
  try {
    fs.linkSync(temporary, file);
  } finally {
    fs.unlinkSync(temporary);
  }
}
function recordText(record) {
  return JSON.stringify(record, null, 2) + '\n';
}
function runPipeline({
  resume = null,
  stopAfter = 5,
  injectError = false,
} = {}) {
  if (
    !Number.isInteger(stopAfter) ||
    stopAfter < 1 ||
    stopAfter > 5 ||
    typeof injectError !== 'boolean'
  )
    throw Error('Invalid pipeline controls');
  if (
    resume !== null &&
    !/^run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      resume
    )
  )
    throw Error('Resume requires the generated run identifier');
  const parent = path.join(ROOT, 'reports');
  fs.mkdirSync(parent, { recursive: true });
  safeDirectory(parent);
  fs.mkdirSync(REPORTS, { recursive: true });
  safeDirectory(REPORTS);
  const runId = resume ?? `run-${randomUUID()}`,
    directory = path.join(REPORTS, runId);
  if (!resume) fs.mkdirSync(directory);
  safeDirectory(directory);
  const expectedFiles = new Set(STAGES.map((_, i) => `${i + 1}.json`));
  if (
    fs
      .readdirSync(directory)
      .some(
        (name) =>
          !expectedFiles.has(name) && !/^\.pending-[0-9a-f-]{36}$/.test(name)
      )
  )
    throw Error('Unexpected file in pipeline checkpoint');
  assertSourcesUnchanged();
  const pins = LOADED_SOURCE_PINS;
  const options = { injectError };
  let previous = null,
    previousHash = null,
    completed = 0,
    reused = 0;
  for (let i = 0; i < STAGES.length; i++) {
    const file = path.join(directory, `${i + 1}.json`);
    const exists = fs.existsSync(file);
    if (
      !exists &&
      fs
        .readdirSync(directory)
        .some((name) => /^[1-5]\.json$/.test(name) && Number(name[0]) > i + 1)
    )
      throw Error('Checkpoint sequence has a gap');
    if (!exists && i >= stopAfter) break;
    assertSourcesUnchanged();
    const data = executeStage(i, previous, options);
    assertSourcesUnchanged();
    const record = {
      schema: 'agijobs.omega-stage-checkpoint.v1',
      runId,
      stage: i + 1,
      name: STAGES[i],
      sourcePins: pins,
      options,
      previousSha256: previousHash,
      data,
    };
    const text = recordText(record);
    if (exists) {
      if (readRecord(file) !== text)
        throw Error(
          `Checkpoint ${i + 1} differs from recomputed source-bound work`
        );
      reused++;
    } else atomicRecord(file, text);
    previous = data;
    previousHash = digest(text);
    completed = i + 1;
    assertSourcesUnchanged();
    if (i === 3 && !data.review.accepted)
      return {
        schema: 'agijobs.omega-pipeline-run.v1',
        runId,
        directory,
        status: 'review-rejected',
        completedStages: completed,
        verifiedRetainedStages: reused,
        checkpointSha256: previousHash,
        productionApproved: false,
        settlementApproved: false,
      };
  }
  assertSourcesUnchanged();
  return {
    schema: 'agijobs.omega-pipeline-run.v1',
    runId,
    directory,
    status: completed === 5 ? 'complete' : 'interrupted',
    completedStages: completed,
    verifiedRetainedStages: reused,
    checkpointSha256: previousHash,
    productionApproved: false,
    settlementApproved: false,
  };
}
function main() {
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (
      a === '--resume' &&
      typeof args[i + 1] === 'string' &&
      !args[i + 1].startsWith('--')
    )
      options.resume = args[++i];
    else if (a === '--stop-after' && /^[1-5]$/.test(args[i + 1] ?? ''))
      options.stopAfter = Number(args[++i]);
    else if (a === '--inject-error') options.injectError = true;
    else
      throw Error('Use --stop-after 1..5, --resume RUN_ID, or --inject-error');
  }
  const result = runPipeline(options);
  console.log(JSON.stringify(result, null, 2));
  return result.status === 'complete' ? 0 : 1;
}
if (require.main === module)
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`Cannot execute local pipeline: ${error.message}`);
    process.exitCode = 2;
  }
module.exports = { runPipeline, readRecord, sourcePins };
