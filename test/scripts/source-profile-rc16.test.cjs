'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const p = require('../../scripts/release/source-profile-rc16.cjs');
const ROOT = path.resolve(__dirname, '../..');
const clone = (value) => JSON.parse(JSON.stringify(value));
const environment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: '2026-10-19T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-10-19T00:00:00Z',
};
for (const name of Object.keys(environment))
  if (
    name.startsWith('GIT_') &&
    !name.startsWith('GIT_CONFIG_') &&
    !name.startsWith('GIT_AUTHOR_') &&
    !name.startsWith('GIT_COMMITTER_')
  )
    delete environment[name];
function command(root, args, input) {
  return execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-C',
      root,
      ...args,
    ],
    {
      encoding: 'utf8',
      env: environment,
      input,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
}
function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-rc16-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  command(root, ['init', '--quiet']);
  const git = (...args) => command(root, args);
  const put = (name, data, mode = '100644') => {
    const blob = command(root, ['hash-object', '-w', '--stdin'], data).trim();
    command(root, [
      'update-index',
      '--add',
      '--cacheinfo',
      `${mode},${blob},${name}`,
    ]);
    return { mode, blob };
  };
  const commit = (parent) =>
    command(root, [
      'commit-tree',
      git('write-tree').trim(),
      ...(parent
        ? (Array.isArray(parent) ? parent : [parent]).flatMap((ref) => [
            '-p',
            ref,
          ])
        : []),
      '-m',
      'Synthetic qualification fixture',
    ]).trim();
  return { root, git, put, commit };
}

function shareObjects(r) {
  let objects = command(ROOT, ['rev-parse', '--git-path', 'objects']).trim();
  if (!path.isAbsolute(objects)) objects = path.resolve(ROOT, objects);
  fs.writeFileSync(
    path.join(r.root, '.git/objects/info/alternates'),
    objects + '\n'
  );
}

function addReviewedIntegration(r) {
  for (const item of p.profile.integrationTransitions)
    r.put(
      item.path,
      command(ROOT, ['cat-file', 'blob', item.after.blob]),
      item.after.mode
    );
}

function addReviewedWebsite(r) {
  for (const item of p.profile.websiteTransitions)
    r.put(item.path, command(ROOT, ['cat-file', 'blob', item.after.blob]));
}

function addReviewedPython(r) {
  for (const name of [
    p.profile.pythonScannerPolicy.configPath,
    p.profile.pythonScannerPolicy.workflowPath,
  ])
    r.put(
      name,
      command(ROOT, ['show', `${p.profile.pythonScannerBaseline}:${name}`])
    );
}

function addCurrentReleaseMetadata(r) {
  for (const item of p.profile.telemetryRuntime.transitions)
    r.put(item.path, command(ROOT, ['cat-file', 'blob', item.after.blob]));
  for (const [name, identity] of Object.entries(p.previousReleaseRecords))
    r.put(name, command(ROOT, ['cat-file', 'blob', identity.blob]));
  for (const item of p.releaseTriggerTransitions)
    r.put(item.path, fs.readFileSync(path.join(ROOT, item.path)));
  r.put('CHANGELOG.md', fs.readFileSync(path.join(ROOT, 'CHANGELOG.md')));
}

test('telemetry scope binds its genuine complete origin and rejects inventory, blob and mode drift', () => {
  const scope = p.profile.telemetryRuntime;
  const git = (...args) => command(ROOT, args);
  assert.equal(p.verifyTelemetryOrigin(git), scope);
  const before = p.parseTree(git('ls-tree', '-rz', scope.baseline));
  const after = p.parseTree(git('ls-tree', '-rz', scope.source));
  const paths = p.verifyTelemetryTransitions(before, after);
  assert.equal(paths.length, 12);
  assert.equal(
    paths.filter((name) => name.startsWith('agent-gateway/')).length,
    6
  );
  for (const name of paths) {
    const changed = new Map(after);
    changed.set(name, { ...changed.get(name), blob: '0'.repeat(40) });
    assert.throws(
      () => p.verifyTelemetryTransitions(before, changed),
      /blob or mode/
    );
    changed.set(name, { ...after.get(name), mode: '100755' });
    assert.throws(
      () => p.verifyTelemetryTransitions(before, changed),
      /blob or mode/
    );
    changed.delete(name);
    assert.throws(
      () => p.verifyTelemetryTransitions(before, changed),
      /blob or mode/
    );
  }
  for (const mutate of [
    (value) => value.transitions.pop(),
    (value) => value.transitions.reverse(),
    (value) =>
      value.transitions.push({
        ...value.transitions[0],
        path: 'agent-gateway/another.ts',
      }),
    (value) => {
      value.source = scope.baseline;
    },
    (value) => {
      value.transitions[0].after.blob = '0'.repeat(40);
    },
  ]) {
    const changed = clone(scope);
    mutate(changed);
    assert.throws(
      () => p.validateTelemetryRuntime(changed),
      /scope commitment/
    );
  }
  const alteredOrigin = (...args) =>
    args[0] === 'rev-parse' && args[1] === `${scope.source}^{tree}`
      ? '0'.repeat(40)
      : git(...args);
  assert.throws(
    () => p.verifyTelemetryOrigin(alteredOrigin),
    /immutable origin/
  );
  const receiverPaths = paths.filter((name) =>
    name.startsWith('agent-gateway/')
  );
  assert(
    receiverPaths.every((name) => p.profile.scannerRequiredPaths.includes(name))
  );
  assert(
    receiverPaths.every((name) => p.profile.scannerReceiverPaths.includes(name))
  );
});

test('historical telemetry proof composes only with the exact discovery follow-up', () => {
  const scope = p.profile.telemetryRuntime;
  const historical = scope.historical;
  const followup = scope.followup;
  const git = (...args) => command(ROOT, args);
  assert.equal(
    createHash('sha256').update(JSON.stringify(historical)).digest('hex'),
    'ff6f82ddd6738d3a0e7481fdd4cd1fc065853b68bc1a20e1defbfaccefea792c'
  );
  assert.equal(historical.transitions.length, 11);
  assert.equal(followup.transitions.length, 4);
  assert.deepEqual(followup.transitions.map((item) => item.path), [
    '.github/workflows/ci.yml',
    'test/gateway/telemetryRecovery.test.cjs',
    'test/scripts/hardhat-test-discovery.test.cjs',
    'test/scripts/telemetryRecovery.test.cjs',
  ]);
  const removed = followup.transitions[1];
  const added = followup.transitions[3];
  assert.equal(removed.after, null);
  assert.equal(added.before, null);
  assert.deepEqual(removed.before, added.after);
  assert.equal(followup.baseline, historical.source);
  assert.equal(followup.baselineTree, historical.tree);
  assert.equal(followup.source, scope.durability.baseline);
  assert.equal(followup.tree, scope.durability.baselineTree);
  assert.equal(scope.durability.source, scope.source);
  assert.equal(scope.durability.tree, scope.tree);
  for (const field of ['historical', 'followup', 'durability']) {
    for (const mutate of [
      (proof) => { proof.source = proof.baseline; },
      (proof) => { proof.tree = '0'.repeat(40); },
      (proof) => { proof.transitions.pop(); },
      (proof) => { proof.transitions.reverse(); },
      (proof) => { proof.transitions.push({ ...proof.transitions[0], path: 'agent-gateway/unreviewed.ts' }); },
      (proof) => { proof.transitions[0].after.blob = '0'.repeat(40); },
      (proof) => { proof.transitions[0].after.mode = '100755'; },
    ]) {
      const changed = clone(scope);
      mutate(changed[field]);
      assert.throws(() => p.validateTelemetryRuntime(changed), /scope commitment/);
    }
    const proof = scope[field];
    for (const name of ['baseline', 'source']) {
      const alteredTree = (...args) =>
        args[0] === 'rev-parse' && args[1] === `${proof[name]}^{tree}`
          ? '0'.repeat(40)
          : git(...args);
      assert.throws(() => p.verifyTelemetryOrigin(alteredTree), /immutable origin/);
    }
    const wrongAncestry = (...args) => {
      if (args[0] === 'merge-base' && args[2] === proof.baseline && args[3] === proof.source)
        throw new Error('injected nonancestor');
      return git(...args);
    };
    assert.throws(() => p.verifyTelemetryOrigin(wrongAncestry), /injected nonancestor/);
  }
  const extraRuntime = 'agent-gateway/unreviewed.ts';
  const extraBlob = '0'.repeat(40);
  for (const proof of [historical, followup, scope.durability]) {
    const unexpectedFile = (...args) => {
      const result = git(...args);
      return args[0] === 'ls-tree' && args[2] === proof.source
        ? result + `100644 blob ${extraBlob}\t${extraRuntime}\0`
        : result;
    };
    assert.throws(() => p.verifyTelemetryOrigin(unexpectedFile), /transition inventory/);
  }
  const discovery = followup.transitions[2];
  const beforeTree = p.parseTree(git('ls-tree', '-rz', followup.baseline));
  const afterTree = p.parseTree(git('ls-tree', '-rz', followup.source));
  for (const item of followup.transitions) {
    for (const [key, original] of [['before', beforeTree], ['after', afterTree]]) {
      for (const replacement of [null, { mode: '100644', blob: '0'.repeat(40) }, { mode: '100755', blob: item[key]?.blob || extraBlob }]) {
        if (JSON.stringify(replacement) === JSON.stringify(item[key])) continue;
        const changed = new Map(original);
        if (replacement === null) changed.delete(item.path);
        else changed.set(item.path, replacement);
        const corrupted = (...args) => {
          if (args[0] === 'ls-tree' && args[2] === followup[key === 'before' ? 'baseline' : 'source'])
            return [...changed].map(([name, identity]) => `${identity.mode} blob ${identity.blob}\t${name}\0`).join('');
          return git(...args);
        };
        assert.throws(() => p.verifyTelemetryOrigin(corrupted), /blob or mode|transition inventory/);
      }
    }
  }
  assert.equal(discovery.after.blob, git('hash-object', 'test/scripts/hardhat-test-discovery.test.cjs').trim());
});

test('telemetry durability admits only its two exact paths after the preserved isolation proof', () => {
  const scope = p.profile.telemetryRuntime;
  const git = (...args) => command(ROOT, args);
  assert.equal(
    createHash('sha256').update(JSON.stringify(scope.followup)).digest('hex'),
    'e2a605cfc233ba1cad6061b514aaadc2175a067cd67a1696012a04f3a3bb7137'
  );
  assert.deepEqual(scope.durability.transitions.map((item) => item.path), [
    'agent-gateway/telemetryQueue.ts',
    'test/scripts/telemetryRecovery.test.cjs',
  ]);
  const before = p.parseTree(git('ls-tree', '-rz', scope.durability.baseline));
  const after = p.parseTree(git('ls-tree', '-rz', scope.durability.source));
  for (const item of scope.durability.transitions) {
    assert.deepEqual(item.before, before.get(item.path));
    assert.deepEqual(item.after, after.get(item.path));
    assert.equal(item.after.blob, git('hash-object', item.path).trim());
    for (const [side, original] of [['before', before], ['after', after]]) {
      for (const replacement of [null, { mode: '100644', blob: '0'.repeat(40) }, { mode: '100755', blob: item[side].blob }]) {
        const changed = new Map(original);
        if (replacement === null) changed.delete(item.path);
        else changed.set(item.path, replacement);
        const corrupted = (...args) => {
          if (args[0] === 'ls-tree' && args[2] === scope.durability[side === 'before' ? 'baseline' : 'source'])
            return [...changed].map(([name, identity]) => `${identity.mode} blob ${identity.blob}\t${name}\0`).join('');
          return git(...args);
        };
        assert.throws(() => p.verifyTelemetryOrigin(corrupted), /blob or mode|transition inventory/);
      }
    }
  }
  const final = new Map(after);
  const oldQueue = scope.durability.transitions[0];
  final.set(oldQueue.path, oldQueue.before);
  assert.throws(() => p.verifyTelemetryTransitions(
    p.parseTree(git('ls-tree', '-rz', scope.baseline)), final
  ), /blob or mode/);
  assert.equal(p.verifyTelemetryOrigin(git), scope);
});

function finiteTelemetryAdmission(t, p) {
  const pending = pendingProfileFixture(p.profile);
  const runtime = profileFixtureRuntime(pending);
  const r = repository(t);
  shareObjects(r);
  r.git('read-tree', p.profile.telemetryRuntime.source);
  addCurrentReleaseMetadata(r);
  r.put(
    'scripts/release/source-profile-rc17.json',
    JSON.stringify(pending, null, 2) + '\n'
  );
  const source = r.commit(p.profile.telemetryRuntime.source);
  const args = (sha) => ({
    git: r.git,
    sha,
    version: p.profile.releaseVersion,
    lock: JSON.parse(r.git('show', `${sha}:package-lock.json`)),
    policy: JSON.parse(r.git('show', `${sha}:config/solidity-compiler.json`)),
  });
  assert.equal(runtime.verifySourceScope(args(source)).productionApproved, false);
  r.put(
    'agent-gateway/unreviewed-runtime.ts',
    'export const unreviewed = true;\n'
  );
  const extra = r.commit(source);
  assert.throws(
    () => runtime.verifySourceScope(args(extra)),
    /Unexpected implementation-to-release change: agent-gateway\/unreviewed-runtime.ts/
  );
  r.git('read-tree', source);
  r.put('.github/workflows/ci.yml', 'name: substituted CI\n');
  const alteredCI = r.commit(source);
  assert.throws(
    () => runtime.verifySourceScope(args(alteredCI)),
    /Exact telemetry runtime blob or mode differs/
  );
  r.git('read-tree', source);
  r.put(
    'test/gateway/telemetryRecovery.test.cjs',
    command(ROOT, ['cat-file', 'blob', p.profile.telemetryRuntime.historical.transitions.at(-1).after.blob])
  );
  const restoredOldSuite = r.commit(source);
  assert.throws(
    () => runtime.verifySourceScope(args(restoredOldSuite)),
    /Unexpected implementation-to-release change: test\/gateway\/telemetryRecovery.test.cjs/
  );
  assert.throws(() => runtime.verifyPublicationReview(), /pending/);
}

test('finite telemetry admission preserves the rejection of an extra runtime file and altered CI commands', (t) => {
  finiteTelemetryAdmission(t, p);
});

test('finite telemetry admission remains independent of installed inert review metadata', (t) => {
  const source = command(ROOT, ['rev-parse', 'HEAD']).trim();
  const tree = command(ROOT, ['rev-parse', `${source}^{tree}`]).trim();
  const reviews = inertProfileReviews(source, tree);
  const installed = {
    ...clone(p.profile),
    scannerReview: reviews.scannerReview,
    pythonScannerReview: reviews.pythonScannerReview,
  };
  const runtime = profileFixtureRuntime(installed);
  assert.notEqual(runtime.profile.scannerReview, null);
  assert.notEqual(runtime.profile.pythonScannerReview, null);
  finiteTelemetryAdmission(t, runtime);
});

test('actual Git trees require the complete finite protected transition set', (t) => {
  const r = repository(t);
  const beforeIdentity = r.put('contracts/Example.sol', 'before\n');
  r.put('docs/example.md', 'old prose\n');
  const before = r.commit();
  const afterIdentity = r.put('contracts/Example.sol', 'after\n');
  const addition = r.put(
    'scripts/v2/explicit-helper.cjs',
    'module.exports = {};\n'
  );
  r.put('docs/example.md', 'new prose\n');
  const after = r.commit(before);
  const beforeTree = p.parseTree(r.git('ls-tree', '-rz', before));
  const afterTree = p.parseTree(r.git('ls-tree', '-rz', after));
  const transitions = [
    {
      path: 'contracts/Example.sol',
      before: beforeIdentity,
      after: afterIdentity,
    },
    { path: 'scripts/v2/explicit-helper.cjs', before: null, after: addition },
  ];
  assert.equal(
    p.verifyProtectedTransitions(beforeTree, afterTree, transitions).length,
    2
  );
  for (const invalid of [
    transitions.slice(1),
    [...transitions, transitions[0]],
    [{ ...transitions[0], before: null }, transitions[1]],
    [
      { ...transitions[0], after: { ...afterIdentity, blob: '0'.repeat(40) } },
      transitions[1],
    ],
    [
      ...transitions,
      { path: 'docs/example.md', before: null, after: addition },
    ],
  ])
    assert.throws(() =>
      p.verifyProtectedTransitions(beforeTree, afterTree, invalid)
    );
  r.put('scripts/v2/unreviewed.cjs', 'not reviewed\n');
  const extra = r.commit(after);
  assert.throws(
    () =>
      p.verifyProtectedTransitions(
        beforeTree,
        p.parseTree(r.git('ls-tree', '-rz', extra)),
        transitions
      ),
    /complete|Complete/
  );
  r.put('contracts/Example.sol', 'after\n', '100755');
  const mode = r.commit(extra);
  const changedMode = clone(transitions);
  changedMode[0].after.mode = '100755';
  assert.throws(
    () =>
      p.verifyProtectedTransitions(
        beforeTree,
        p.parseTree(r.git('ls-tree', '-rz', mode)),
        changedMode
      ),
    /mode change/
  );
});

test('actual candidate history verifies all eighteen reviewed blobs without changing historical scope', () => {
  const git = (...args) => command(ROOT, args);
  assert.equal(
    git('rev-parse', `${p.profile.implementationBaseline}^{tree}`).trim(),
    p.profile.implementationTree
  );
  const transitions = p.verifyProtectedTransitions(
    p.parseTree(git('ls-tree', '-rz', p.profile.compilerSourceBaseline)),
    p.parseTree(git('ls-tree', '-rz', p.profile.implementationBaseline)),
    p.profile.transitions
  );
  assert.equal(transitions.length, 18);
  git(
    'merge-base',
    '--is-ancestor',
    p.profile.securityPrerequisite,
    p.profile.implementationBaseline
  );
  assert.equal(
    git(
      'diff',
      '--name-only',
      p.profile.evidenceBaseline,
      p.profile.implementationBaseline,
      '--',
      ...require('../../scripts/release/qualify-source-release.cjs')
        .preservedEvidencePaths
    ),
    ''
  );
});

test('complete source verifier accepts only finite release plumbing over the actual pinned ancestor', (t) => {
  const r = repository(t);
  shareObjects(r);
  const pending = pendingProfileFixture();
  const runtime = profileFixtureRuntime(pending);
  r.git('read-tree', p.profile.implementationBaseline);
  addReviewedWebsite(r);
  addReviewedIntegration(r);
  addReviewedPython(r);
  addCurrentReleaseMetadata(r);
  const beforePackage = JSON.parse(
    r.git('show', `${p.profile.implementationBaseline}:package.json`)
  );
  const beforeLock = JSON.parse(
    r.git('show', `${p.profile.implementationBaseline}:package-lock.json`)
  );
  const afterPackage = clone(beforePackage),
    afterLock = clone(beforeLock);
  afterPackage.version =
    afterLock.version =
    afterLock.packages[''].version =
      p.profile.releaseVersion;
  r.put('package.json', JSON.stringify(afterPackage, null, 2) + '\n');
  r.put('package-lock.json', JSON.stringify(afterLock, null, 2) + '\n');
  const oldWorkflow = r.git(
    'show',
    `${p.profile.implementationBaseline}:.github/workflows/source-release.yml`
  );
  r.put(
    '.github/workflows/source-release.yml',
    p.applyLegacyWorkflowGuard(oldWorkflow)
  );
  r.put(
    'docs/production/RELEASE_NOTES_SOURCE_RC17.md',
    '# Pending fixture only\n'
  );
  r.put(
    'scripts/release/source-profile-rc17.json',
    JSON.stringify(pending, null, 2) + '\n'
  );
  const policy = JSON.parse(
    r.git(
      'show',
      `${p.profile.implementationBaseline}:config/solidity-compiler.json`
    )
  );
  const args = {
    git: r.git,
    sha: r.commit([
      p.profile.implementationBaseline,
      p.profile.integrationBaseline,
      p.profile.nativePinBaseline,
      p.profile.scannerPolicy.producerCommit,
      p.profile.sourceConvergenceBaseline,
      p.profile.pythonScannerBaseline,
      p.profile.telemetryRuntime.source,
    ]),
    version: p.profile.releaseVersion,
    lock: afterLock,
    policy,
  };
  const result = runtime.verifySourceScope(args);
  assert.equal(result.qualification, 'PENDING_FINAL_SOURCE_MAIN_PUSH');
  assert.equal(result.productionApproved, false);
  assert.equal(result.scannerReview, null);
  assert.equal(result.pythonScannerReview, null);
  assert.deepEqual(result.pythonScannerPolicy, p.profile.pythonScannerPolicy);
  assert.equal(result.scannerRequiredPaths.length, 34);
  assert.equal(result.scannerReceiverPaths.length, 20);
  assert.deepEqual(result.telemetryRuntime, p.profile.telemetryRuntime);
  assert.equal(result.pythonScannerRequiredPaths.length, 8);
  assert.equal(result.protectedTransitions.length, 18);
  assert.deepEqual(result.websiteTransitions, p.websiteTransitions);
  assert.throws(
    () =>
      runtime.verifySourceScope({
        ...args,
        version: p.profile.previousVersion,
      }),
    /version/
  );
  assert.throws(
    () =>
      runtime.verifySourceScope({
        ...args,
        policy: { ...policy, optimizerRuns: 1 },
      }),
    /compiler/
  );
  assert.throws(
    () =>
      runtime.verifySourceScope({
        ...args,
        lock: { ...afterLock, injected: true },
      }),
    /identity/
  );
  const changes = [
    [
      'integrations/alpha-agent/transformational-work-request.mjs',
      'unreviewed implementation\n',
    ],
    [
      'scripts/release/qualify-source-release.cjs',
      'historical gate overwritten\n',
    ],
    [
      'docs/production/RELEASE_NOTES_SOURCE_RC15.md',
      'historical notes overwritten\n',
    ],
    ['scripts/v2/unexpected.cjs', 'extra protected file\n'],
    ['scripts/release/unexpected.cjs', 'extra release plumbing\n'],
  ];
  for (const [name, bytes] of changes) {
    r.git('read-tree', args.sha);
    r.put(name, bytes);
    assert.throws(
      () => runtime.verifySourceScope({ ...args, sha: r.commit(args.sha) }),
      /Unexpected implementation-to-release/
    );
  }
  r.git('read-tree', args.sha);
  r.put('docs/deployments/ethereum-mainnet-2026-10-12.json', '{}\n');
  assert.throws(() =>
    runtime.verifySourceScope({ ...args, sha: r.commit(args.sha) })
  );
  r.git('read-tree', args.sha);
  r.put('scripts/release/source-profile-rc16.cjs', 'fixture\n', '100755');
  assert.throws(
    () => runtime.verifySourceScope({ ...args, sha: r.commit(args.sha) }),
    /regular file/
  );
  for (const name of [
    p.profile.pythonScannerPolicy.configPath,
    p.profile.pythonScannerPolicy.workflowPath,
  ]) {
    for (const mode of ['100644', '100755']) {
      r.git('read-tree', args.sha);
      r.put(
        name,
        mode === '100644'
          ? 'unreviewed Python producer bytes\n'
          : command(ROOT, [
              'show',
              `${p.profile.pythonScannerBaseline}:${name}`,
            ]),
        mode
      );
      assert.throws(
        () => runtime.verifySourceScope({ ...args, sha: r.commit(args.sha) }),
        /Python scanner producer blob or digest/
      );
    }
    r.git('read-tree', args.sha);
    r.git('update-index', '--force-remove', name);
    assert.throws(
      () => runtime.verifySourceScope({ ...args, sha: r.commit(args.sha) }),
      /Python scanner producer blob or digest/
    );
  }
  r.git('read-tree', args.sha);
  const missingProducer = r.commit([
    p.profile.implementationBaseline,
    p.profile.integrationBaseline,
    p.profile.nativePinBaseline,
    p.profile.sourceConvergenceBaseline,
  ]);
  assert.throws(() =>
    runtime.verifySourceScope({ ...args, sha: missingProducer })
  );
});

test('actual Git website transitions admit only the two exact reviewed byte and mode changes', (t) => {
  const r = repository(t);
  shareObjects(r);
  r.git('read-tree', p.profile.implementationBaseline);
  addReviewedWebsite(r);
  addReviewedIntegration(r);
  addCurrentReleaseMetadata(r);
  const after = r.commit(p.profile.implementationBaseline);
  const beforeTree = p.parseTree(
    r.git('ls-tree', '-rz', p.profile.implementationBaseline)
  );
  const afterTree = p.parseTree(r.git('ls-tree', '-rz', after));
  const paths = p.websiteTransitions.map((item) => item.path);
  assert.deepEqual(
    p.verifyReleaseDelta(beforeTree, afterTree),
    [
      ...paths,
      ...Object.keys(p.previousReleaseRecords),
      'CHANGELOG.md',
      ...p.profile.integrationTransitions.map((item) => item.path),
      ...p.profile.telemetryRuntime.transitions.map((item) => item.path),
    ].sort()
  );
  assert.throws(
    () => p.verifyReleaseDelta(beforeTree, beforeTree),
    /website blob or mode|release trigger/
  );
  for (const inventory of [
    p.websiteTransitions.slice(1),
    [...p.websiteTransitions, p.websiteTransitions[0]],
    [...p.websiteTransitions, { path: 'docs/unreviewed.md' }],
    p.websiteTransitions.toReversed(),
  ])
    assert.throws(
      () => p.verifyWebsiteTransitions(beforeTree, afterTree, inventory),
      /inventory/
    );
  const wrongBefore = new Map(beforeTree);
  wrongBefore.set(paths[0], { mode: '100644', blob: '0'.repeat(40) });
  assert.throws(
    () => p.verifyReleaseDelta(wrongBefore, afterTree),
    /website blob or mode/
  );
  for (const name of paths) {
    for (const mode of ['100644', '100755']) {
      r.git('read-tree', after);
      r.put(
        name,
        mode === '100755'
          ? command(ROOT, [
              'cat-file',
              'blob',
              p.websiteTransitions.find((item) => item.path === name).after
                .blob,
            ])
          : 'unreviewed website bytes\n',
        mode
      );
      assert.throws(
        () =>
          p.verifyReleaseDelta(
            beforeTree,
            p.parseTree(r.git('ls-tree', '-rz', r.commit(after)))
          ),
        /website blob or mode/
      );
    }
    r.git('read-tree', after);
    r.git('update-index', '--force-remove', name);
    assert.throws(
      () =>
        p.verifyReleaseDelta(
          beforeTree,
          p.parseTree(r.git('ls-tree', '-rz', r.commit(after)))
        ),
      /website blob or mode/
    );
  }
  for (const name of ['docs/extra.md', 'scripts/pages/extra.mjs']) {
    r.git('read-tree', after);
    r.put(name, 'not reviewed\n');
    assert.throws(
      () =>
        p.verifyReleaseDelta(
          beforeTree,
          p.parseTree(r.git('ls-tree', '-rz', r.commit(after)))
        ),
      /Unexpected implementation-to-release/
    );
  }
});

test('version-only normalization rejects dependency, scripts, resolutions and configuration changes', () => {
  const beforePackage = {
    version: '2.1.0-rc.15',
    scripts: { test: 'real' },
    dependencies: { pinned: '1.0.0' },
  };
  const beforeLock = {
    version: '2.1.0-rc.15',
    lockfileVersion: 3,
    packages: {
      '': { version: '2.1.0-rc.15' },
      'node_modules/pinned': {
        version: '1.0.0',
        resolved: 'https://example.org/pkg',
        integrity: 'sha512-reviewed',
      },
    },
  };
  const afterPackage = clone(beforePackage),
    afterLock = clone(beforeLock);
  afterPackage.version =
    afterLock.version =
    afterLock.packages[''].version =
      '2.1.0-rc.17';
  assert.equal(
    p.verifyVersionOnly(beforePackage, afterPackage, beforeLock, afterLock),
    true
  );
  const wrongPackage = clone(afterPackage);
  wrongPackage.scripts.test = 'true';
  const wrongLock = clone(afterLock);
  wrongLock.packages['node_modules/pinned'].integrity = 'sha512-other';
  assert.throws(
    () =>
      p.verifyVersionOnly(beforePackage, wrongPackage, beforeLock, afterLock),
    /beyond/
  );
  assert.throws(
    () =>
      p.verifyVersionOnly(beforePackage, afterPackage, beforeLock, wrongLock),
    /beyond/
  );
  assert.throws(
    () =>
      p.verifyVersionOnly(beforePackage, afterPackage, beforeLock, {
        ...afterLock,
        version: '2.1.0-rc.15',
      }),
    /version/
  );
});

test('legacy version selection preserves every historical workflow byte outside the exact guard', () => {
  const before = command(ROOT, [
    'show',
    `${p.profile.implementationBaseline}:.github/workflows/source-release.yml`,
  ]);
  const guarded = p.applyLegacyWorkflowGuard(before);
  assert.equal(p.verifyLegacyWorkflow(before, guarded), true);
  for (const after of [
    before,
    guarded.replace('contents: write', 'contents: none'),
    guarded.replace(
      'qualify-source-release.cjs',
      'qualify-source-release-rc16.cjs'
    ),
    guarded.replace('source-v2.1.0-rc.15', 'source-v2.1.0-rc.17'),
    guarded.replace("selected == 'true'", "selected != 'true'"),
    guarded + '\n',
  ])
    assert.throws(
      () => p.verifyLegacyWorkflow(before, after),
      /version selection/
    );
});

test('profile baseline, source pins and pending scanner boundary cannot silently advance', () => {
  const pending = pendingProfileFixture();
  assert.equal(p.validateProfile(pending), pending);
  assert.ok(Object.isFrozen(p.profile.transitions[0].after));
  for (const modify of [
    (value) => {
      value.implementationBaseline = '0'.repeat(40);
    },
    (value) => {
      value.qualification = 'QUALIFIED';
    },
    (value) => {
      value.nativeCompatibility.commit = '0'.repeat(40);
    },
    (value) => {
      value.integrationTransitions.pop();
    },
    (value) => {
      value.integrationTransitions[0].after.blob = '0'.repeat(40);
    },
    (value) => {
      value.websiteTransitions.pop();
    },
    (value) => {
      value.websiteTransitions[0].after.blob = '0'.repeat(40);
    },
    (value) => {
      value.scannerRequiredPaths.pop();
    },
    (value) => {
      value.scannerRequiredPaths = value.scannerRequiredPaths.filter(
        (name) => name !== 'scripts/release/python-scanner-rc16.cjs'
      );
    },
    (value) => {
      value.scannerReceiverPaths.pop();
    },
    (value) => {
      value.sourceConvergenceBaseline = '0'.repeat(40);
    },
    (value) => {
      value.sourceConvergenceTree = '0'.repeat(40);
    },
    (value) => {
      value.pythonScannerBaseline = '0'.repeat(40);
    },
    (value) => {
      value.pythonScannerPolicy.workflowSha256 = '0'.repeat(64);
    },
    (value) => {
      value.pythonScannerRequiredPaths.pop();
    },
    (value) => {
      value.pythonScannerReview = { approved: true };
    },
    (value) => {
      value.scannerReview = { approved: true };
    },
  ]) {
    const altered = clone(pending);
    modify(altered);
    assert.throws(() => p.validateProfile(altered));
  }
  assert.throws(
    () => p.verifyPublicationReview(pending),
    /publication blocked.*scannerReview.*Python/
  );
});

test('Python producer retains original owner bytes plus exact service evidence additions', () => {
  const owner = JSON.parse(
    command(ROOT, [
      'show',
      `${p.profile.sourceConvergenceBaseline}:scripts/release/source-profile-rc16.json`,
    ])
  );
  const originalProducer = 'ce08a583391e563566a0eaec6f89da3190c319db';
  const formattedProducer = p.profile.pythonScannerBaseline;
  const policy = p.profile.pythonScannerPolicy;
  assert.equal(p.profile.pythonScannerBaseline, formattedProducer);
  assert.equal(policy.producerCommit, formattedProducer);
  const actualTree = command(ROOT, [
    'rev-parse',
    formattedProducer + '^{tree}',
  ]).trim();
  assert.equal(p.profile.pythonScannerTree, actualTree);
  assert.equal(policy.producerTree, actualTree);
  command(ROOT, [
    'merge-base',
    '--is-ancestor',
    originalProducer,
    formattedProducer,
  ]);
  const originalWorkflow = command(ROOT, [
    'show',
    `${originalProducer}:${policy.workflowPath}`,
  ]);
  const formattedWorkflow = command(ROOT, [
    'show',
    `${formattedProducer}:${policy.workflowPath}`,
  ]);
  // Normalize only the exact additive service-receipt steps, analyze output ID
  // and approved new push branch before checking the original owner bytes.
  const reviewSuffix =
    "\n  codeql-review-bytes:\n    name: Complete Python CodeQL review bytes\n    needs: codeql-python\n    if: ${{ success() && github.event_name == 'push' && github.ref == 'refs/heads/fix/processed-codeql-release-proof-20261020' && github.repository == 'MontrealAI/AGIJobsv0' }}\n    runs-on: ubuntu-24.04\n    timeout-minutes: 10\n    permissions:\n      contents: read\n      actions: read\n    steps:\n      - name: Harden runner\n        uses: step-security/harden-runner@f4a75cfd619ee5ce8d5b864b0d183aff3c69b55a\n        with:\n          egress-policy: audit\n      - name: Checkout exact review source\n        uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955\n        with:\n          fetch-depth: 1\n          persist-credentials: false\n      - name: Setup Node\n        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\n        with:\n          node-version-file: '.nvmrc'\n      - name: Retain complete original CodeQL review bytes\n        env:\n          GH_TOKEN: ${{ github.token }}\n          CODEQL_REVIEW_ARTIFACT_ID: ${{ needs.codeql-python.outputs.raw_artifact_id }}\n        run: node scripts/release/emit-codeql-review-rc16.cjs --language python\n";
  assert.ok(formattedWorkflow.endsWith(reviewSuffix));
  let withoutReviewJob = formattedWorkflow.slice(0, -reviewSuffix.length);
  for (const addition of [
    '    outputs:\n      raw_artifact_id: ${{ steps.codeql_raw.outputs.artifact-id }}\n',
    '        id: codeql_raw\n',
  ]) {
    assert.equal(withoutReviewJob.split(addition).length, 2);
    withoutReviewJob = withoutReviewJob.replace(addition, '');
  }
  const serviceSuffix =
    "\n      - name: Retain exact processed CodeQL service receipt\n        if: ${{ success() && github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'MontrealAI/AGIJobsv0' }}\n        env:\n          GH_TOKEN: ${{ github.token }}\n          SARIF_UPLOAD_ID: ${{ steps.codeql_analyze.outputs.sarif-id }}\n        run: node scripts/release/source-codeql-service-rc16.cjs --capture --language python --output reports/security/codeql-service-python/codeql-service-receipt.json\n\n      - name: Upload exact processed CodeQL service receipt\n        if: ${{ success() && github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'MontrealAI/AGIJobsv0' }}\n        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02\n        with:\n          name: codeql-service-receipt-python-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}\n          path: reports/security/codeql-service-python/codeql-service-receipt.json\n          if-no-files-found: error\n";
  assert.ok(withoutReviewJob.endsWith(serviceSuffix));
  let retainedOriginal = withoutReviewJob.slice(0, -serviceSuffix.length);
  for (const addition of [
    '        id: codeql_analyze\n',
    "      - 'fix/processed-codeql-release-proof-20261020'\n",
  ]) {
    assert.equal(retainedOriginal.split(addition).length, 2);
    retainedOriginal = retainedOriginal.replace(addition, '');
  }
  assert.equal(
    retainedOriginal,
    command(ROOT, [
      'show',
      '7d7a2c19072c211282a9b18b6dc71a85ee1d8abe:' + policy.workflowPath,
    ])
  );
  let normalizedWorkflow = retainedOriginal;
  for (const [formatted, original] of [
    [
      "      - 'fix/inherited-codeql-*'\n",
      '      - "fix/inherited-codeql-*"\n',
    ],
    ["    - cron: '30 2 * * *'\n", '    - cron: "30 2 * * *"\n'],
    [
      "          node-version-file: '.nvmrc'\n",
      '          node-version-file: ".nvmrc"\n',
    ],
    [
      "          python-version: '3.12'\n",
      '          python-version: "3.12"\n',
    ],
  ]) {
    assert.equal(normalizedWorkflow.split(formatted).length, 2);
    normalizedWorkflow = normalizedWorkflow.replace(formatted, original);
  }
  assert.equal(normalizedWorkflow, originalWorkflow);
  const runScripts = (workflow) => {
    const lines = workflow.split('\n'),
      scripts = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== '        run: |') continue;
      const script = [];
      for (
        i++;
        i < lines.length && (lines[i].startsWith('          ') || !lines[i]);
        i++
      )
        script.push(lines[i].slice(10));
      scripts.push(script.join('\n'));
      i--;
    }
    return scripts;
  };
  assert.equal(runScripts(originalWorkflow).length, 3);
  assert.deepEqual(runScripts(formattedWorkflow), runScripts(originalWorkflow));
  assert.equal(
    command(ROOT, ['show', `${formattedProducer}:${policy.configPath}`]),
    command(ROOT, ['show', `${originalProducer}:${policy.configPath}`])
  );
  assert.deepEqual(policy, {
    ...owner.pythonScannerPolicy,
    reviewSchema: 'agijobsv0/codeql-python-review/2',
    reviewedProducer: {
      event: 'push',
      headBranch: 'fix/inherited-codeql-telemetry-runtime-20261021',
      ref: 'refs/heads/fix/inherited-codeql-telemetry-runtime-20261021',
    },
    producerCommit: formattedProducer,
    producerTree: actualTree,
    workflowSha256: createHash('sha256')
      .update(formattedWorkflow)
      .digest('hex'),
    workflowBlob: command(ROOT, [
      'rev-parse',
      `${formattedProducer}:${policy.workflowPath}`,
    ]).trim(),
  });
  assert.deepEqual(
    p.profile.pythonScannerRequiredPaths,
    owner.pythonScannerRequiredPaths
  );
  assert.equal(pendingProfileFixture().pythonScannerReview, null);
  assert.equal(p.allowedNewPaths.length, 31);
  assert(
    p.allowedNewPaths.includes('scripts/release/source-profile-rc17.json')
  );
  assert(
    p.allowedNewPaths.includes('docs/production/RELEASE_NOTES_SOURCE_RC17.md')
  );
  for (const name of [
    'scripts/release/emit-codeql-review-rc16.cjs',
    'scripts/release/python-scanner-rc16.cjs',
    'test/scripts/source-python-scanner-rc16.test.cjs',
    '.github/codeql/config-python-integrations.yml',
    '.github/workflows/static-analysis-python-integrations.yml',
  ])
    assert(p.allowedNewPaths.includes(name));
  for (const name of owner.scannerRequiredPaths) {
    assert(p.profile.scannerRequiredPaths.includes(name));
    if (/^(?:integrations\/alpha-agent|website\/assets)\//.test(name))
      assert(p.profile.scannerReceiverPaths.includes(name));
  }
});

test('tree enumeration rejects links, gitlinks, duplicate paths and malformed Git identities', () => {
  for (const raw of [
    '120000 blob ' + 'a'.repeat(40) + '\tlink\0',
    '160000 commit ' + 'a'.repeat(40) + '\tsubmodule\0',
    '100644 blob ' + 'a'.repeat(40) + '\t../escape\0',
    ('100644 blob ' + 'a'.repeat(40) + '\tduplicate\0').repeat(2),
    '100644 blob not-a-full-object\tfile\0',
  ])
    assert.throws(() => p.parseTree(raw));
});

test('actual Git integration transitions reject substituted security/runtime bytes and inventory drift', (t) => {
  const r = repository(t);
  shareObjects(r);
  r.git('read-tree', p.profile.implementationBaseline);
  addReviewedWebsite(r);
  addReviewedIntegration(r);
  const candidate = r.commit([
    p.profile.implementationBaseline,
    p.profile.integrationBaseline,
    p.profile.nativePinBaseline,
    p.profile.scannerPolicy.producerCommit,
  ]);
  const before = p.parseTree(
    r.git('ls-tree', '-rz', p.profile.implementationBaseline)
  );
  const after = p.parseTree(r.git('ls-tree', '-rz', candidate));
  assert.equal(p.verifyIntegrationTransitions(before, after).length, 43);
  for (const transitions of [
    p.profile.integrationTransitions.slice(1),
    [...p.profile.integrationTransitions, p.profile.integrationTransitions[0]],
    p.profile.integrationTransitions.toReversed(),
  ])
    assert.throws(
      () => p.verifyIntegrationTransitions(before, after, transitions),
      /inventory/
    );
  const selected = p.profile.integrationTransitions.find(
    (item) => item.path === 'shared/containedFiles.ts'
  );
  for (const [bytes, mode] of [
    ['changed unreviewed storage source\n', '100644'],
    [command(ROOT, ['cat-file', 'blob', selected.after.blob]), '100755'],
  ]) {
    r.git('read-tree', candidate);
    r.put(selected.path, bytes, mode);
    addCurrentReleaseMetadata(r);
    assert.throws(
      () =>
        p.verifyReleaseDelta(
          before,
          p.parseTree(r.git('ls-tree', '-rz', r.commit(candidate)))
        ),
      /integration blob or mode/
    );
  }
  const wrongBefore = new Map(before);
  wrongBefore.set(selected.path, { mode: '100644', blob: '0'.repeat(40) });
  assert.throws(
    () => p.verifyIntegrationTransitions(wrongBefore, after),
    /integration blob or mode/
  );
});

test('scanner producer pins must name the same immutable workflow bytes as the release', (t) => {
  const r = repository(t);
  const configPath = '.github/codeql/fixture.yml';
  const workflowPath = '.github/workflows/fixture.yml';
  r.put(configPath, 'name: benign config\n');
  r.put(workflowPath, 'name: benign selected workflow\n');
  const selected = r.commit();
  const releaseTree = p.parseTree(r.git('ls-tree', '-rz', selected));
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  const policy = {
    producerCommit: selected,
    producerTree: r.git('rev-parse', `${selected}^{tree}`).trim(),
    configPath,
    workflowPath,
    configBlob: releaseTree.get(configPath).blob,
    workflowBlob: releaseTree.get(workflowPath).blob,
    configSha256: digest(r.git('show', `${selected}:${configPath}`)),
    workflowSha256: digest(r.git('show', `${selected}:${workflowPath}`)),
  };
  p.verifyScannerProducerPin(r.git, releaseTree, policy);
  r.put(workflowPath, 'name: another legitimate revision\n');
  const other = r.commit(selected);
  assert.throws(
    () =>
      p.verifyScannerProducerPin(r.git, releaseTree, {
        ...policy,
        producerCommit: other,
        producerTree: r.git('rev-parse', `${other}^{tree}`).trim(),
      }),
    /producer blob or digest/
  );
  assert.throws(
    () =>
      p.verifyScannerProducerPin(r.git, releaseTree, {
        ...policy,
        workflowSha256: '0'.repeat(64),
      }),
    /producer blob or digest/
  );
});

// These fixtures exercise only review metadata admission. They contain no
// scanner archive, SARIF report, authenticated API observation or authority.
function pendingProfileFixture(value = p.profile) {
  return {
    ...clone(value),
    scannerReview: null,
    pythonScannerReview: null,
  };
}

function profileFixtureRuntime(value) {
  const { Module, createRequire } = require('node:module');
  const filename = require.resolve(
    '../../scripts/release/source-profile-rc16.cjs'
  );
  const originalRequire = createRequire(filename);
  const runtime = new Module(filename, module);
  runtime.filename = filename;
  runtime.paths = Module._nodeModulePaths(path.dirname(filename));
  // Compile the unchanged production function source with only its inert JSON
  // input replaced. Do not mutate the live require cache or any predicates.
  runtime.require = (name) =>
    name === './source-profile-rc17.json'
      ? clone(value)
      : originalRequire(name);
  runtime._compile(fs.readFileSync(filename, 'utf8'), filename);
  return runtime.exports;
}

function inertProfileReviews(sourceCommit, tree) {
  const {
    scannerHistory,
  } = require('../../scripts/release/qualify-source-release-rc16.cjs');
  const policy = p.profile.pythonScannerPolicy;
  assert.equal(policy.reviewSchema, 'agijobsv0/codeql-python-review/2');
  assert.deepEqual(policy.reviewedProducer, {
    event: 'push',
    headBranch: 'fix/inherited-codeql-telemetry-runtime-20261021',
    ref: 'refs/heads/fix/inherited-codeql-telemetry-runtime-20261021',
  });
  return {
    notesReview: {
      schema: 'agijobsv0/rc16-scanner-review/1',
      sourceSha: sourceCommit,
      sourceTree: tree,
      producer: {
        runId: 1,
        runAttempt: 1,
        runNumber: 1,
        event: 'push',
        headBranch: 'main',
        artifactId: 2,
        artifactName: `codeql-security-report-${sourceCommit}-1-1`,
        githubDigest: 'sha256:' + 'a'.repeat(64),
      },
      summary: {
        schema: 'agijobsv0/raw-codeql-summary/1',
        toolSha256: 'a'.repeat(64),
        queriesSha256: 'b'.repeat(64),
        extractedPaths: ['INERT-METADATA-ONLY.js'],
        results: [],
        resultCount: 0,
      },
      resultReviews: [],
      codeqlChecks: [
        {
          id: 3,
          headSha: sourceCommit,
          name: 'CodeQL',
          appId: 57789,
          appSlug: 'github-advanced-security',
          status: 'completed',
          conclusion: 'success',
          url: 'https://github.com/MontrealAI/AGIJobsv0/runs/3',
        },
      ],
      history: scannerHistory,
      reviewLinks: [
        'https://github.com/MontrealAI/AGIJobsv0/pull/3991#issuecomment-1',
      ],
    },
    scannerReview: {
      sourceCommit,
      results: [],
      reviewEvidence: ['INERT metadata only; not authenticated scan evidence'],
    },
    pythonScannerReview: {
      schema: policy.reviewSchema,
      sourceCommit,
      tree,
      producerRunId: 4,
      producerRunAttempt: 1,
      producerEvent: policy.reviewedProducer.event,
      producerHeadBranch: policy.reviewedProducer.headBranch,
      producerRef: policy.reviewedProducer.ref,
      artifactId: 5,
      artifactName: `python-codeql-security-report-${sourceCommit}-4-1`,
      archiveSha256: 'c'.repeat(64),
      rawRecords: Object.fromEntries(
        [
          'python.sarif',
          'source-extraction.json',
          'source-scope-after.json',
          'source-scope-before.json',
        ].map((name) => [name, 'd'.repeat(64)])
      ),
      toolComponents: [
        { name: 'INERT-METADATA-ONLY', rules: [{ id: 'inert-metadata-only' }] },
      ],
      codeqlConfigSummary: { inertMetadataOnly: true },
      successfulExtractionFiles: ['INERT-METADATA-ONLY.py'],
      requiredExtractedFiles: ['INERT-METADATA-ONLY.py'],
      ruleIds: ['inert-metadata-only'],
      rawResultCount: 0,
      results: [],
      reviewEvidence: ['INERT metadata only; not authenticated scan evidence'],
    },
  };
}

function inertProfileHistory(t) {
  const r = repository(t);
  shareObjects(r);
  const profilePath = 'scripts/release/source-profile-rc17.json';
  const notesPath = 'docs/production/RELEASE_NOTES_SOURCE_RC17.md';
  const selected = command(ROOT, ['rev-parse', 'HEAD']).trim();
  const pending = pendingProfileFixture();
  const liveNotes = command(ROOT, ['show', `${selected}:${notesPath}`]);
  const marker = /<!-- rc16-scanner-review\n[\s\S]*?\n-->/g;
  assert.equal([...liveNotes.matchAll(marker)].length, 1);
  const notes = (value) =>
    liveNotes.replace(
      marker,
      '<!-- rc16-scanner-review\n' + JSON.stringify(value, null, 2) + '\n-->'
    );
  r.git('read-tree', selected);
  r.put(profilePath, JSON.stringify(pending, null, 2) + '\n');
  r.put(notesPath, notes(null));
  const base = r.commit(selected);
  const tree = r.git('rev-parse', `${base}^{tree}`).trim();
  const reviews = inertProfileReviews(base, tree);
  const install = (records, parent = base, options = {}) => {
    r.git('read-tree', parent);
    const value = {
      ...clone(pending),
      scannerReview: records.scannerReview ?? null,
      pythonScannerReview: records.pythonScannerReview ?? null,
    };
    r.put(
      profilePath,
      options.profile ?? JSON.stringify(value, null, 2) + '\n',
      options.profileMode
    );
    r.put(
      notesPath,
      options.notes ?? notes(records.notesReview ?? null),
      options.notesMode
    );
    for (const [name, bytes] of options.others ?? []) r.put(name, bytes);
    return { target: r.commit(parent), value };
  };
  const scopeArgs = (target) => ({
    git: r.git,
    sha: target,
    version: pending.releaseVersion,
    lock: JSON.parse(r.git('show', `${target}:package-lock.json`)),
    policy: JSON.parse(
      r.git('show', `${target}:config/solidity-compiler.json`)
    ),
  });
  return {
    ...r,
    base,
    tree,
    reviews,
    pending,
    install,
    notes,
    notesPath,
    profilePath,
    scopeArgs,
  };
}

test('production metadata admission preserves the actual installed profile and exact review provenance without authorizing publication', (t) => {
  const r = inertProfileHistory(t);
  const installed = r.install(r.reviews);
  const runtime = profileFixtureRuntime(installed.value);
  const context = { git: r.git, target: installed.target };
  assert.equal(
    runtime.validatePreparedProfile(installed.value, context),
    installed.value
  );
  assert.deepEqual(runtime.verifyPublicationReview(installed.value, context), {
    metadataAdmissionOnly: true,
    productionApproved: false,
  });
  const sourceProfile = JSON.parse(
    JSON.stringify(runtime.verifySourceScope(r.scopeArgs(installed.target)))
  );
  assert.deepEqual(sourceProfile.scannerReview, installed.value.scannerReview);
  assert.deepEqual(
    sourceProfile.pythonScannerReview,
    installed.value.pythonScannerReview
  );
  assert.equal(sourceProfile.productionApproved, false);
  assert.equal(sourceProfile.qualification, 'PENDING_FINAL_SOURCE_MAIN_PUSH');
  assert.throws(
    () => runtime.validateProfile(installed.value),
    /Pending native or scanner policy/
  );

  // Execute only the real publisher's finite-profile comparison block. The
  // enclosing scanner/API/compiler/native authorization path is never entered.
  const publisher = fs.readFileSync(
    path.join(ROOT, 'scripts/release/publish-source-release-rc16.cjs'),
    'utf8'
  );
  const start = publisher.indexOf(
    "  if (\n    canonical(\n      JSON.parse(\n        fs.readFileSync(path.join(downloaded, 'source-profile-rc17.json'))"
  );
  const endMarker = "    throw Error('Remote finite source profile differs');";
  assert(start > 0);
  const end = publisher.indexOf(endMarker, start);
  assert(end > start);
  const comparison = publisher.slice(start, end + endMarker.length);
  const downloaded = path.join(r.root, 'inert-retained-profile');
  fs.mkdirSync(downloaded);
  const asset = path.join(downloaded, 'source-profile-rc17.json');
  fs.writeFileSync(asset, JSON.stringify(installed.value));
  const {
    canonical,
  } = require('../../scripts/release/qualify-source-release-rc16.cjs');
  const compare = (retained) =>
    require('node:vm').runInNewContext(comparison, {
      canonical,
      fs,
      path,
      downloaded,
      profile: runtime.profile,
      provenance: { sourceProfile: retained },
    });
  assert.doesNotThrow(() => compare(sourceProfile));
  const substitutedRuntime = clone(sourceProfile);
  substitutedRuntime.telemetryRuntime.transitions[0].after.blob = '0'.repeat(
    40
  );
  assert.throws(() => compare(substitutedRuntime), /finite source profile/);
  for (const field of ['scannerReview', 'pythonScannerReview']) {
    const altered = clone(sourceProfile);
    altered[field] = null;
    assert.throws(() => compare(altered), /finite source profile/);
    altered[field] = { ...sourceProfile[field], sourceCommit: '0'.repeat(40) };
    assert.throws(() => compare(altered), /finite source profile/);
  }
  const substitutedAsset = clone(installed.value);
  substitutedAsset.scannerReview = null;
  fs.writeFileSync(asset, JSON.stringify(substitutedAsset));
  assert.throws(() => compare(sourceProfile), /finite source profile/);
});

test('partial review installations pass only strict finite source validation and refuse production admission before effects', (t) => {
  const r = inertProfileHistory(t);
  let calls = 0;
  const noEffects = {
    git() {
      calls++;
      throw Error('unexpected Git access');
    },
    target: r.base,
  };
  assert.throws(
    () => p.verifyPublicationReview(r.pending, noEffects),
    /scannerReview is pending/
  );
  for (const field of ['scannerReview', 'pythonScannerReview']) {
    const partial = r.install({
      notesReview: r.reviews.notesReview,
      [field]: r.reviews[field],
    });
    const runtime = profileFixtureRuntime(partial.value);
    assert.equal(
      runtime.validatePreparedProfile(partial.value, {
        git: r.git,
        target: partial.target,
      }),
      partial.value
    );
    const scope = runtime.verifySourceScope(r.scopeArgs(partial.target));
    assert.deepEqual(scope[field], partial.value[field]);
    assert.equal(
      scope[
        field === 'scannerReview' ? 'pythonScannerReview' : 'scannerReview'
      ],
      null
    );
    assert.equal(scope.productionApproved, false);
    assert.throws(
      () => runtime.verifyPublicationReview(partial.value, noEffects),
      /scannerReview is pending/
    );
    const complete = r.install(r.reviews, partial.target);
    assert.deepEqual(
      profileFixtureRuntime(complete.value).verifyPublicationReview(
        complete.value,
        { git: r.git, target: complete.target }
      ),
      {
        metadataAdmissionOnly: true,
        productionApproved: false,
      }
    );
  }
  assert.equal(calls, 0);
});

test('current profile admission rejects immutable metadata drift, modes, malformed serialization and hidden nonmetadata changes', (t) => {
  const r = inertProfileHistory(t);
  const installed = r.install(r.reviews);
  const runtime = profileFixtureRuntime(installed.value);
  const context = { git: r.git, target: installed.target };
  for (const bad of [{}, { git: r.git }, { git: r.git, target: 'main' }])
    assert.throws(
      () => runtime.verifyPublicationReview(installed.value, bad),
      /Immutable Git target/
    );
  const mismatch = clone(installed.value);
  mismatch.scannerReview.reviewEvidence = ['Other inert metadata'];
  assert.throws(
    () => runtime.verifyPublicationReview(mismatch, context),
    /installed review profile differs/
  );
  for (const field of ['qualification', 'implementationBaseline']) {
    const altered = clone(installed.value);
    altered[field] = field === 'qualification' ? 'QUALIFIED' : '0'.repeat(40);
    const target = r.install(r.reviews, r.base, {
      profile: JSON.stringify(altered, null, 2) + '\n',
    }).target;
    assert.throws(
      () =>
        profileFixtureRuntime(altered).verifySourceScope(r.scopeArgs(target)),
      /pending status|immutable baseline/
    );
  }
  for (const options of [
    { profileMode: '100755' },
    { notesMode: '100755' },
    { notes: '# Changed outer prose\n' + r.notes(r.reviews.notesReview) },
    {
      others: [
        [
          'scripts/release/qualify-source-release-rc16.cjs',
          'INERT changed executable content; never executed\n',
        ],
      ],
    },
    {
      profile: JSON.stringify(installed.value).replace(
        '"scannerReview":',
        '"scannerReview":null,"scannerReview":'
      ),
    },
  ]) {
    const changed = r.install(r.reviews, r.base, options);
    assert.throws(() =>
      runtime.verifyPublicationReview(installed.value, {
        git: r.git,
        target: changed.target,
      })
    );
    assert.throws(() => runtime.verifySourceScope(r.scopeArgs(changed.target)));
  }
  const changedPython = clone(r.reviews);
  changedPython.pythonScannerReview.tree = '0'.repeat(40);
  const wrongTree = r.install(changedPython);
  assert.throws(
    () =>
      profileFixtureRuntime(wrongTree.value).verifyPublicationReview(
        wrongTree.value,
        { git: r.git, target: wrongTree.target }
      ),
    /tree differs/
  );
});

test('rc17 release additions preserve every rc16 record and exact trigger-only delta', () => {
  const git = (...args) => command(ROOT, args);
  for (const [name, identity] of Object.entries(p.previousReleaseRecords)) {
    assert.equal(git('rev-parse', `HEAD:${name}`).trim(), identity.blob);
    assert.equal(
      git(
        'rev-parse',
        `83065adf18a6ee987f8fa479a496a052d35db682:${name}`
      ).trim(),
      identity.blob
    );
  }
  assert.equal(p.releaseTriggerTransitions.length, 7);
  const needle = "      - 'docs/production/RELEASE_NOTES_SOURCE_RC17.md'\n";
  for (const item of p.releaseTriggerTransitions) {
    const before = git('cat-file', 'blob', item.before.blob);
    const after = git('cat-file', 'blob', item.after.blob);
    assert.equal(after.replaceAll(needle, ''), before);
    assert.equal(
      after.split(needle).length - 1,
      before.split(needle.replace('RC17', 'RC16')).length - 1
    );
    assert.equal(git('rev-parse', `HEAD:${item.path}`).trim(), item.after.blob);
  }
});
