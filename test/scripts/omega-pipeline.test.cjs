'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  runPipeline,
} = require('../../demo/zenith-sapience-initiative-omega-omni-operating-system/run.cjs');
const {
  executeStage,
} = require('../../demo/zenith-sapience-initiative-omega-omni-operating-system/engine.cjs');
test('actual artifacts and independent review complete five fixed stages', () => {
  const run = runPipeline();
  assert.equal(run.status, 'complete');
  assert.equal(run.completedStages, 5);
  const record = JSON.parse(
    fs.readFileSync(path.join(run.directory, '5.json'))
  );
  assert.equal(record.data.review.accepted, true);
  assert.equal(record.data.receipt.artifacts.length, 2);
  assert.equal(record.data.providerCalled, false);
  assert.equal(record.data.admitted, false);
});
test('each deliberate interruption resumes only after exact recomputation', () => {
  for (let stopAfter = 1; stopAfter < 5; stopAfter++) {
    const first = runPipeline({ stopAfter });
    assert.equal(first.status, 'interrupted');
    const bytes = fs.readFileSync(path.join(first.directory, '1.json'), 'utf8');
    const next = runPipeline({ resume: first.runId });
    assert.equal(next.status, 'complete');
    assert.equal(next.verifiedRetainedStages, stopAfter);
    assert.equal(
      fs.readFileSync(path.join(first.directory, '1.json'), 'utf8'),
      bytes
    );
    const replay = runPipeline({ resume: first.runId });
    assert.equal(replay.verifiedRetainedStages, 5);
    assert.equal(replay.checkpointSha256, next.checkpointSha256);
  }
});
test('tampered artifact data cannot resume even with valid JSON', () => {
  const run = runPipeline({ stopAfter: 2 });
  const file = path.join(run.directory, '2.json');
  const record = JSON.parse(fs.readFileSync(file));
  record.data.recommendedSupplier = 'Laurentian';
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  assert.throws(() => runPipeline({ resume: run.runId }), /differs/);
  assert.equal(fs.existsSync(path.join(run.directory, '3.json')), false);
});
test('source pin tampering and checkpoint gaps reject', () => {
  const run = runPipeline({ stopAfter: 2 });
  const first = path.join(run.directory, '1.json');
  const record = JSON.parse(fs.readFileSync(first));
  record.sourcePins['engine.cjs'] = '0'.repeat(64);
  fs.writeFileSync(first, JSON.stringify(record, null, 2) + '\n');
  assert.throws(() => runPipeline({ resume: run.runId }), /differs/);
  const gap = runPipeline({ stopAfter: 2 });
  fs.renameSync(
    path.join(gap.directory, '1.json'),
    path.join(gap.directory, '3.json')
  );
  assert.throws(() => runPipeline({ resume: gap.runId }), /gap/);
});
test('wrong recommendation is retained as rejection with no delivery export', () => {
  const run = runPipeline({ injectError: true });
  assert.equal(run.status, 'review-rejected');
  assert.equal(run.completedStages, 4);
  assert.equal(fs.existsSync(path.join(run.directory, '5.json')), false);
  assert.throws(() => runPipeline({ resume: run.runId }), /differs/);
  assert.equal(
    runPipeline({ resume: run.runId, injectError: true }).status,
    'review-rejected'
  );
});
test('resume paths and symlink checkpoint substitutions fail closed', () => {
  for (const resume of ['../../outside', 'run-invalid', '/tmp'])
    assert.throws(() => runPipeline({ resume }), /identifier/);
  const a = runPipeline({ stopAfter: 1 });
  const b = runPipeline({ stopAfter: 1 });
  fs.renameSync(
    path.join(b.directory, '1.json'),
    path.join(b.directory, '.pending-00000000-0000-0000-0000-000000000000')
  );
  fs.symlinkSync(
    path.join(a.directory, '1.json'),
    path.join(b.directory, '1.json')
  );
  assert.throws(() => runPipeline({ resume: b.runId }));
});
test('unsupported stages and controls reject without arbitrary execution', () => {
  assert.throws(() => executeStage(5, {}), /Unknown/);
  assert.throws(() => runPipeline({ stopAfter: 0 }), /controls/);
  const result = spawnSync(
    process.execPath,
    [
      'demo/zenith-sapience-initiative-omega-omni-operating-system/run.cjs',
      '--resume',
    ],
    { encoding: 'utf8', timeout: 5000 }
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Use --stop-after/);
});

test('long-lived process rejects disk changes rather than attributing old code to new pins', () => {
  const base = fs.mkdtempSync(
    path.join(path.resolve(__dirname, '../../reports'), 'omega-source-copy-')
  );
  const target = path.join(base, 'demo/omega');
  fs.mkdirSync(target, { recursive: true });
  const quoteDir = path.join(base, 'demo/One-Box/computer-work');
  fs.mkdirSync(quoteDir, { recursive: true });
  for (const name of ['engine.cjs', 'run.cjs'])
    fs.copyFileSync(
      path.resolve(
        __dirname,
        '../../demo/zenith-sapience-initiative-omega-omni-operating-system',
        name
      ),
      path.join(target, name)
    );
  for (const name of ['review.cjs', 'quotes.json'])
    fs.copyFileSync(
      path.resolve(__dirname, '../../demo/One-Box/computer-work', name),
      path.join(quoteDir, name)
    );
  const local = require(path.join(target, 'run.cjs'));
  const before = local.runPipeline({ stopAfter: 1 });
  fs.appendFileSync(
    path.join(target, 'engine.cjs'),
    '\n// changed after module load\n'
  );
  assert.throws(
    () => local.runPipeline({ resume: before.runId }),
    /source changed/
  );
  assert.equal(fs.existsSync(path.join(before.directory, '2.json')), false);
});
test('interrupted publication leaves no completed partial checkpoint and resumes safely', () => {
  const first = runPipeline({ stopAfter: 1 });
  const original = fs.linkSync;
  fs.linkSync = () => {
    throw Error('simulated process interruption before publication');
  };
  try {
    assert.throws(
      () => runPipeline({ resume: first.runId }),
      /simulated process interruption/
    );
  } finally {
    fs.linkSync = original;
  }
  assert.equal(fs.existsSync(path.join(first.directory, '2.json')), false);
  assert.equal(runPipeline({ resume: first.runId }).status, 'complete');
});

test('returned quote data cannot mutate later source-bound executions', () => {
  const first = executeStage(0);
  first.quotes[0].unitCents = 1;
  const next = executeStage(0);
  assert.equal(next.quotes[0].unitCents, 1250);
  assert.throws(() => {
    require('../../demo/One-Box/computer-work/quotes.json')[0].unitCents = 1;
  }, TypeError);
  assert.equal(runPipeline().status, 'complete');
});
