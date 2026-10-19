'use strict';

// This profile authenticates a finite pending candidate. It cannot qualify CI,
// scanner findings, a native release set, publication, or deployed contracts.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const integrationTransitionsSha256 =
  'd9e73a37a3c67d4ce2aa3bce429865fde81f5b167d75191a142ab3d79c68b82f';
const historical = require('./qualify-source-release.cjs');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const profile = freeze(require('./source-profile-rc16.json'));
const anchors = Object.freeze({
  compilerSourceBaseline: '3c17153942251116ee51163055eb1a25d652454b',
  evidenceBaseline: '9c730e0188594089e27ed0589c2b5ca57eec5cf5',
  deployedSourceBaseline: 'b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e',
  securityPrerequisite: '62d4f2db2b9eeddb6156b486336555b1e6485d92',
  implementationBaseline: 'b88965ef6e90bf6f725934520e9be3161e91af62',
  implementationTree: '6003d3d7286fe9fa4bf6875deefc01e579ce9dfc',
  integrationBaseline: 'b26a65456d5c06c901ba73d1e1620f7edb1a315a',
  integrationTree: 'f1f082a1af8375a7418d86556daeb65351757ad5',
  nativePinBaseline: 'd943e0b2384cad09b2918fe532fca50f5837e65f',
  nativePinTree: 'b279cfcbd53c814db48bb4ab997199ea7ca9269c',
});
const allowedNewPaths = Object.freeze([
  'scripts/release/source-profile-rc16.cjs',
  'scripts/release/source-profile-rc16.json',
  'scripts/release/qualify-source-release-rc16.cjs',
  'scripts/release/publish-source-release-rc16.cjs',
  'scripts/release/verify-transformational-compatibility.mjs',
  'test/scripts/source-profile-rc16.test.cjs',
  'test/scripts/source-release-rc16.test.cjs',
  'test/scripts/transformational-compatibility.test.mjs',
  '.github/workflows/source-release-rc16.yml',
  '.github/workflows/transformational-compatibility.yml',
  'scripts/release/source-native-gates-rc16.cjs',
  'scripts/release/source-native-evidence-rc16.cjs',
  'test/scripts/source-release-security-rc16-gate.test.cjs',
  'test/scripts/source-release-security-rc16-publish.test.cjs',
  'scripts/release/source-scanner-gates-rc16.cjs',
  'test/scripts/source-release-integrated-rc16.test.cjs',
  'docs/production/RELEASE_NOTES_SOURCE_RC16.md',
]);
const allowedExistingPaths = Object.freeze([
  '.github/workflows/source-release.yml',
  'package.json',
  'package-lock.json',
]);
// These two reviewed entry additions are authenticated by exact Git bytes,
// rather than granting an editable website or documentation path exception.
const websiteTransitions = freeze([
  {
    path: 'docs/successor/TRANSFORMATIONAL_WORK.md',
    before: {
      mode: '100644',
      blob: '19c3a3cdacc6a13713f5075eedba7236b5089e7c',
    },
    after: {
      mode: '100644',
      blob: 'c6c97f21058842b5e6513d2c1dfb1fe2287255d6',
    },
  },
  {
    path: 'scripts/pages/build.mjs',
    before: {
      mode: '100644',
      blob: '67bac0b86418db9605c8775081247d167d2b3a42',
    },
    after: {
      mode: '100644',
      blob: 'b2fad292e6ea9afc740ecf6c6ff595bcee12fc0e',
    },
  },
]);
const nativeCompatibility = freeze({
  schema: 'agijobsv0/transformational-native-compatibility/v1',
  repository: 'MontrealAI/AGI-Alpha-Agent-v0',
  commit: 'dbaf5696d64ddcbf133f05d88d35496ebb85c3f0',
  tree: '30dc828703a6e9cd64103e0ebc965fc701e9bcf3',
  fixturePath: 'examples/transformational-intelligence/campaign.json',
  boundary: 'free-inspection-positive-payment-refused',
  files: {
    'docs/assets/successor/engine.mjs':
      '38c4f38978bf9fc29f207bae3adee0755bc6530d04502a36c491cc430787e488',
    'examples/transformational-intelligence/campaign.json':
      'fa5f570e89c20cffd0df844869047a7c0594c5460c3e95df5ada44592ea4fd20',
    'examples/transformational-intelligence/inspector.mjs':
      'b5f8e704aaab345f9d6503c854d38910ddfabbf98fe674c48b051097812b07f4',
  },
});
const scannerPolicy = freeze({
  producerCommit: 'b26a65456d5c06c901ba73d1e1620f7edb1a315a',
  producerTree: 'f1f082a1af8375a7418d86556daeb65351757ad5',
  historicalConfigPath: '.github/codeql/config.yml',
  historicalConfigSha256:
    '4b34450e1dcc0b489feea158d642a6b66261d9e935463928782219c8716c0892',
  configPath: '.github/codeql/config-integrations.yml',
  configSha256:
    '18041680f9d2df3706e45bdf04e785457ee27573312998b999f51e893e7b59bb',
  configBlob: '0759a4da80412a04830bed3e7f5727d07cbdeb35',
  workflowPath: '.github/workflows/static-analysis.yml',
  workflowSha256:
    'c63eb465e33b49be07c812ec1d40c21b8c3f04c5e994bc9b687d75e1d01f6c35',
  workflowBlob: 'a86b7fa495620d9dbac4f5ff4c5c5cbd8c8fe53e',
  archiveFiles: [
    'javascript.sarif',
    'source-extraction.json',
    'source-scope-after.json',
    'source-scope-before.json',
  ],
});
const scannerReceiverPaths = Object.freeze([
  'integrations/alpha-agent/four-repo-computer-lifecycle.cjs',
  'integrations/alpha-agent/four-repo-computer-receipt.mjs',
  'integrations/alpha-agent/pinned-alpha-checkout.cjs',
  'integrations/alpha-agent/transformational-work-request.mjs',
  'integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs',
  'website/assets/computer-receipt.mjs',
  'website/assets/computer-receipt-model.mjs',
  'website/assets/computer-receipt-copy.mjs',
  'website/assets/computer-desk.mjs',
  'website/assets/computer-desk-runtime-source.mjs',
  'website/assets/computer-mission.js',
  'website/assets/computer-mission-copy.mjs',
]);
const scannerRequiredPaths = Object.freeze([
  'integrations/alpha-agent/four-repo-computer-lifecycle.cjs',
  'integrations/alpha-agent/four-repo-computer-receipt.mjs',
  'integrations/alpha-agent/pinned-alpha-checkout.cjs',
  'integrations/alpha-agent/transformational-work-request.mjs',
  'integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs',
  'scripts/pages/build.mjs',
  'scripts/release/qualify-source-release-rc16.cjs',
  'scripts/release/publish-source-release-rc16.cjs',
  'scripts/release/source-profile-rc16.cjs',
  'scripts/release/source-native-gates-rc16.cjs',
  'scripts/release/source-native-evidence-rc16.cjs',
  'scripts/release/verify-transformational-compatibility.mjs',
  'website/assets/computer-receipt.mjs',
  'website/assets/computer-receipt-model.mjs',
  'website/assets/computer-receipt-copy.mjs',
  'website/assets/computer-desk.mjs',
  'website/assets/computer-desk-runtime-source.mjs',
  'website/assets/computer-mission.js',
  'website/assets/computer-mission-copy.mjs',
  'scripts/release/source-scanner-gates-rc16.cjs',
]);
const excludedCompilerPaths = new Set(
  historical.reviewedCompilerPaths
    .filter((name) => name.startsWith(':(exclude)'))
    .map((name) => name.slice(':(exclude)'.length))
);
const compilerPaths = historical.reviewedCompilerPaths.filter(
  (name) => !name.startsWith(':')
);
const protectedPath = (name) =>
  !excludedCompilerPaths.has(name) &&
  compilerPaths.some((item) =>
    item.endsWith('/') ? name.startsWith(item) : name === item
  );
const text = (value) =>
  Buffer.isBuffer(value) ? value.toString('utf8') : value;
const same = (left, right) => {
  try {
    assert.deepStrictEqual(left, right);
    return true;
  } catch {
    return false;
  }
};
function requireValue(ok, message) {
  if (!ok) throw Error(message);
}
function fields(value, expected, message) {
  requireValue(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      same(Object.keys(value).sort(), [...expected].sort()),
    message
  );
}

function parseTree(raw) {
  const result = new Map();
  for (const row of text(raw).split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)$/.exec(row);
    requireValue(
      match &&
        !result.has(match[3]) &&
        !match[3]
          .split('/')
          .some((part) => !part || part === '.' || part === '..') &&
        !/[\\\r\n]/.test(match[3]),
      'Unexpected or duplicate source tree entry'
    );
    result.set(match[3], { mode: match[1], blob: match[2] });
  }
  return result;
}
function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .filter((name) => !same(before.get(name) ?? null, after.get(name) ?? null));
}

/** Validate the complete actual tree delta, including additions and deletions. */
function verifyProtectedTransitions(beforeTree, afterTree, transitions) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      Array.isArray(transitions),
    'Protected transition inputs must be complete tree maps'
  );
  const seen = new Set();
  for (const item of transitions) {
    fields(item, ['path', 'before', 'after'], 'Malformed protected transition');
    requireValue(
      typeof item.path === 'string' &&
        protectedPath(item.path) &&
        !seen.has(item.path),
      'Unexpected or duplicate protected transition'
    );
    seen.add(item.path);
    for (const identity of [item.before, item.after]) {
      if (identity === null) continue;
      fields(identity, ['mode', 'blob'], 'Malformed protected blob identity');
      requireValue(
        ['100644', '100755'].includes(identity.mode) &&
          /^[a-f0-9]{40}$/.test(identity.blob),
        'Invalid protected blob identity'
      );
    }
    requireValue(
      item.after !== null &&
        !same(item.before, item.after) &&
        (item.before === null || item.before.mode === item.after.mode),
      'Protected deletion, unchanged transition or mode change is prohibited'
    );
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed protected blob differs: ' + item.path
    );
  }
  const actual = changedPaths(beforeTree, afterTree).filter(protectedPath);
  requireValue(
    same(actual, [...seen].sort()),
    'Complete protected transition inventory differs'
  );
  return actual;
}

function verifyWebsiteTransitions(
  beforeTree,
  afterTree,
  transitions = profile.websiteTransitions
) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      same(transitions, websiteTransitions),
    'Exact reviewed website transition inventory differs'
  );
  for (const item of websiteTransitions)
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed website blob or mode differs: ' + item.path
    );
  return websiteTransitions.map((item) => item.path);
}

function verifyIntegrationTransitions(
  beforeTree,
  afterTree,
  transitions = profile.integrationTransitions
) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      Array.isArray(transitions) &&
      createHash('sha256').update(JSON.stringify(transitions)).digest('hex') ===
        integrationTransitionsSha256,
    'Exact reviewed integration transition inventory differs'
  );
  for (const item of transitions) {
    requireValue(
      !protectedPath(item.path),
      'Protected implementation change cannot become an integration exception'
    );
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed integration blob or mode differs: ' + item.path
    );
  }
  return transitions.map((item) => item.path);
}

function verifyReleaseDelta(beforeTree, afterTree) {
  const websitePaths = verifyWebsiteTransitions(beforeTree, afterTree);
  const integrationPaths = verifyIntegrationTransitions(beforeTree, afterTree);
  const changes = changedPaths(beforeTree, afterTree);
  for (const name of changes) {
    const before = beforeTree.get(name),
      after = afterTree.get(name);
    if (allowedNewPaths.includes(name))
      requireValue(
        !before && after?.mode === '100644',
        'Release addition is not a new regular file: ' + name
      );
    else if (!websitePaths.includes(name) && !integrationPaths.includes(name)) {
      requireValue(
        allowedExistingPaths.includes(name),
        'Unexpected implementation-to-release change: ' + name
      );
      requireValue(
        before && after && before.mode === after.mode,
        'Existing release path removed or mode changed: ' + name
      );
    }
  }
  return changes;
}

function verifyVersionOnly(beforePackage, afterPackage, beforeLock, afterLock) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  requireValue(
    beforePackage?.version === profile.previousVersion &&
      beforeLock?.version === profile.previousVersion &&
      beforeLock?.packages?.['']?.version === profile.previousVersion,
    'Previous package or lock version differs'
  );
  requireValue(
    afterPackage?.version === profile.releaseVersion &&
      afterLock?.version === profile.releaseVersion &&
      afterLock?.packages?.['']?.version === profile.releaseVersion,
    'rc.16 package or lock version differs'
  );
  const normalizedPackage = clone(afterPackage),
    normalizedLock = clone(afterLock);
  normalizedPackage.version = profile.previousVersion;
  normalizedLock.version = normalizedLock.packages[''].version =
    profile.previousVersion;
  requireValue(
    same(beforePackage, normalizedPackage) && same(beforeLock, normalizedLock),
    'Package or lock changed beyond software version fields'
  );
  return true;
}

// These exact additions select the historical policy without altering any of
// its tests, producer commands, permissions, asset checks or immutable tag.
const LEGACY_WORKFLOW_GUARD = Object.freeze({
  outputs:
    '    outputs:\n      selected: ${{ steps.release-version.outputs.selected }}\n',
  selection:
    "      - name: Select historical rc.15 source version\n        id: release-version\n        run: node -e \"require('node:fs').appendFileSync(process.env.GITHUB_OUTPUT, 'selected=' + (require('./package.json').version === '2.1.0-rc.15') + '\\n')\"\n",
  test: "      - if: steps.release-version.outputs.selected == 'true'\n        run: node --test test/scripts/source-release-gate.test.cjs test/scripts/source-release-publish.test.cjs",
  publish: " && needs.validate.outputs.selected == 'true'",
});
function applyLegacyWorkflowGuard(before) {
  const replace = (source, needle, replacement) => {
    requireValue(
      source.split(needle).length === 2,
      'Historical workflow anchor differs'
    );
    return source.replace(needle, replacement);
  };
  let expected = replace(
    before,
    '    timeout-minutes: 5\n    steps:\n',
    '    timeout-minutes: 5\n' + LEGACY_WORKFLOW_GUARD.outputs + '    steps:\n'
  );
  expected = replace(
    expected,
    '      - run: node --test test/scripts/source-release-gate.test.cjs test/scripts/source-release-publish.test.cjs',
    LEGACY_WORKFLOW_GUARD.selection + LEGACY_WORKFLOW_GUARD.test
  );
  const condition =
    "    if: github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'MontrealAI/AGIJobsv0'";
  return replace(
    expected,
    condition + '\n',
    condition + LEGACY_WORKFLOW_GUARD.publish + '\n'
  );
}
function verifyLegacyWorkflow(before, after) {
  requireValue(
    after === applyLegacyWorkflowGuard(before),
    'Historical rc.15 workflow changed beyond version selection'
  );
  return true;
}

function validateProfile(value = profile) {
  fields(
    value,
    [
      'schema',
      'repository',
      'releaseVersion',
      'previousVersion',
      'tag',
      'qualification',
      ...Object.keys(anchors),
      'transitions',
      'websiteTransitions',
      'integrationTransitions',
      'nativeCompatibility',
      'scannerRequiredPaths',
      'scannerReceiverPaths',
      'scannerPolicy',
      'scannerReview',
    ],
    'rc.16 profile fields differ'
  );
  requireValue(
    value.schema === 'agijobsv0/source-release-profile/v1' &&
      value.repository === 'MontrealAI/AGIJobsv0' &&
      value.releaseVersion === '2.1.0-rc.16' &&
      value.previousVersion === '2.1.0-rc.15' &&
      value.tag === 'source-v2.1.0-rc.16' &&
      value.qualification === 'PENDING_FINAL_SOURCE_MAIN_PUSH',
    'rc.16 profile identity or pending status differs'
  );
  for (const [name, expected] of Object.entries(anchors))
    requireValue(
      value[name] === expected,
      'rc.16 immutable baseline differs: ' + name
    );
  requireValue(
    Array.isArray(value.transitions) && value.transitions.length === 18,
    'Exactly eighteen protected implementation transitions are required'
  );
  requireValue(
    Array.isArray(value.integrationTransitions) &&
      createHash('sha256')
        .update(JSON.stringify(value.integrationTransitions))
        .digest('hex') === integrationTransitionsSha256,
    'Exact reviewed integration transition inventory differs'
  );
  requireValue(
    same(value.websiteTransitions, websiteTransitions),
    'Exact reviewed website transition inventory differs'
  );
  requireValue(
    same(value.scannerPolicy, scannerPolicy) &&
      same(value.scannerReceiverPaths, scannerReceiverPaths) &&
      same(value.nativeCompatibility, nativeCompatibility) &&
      same(value.scannerRequiredPaths, scannerRequiredPaths) &&
      value.scannerReview === null,
    'Pending native or scanner policy differs; a separately reviewed gate update is required'
  );
  return value;
}

function verifySourceScope({ git, sha, version, lock, policy }) {
  validateProfile();
  requireValue(
    typeof git === 'function' &&
      /^[a-f0-9]{40}$/.test(sha ?? '') &&
      version === profile.releaseVersion,
    'Invalid rc.16 source identity or version'
  );
  const readJSON = (ref, name) =>
    JSON.parse(text(git('show', `${ref}:${name}`)));
  for (const baseline of [
    profile.deployedSourceBaseline,
    profile.evidenceBaseline,
    profile.compilerSourceBaseline,
    profile.securityPrerequisite,
    profile.implementationBaseline,
    profile.integrationBaseline,
    profile.nativePinBaseline,
  ])
    git('merge-base', '--is-ancestor', baseline, sha);
  requireValue(
    text(
      git('rev-parse', `${profile.implementationBaseline}^{tree}`)
    ).trim() === profile.implementationTree,
    'Candidate implementation tree differs'
  );
  requireValue(
    text(git('rev-parse', `${profile.integrationBaseline}^{tree}`)).trim() ===
      profile.integrationTree,
    'Reviewed integration tree differs'
  );
  git(
    'merge-base',
    '--is-ancestor',
    profile.securityPrerequisite,
    profile.implementationBaseline
  );
  git(
    'diff',
    '--exit-code',
    profile.evidenceBaseline,
    sha,
    '--',
    ...historical.preservedEvidencePaths
  );
  const compiler = readJSON(
    profile.implementationBaseline,
    'config/solidity-compiler.json'
  );
  requireValue(
    compiler.version === '0.8.37' &&
      compiler.longVersion === '0.8.37+commit.f401782d' &&
      compiler.evmVersion === 'cancun' &&
      compiler.optimizerRuns === 200 &&
      compiler.viaIR === true &&
      same(policy, compiler) &&
      same(readJSON(sha, 'config/solidity-compiler.json'), compiler),
    'Reviewed compiler policy differs'
  );
  const baselineTree = parseTree(
    git('ls-tree', '-rz', profile.compilerSourceBaseline)
  );
  const implementationTree = parseTree(
    git('ls-tree', '-rz', profile.implementationBaseline)
  );
  const releaseTree = parseTree(git('ls-tree', '-rz', sha));
  verifyProtectedTransitions(
    baselineTree,
    implementationTree,
    profile.transitions
  );
  requireValue(
    text(git('rev-parse', `${profile.nativePinBaseline}^{tree}`)).trim() ===
      profile.nativePinTree,
    'Reviewed native pin tree differs'
  );
  for (const [name, blob] of [
    [scannerPolicy.configPath, scannerPolicy.configBlob],
    [scannerPolicy.workflowPath, scannerPolicy.workflowBlob],
  ])
    requireValue(
      releaseTree.get(name)?.mode === '100644' &&
        releaseTree.get(name)?.blob === blob,
      'Reviewed scanner producer blob differs: ' + name
    );
  const releaseChanges = verifyReleaseDelta(implementationTree, releaseTree);
  const afterPackage = readJSON(sha, 'package.json'),
    afterLock = readJSON(sha, 'package-lock.json');
  verifyVersionOnly(
    readJSON(profile.implementationBaseline, 'package.json'),
    afterPackage,
    readJSON(profile.implementationBaseline, 'package-lock.json'),
    afterLock
  );
  requireValue(
    afterPackage.version === version && same(afterLock, lock),
    'Supplied package/lock identity differs from release Git bytes'
  );
  verifyLegacyWorkflow(
    text(
      git(
        'show',
        `${profile.implementationBaseline}:.github/workflows/source-release.yml`
      )
    ),
    text(git('show', `${sha}:.github/workflows/source-release.yml`))
  );
  return {
    ...anchors,
    releaseVersion: profile.releaseVersion,
    qualification: profile.qualification,
    preservedEvidencePaths: historical.preservedEvidencePaths,
    reviewedCompilerPaths: historical.reviewedCompilerPaths,
    compiler: compiler.longVersion,
    protectedTransitions: profile.transitions,
    websiteTransitions: profile.websiteTransitions,
    integrationTransitions: profile.integrationTransitions,
    releaseChanges,
    nativeCompatibility: profile.nativeCompatibility,
    scannerRequiredPaths: profile.scannerRequiredPaths,
    scannerReceiverPaths: profile.scannerReceiverPaths,
    scannerPolicy: profile.scannerPolicy,
    scannerReview: null,
    productionApproved: false,
  };
}

function verifyPublicationReview() {
  // The additive producer is preserved, but authentic final-source extraction
  // and its finite independently reviewed result inventory are still pending.
  throw Error(
    'rc.16 publication blocked: scannerReview is pending; full integration extraction and independent finite result review are required'
  );
}

module.exports = {
  profile,
  anchors,
  allowedNewPaths,
  allowedExistingPaths,
  websiteTransitions,
  protectedPath,
  parseTree,
  verifyProtectedTransitions,
  verifyWebsiteTransitions,
  verifyIntegrationTransitions,
  verifyReleaseDelta,
  verifyVersionOnly,
  LEGACY_WORKFLOW_GUARD,
  applyLegacyWorkflowGuard,
  verifyLegacyWorkflow,
  validateProfile,
  verifySourceScope,
  verifyPublicationReview,
};
