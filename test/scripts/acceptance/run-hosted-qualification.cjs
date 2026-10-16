#!/usr/bin/env node
'use strict';
// Test-only driver. No remote URL, key, nonce, resume, skip or output arguments.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {
  HOSTED_ROOT,
  git,
  getSourceIdentity,
  assertCleanSource,
  processGroupIdentity,
  ownedGroupMembers,
  signalOwnedGroup,
  waitOwnedGroupEmpty,
  assertExpectedNormalization,
  fixtureFileIdentity,
  restoreFixtureFile,
} = require('./external-cli-hosted-state.cjs');
const root = path.resolve(__dirname, '../../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const state = {
  schema: 'jobs-hosted-driver-v1',
  passed: false,
  stages: [],
  source: null,
  sourceGate: null,
  canonicalCompiler: null,
  ensNormalization: null,
  cliEnsNormalization: null,
  cleanBefore: null,
  cleanAfter: null,
};
let child,
  interrupted = false;
const save = () =>
  fs.writeFileSync(
    path.join(HOSTED_ROOT, 'driver.json'),
    JSON.stringify(state, null, 2) + '\n',
    { mode: 0o600 }
  );
async function run(label, executable, args, env, minutes = 20) {
  assert.equal(
    interrupted,
    false,
    'Qualification interrupted; no further stages allowed'
  );
  const log = path.join(HOSTED_ROOT, `${label}.log`);
  const fd = fs.openSync(log, 'wx', 0o600);
  const stage = {
    label,
    code: null,
    signal: null,
    passed: false,
    processGroupEmpty: false,
    unexpectedRemainingGroupMembers: false,
  };
  state.stages.push(stage);
  save();
  try {
    await new Promise((resolve, reject) => {
      const processChild = cp.spawn(executable, args, {
        cwd: root,
        env,
        detached: true,
        stdio: ['ignore', fd, fd],
      });
      const identity = processGroupIdentity(processChild.pid);
      child = { process: processChild, identity };
      stage.pid = processChild.pid;
      stage.parentPid = process.pid;
      save();
      let error,
        timedOut = false,
        escalation;
      const timeout = setTimeout(() => {
        timedOut = true;
        try {
          signalOwnedGroup(identity, 'SIGTERM');
        } catch (value) {
          error = value;
        }
        escalation = setTimeout(() => {
          try {
            signalOwnedGroup(identity, 'SIGKILL');
          } catch (value) {
            error = value;
          }
        }, 30000);
      }, minutes * 60000);
      processChild.once('error', (value) => {
        error = value;
      });
      processChild.once('close', (code, signal) => {
        clearTimeout(timeout);
        clearTimeout(escalation);
        void (async () => {
          Object.assign(stage, { code, signal, timedOut });
          const cleanExit = ownedGroupMembers(identity).length === 0;
          stage.unexpectedRemainingGroupMembers = !cleanExit;
          if (!cleanExit) {
            signalOwnedGroup(identity, 'SIGTERM');
            if (!(await waitOwnedGroupEmpty(identity)))
              signalOwnedGroup(identity, 'SIGKILL');
          }
          stage.processGroupEmpty = await waitOwnedGroupEmpty(identity);
          child = null;
          save();
          if (
            error ||
            code !== 0 ||
            signal !== null ||
            timedOut ||
            interrupted ||
            !cleanExit ||
            !stage.processGroupEmpty
          )
            throw Error(
              'Qualification stage failed or owned-group cleanup is incomplete'
            );
        })().then(resolve, reject);
      });
    });
    stage.passed = true;
    save();
    return log;
  } finally {
    fs.closeSync(fd);
  }
}
function boundedText(file) {
  assert(
    fs.statSync(file).size < 8 * 1024 * 1024,
    'Unexpectedly large test result'
  );
  return fs.readFileSync(file, 'utf8');
}
function tapCounts(file, count) {
  const text = boundedText(file);
  for (const [field, expected] of Object.entries({
    tests: count,
    pass: count,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  })) {
    const values = [...text.matchAll(new RegExp(`^# ${field} (\\d+)$`, 'gm'))];
    assert.equal(values.length, 1);
    assert.equal(Number(values[0][1]), expected);
  }
  return {
    tests: count,
    passed: count,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    todo: 0,
  };
}
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.log(
      'Prepared only. Hosted disposable qualification: node --max-old-space-size=256 test/scripts/acceptance/run-hosted-qualification.cjs --run'
    );
    return;
  }
  assert.equal(process.platform, 'linux');
  assert.equal(
    process.versions.node,
    fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()
  );
  assert(process.execArgv.includes('--max-old-space-size=256'));
  assert(
    !process.env.NODE_OPTIONS &&
      !process.env.NODE_PATH &&
      !process.env.HARDHAT_CONFIG
  );
  assert(!fs.existsSync(path.join(root, '.env')));
  state.source = getSourceIdentity(root);
  state.cleanBefore = assertCleanSource(root);
  process.umask(0o077);
  fs.mkdirSync(HOSTED_ROOT, { mode: 0o700 }); // Must not exist: never resume a prior campaign.
  for (const name of ['home', 'cache', 'config', 'data'])
    fs.mkdirSync(path.join(HOSTED_ROOT, name), { mode: 0o700 });
  save();
  const env = {
    PATH: process.env.PATH,
    HOME: path.join(HOSTED_ROOT, 'home'),
    XDG_CACHE_HOME: path.join(HOSTED_ROOT, 'cache'),
    XDG_CONFIG_HOME: path.join(HOSTED_ROOT, 'config'),
    XDG_DATA_HOME: path.join(HOSTED_ROOT, 'data'),
    CI: 'true',
    HARDHAT_DISABLE_TELEMETRY_PROMPT: 'true',
    DOTENV_CONFIG_QUIET: 'true',
    GITHUB_ACTIONS: 'true',
    JOBS_QUALIFICATION_EXPECTED_SHA: state.source.sourceCommit,
    DEPENDENCY_PRESERVATION_BASE_SHA:
      process.env.JOBS_QUALIFICATION_BASE_SHA ||
      git(root, 'rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'),
  };
  const node = async (label, args, overrides = {}, minutes) =>
    run(
      label,
      process.execPath,
      ['--max-old-space-size=256', ...args],
      { ...env, ...overrides },
      minutes
    );
  const gateLog = await node('source-preservation', [
    'scripts/security/check-dependency-preservation.cjs',
    'source',
  ]);
  const gate = JSON.parse(boundedText(gateLog));
  assert.equal(gate.head, state.source.sourceCommit);
  assert.equal(
    gate.reviewedSourceReconciled,
    true,
    'Exact reviewed protected-source checkpoint is required'
  );
  const record = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'scripts/security/reviewed-source-jobs-handover-20261016.json'
      ),
      'utf8'
    )
  );
  assert.equal(
    record.transitionCount,
    67,
    'Reviewed 67-transition binding must already exist'
  );
  const releaseGate = require('../../../scripts/release/qualify-source-release.cjs');
  releaseGate.verifySourceScope({
    git: (...args) => git(root, ...args),
    sha: state.source.sourceCommit,
    policy: require('../../../config/solidity-compiler.json'),
    version: require('../../../package.json').version,
  });
  state.sourceGate = {
    compilerSourceBaseline: releaseGate.compilerSourceBaseline,
    preservedHistoricalEvidence: true,
    baseline: gate.baseline,
    baseTip: gate.baseTip,
    head: gate.head,
    generatedSourceBaseline: gate.generatedSourceBaseline,
    reviewedSourceReconciled: true,
    transitionCount: 67,
  };
  save();
  const focused = await node('focused-node-84', [
    '--test',
    '--test-reporter=tap',
    'test/scripts/authority-handover.test.cjs',
    'test/scripts/deployment-candidate.test.cjs',
    'test/scripts/external-envelope.test.cjs',
    'test/scripts/external-profile.test.cjs',
    'test/scripts/external-session.test.cjs',
  ]);
  state.stages.at(-1).counts = tapCounts(focused, 84);
  save();
  const completion = await node('child-completion-43', [
    'test/scripts/external-cli-child-completion.test.cjs',
  ]);
  assert.match(
    boundedText(completion),
    /^PASS: 43 synthetic child-completion checks,/m
  );
  state.stages.at(-1).counts = { tests: 43, passed: 43, failed: 0, skipped: 0 };
  save();
  const publicTests = await node('public-export-tests', [
    '--test',
    '--test-reporter=tap',
    'test/scripts/external-cli-public-evidence.test.cjs',
  ]);
  state.stages.at(-1).counts = tapCounts(publicTests, 33);
  save();
  // Reuse the repository's reviewed canonical compile command unchanged.
  await run('canonical-compile', 'npm', ['run', 'compile'], env, 30);
  assertCleanSource(root);
  const compilerLog = await node('canonical-compiler-validation', [
    'scripts/ci/check-solidity-build.cjs',
  ]);
  const compiler = JSON.parse(boundedText(compilerLog));
  assert.equal(compiler.sizeGatePassed, true);
  assert.equal(compiler.projectSourceWarnings, 0);
  state.canonicalCompiler = {
    compiler: compiler.compiler,
    projectSourceWarnings: compiler.projectSourceWarnings,
    reviewedUpstreamWarningCount: compiler.reviewedUpstreamWarningCount,
    sizeGatePassed: true,
    evidenceSha256: hash(fs.readFileSync(compilerLog)),
  };
  save();
  // The sole runtime source normalization is backed up and restored exactly.
  const ensFile = path.join(root, 'config/ens.json');
  const before = fs.readFileSync(ensFile);
  const ensIdentity = fixtureFileIdentity(ensFile);
  fs.writeFileSync(path.join(HOSTED_ROOT, 'ens-original.json'), before, {
    flag: 'wx',
    mode: 0o600,
  });
  let expectedHash = hash(before);
  state.ensNormalization = {
    path: 'config/ens.json',
    originalSha256: hash(before),
    normalizedSha256: expectedHash,
    restored: false,
  };
  save();
  try {
    // Existing read-only preview determines the only permitted changed bytes.
    const preview = require('../../../scripts/config').loadEnsConfig({
      network: 'hardhat',
      persist: false,
    });
    assert.equal(preview.path, ensFile);
    expectedHash = hash(
      Buffer.from(JSON.stringify(preview.config, null, 2) + '\n')
    );
    state.ensNormalization.normalizedSha256 = expectedHash;
    save();
    await node('normalize-ens-fixture', [
      '-e',
      "require('./scripts/config').loadEnsConfig({ network: 'hardhat' })",
    ]);
    const observed = hash(fs.readFileSync(ensFile));
    assertExpectedNormalization(hash(before), expectedHash, observed);
    save();
    await node(
      'direct-v1-22',
      [
        'node_modules/hardhat/internal/cli/cli.js',
        'test',
        '--no-compile',
        'test/v2/AuthorityHandover.test.js',
      ],
      {
        MOCHA_REPORTER: 'json',
        MOCHA_REPORTER_OPTIONS: JSON.stringify({
          output: path.join(HOSTED_ROOT, 'direct-v1-result.json'),
        }),
      },
      30
    );
    const direct = JSON.parse(
      boundedText(path.join(HOSTED_ROOT, 'direct-v1-result.json'))
    );
    assert.equal(direct.stats.tests, 22);
    assert.equal(direct.stats.passes, 22);
    assert.equal(direct.stats.failures, 0);
    assert.equal(direct.stats.pending, 0);
    assert.equal(direct.tests.length, 22);
    assert.equal(direct.passes.length, 22);
    assert.equal(direct.failures.length, 0);
    assert.equal(direct.pending.length, 0);
    state.stages.at(-1).counts = {
      tests: 22,
      passed: 22,
      failed: 0,
      skipped: 0,
    };
    save();
  } finally {
    state.ensNormalization.restored = restoreFixtureFile(
      ensFile,
      ensIdentity,
      before,
      expectedHash,
      state.stages.every((stage) => stage.processGroupEmpty)
    );
    save();
  }
  assertCleanSource(root);
  // Pin the same original inode/bytes and a read-only localhost preview before
  // the harness can mutate ENS. This recovery stays available after harness SIGKILL.
  let cliExpectedHash = hash(before);
  state.cliEnsNormalization = {
    path: 'config/ens.json',
    originalSha256: hash(before),
    normalizedSha256: cliExpectedHash,
    restored: false,
  };
  save();
  try {
    const preview = require('../../../scripts/config').loadEnsConfig({
      network: 'localhost',
      chainId: 31337,
      persist: false,
    });
    assert.equal(preview.path, ensFile);
    cliExpectedHash = hash(
      Buffer.from(JSON.stringify(preview.config, null, 2) + '\n')
    );
    state.cliEnsNormalization.normalizedSha256 = cliExpectedHash;
    save();
    await node(
      'external-cli-39',
      ['test/scripts/acceptance/run-external-cli.cjs', '--run-owned-loopback'],
      {},
      110
    );
  } finally {
    // A failed/abrupt stage must first prove its entire inherited group empty.
    // Unpredicted bytes/identity changes are left untouched, never recovered blindly.
    state.cliEnsNormalization.restored = restoreFixtureFile(
      ensFile,
      ensIdentity,
      before,
      cliExpectedHash,
      state.stages.every((stage) => stage.processGroupEmpty)
    );
    save();
  }
  state.cleanAfter = assertCleanSource(root);
  assert.deepEqual(getSourceIdentity(root), state.source);
  state.passed = true;
  save();
  console.log(
    'PASS: canonical compile, strict source binding, 84 focused Node cases, 43 child-close checks, 33 public/safety checks, 22 direct/v1 cases and the full 39-operation fresh-CLI fixture.'
  );
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    interrupted = true;
    if (child) {
      try {
        signalOwnedGroup(child.identity, signal);
      } catch {
        /* Ownership ambiguity stays a fatal/incomplete cleanup result. */
      }
    }
  });
main().catch((error) => {
  if (fs.existsSync(HOSTED_ROOT)) {
    state.passed = false;
    state.failureMessageSha256 = hash(String(error?.message || 'unknown'));
    try {
      state.cleanAfter = assertCleanSource(root);
    } catch {
      state.cleanAfter = { trackedSourceClean: false };
    }
    save();
  }
  console.error(
    'STOP: hosted qualification failed. Raw private logs/capabilities are not exported.'
  );
  process.exitCode = 1;
});
