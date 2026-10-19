'use strict';

// This profile authenticates a finite pending candidate. It cannot qualify CI,
// scanner findings, a native release set, publication, or deployed contracts.
const assert = require('node:assert/strict');
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
  integrationBaseline: 'b1e03ef48f517054802a513f0302ef06d285f17a',
  integrationTree: '9fd2d43a5075ed54b308ff381da92cb402d26319',
  nativePinBaseline: '38a96554bb0932ff343c27c99bd397b372e4212c',
  nativePinTree: 'ae407c07b079174b45fe10697015de8ab132118b',
  sourceConvergenceBaseline: 'fb5d3603479906830e4f207cc25c9f2499c429d2',
  sourceConvergenceTree: 'a57568af67ae780f2d9851e0569473f62a80da90',
  pythonScannerBaseline: 'ce08a583391e563566a0eaec6f89da3190c319db',
  pythonScannerTree: 'da44eb275fae8d01bd471fe2efef4a36982fc9d3',
  javascriptExtractorBaseline: 'fdfd8155f2fa7f11625556f75251c233823c492f',
  javascriptExtractorTree: '34e4cbbc18bf127b4fbb3a9641969012b732f4d9',
});
const allowedNewPaths = Object.freeze([
  'scripts/release/source-profile-rc16.cjs',
  'scripts/release/source-profile-rc16.json',
  'scripts/release/qualify-source-release-rc16.cjs',
  'scripts/release/publish-source-release-rc16.cjs',
  'scripts/release/verify-transformational-compatibility.mjs',
  'scripts/release/python-scanner-rc16.cjs',
  'test/scripts/source-python-scanner-rc16.test.cjs',
  'test/scripts/source-profile-rc16.test.cjs',
  'test/scripts/source-release-rc16.test.cjs',
  'test/scripts/transformational-compatibility.test.mjs',
  '.github/workflows/source-release-rc16.yml',
  '.github/workflows/transformational-compatibility.yml',
  'docs/production/RELEASE_NOTES_SOURCE_RC16.md',
]);
const allowedExistingPaths = Object.freeze([
  '.github/workflows/source-release.yml',
  'package.json',
  'package-lock.json',
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
const scannerRequiredPaths = Object.freeze([
  'integrations/alpha-agent/four-repo-computer-lifecycle.cjs',
  'integrations/alpha-agent/four-repo-computer-receipt.mjs',
  'integrations/alpha-agent/pinned-alpha-checkout.cjs',
  'integrations/alpha-agent/transformational-work-request.mjs',
  'integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/computer.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/docs/assets/successor/engine.mjs',
  'website/assets/computer-receipt.mjs',
  'website/assets/computer-receipt-model.mjs',
  'website/assets/computer-receipt-copy.mjs',
  'website/assets/computer-desk.mjs',
  'website/assets/computer-desk-runtime-source.mjs',
  'website/assets/computer-mission.js',
  'website/assets/computer-mission-copy.mjs',
]);
const scannerPolicy = freeze({
  producerCommit: '838eb65c5b78ef8af271a442bd49136c9b86c38e',
  producerTree: 'dba1dbde98996700c4460336e837d94c332bffa2',
  historicalConfigPath: '.github/codeql/config.yml',
  historicalConfigSha256:
    '4b34450e1dcc0b489feea158d642a6b66261d9e935463928782219c8716c0892',
  configPath: '.github/codeql/config-integrations.yml',
  configSha256:
    '07d7be878097a38520bcf09147b62c75064cb3d707317ad34e028c1f46ba8155',
  configBlob: '4533ce4d7f681a6230399e25fb1d1f736c84b25b',
  workflowPath: '.github/workflows/static-analysis.yml',
  workflowSha256:
    '2b4228cdcaeb5e57730818958329d15a357028dec7e77c83a4f38b9fb0609da4',
  workflowBlob: 'ba3056630cae4131292764ba313ea7bd9678bd25',
  archiveFiles: [
    'javascript.sarif',
    'source-extraction.json',
    'source-scope-after.json',
    'source-scope-before.json',
  ],
});
const integrationPaths = Object.freeze([
  '.github/codeql/config-integrations.yml',
  '.github/workflows/static-analysis.yml',
  'integrations/alpha-agent/four-repo-computer-lifecycle.cjs',
  'integrations/alpha-agent/generate-computer-source.mjs',
  'integrations/alpha-agent/pinned-alpha-checkout.cjs',
  'integrations/alpha-agent/README.md',
  'integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/learning.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/research.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/source-identity.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/source-manifest.json',
  'scripts/pages/computer-receipt-qa.mjs',
  'scripts/pages/computer-receipt.mjs',
  'scripts/pages/run-computer-receipt-qa.mjs',
  'test/pages/computer-receipt-fixture.mjs',
  'test/pages/computer-receipt-workspace.test.mjs',
  'test/pages/four-repo-alpha-source.test.mjs',
  'website/assets/computer-receipt-copy.mjs',
  'website/assets/computer-receipt-model.mjs',
  'website/assets/computer-receipt.mjs',
]);
const nativePinPaths = Object.freeze([
  '.github/workflows/successor-computer.yml',
  'integrations/alpha-agent/project-native-source.mjs',
  'integrations/alpha-agent/project-source-selector.mjs',
  'integrations/alpha-agent/successor-computer-mission-lab.py',
  'integrations/alpha-agent/vendor/alpha-computer/source-identity.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/source-manifest.json',
]);
const sourceConvergencePaths = Object.freeze([
  '.github/workflows/apps-images.yml',
  '.github/workflows/contracts.yml',
  '.github/workflows/culture-ci.yml',
  '.github/workflows/escrow-replay-regression.yml',
  '.github/workflows/pages.yml',
  '.github/workflows/static-analysis.yml',
  'docs/security/remediation-2026-10-19/README.md',
  'shared/containedFiles.ts',
  'test/security/inherited-codeql.test.cjs',
]);
const pythonScannerPaths = Object.freeze([
  '.github/codeql/config-python-integrations.yml',
  '.github/workflows/static-analysis-python-integrations.yml',
]);
const javascriptExtractorPaths = Object.freeze([
  '.github/codeql/config-integrations.yml',
  '.github/workflows/apps-images.yml',
  '.github/workflows/contracts.yml',
  '.github/workflows/culture-ci.yml',
  '.github/workflows/escrow-replay-regression.yml',
  '.github/workflows/pages.yml',
  '.github/workflows/static-analysis.yml',
]);
const pythonScannerPolicy = freeze({
  producerCommit: 'ce08a583391e563566a0eaec6f89da3190c319db',
  producerTree: 'da44eb275fae8d01bd471fe2efef4a36982fc9d3',
  configPath: '.github/codeql/config-python-integrations.yml',
  configSha256:
    'eb5b425facefb419987bf537280d5144a477b65a205ccd71df3866b60b01e560',
  configBlob: 'cdd0d5a0a1a0e691c3367bc5ce4429215f41381d',
  workflowPath: '.github/workflows/static-analysis-python-integrations.yml',
  workflowSha256:
    '52a2c3176448aa61699bf468fd1d864dde693259f1c97622d47cb88085f25f82',
  workflowBlob: 'bfc677ed09b794c14a9bac11af68eea403a3e25b',
  archiveFiles: [
    'python.sarif',
    'source-extraction.json',
    'source-scope-after.json',
    'source-scope-before.json',
  ],
});
const pythonScannerRequiredPaths = Object.freeze([
  'integrations/alpha-agent/successor-computer-mission-lab.py',
  'integrations/alpha-agent/successor-computer-worker-launch.py',
  'integrations/alpha-agent/successor-frontier-mission-lab.py',
  'integrations/alpha-agent/supplier-adapter-lab.py',
  'integrations/alpha-agent/supplier-browser-lab.py',
  'integrations/alpha-agent/supplier_browser_lab_support.py',
  'integrations/alpha-agent/supplier_node_guard.py',
  'integrations/alpha-agent/supplier_proof_guard.py',
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

function verifyIntegrationTransitions(beforeTree, afterTree, transitions) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      Array.isArray(transitions) &&
      same(
        transitions.map((item) => item.path).sort(),
        [...integrationPaths].sort()
      ),
    'Complete finite integration transition paths differ'
  );
  for (const item of transitions) {
    fields(
      item,
      ['path', 'before', 'after'],
      'Malformed integration transition'
    );
    for (const identity of [item.before, item.after]) {
      if (identity === null) continue;
      fields(identity, ['mode', 'blob'], 'Malformed integration blob identity');
      requireValue(
        identity.mode === '100644' && /^[a-f0-9]{40}$/.test(identity.blob),
        'Integration source must retain reviewed regular blob modes'
      );
    }
    requireValue(
      item.after !== null &&
        !same(item.before, item.after) &&
        (item.before === null || item.before.mode === item.after.mode),
      'Integration deletion, unchanged transition or mode change is prohibited'
    );
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed integration blob differs: ' + item.path
    );
  }
  requireValue(
    same(changedPaths(beforeTree, afterTree), [...integrationPaths].sort()),
    'Complete integration transition inventory differs'
  );
  return [...integrationPaths].sort();
}

function verifyNativePinTransitions(beforeTree, afterTree, transitions) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      Array.isArray(transitions) &&
      same(
        transitions.map((item) => item.path).sort(),
        [...nativePinPaths].sort()
      ),
    'Complete finite native pin transition paths differ'
  );
  for (const item of transitions) {
    fields(
      item,
      ['path', 'before', 'after'],
      'Malformed native pin transition'
    );
    for (const identity of [item.before, item.after]) {
      if (identity === null) continue;
      fields(identity, ['mode', 'blob'], 'Malformed native pin blob identity');
      requireValue(
        identity.mode === '100644' && /^[a-f0-9]{40}$/.test(identity.blob),
        'Native pin source must retain reviewed regular blob modes'
      );
    }
    requireValue(
      item.after !== null &&
        !same(item.before, item.after) &&
        (item.before === null || item.before.mode === item.after.mode),
      'Native pin deletion, unchanged transition or mode change is prohibited'
    );
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed native pin blob differs: ' + item.path
    );
  }
  requireValue(
    same(changedPaths(beforeTree, afterTree), [...nativePinPaths].sort()),
    'Complete native pin transition inventory differs'
  );
  return [...nativePinPaths].sort();
}

function verifySourceConvergenceTransitions(
  beforeTree,
  afterTree,
  transitions
) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      Array.isArray(transitions) &&
      same(
        transitions.map((item) => item.path).sort(),
        [...sourceConvergencePaths].sort()
      ),
    'Complete finite source convergence transition paths differ'
  );
  for (const item of transitions) {
    fields(
      item,
      ['path', 'before', 'after'],
      'Malformed source convergence transition'
    );
    for (const identity of [item.before, item.after]) {
      if (identity === null) continue;
      fields(
        identity,
        ['mode', 'blob'],
        'Malformed source convergence blob identity'
      );
      requireValue(
        identity.mode === '100644' && /^[a-f0-9]{40}$/.test(identity.blob),
        'Source convergence source must retain reviewed regular blob modes'
      );
    }
    requireValue(
      item.after !== null &&
        !same(item.before, item.after) &&
        (item.before === null || item.before.mode === item.after.mode),
      'Source convergence deletion, unchanged transition or mode change is prohibited'
    );
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed source convergence blob differs: ' + item.path
    );
  }
  requireValue(
    same(
      changedPaths(beforeTree, afterTree),
      [...sourceConvergencePaths].sort()
    ),
    'Complete source convergence transition inventory differs'
  );
  return [...sourceConvergencePaths].sort();
}

function verifyPythonScannerTransitions(beforeTree, afterTree, transitions) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      Array.isArray(transitions) &&
      same(
        transitions.map((item) => item.path).sort(),
        [...pythonScannerPaths].sort()
      ),
    'Complete finite Python scanner transition paths differ'
  );
  for (const item of transitions) {
    fields(
      item,
      ['path', 'before', 'after'],
      'Malformed Python scanner transition'
    );
    for (const identity of [item.before, item.after]) {
      if (identity === null) continue;
      fields(
        identity,
        ['mode', 'blob'],
        'Malformed Python scanner blob identity'
      );
      requireValue(
        identity.mode === '100644' && /^[a-f0-9]{40}$/.test(identity.blob),
        'Python scanner source must retain reviewed regular blob modes'
      );
    }
    requireValue(
      item.after !== null &&
        !same(item.before, item.after) &&
        (item.before === null || item.before.mode === item.after.mode),
      'Python scanner deletion, unchanged transition or mode change is prohibited'
    );
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed Python scanner blob differs: ' + item.path
    );
  }
  requireValue(
    same(changedPaths(beforeTree, afterTree), [...pythonScannerPaths].sort()),
    'Complete Python scanner transition inventory differs'
  );
  return [...pythonScannerPaths].sort();
}

function verifyJavaScriptExtractorTransitions(
  beforeTree,
  afterTree,
  transitions
) {
  requireValue(
    beforeTree instanceof Map &&
      afterTree instanceof Map &&
      Array.isArray(transitions) &&
      same(
        transitions.map((item) => item.path).sort(),
        [...javascriptExtractorPaths].sort()
      ),
    'Complete finite JavaScript extractor transition paths differ'
  );
  for (const item of transitions) {
    fields(
      item,
      ['path', 'before', 'after'],
      'Malformed JavaScript extractor transition'
    );
    for (const identity of [item.before, item.after]) {
      fields(
        identity,
        ['mode', 'blob'],
        'Malformed JavaScript extractor blob identity'
      );
      requireValue(
        identity.mode === '100644' && /^[a-f0-9]{40}$/.test(identity.blob),
        'JavaScript extractor source must retain its regular blob modes'
      );
    }
    requireValue(
      !same(item.before, item.after) &&
        same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Reviewed JavaScript extractor blob differs: ' + item.path
    );
  }
  requireValue(
    same(
      changedPaths(beforeTree, afterTree),
      [...javascriptExtractorPaths].sort()
    ),
    'Complete JavaScript extractor transition inventory differs'
  );
  return [...javascriptExtractorPaths].sort();
}

function verifyReleaseDelta(beforeTree, afterTree) {
  const changes = changedPaths(beforeTree, afterTree);
  for (const name of changes) {
    const before = beforeTree.get(name),
      after = afterTree.get(name);
    if (allowedNewPaths.includes(name))
      requireValue(
        !before && after?.mode === '100644',
        'Release addition is not a new regular file: ' + name
      );
    else {
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

function validateProfile(value = profile, { git, target } = {}) {
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
      'integrationTransitions',
      'nativePinTransitions',
      'sourceConvergenceTransitions',
      'pythonScannerTransitions',
      'javascriptExtractorTransitions',
      'pythonScannerPolicy',
      'pythonScannerRequiredPaths',
      'pythonScannerReview',
      'nativeCompatibility',
      'scannerPolicy',
      'scannerRequiredPaths',
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
      value.integrationTransitions.length === 19 &&
      Array.isArray(value.nativePinTransitions) &&
      value.nativePinTransitions.length === 6 &&
      Array.isArray(value.sourceConvergenceTransitions) &&
      value.sourceConvergenceTransitions.length === 9 &&
      Array.isArray(value.pythonScannerTransitions) &&
      value.pythonScannerTransitions.length === 2 &&
      Array.isArray(value.javascriptExtractorTransitions) &&
      value.javascriptExtractorTransitions.length === 7 &&
      same(value.pythonScannerPolicy, pythonScannerPolicy) &&
      same(value.pythonScannerRequiredPaths, pythonScannerRequiredPaths) &&
      same(value.scannerPolicy, scannerPolicy) &&
      same(value.nativeCompatibility, nativeCompatibility) &&
      same(value.scannerRequiredPaths, scannerRequiredPaths),
    'Pending native or scanner policy differs; a separately reviewed gate update is required'
  );
  for (const field of ['scannerReview', 'pythonScannerReview']) {
    if (value[field] === null) continue;
    requireValue(
      typeof git === 'function' && /^[a-f0-9]{40}$/.test(target || ''),
      'Installed scanner reviews require immutable final Git source'
    );
    // Load after module initialization: the qualifier imports this profile.
    const {
      validateScannerReviewMetadata,
    } = require('./qualify-source-release-rc16.cjs');
    validateScannerReviewMetadata(field, value[field], { git, target });
  }
  return value;
}

function bindInstalledScannerReviews(value, { git, target }) {
  for (const field of ['scannerReview', 'pythonScannerReview']) {
    if (value[field] === null) continue;
    const {
      verifyScannerReviewInstallBinding,
    } = require('./qualify-source-release-rc16.cjs');
    verifyScannerReviewInstallBinding({
      sha: target,
      review: value[field],
      git,
      field,
    });
  }
}

function verifySourceScope({ git, sha, version, lock, policy }) {
  validateProfile(profile, { git, target: sha });
  requireValue(
    typeof git === 'function' &&
      /^[a-f0-9]{40}$/.test(sha ?? '') &&
      version === profile.releaseVersion,
    'Invalid rc.16 source identity or version'
  );
  bindInstalledScannerReviews(profile, { git, target: sha });
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
    profile.sourceConvergenceBaseline,
    profile.pythonScannerBaseline,
    profile.javascriptExtractorBaseline,
  ])
    git('merge-base', '--is-ancestor', baseline, sha);
  requireValue(
    text(
      git('rev-parse', `${profile.implementationBaseline}^{tree}`)
    ).trim() === profile.implementationTree,
    'Candidate implementation tree differs'
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
  const integrationTree = parseTree(
    git('ls-tree', '-rz', profile.integrationBaseline)
  );
  const nativePinTree = parseTree(
    git('ls-tree', '-rz', profile.nativePinBaseline)
  );
  const sourceConvergenceTree = parseTree(
    git('ls-tree', '-rz', profile.sourceConvergenceBaseline)
  );
  const pythonScannerTree = parseTree(
    git('ls-tree', '-rz', profile.pythonScannerBaseline)
  );
  const javascriptExtractorTree = parseTree(
    git('ls-tree', '-rz', profile.javascriptExtractorBaseline)
  );
  const releaseTree = parseTree(git('ls-tree', '-rz', sha));
  verifyProtectedTransitions(
    baselineTree,
    implementationTree,
    profile.transitions
  );
  requireValue(
    text(git('rev-parse', profile.integrationBaseline + '^{tree}')).trim() ===
      profile.integrationTree,
    'Integrated candidate tree differs'
  );
  git(
    'merge-base',
    '--is-ancestor',
    profile.implementationBaseline,
    profile.integrationBaseline
  );
  git(
    'merge-base',
    '--is-ancestor',
    scannerPolicy.producerCommit,
    profile.integrationBaseline
  );
  requireValue(
    text(git('rev-parse', scannerPolicy.producerCommit + '^{tree}')).trim() ===
      scannerPolicy.producerTree,
    'Reviewed scanner producer tree differs'
  );
  verifyIntegrationTransitions(
    implementationTree,
    integrationTree,
    profile.integrationTransitions
  );
  for (const [name, blob] of [
    [scannerPolicy.configPath, scannerPolicy.configBlob],
    [scannerPolicy.workflowPath, scannerPolicy.workflowBlob],
  ])
    requireValue(
      javascriptExtractorTree.get(name)?.mode === '100644' &&
        javascriptExtractorTree.get(name)?.blob === blob,
      'Reviewed scanner producer blob differs: ' + name
    );
  requireValue(
    text(git('rev-parse', profile.nativePinBaseline + '^{tree}')).trim() ===
      profile.nativePinTree,
    'Native pin candidate tree differs'
  );
  git(
    'merge-base',
    '--is-ancestor',
    profile.integrationBaseline,
    profile.nativePinBaseline
  );
  verifyNativePinTransitions(
    integrationTree,
    nativePinTree,
    profile.nativePinTransitions
  );
  requireValue(
    text(
      git('rev-parse', profile.sourceConvergenceBaseline + '^{tree}')
    ).trim() === profile.sourceConvergenceTree,
    'Converged source tree differs'
  );
  git(
    'merge-base',
    '--is-ancestor',
    profile.nativePinBaseline,
    profile.sourceConvergenceBaseline
  );
  git(
    'merge-base',
    '--is-ancestor',
    'b26a65456d5c06c901ba73d1e1620f7edb1a315a',
    profile.sourceConvergenceBaseline
  );
  verifySourceConvergenceTransitions(
    nativePinTree,
    sourceConvergenceTree,
    profile.sourceConvergenceTransitions
  );
  requireValue(
    text(git('rev-parse', profile.pythonScannerBaseline + '^{tree}')).trim() ===
      profile.pythonScannerTree,
    'Python scanner source tree differs'
  );
  git(
    'merge-base',
    '--is-ancestor',
    profile.sourceConvergenceBaseline,
    profile.pythonScannerBaseline
  );
  verifyPythonScannerTransitions(
    sourceConvergenceTree,
    pythonScannerTree,
    profile.pythonScannerTransitions
  );
  for (const [name, blob] of [
    [pythonScannerPolicy.configPath, pythonScannerPolicy.configBlob],
    [pythonScannerPolicy.workflowPath, pythonScannerPolicy.workflowBlob],
  ])
    requireValue(
      pythonScannerTree.get(name)?.mode === '100644' &&
        pythonScannerTree.get(name)?.blob === blob,
      'Reviewed Python scanner source differs: ' + name
    );
  requireValue(
    text(
      git('rev-parse', profile.javascriptExtractorBaseline + '^{tree}')
    ).trim() === profile.javascriptExtractorTree,
    'JavaScript extractor source tree differs'
  );
  for (const baseline of [
    profile.pythonScannerBaseline,
    'c84d6de35bed10012615931c0f15ba8a7b931974',
    '27b654cfa2d02ddae5c9a0633f94461648bd0822',
  ])
    git(
      'merge-base',
      '--is-ancestor',
      baseline,
      profile.javascriptExtractorBaseline
    );
  verifyJavaScriptExtractorTransitions(
    pythonScannerTree,
    javascriptExtractorTree,
    profile.javascriptExtractorTransitions
  );
  const releaseChanges = verifyReleaseDelta(
    javascriptExtractorTree,
    releaseTree
  );
  const afterPackage = readJSON(sha, 'package.json'),
    afterLock = readJSON(sha, 'package-lock.json');
  verifyVersionOnly(
    readJSON(profile.integrationBaseline, 'package.json'),
    afterPackage,
    readJSON(profile.integrationBaseline, 'package-lock.json'),
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
        `${profile.integrationBaseline}:.github/workflows/source-release.yml`
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
    integrationTransitions: profile.integrationTransitions,
    nativePinTransitions: profile.nativePinTransitions,
    sourceConvergenceTransitions: profile.sourceConvergenceTransitions,
    pythonScannerTransitions: profile.pythonScannerTransitions,
    javascriptExtractorTransitions: profile.javascriptExtractorTransitions,
    pythonScannerPolicy: profile.pythonScannerPolicy,
    pythonScannerRequiredPaths: profile.pythonScannerRequiredPaths,
    pythonScannerReview: profile.pythonScannerReview,
    scannerPolicy: profile.scannerPolicy,
    releaseChanges,
    nativeCompatibility: profile.nativeCompatibility,
    scannerRequiredPaths: profile.scannerRequiredPaths,
    scannerReview: profile.scannerReview,
    productionApproved: false,
  };
}

function verifyPublicationReview(value = profile, { git, target } = {}) {
  requireValue(
    value?.scannerReview != null && value?.pythonScannerReview != null,
    'rc.16 publication blocked: scannerReview is pending and Python scanner review is pending; actual JavaScript and Python extraction and independent finite result reviews are required'
  );
  validateProfile(value, { git, target });
  requireValue(
    same(
      JSON.parse(
        text(git('show', `${target}:scripts/release/source-profile-rc16.json`))
      ),
      value
    ),
    'rc.16 publication blocked: installed review profile differs from immutable Git source'
  );
  bindInstalledScannerReviews(value, { git, target });
  // Metadata admission only. Authenticated archives, complete extraction,
  // raw rule/result inventories and independent dispositions remain mandatory.
  return { metadataAdmissionOnly: true, productionApproved: false };
}

module.exports = {
  profile,
  anchors,
  allowedNewPaths,
  allowedExistingPaths,
  protectedPath,
  parseTree,
  verifyProtectedTransitions,
  verifyIntegrationTransitions,
  verifyNativePinTransitions,
  verifySourceConvergenceTransitions,
  verifyPythonScannerTransitions,
  verifyJavaScriptExtractorTransitions,
  verifyReleaseDelta,
  verifyVersionOnly,
  LEGACY_WORKFLOW_GUARD,
  applyLegacyWorkflowGuard,
  verifyLegacyWorkflow,
  validateProfile,
  verifySourceScope,
  verifyPublicationReview,
};
