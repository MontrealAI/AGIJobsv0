'use strict';

// This profile authenticates a finite pending candidate. It cannot qualify CI,
// scanner findings, a native release set, publication, or deployed contracts.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const integrationTransitionsSha256 =
  '1363ebe715ffc6405f70261924ff41313073f72dd0d03bd68440235cac78af02';
const telemetryRuntimeSha256 =
  'e0d4553adeb20a21871297fed43b0682846571e6cbe7e9a5554fa2e6072df982';
const historical = require('./qualify-source-release.cjs');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const profile = freeze(require('./source-profile-rc17.json'));
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
  sourceConvergenceBaseline: '0b6d175a4ec8abf5b899e4a1b58a09e7045fe158',
  sourceConvergenceTree: '9e8dff3e0863afa73e04757f77ca2bcb8c01dca2',
  pythonScannerBaseline: 'cb30d7453b36eaca040c139e06fd9668b300c5f4',
  pythonScannerTree: '19d86f484ed11de23bb54d11b193ea868d2de88e',
});
const allowedNewPaths = Object.freeze([
  'scripts/release/emit-codeql-review-rc16.cjs',
  'scripts/release/source-codeql-service-rc16.cjs',
  'test/scripts/source-codeql-service-rc16.test.cjs',
  'test/scripts/source-codeql-service-fixture-rc16.cjs',
  'scripts/release/source-profile-rc16.cjs',
  'scripts/release/source-profile-rc16.json',
  'scripts/release/source-profile-rc17.json',
  'scripts/release/qualify-source-release-rc16.cjs',
  'scripts/release/publish-source-release-rc16.cjs',
  'scripts/release/verify-transformational-compatibility.mjs',
  'test/scripts/source-profile-rc16.test.cjs',
  'test/scripts/source-release-rc16.test.cjs',
  'integrations/alpha-agent/tests/transformational-compatibility.test.mjs',
  '.github/workflows/source-release-rc16.yml',
  '.github/workflows/transformational-compatibility.yml',
  'scripts/release/source-native-gates-rc16.cjs',
  'scripts/release/source-native-evidence-rc16.cjs',
  'test/scripts/source-release-security-rc16-gate.test.cjs',
  'test/scripts/source-release-security-rc16-publish.test.cjs',
  'scripts/release/source-scanner-gates-rc16.cjs',
  'test/scripts/source-release-integrated-rc16.test.cjs',
  'docs/production/RELEASE_NOTES_SOURCE_RC16.md',
  'docs/production/RELEASE_NOTES_SOURCE_RC17.md',
  'scripts/release/python-scanner-rc16.cjs',
  'test/scripts/source-python-scanner-rc16.test.cjs',
  'scripts/release/source-scanner-review-bindings-rc16.cjs',
  'scripts/release/source-python-evidence-rc16.cjs',
  'test/scripts/source-python-evidence-rc16.test.cjs',
  'test/scripts/source-review-binding-rc16.test.cjs',
  '.github/codeql/config-python-integrations.yml',
  '.github/workflows/static-analysis-python-integrations.yml',
]);
const allowedExistingPaths = Object.freeze([
  '.github/workflows/source-release.yml',
  'package.json',
  'package-lock.json',
  'CHANGELOG.md',
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
  commit: '272b4de86bdc306ebf547750717983e467f5fcfd',
  tree: '7e3a171a3f4a256723d6b480c64104264021b456',
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
  referenceTransportSchema: 'agijobsv0/codeql-lossless-reference-transport/1',
  reviewedProducer: {
    event: 'push',
    headBranch: 'fix/inherited-codeql-telemetry-runtime-20261021',
    ref: 'refs/heads/fix/inherited-codeql-telemetry-runtime-20261021',
  },
  qualityReview: {
    schema: 'agijobsv0/nonsecurity-quality-review/1',
    disposition: 'Acknowledged nonsecurity quality',
    ruleIds: ['js/unused-local-variable', 'js/useless-assignment-to-local'],
  },
  producerCommit: 'cb30d7453b36eaca040c139e06fd9668b300c5f4',
  producerTree: '19d86f484ed11de23bb54d11b193ea868d2de88e',
  historicalConfigPath: '.github/codeql/config.yml',
  historicalConfigSha256:
    '4b34450e1dcc0b489feea158d642a6b66261d9e935463928782219c8716c0892',
  configPath: '.github/codeql/config-integrations.yml',
  configSha256:
    '07d7be878097a38520bcf09147b62c75064cb3d707317ad34e028c1f46ba8155',
  configBlob: '4533ce4d7f681a6230399e25fb1d1f736c84b25b',
  workflowPath: '.github/workflows/static-analysis.yml',
  workflowSha256:
    '8b577905c4b4e2a173180a8883262869de7e5f9861a7dd6d1f36e316519e60ce',
  workflowBlob: 'da884644bf8b483c5ab6a643ce491c40b87898f6',
  archiveFiles: [
    'javascript.sarif',
    'source-extraction.json',
    'source-scope-after.json',
    'source-scope-before.json',
  ],
});
const scannerReceiverPaths = Object.freeze([
  'agent-gateway/grpc.ts',
  'agent-gateway/operator.ts',
  'agent-gateway/routes.ts',
  'agent-gateway/telemetry.ts',
  'agent-gateway/telemetryQueue.ts',
  'agent-gateway/telemetrySample.ts',
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
const scannerRequiredPaths = Object.freeze([
  'agent-gateway/grpc.ts',
  'agent-gateway/operator.ts',
  'agent-gateway/routes.ts',
  'agent-gateway/telemetry.ts',
  'agent-gateway/telemetryQueue.ts',
  'agent-gateway/telemetrySample.ts',
  'scripts/release/emit-codeql-review-rc16.cjs',
  'scripts/release/source-codeql-service-rc16.cjs',
  'integrations/alpha-agent/four-repo-computer-lifecycle.cjs',
  'integrations/alpha-agent/four-repo-computer-receipt.mjs',
  'integrations/alpha-agent/pinned-alpha-checkout.cjs',
  'integrations/alpha-agent/transformational-work-request.mjs',
  'integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/computer.mjs',
  'integrations/alpha-agent/vendor/alpha-computer/docs/assets/successor/engine.mjs',
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
  'scripts/release/python-scanner-rc16.cjs',
  'scripts/pages/computer-receipt.mjs',
  'scripts/release/source-scanner-review-bindings-rc16.cjs',
  'scripts/release/source-python-evidence-rc16.cjs',
]);
const pythonScannerPolicy = freeze({
  reviewSchema: 'agijobsv0/codeql-python-review/2',
  reviewedProducer: {
    event: 'push',
    headBranch: 'fix/inherited-codeql-telemetry-runtime-20261021',
    ref: 'refs/heads/fix/inherited-codeql-telemetry-runtime-20261021',
  },
  producerCommit: 'cb30d7453b36eaca040c139e06fd9668b300c5f4',
  producerTree: '19d86f484ed11de23bb54d11b193ea868d2de88e',
  configPath: '.github/codeql/config-python-integrations.yml',
  configSha256:
    'eb5b425facefb419987bf537280d5144a477b65a205ccd71df3866b60b01e560',
  configBlob: 'cdd0d5a0a1a0e691c3367bc5ce4429215f41381d',
  workflowPath: '.github/workflows/static-analysis-python-integrations.yml',
  workflowSha256:
    '5b08a73d05cea31c09e8bf23a34b742c2fd85a47b7fbea52a94f70fd9c3ce077',
  workflowBlob: '0d1220ce9b561ae8feeee9e47bb6a0ff4226c3c0',
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

// The aggregate composes the untouched historical and isolation proofs with
// one exact two-path durability correction.
// These proofs do not install a review or qualify publication.
const historicalTelemetryRuntimeSha256 =
  'ff6f82ddd6738d3a0e7481fdd4cd1fc065853b68bc1a20e1defbfaccefea792c';
const isolationTelemetryRuntimeSha256 =
  'e2a605cfc233ba1cad6061b514aaadc2175a067cd67a1696012a04f3a3bb7137';
function telemetryProof(value) {
  const { baseline, baselineTree, source, tree, transitions } = value;
  return { baseline, baselineTree, source, tree, transitions };
}
function validateTelemetryProof(value, count, allowDeletion = false) {
  fields(
    value,
    ['baseline', 'baselineTree', 'source', 'tree', 'transitions'],
    'Malformed telemetry runtime proof'
  );
  requireValue(
    ['baseline', 'baselineTree', 'source', 'tree'].every((field) =>
      /^[a-f0-9]{40}$/.test(value[field] || '')
    ) &&
      Array.isArray(value.transitions) &&
      value.transitions.length === count,
    'Exact telemetry runtime source and finite transition count are required'
  );
  const seen = new Set();
  for (const item of value.transitions) {
    fields(item, ['path', 'before', 'after'], 'Malformed telemetry transition');
    requireValue(
      typeof item.path === 'string' &&
        !protectedPath(item.path) &&
        !seen.has(item.path),
      'Protected or duplicate telemetry runtime transition'
    );
    seen.add(item.path);
    for (const identity of [item.before, item.after]) {
      if (identity === null) continue;
      fields(identity, ['mode', 'blob'], 'Malformed telemetry blob identity');
      requireValue(
        identity.mode === '100644' && /^[a-f0-9]{40}$/.test(identity.blob),
        'Telemetry source must retain its exact regular file mode'
      );
    }
    requireValue(
      (allowDeletion || item.after !== null) && !same(item.before, item.after),
      'Telemetry source deletion or unchanged transition is prohibited'
    );
  }
  return value;
}
function validateTelemetryRuntime(value = profile.telemetryRuntime) {
  fields(
    value,
    ['baseline', 'baselineTree', 'source', 'tree', 'transitions', 'historical', 'followup', 'durability'],
    'Malformed telemetry runtime scope'
  );
  requireValue(
    createHash('sha256').update(JSON.stringify(value)).digest('hex') ===
      telemetryRuntimeSha256,
    'Exact telemetry runtime scope commitment differs'
  );
  validateTelemetryProof(telemetryProof(value), 12);
  validateTelemetryProof(value.historical, 11);
  requireValue(
    createHash('sha256').update(JSON.stringify(value.historical)).digest('hex') ===
      historicalTelemetryRuntimeSha256,
    'Historical eleven-transition telemetry proof commitment differs'
  );
  validateTelemetryProof(value.followup, 4, true);
  requireValue(
    createHash('sha256').update(JSON.stringify(value.followup)).digest('hex') ===
      isolationTelemetryRuntimeSha256,
    'Historical four-path isolation proof commitment differs'
  );
  validateTelemetryProof(value.durability, 2);
  requireValue(
    value.baseline === value.historical.baseline &&
      value.baselineTree === value.historical.baselineTree &&
      value.followup.baseline === value.historical.source &&
      value.followup.baselineTree === value.historical.tree &&
      value.durability.baseline === value.followup.source &&
      value.durability.baselineTree === value.followup.tree &&
      value.durability.source === value.source &&
      value.durability.tree === value.tree,
    'Telemetry historical, isolation and durability proofs do not compose'
  );
  return value;
}
function verifyTelemetryProofTransitions(beforeTree, afterTree, value) {
  requireValue(
    beforeTree instanceof Map && afterTree instanceof Map,
    'Telemetry runtime inputs must be complete tree maps'
  );
  for (const item of value.transitions)
    requireValue(
      same(beforeTree.get(item.path) ?? null, item.before) &&
        same(afterTree.get(item.path) ?? null, item.after),
      'Exact telemetry runtime blob or mode differs: ' + item.path
    );
  return value.transitions.map((item) => item.path);
}
function verifyTelemetryTransitions(
  beforeTree,
  afterTree,
  value = profile.telemetryRuntime
) {
  validateTelemetryRuntime(value);
  return verifyTelemetryProofTransitions(beforeTree, afterTree, value);
}
function verifyTelemetryOrigin(git, value = profile.telemetryRuntime) {
  validateTelemetryRuntime(value);
  for (const proof of [value.historical, value.followup, value.durability, value]) {
    requireValue(
      text(git('rev-parse', `${proof.source}^{tree}`)).trim() === proof.tree &&
        text(git('rev-parse', `${proof.baseline}^{tree}`)).trim() ===
          proof.baselineTree,
      'Telemetry source or baseline tree differs from its immutable origin'
    );
    git('merge-base', '--is-ancestor', proof.baseline, proof.source);
    const before = parseTree(git('ls-tree', '-rz', proof.baseline));
    const after = parseTree(git('ls-tree', '-rz', proof.source));
    const paths = verifyTelemetryProofTransitions(before, after, proof);
    requireValue(
      same(changedPaths(before, after), [...paths].sort()),
      'Complete telemetry runtime origin transition inventory differs'
    );
  }
  return value;
}

const releaseTriggerTransitions = freeze([
  {
    path: '.github/workflows/apps-images.yml',
    before: {
      mode: '100644',
      blob: '14cab78934e4b7fd6aeb1f717e6ccbce588b2594',
    },
    after: {
      mode: '100644',
      blob: 'ca04e6c0f35ccbb9a2a3083649decb576088f5bd',
    },
  },
  {
    path: '.github/workflows/contracts.yml',
    before: {
      mode: '100644',
      blob: '7d35388b5ccf8e9b9e21cab9a13eb918d9555f68',
    },
    after: {
      mode: '100644',
      blob: 'f9250dcb52ca99e904efc48a6c3d2de211a717c5',
    },
  },
  {
    path: '.github/workflows/culture-ci.yml',
    before: {
      mode: '100644',
      blob: '861d287aa1fd21e2d99455d8e3a4d5f922fd18e8',
    },
    after: {
      mode: '100644',
      blob: '91ce8db0e44c6f77dc349ce7f76714c4807c2100',
    },
  },
  {
    path: '.github/workflows/escrow-replay-regression.yml',
    before: {
      mode: '100644',
      blob: '3a3bb2f3f19808415572e92014f14c63a1d1de71',
    },
    after: {
      mode: '100644',
      blob: 'b61c8ac0bb530afac74de5e367e9cb3ca46b74c6',
    },
  },
  {
    path: '.github/workflows/pages.yml',
    before: {
      mode: '100644',
      blob: 'e6bebe9ccdfab552420b89cbfc7e8eec49073bd3',
    },
    after: {
      mode: '100644',
      blob: '5eba7f3aeb6e19fd645672488914110205b3c28c',
    },
  },
  {
    path: '.github/workflows/production-rehearsal.yml',
    before: {
      mode: '100644',
      blob: 'e1fa3f4a6b4548d08855c3f9204fedb6a3ee9b6e',
    },
    after: {
      mode: '100644',
      blob: 'f263f8979070da4bbbb4f066ed6159a78db462f5',
    },
  },
  {
    path: '.github/workflows/torch-tests.yml',
    before: {
      mode: '100644',
      blob: '787b12a259b865b42c7f346ee84768ca2014bfd5',
    },
    after: {
      mode: '100644',
      blob: '0d7f44ad10d966ece8e8ee3e391ae61db10dd7d9',
    },
  },
]);
const previousReleaseRecords = freeze({
  'docs/production/RELEASE_NOTES_SOURCE_RC16.md': {
    mode: '100644',
    blob: '46bc7625b8b56ff17b8d2bcdeaf435a9c362f8d1',
  },
  'scripts/release/source-profile-rc16.json': {
    mode: '100644',
    blob: 'fa13b44bbc29302db81ebe098f4d9906f60746fa',
  },
});
const releaseChangelog = freeze({
  before: { mode: '100644', blob: '9d08b12d9c10dbeb59edcac19b02243f23a6d1c1' },
  after: { mode: '100644', blob: '862a0a221178006cc1ab2e0d5324b09f25698356' },
});
function verifyReleaseDelta(beforeTree, afterTree) {
  const normalized = new Map(afterTree);
  for (const item of releaseTriggerTransitions) {
    requireValue(
      same(afterTree.get(item.path), item.after),
      'Exact additive release trigger differs: ' + item.path
    );
    normalized.set(item.path, item.before);
  }
  const websitePaths = verifyWebsiteTransitions(beforeTree, normalized);
  const integrationPaths = verifyIntegrationTransitions(beforeTree, normalized);
  const telemetryPaths = verifyTelemetryTransitions(beforeTree, afterTree);
  requireValue(
    same(beforeTree.get('CHANGELOG.md'), releaseChangelog.before) &&
      same(afterTree.get('CHANGELOG.md'), releaseChangelog.after),
    'Exact release-only changelog transition differs'
  );
  for (const [name, identity] of Object.entries(previousReleaseRecords))
    requireValue(
      same(afterTree.get(name), identity),
      'Historical rc.16 release record changed: ' + name
    );
  const changes = changedPaths(beforeTree, afterTree);
  for (const name of changes) {
    const before = beforeTree.get(name),
      after = afterTree.get(name);
    if (allowedNewPaths.includes(name))
      requireValue(
        !before && after?.mode === '100644',
        'Release addition is not a new regular file: ' + name
      );
    else if (
      !websitePaths.includes(name) &&
      !integrationPaths.includes(name) &&
      !telemetryPaths.includes(name)
    ) {
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
      'telemetryRuntime',
      'nativeCompatibility',
      'scannerRequiredPaths',
      'scannerReceiverPaths',
      'scannerPolicy',
      'scannerReview',
      'pythonScannerPolicy',
      'pythonScannerRequiredPaths',
      'pythonScannerReview',
    ],
    'rc.16 profile fields differ'
  );
  requireValue(
    value.schema === 'agijobsv0/source-release-profile/v1' &&
      value.repository === 'MontrealAI/AGIJobsv0' &&
      value.releaseVersion === '2.1.0-rc.17' &&
      value.previousVersion === '2.1.0-rc.15' &&
      value.tag === 'source-v2.1.0-rc.17' &&
      value.qualification === 'PENDING_FINAL_SOURCE_MAIN_PUSH',
    'rc.16 profile identity or pending status differs'
  );
  for (const [name, expected] of Object.entries(anchors))
    requireValue(
      value[name] === expected,
      'rc.16 immutable baseline differs: ' + name
    );
  validateTelemetryRuntime(value.telemetryRuntime);
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
      value.scannerReview === null &&
      same(value.pythonScannerPolicy, pythonScannerPolicy) &&
      same(value.pythonScannerRequiredPaths, pythonScannerRequiredPaths) &&
      value.pythonScannerReview === null,
    'Pending native or scanner policy differs; a separately reviewed gate update is required'
  );
  return value;
}

function verifyScannerProducerPin(git, releaseTree, policy) {
  requireValue(
    typeof git === 'function' && releaseTree instanceof Map,
    'Immutable scanner producer inputs required'
  );
  requireValue(
    text(git('rev-parse', `${policy.producerCommit}^{tree}`)).trim() ===
      policy.producerTree,
    'Reviewed scanner producer tree differs'
  );
  const scannerProducerTree = parseTree(
    git('ls-tree', '-rz', policy.producerCommit)
  );
  for (const [name, blob, digest] of [
    [policy.configPath, policy.configBlob, policy.configSha256],
    [policy.workflowPath, policy.workflowBlob, policy.workflowSha256],
  ])
    requireValue(
      releaseTree.get(name)?.mode === '100644' &&
        releaseTree.get(name)?.blob === blob &&
        scannerProducerTree.get(name)?.mode === '100644' &&
        scannerProducerTree.get(name)?.blob === blob &&
        createHash('sha256')
          .update(git('show', `${policy.producerCommit}:${name}`))
          .digest('hex') === digest,
      'Reviewed scanner producer blob or digest differs: ' + name
    );
  return true;
}

function verifySourceScope({ git, sha, version, lock, policy }) {
  requireValue(
    typeof git === 'function' &&
      /^[a-f0-9]{40}$/.test(sha ?? '') &&
      version === profile.releaseVersion,
    'Invalid rc.16 source identity or version'
  );
  validatePreparedProfile(profile, { git, target: sha });
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
    scannerPolicy.producerCommit,
    profile.telemetryRuntime.source,
  ])
    git('merge-base', '--is-ancestor', baseline, sha);
  verifyTelemetryOrigin(git);
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
  requireValue(
    text(
      git('rev-parse', `${profile.sourceConvergenceBaseline}^{tree}`)
    ).trim() === profile.sourceConvergenceTree,
    'Reviewed owner convergence tree differs'
  );
  requireValue(
    text(git('rev-parse', `${profile.pythonScannerBaseline}^{tree}`)).trim() ===
      profile.pythonScannerTree &&
      profile.pythonScannerBaseline === pythonScannerPolicy.producerCommit &&
      profile.pythonScannerTree === pythonScannerPolicy.producerTree,
    'Reviewed Python scanner producer tree differs'
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
  requireValue(
    text(git('rev-parse', `${scannerPolicy.producerCommit}^{tree}`)).trim() ===
      scannerPolicy.producerTree,
    'Reviewed scanner producer tree differs'
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
  verifyScannerProducerPin(git, releaseTree, scannerPolicy);
  // The separate Python producer is retained exactly without changing the
  // direct implementation-to-release transition inventory above.
  const pythonProducerTree = parseTree(
    git('ls-tree', '-rz', profile.pythonScannerBaseline)
  );
  for (const [name, blob, digest] of [
    [
      pythonScannerPolicy.configPath,
      pythonScannerPolicy.configBlob,
      pythonScannerPolicy.configSha256,
    ],
    [
      pythonScannerPolicy.workflowPath,
      pythonScannerPolicy.workflowBlob,
      pythonScannerPolicy.workflowSha256,
    ],
  ])
    requireValue(
      pythonProducerTree.get(name)?.mode === '100644' &&
        pythonProducerTree.get(name)?.blob === blob &&
        releaseTree.get(name)?.mode === '100644' &&
        releaseTree.get(name)?.blob === blob &&
        createHash('sha256')
          .update(text(git('show', `${profile.pythonScannerBaseline}:${name}`)))
          .digest('hex') === digest,
      'Reviewed Python scanner producer blob or digest differs: ' + name
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
    telemetryRuntime: profile.telemetryRuntime,
    releaseChanges,
    nativeCompatibility: profile.nativeCompatibility,
    scannerRequiredPaths: profile.scannerRequiredPaths,
    scannerReceiverPaths: profile.scannerReceiverPaths,
    scannerPolicy: profile.scannerPolicy,
    scannerReview: profile.scannerReview,
    pythonScannerPolicy: profile.pythonScannerPolicy,
    pythonScannerRequiredPaths: profile.pythonScannerRequiredPaths,
    pythonScannerReview: profile.pythonScannerReview,
    productionApproved: false,
  };
}

function validatePreparedProfile(value = profile, { git, target } = {}) {
  validateProfile({ ...value, scannerReview: null, pythonScannerReview: null });
  requireValue(
    typeof git === 'function' && /^[a-f0-9]{40}$/.test(target || ''),
    'Immutable Git target is required for scanner review metadata admission'
  );
  const {
    projectThreeSlotProfile,
    validateScannerReviewMetadata,
    verifyThreeSlotReviewBinding,
  } = require('./source-scanner-review-bindings-rc16.cjs');
  const profilePath = 'scripts/release/source-profile-rc17.json';
  const installed = parseTree(git('ls-tree', '-rz', target, '--', profilePath));
  requireValue(
    installed.get(profilePath)?.mode === '100644',
    'Installed review profile must be a regular immutable Git file'
  );
  requireValue(
    same(
      projectThreeSlotProfile(text(git('show', `${target}:${profilePath}`)))
        .profile,
      value
    ),
    'rc.16 publication blocked: installed review profile differs from immutable Git source'
  );
  for (const field of ['scannerReview', 'pythonScannerReview']) {
    if (value[field] !== null) {
      validateScannerReviewMetadata(field, value[field], { git, target });
      const {
        parseScannerReview,
        scannerReviewPath,
      } = require('./qualify-source-release-rc16.cjs');
      verifyThreeSlotReviewBinding({
        sourceSha: value[field].sourceCommit,
        sha: target,
        review: value[field],
        git,
        field,
        parseNotes: parseScannerReview,
        notesPath: scannerReviewPath,
      });
    }
  }
  return value;
}
function verifyPreparedPublicationReview(
  value = profile,
  { git, target } = {}
) {
  requireValue(
    value?.scannerReview != null && value?.pythonScannerReview != null,
    'rc.16 publication blocked: scannerReview is pending and Python scanner review is pending; actual JavaScript and Python extraction and independent finite result reviews are required'
  );
  validatePreparedProfile(value, { git, target });
  return { metadataAdmissionOnly: true, productionApproved: false };
}
function verifyPublicationReview(value = profile, context = {}) {
  // This receipt admits only immutable review metadata. The callers still
  // authenticate complete JavaScript/Python archives, API identities and CI.
  return verifyPreparedPublicationReview(value, context);
}

module.exports = {
  profile,
  anchors,
  allowedNewPaths,
  previousReleaseRecords,
  releaseTriggerTransitions,
  releaseChangelog,
  allowedExistingPaths,
  websiteTransitions,
  protectedPath,
  parseTree,
  verifyProtectedTransitions,
  verifyWebsiteTransitions,
  verifyIntegrationTransitions,
  validateTelemetryRuntime,
  verifyTelemetryTransitions,
  verifyTelemetryOrigin,
  verifyReleaseDelta,
  verifyVersionOnly,
  LEGACY_WORKFLOW_GUARD,
  applyLegacyWorkflowGuard,
  verifyLegacyWorkflow,
  validateProfile,
  verifyScannerProducerPin,
  verifySourceScope,
  validatePreparedProfile,
  verifyPreparedPublicationReview,
  verifyPublicationReview,
};
