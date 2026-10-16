'use strict';
// Builtin-only acceptance/refusal tests: no Hardhat, EVM, provider, signing or relay.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const {
  inspectHardhatCompletion,
} = require('./acceptance/external-cli-child-completion.cjs');
process.umask(0o077);
const root = fs.mkdtempSync('/tmp/jobs-external-cli-completion-synthetic-');
const save = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
let checks = 0;
function fixture(name, mutate, expected = false) {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { mode: 0o700 });
  const item = {
    label: 'synthetic-completion',
    pid: 123,
    parentPid: 100,
    entrypoint: 'cli.js',
    code: 0,
    signal: null,
  };
  const parent = {
    schema: 'jobs-external-cli-process-metrics-v1',
    pid: 123,
    parentPid: 100,
    label: item.label,
    entrypoint: 'cli.js',
    final: true,
    forkObservations: { spawned: 1, closed: 1, writeErrors: 0 },
  };
  const close = {
    schema: 'jobs-external-cli-child-close-v1',
    label: item.label,
    parentPid: 123,
    childPid: 124,
    code: 0,
    signal: null,
    closedAt: '2026-10-16T17:00:00.000Z',
  };
  const child = {
    schema: 'jobs-external-cli-process-metrics-v1',
    pid: 124,
    parentPid: 123,
    label: item.label,
    entrypoint: 'synthetic-child.ts',
    final: true,
    forkObservations: { spawned: 0, closed: 0, writeErrors: 0 },
  };
  const files = {
    parent: path.join(directory, `${item.label}-123.json`),
    closes: path.join(directory, `${item.label}-123-forks.jsonl`),
    child: path.join(directory, `${item.label}-124.json`),
  };
  const state = { item, parent, close, child, closes: [close], files };
  if (mutate) mutate(state);
  save(files.parent, parent);
  save(files.child, child);
  fs.writeFileSync(
    files.closes,
    state.closes.map((value) => JSON.stringify(value) + '\n').join(''),
    { mode: 0o600 }
  );
  if (state.afterWrite) state.afterWrite();
  const result = inspectHardhatCompletion(
    directory,
    item,
    'synthetic-child.ts'
  );
  assert.equal(result.accepted, expected, `${name}: ${result.reason}`);
  if (expected) {
    assert.equal(result.parentFinal, true);
    assert.equal(result.childCloseCount, 1);
    assert.equal(result.childCloses[0].childPid, 124);
  }
  assert(result.childCloses.length <= 2);
  checks++;
}
fixture('success', null, true);
const cases = {
  'missing-parent': (s) => {
    s.afterWrite = () => fs.unlinkSync(s.files.parent);
  },
  'parent-not-final': (s) => {
    s.parent.final = false;
  },
  'parent-wrong-pid': (s) => {
    s.parent.pid++;
  },
  'parent-wrong-harness': (s) => {
    s.parent.parentPid++;
  },
  'parent-wrong-label': (s) => {
    s.parent.label = 'other';
  },
  'parent-wrong-entrypoint': (s) => {
    s.parent.entrypoint = 'other.js';
  },
  'parent-write-errors': (s) => {
    s.parent.forkObservations.writeErrors = 1;
  },
  'parent-zero-spawn': (s) => {
    s.parent.forkObservations.spawned = 0;
  },
  'parent-extra-spawn': (s) => {
    s.parent.forkObservations.spawned = 2;
  },
  'parent-zero-close': (s) => {
    s.parent.forkObservations.closed = 0;
  },
  'parent-no-observer': (s) => {
    delete s.parent.forkObservations;
  },
  'missing-close-file': (s) => {
    s.afterWrite = () => fs.unlinkSync(s.files.closes);
  },
  'zero-closes': (s) => {
    s.closes = [];
  },
  'extra-closes': (s) => {
    s.closes.push({ ...s.close, childPid: 125 });
  },
  'close-nonzero': (s) => {
    s.close.code = 7;
  },
  'close-signaled-wrapper-zero': (s) => {
    s.close.code = null;
    s.close.signal = 'SIGKILL';
  },
  'close-null-code': (s) => {
    s.close.code = null;
  },
  'close-signal-with-zero': (s) => {
    s.close.signal = 'SIGTERM';
  },
  'close-wrong-parent': (s) => {
    s.close.parentPid++;
  },
  'close-wrong-label': (s) => {
    s.close.label = 'other';
  },
  'close-wrong-schema': (s) => {
    s.close.schema = 'other';
  },
  'close-invalid-pid': (s) => {
    s.close.childPid = 0;
  },
  'close-self-pid': (s) => {
    s.close.childPid = 123;
  },
  'close-invalid-time': (s) => {
    s.close.closedAt = 'invalid';
  },
  'close-unexpected-field': (s) => {
    s.close.unexpected = 'must-not-escape';
  },
  'missing-child': (s) => {
    s.afterWrite = () => fs.unlinkSync(s.files.child);
  },
  'child-not-final': (s) => {
    s.child.final = false;
  },
  'child-wrong-pid': (s) => {
    s.child.pid++;
  },
  'child-wrong-parent': (s) => {
    s.child.parentPid++;
  },
  'child-wrong-label': (s) => {
    s.child.label = 'other';
  },
  'child-wrong-entrypoint': (s) => {
    s.child.entrypoint = 'different.ts';
  },
  'child-write-errors': (s) => {
    s.child.forkObservations.writeErrors = 1;
  },
  'wrapper-nonzero': (s) => {
    s.item.code = 7;
  },
  'wrapper-signal': (s) => {
    s.item.signal = 'SIGTERM';
  },
  'truncated-json': (s) => {
    s.afterWrite = () => fs.writeFileSync(s.files.parent, '{');
  },
  'truncated-close': (s) => {
    s.afterWrite = () =>
      fs.writeFileSync(s.files.closes, JSON.stringify(s.close));
  },
  'oversize-close': (s) => {
    s.afterWrite = () => fs.writeFileSync(s.files.closes, 'x'.repeat(16385));
  },
  'public-metrics': (s) => {
    s.afterWrite = () => fs.chmodSync(s.files.parent, 0o644);
  },
  'symlink-metrics': (s) => {
    s.afterWrite = () => {
      fs.renameSync(s.files.parent, `${s.files.parent}.saved`);
      fs.symlinkSync(`${s.files.parent}.saved`, s.files.parent);
    };
  },
};
for (const [name, mutate] of Object.entries(cases)) fixture(name, mutate);
// Exercise the real preload in fresh Node processes, including Hardhat's
// null-close-code-to-wrapper-zero behavior, with only synthetic builtin children.
const childScript = path.join(root, 'synthetic-child.ts');
fs.writeFileSync(
  childScript,
  "'use strict';\nif (process.argv[2] === 'signal') { process.kill(process.pid, 'SIGTERM'); } else { process.exit(Number(process.argv[2])); }\n",
  { mode: 0o600 }
);
const parentScript = path.join(root, 'synthetic-parent.cjs');
fs.writeFileSync(
  parentScript,
  "'use strict';\nconst child = require('node:child_process').fork(process.argv[2], [process.argv[3]], { stdio: 'ignore' });\nchild.once('close', (code) => { process.exitCode = code; });\n",
  { mode: 0o600 }
);
const actual = [];
for (const mode of ['0', '7', 'signal']) {
  const directory = path.join(root, `real-${mode}`);
  fs.mkdirSync(directory, { mode: 0o700 });
  const label = `synthetic-${mode}`;
  const result = cp.spawnSync(
    process.execPath,
    [
      '--max-old-space-size=256',
      '--require',
      path.join(__dirname, './acceptance/external-cli-metrics.cjs'),
      parentScript,
      childScript,
      mode,
    ],
    {
      env: {
        PATH: process.env.PATH,
        JOBS_CLI_METRICS_DIRECTORY: directory,
        JOBS_CLI_METRICS_LABEL: label,
      },
      timeout: 10000,
      maxBuffer: 16384,
    }
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, mode === '7' ? 7 : 0);
  const item = {
    label,
    pid: result.pid,
    parentPid: process.pid,
    entrypoint: path.basename(parentScript),
    code: result.status,
    signal: result.signal,
  };
  const completion = inspectHardhatCompletion(
    directory,
    item,
    path.basename(childScript)
  );
  assert.equal(completion.accepted, mode === '0');
  assert.equal(completion.parentFinal, true);
  assert.equal(completion.childCloseCount, 1);
  assert.equal(
    completion.childCloses[0].code,
    mode === 'signal' ? null : Number(mode)
  );
  assert.equal(
    completion.childCloses[0].signal,
    mode === 'signal' ? 'SIGTERM' : null
  );
  actual.push({ mode, wrapperCode: result.status, completion });
  checks++;
}
save(path.join(root, 'result.json'), { passed: true, checks, actual });
console.log(
  `PASS: ${checks} synthetic child-completion checks, including actual zero/nonzero/signaled children and a zero-exit wrapper hiding SIGTERM. No EVM was run.`
);
console.log(`Synthetic evidence: ${root}`);
