'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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
      ...(parent ? ['-p', parent] : []),
      '-m',
      'Synthetic qualification fixture',
    ]).trim();
  return { root, git, put, commit };
}

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
  let objects = command(ROOT, ['rev-parse', '--git-path', 'objects']).trim();
  if (!path.isAbsolute(objects)) objects = path.resolve(ROOT, objects);
  fs.writeFileSync(
    path.join(r.root, '.git/objects/info/alternates'),
    objects + '\n'
  );
  r.git('read-tree', p.profile.alphaPinBaseline);
  const beforePackage = JSON.parse(
    r.git('show', `${p.profile.integrationBaseline}:package.json`)
  );
  const beforeLock = JSON.parse(
    r.git('show', `${p.profile.integrationBaseline}:package-lock.json`)
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
    `${p.profile.integrationBaseline}:.github/workflows/source-release.yml`
  );
  r.put(
    '.github/workflows/source-release.yml',
    p.applyLegacyWorkflowGuard(oldWorkflow)
  );
  r.put(
    'docs/production/RELEASE_NOTES_SOURCE_RC16.md',
    '# Pending fixture only\n'
  );
  const policy = JSON.parse(
    r.git(
      'show',
      `${p.profile.integrationBaseline}:config/solidity-compiler.json`
    )
  );
  const args = {
    git: r.git,
    sha: r.commit(p.profile.alphaPinBaseline),
    version: p.profile.releaseVersion,
    lock: afterLock,
    policy,
  };
  const result = p.verifySourceScope(args);
  assert.equal(result.qualification, 'PENDING_FINAL_SOURCE_MAIN_PUSH');
  assert.equal(result.productionApproved, false);
  assert.equal(result.scannerReview, null);
  assert.equal(result.protectedTransitions.length, 18);
  assert.equal(result.nativePinTransitions.length, 6);
  assert.throws(
    () => p.verifySourceScope({ ...args, version: p.profile.previousVersion }),
    /version/
  );
  assert.throws(
    () =>
      p.verifySourceScope({ ...args, policy: { ...policy, optimizerRuns: 1 } }),
    /compiler/
  );
  assert.throws(
    () =>
      p.verifySourceScope({ ...args, lock: { ...afterLock, injected: true } }),
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
      () => p.verifySourceScope({ ...args, sha: r.commit(args.sha) }),
      /Unexpected implementation-to-release/
    );
  }
  r.git('read-tree', args.sha);
  r.put('docs/deployments/ethereum-mainnet-2026-10-12.json', '{}\n');
  assert.throws(() =>
    p.verifySourceScope({ ...args, sha: r.commit(args.sha) })
  );
  r.git('read-tree', args.sha);
  r.put('scripts/release/source-profile-rc16.cjs', 'fixture\n', '100755');
  assert.throws(
    () => p.verifySourceScope({ ...args, sha: r.commit(args.sha) }),
    /regular file/
  );
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
      '2.1.0-rc.16';
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
    guarded.replace('source-v2.1.0-rc.15', 'source-v2.1.0-rc.16'),
    guarded.replace("selected == 'true'", "selected != 'true'"),
    guarded + '\n',
  ])
    assert.throws(
      () => p.verifyLegacyWorkflow(before, after),
      /version selection/
    );
});

test('profile baseline, source pins and pending scanner boundary cannot silently advance', () => {
  assert.equal(p.validateProfile(), p.profile);
  assert.ok(Object.isFrozen(p.profile.transitions[0].after));
  for (const modify of [
    (value) => {
      value.implementationBaseline = '0'.repeat(40);
    },
    (value) => {
      value.javascriptExtractorBaseline = '0'.repeat(40);
    },
    (value) => {
      value.javascriptExtractorTransitions.pop();
    },
    (value) => {
      value.alphaPinBaseline = '0'.repeat(40);
    },
    (value) => {
      value.alphaPinTransitions.pop();
    },
    (value) => {
      value.qualification = 'QUALIFIED';
    },
    (value) => {
      value.nativeCompatibility.commit = '0'.repeat(40);
    },
    (value) => {
      value.scannerRequiredPaths.pop();
    },
    (value) => {
      value.scannerReview = { approved: true };
    },
  ]) {
    const altered = clone(p.profile);
    modify(altered);
    assert.throws(() => p.validateProfile(altered));
  }
  assert.throws(
    () => p.verifyPublicationReview(),
    /publication blocked.*scannerReview/
  );
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
test('actual integrated candidate has exactly nineteen finite receiver and producer transitions', () => {
  const git = (...args) => command(ROOT, args);
  assert.equal(
    git('rev-parse', p.profile.integrationBaseline + '^{tree}').trim(),
    p.profile.integrationTree
  );
  const before = p.parseTree(
    git('ls-tree', '-rz', p.profile.implementationBaseline)
  );
  const after = p.parseTree(
    git('ls-tree', '-rz', p.profile.integrationBaseline)
  );
  assert.equal(
    p.verifyIntegrationTransitions(
      before,
      after,
      p.profile.integrationTransitions
    ).length,
    19
  );
  git(
    'merge-base',
    '--is-ancestor',
    p.profile.implementationBaseline,
    p.profile.integrationBaseline
  );
  git(
    'merge-base',
    '--is-ancestor',
    p.profile.scannerPolicy.producerCommit,
    p.profile.integrationBaseline
  );
  assert.equal(
    after.get(p.profile.scannerPolicy.configPath).blob,
    '0759a4da80412a04830bed3e7f5727d07cbdeb35'
  );
  assert.equal(
    after.get(p.profile.scannerPolicy.workflowPath).blob,
    'c7436fe742b7751b776eeb9ff82cd31f2508cb1a'
  );
  assert.equal(p.profile.scannerReview, null);
  assert.throws(() => p.verifyPublicationReview(), /pending/);
});

test('actual native pin candidate preserves the exact six source identity and generated selector transitions', () => {
  const git = (...args) => command(ROOT, args);
  assert.equal(
    git('rev-parse', p.profile.nativePinBaseline + '^{tree}').trim(),
    p.profile.nativePinTree
  );
  git(
    'merge-base',
    '--is-ancestor',
    p.profile.integrationBaseline,
    p.profile.nativePinBaseline
  );
  assert.equal(
    p.verifyNativePinTransitions(
      p.parseTree(git('ls-tree', '-rz', p.profile.integrationBaseline)),
      p.parseTree(git('ls-tree', '-rz', p.profile.nativePinBaseline)),
      p.profile.nativePinTransitions
    ).length,
    6
  );
  const historicalManifest = JSON.parse(
    git(
      'show',
      p.profile.nativePinBaseline +
        ':integrations/alpha-agent/vendor/alpha-computer/source-manifest.json'
    )
  );
  assert.equal(
    historicalManifest.commit,
    'dbaf5696d64ddcbf133f05d88d35496ebb85c3f0'
  );
  assert.equal(
    historicalManifest.tree,
    '30dc828703a6e9cd64103e0ebc965fc701e9bcf3'
  );
  assert.equal(p.profile.scannerReview, null);
});

test('converged storage and additive Python policy have exact finite source transitions', () => {
  const git = (...args) => command(ROOT, args);
  const native = p.parseTree(
    git('ls-tree', '-rz', p.profile.nativePinBaseline)
  );
  const converged = p.parseTree(
    git('ls-tree', '-rz', p.profile.sourceConvergenceBaseline)
  );
  const python = p.parseTree(
    git('ls-tree', '-rz', p.profile.pythonScannerBaseline)
  );
  assert.equal(
    p.verifySourceConvergenceTransitions(
      native,
      converged,
      p.profile.sourceConvergenceTransitions
    ).length,
    9
  );
  assert.equal(
    p.verifyPythonScannerTransitions(
      converged,
      python,
      p.profile.pythonScannerTransitions
    ).length,
    2
  );
  assert.equal(
    converged.get('shared/containedFiles.ts').blob,
    'd17e3090c9a28580eafc265fb4958d24910ca0ef'
  );
  assert.equal(
    converged.get(p.profile.scannerPolicy.workflowPath).blob,
    '7813a7c15e6d5637b44f731111c990a67ec0faaa'
  );
  assert.equal(p.profile.scannerRequiredPaths.length, 14);
  assert.equal(p.profile.pythonScannerReview, null);
});

test('final Alpha pin extends the reviewed extractor tree through exactly six identity files', () => {
  const git = (...args) => command(ROOT, args);
  const before = p.parseTree(
    git('ls-tree', '-rz', p.profile.javascriptExtractorBaseline)
  );
  const after = p.parseTree(git('ls-tree', '-rz', p.profile.alphaPinBaseline));
  assert.equal(
    git('rev-parse', p.profile.alphaPinBaseline + '^{tree}').trim(),
    p.profile.alphaPinTree
  );
  git(
    'merge-base',
    '--is-ancestor',
    p.profile.javascriptExtractorBaseline,
    p.profile.alphaPinBaseline
  );
  assert.equal(
    p.verifyNativePinTransitions(before, after, p.profile.alphaPinTransitions)
      .length,
    6
  );
  const manifest = JSON.parse(
    git(
      'show',
      p.profile.alphaPinBaseline +
        ':integrations/alpha-agent/vendor/alpha-computer/source-manifest.json'
    )
  );
  assert.equal(manifest.commit, p.profile.nativeCompatibility.commit);
  assert.equal(manifest.tree, p.profile.nativeCompatibility.tree);
  assert.equal(
    p.profile.nativeCompatibility.commit,
    'c6459bdfb509b10f0d757eb332775902a4bb04b7'
  );
  assert.equal(
    p.profile.nativeCompatibility.tree,
    'c25ac996e27eb317c795809f923431f9e4ab4933'
  );
  const nativeWorkflow = git(
    'show',
    'HEAD:.github/workflows/transformational-compatibility.yml'
  );
  const alphaCheckout =
    /repository: MontrealAI\/AGI-Alpha-Agent-v0\s+ref: ([a-f0-9]{40})/.exec(
      nativeWorkflow
    );
  assert.equal(alphaCheckout?.[1], p.profile.nativeCompatibility.commit);
  assert.equal(p.profile.scannerReview, null);
  assert.equal(p.profile.pythonScannerReview, null);
});

test('final JavaScript extractor anchor preserves exact policy and workflow admissions', () => {
  const git = (...args) => command(ROOT, args);
  const before = p.parseTree(
    git('ls-tree', '-rz', p.profile.pythonScannerBaseline)
  );
  const after = p.parseTree(
    git('ls-tree', '-rz', p.profile.javascriptExtractorBaseline)
  );
  assert.equal(
    git('rev-parse', p.profile.javascriptExtractorBaseline + '^{tree}').trim(),
    p.profile.javascriptExtractorTree
  );
  for (const baseline of [
    p.profile.pythonScannerBaseline,
    'c84d6de35bed10012615931c0f15ba8a7b931974',
    '27b654cfa2d02ddae5c9a0633f94461648bd0822',
  ])
    git(
      'merge-base',
      '--is-ancestor',
      baseline,
      p.profile.javascriptExtractorBaseline
    );
  assert.deepEqual(
    p.verifyJavaScriptExtractorTransitions(
      before,
      after,
      p.profile.javascriptExtractorTransitions
    ),
    p.profile.javascriptExtractorTransitions.map((item) => item.path).sort()
  );
  assert.equal(
    after.get(p.profile.scannerPolicy.configPath).blob,
    p.profile.scannerPolicy.configBlob
  );
  assert.equal(
    after.get(p.profile.scannerPolicy.workflowPath).blob,
    p.profile.scannerPolicy.workflowBlob
  );
  assert.equal(p.profile.javascriptExtractorTransitions.length, 7);
  const priorConfig = git(
    'show',
    p.profile.pythonScannerBaseline + ':' + p.profile.scannerPolicy.configPath
  );
  const finalConfig = git(
    'show',
    p.profile.javascriptExtractorBaseline +
      ':' +
      p.profile.scannerPolicy.configPath
  );
  assert.equal(finalConfig, priorConfig.replaceAll('"', "'"));
  assert.equal(
    crypto.createHash('sha256').update(finalConfig).digest('hex'),
    p.profile.scannerPolicy.configSha256
  );
  const finalWorkflow = git(
    'show',
    p.profile.javascriptExtractorBaseline +
      ':' +
      p.profile.scannerPolicy.workflowPath
  );
  assert.equal(
    finalWorkflow.match(/CODEQL_EXTRACTOR_JAVASCRIPT_ALLOW_MINIFIED_FILES/g)
      ?.length,
    1
  );
  assert.match(
    finalWorkflow,
    /CODEQL_EXTRACTOR_JAVASCRIPT_ALLOW_MINIFIED_FILES: ['"]true['"]/
  );
  assert.equal(
    crypto.createHash('sha256').update(finalWorkflow).digest('hex'),
    p.profile.scannerPolicy.workflowSha256
  );
  assert.equal(p.profile.scannerRequiredPaths.length, 14);
  assert.equal(p.profile.scannerReview, null);
  assert.equal(p.profile.pythonScannerReview, null);
});
