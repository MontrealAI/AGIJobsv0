import assert from 'node:assert/strict';

const HISTORICAL_COMMIT = '6a18192e915230440f288923b25814e4a87ed7c5';
const HISTORICAL_TREE = '899508ecc40c33086a8d8a6198198ee7f441fa42';
const INSTALLED_COMMIT = '83065adf18a6ee987f8fa479a496a052d35db682';
const INSTALLED_TREE = '77ded62b991e8cca28bfd849593153f61ac72d86';

// The actual caller supplies only its always-hardened installedGit wrapper.
// This module has no filesystem, process, network or top-level validator work.
export function selectLedgerSource(readGit) {
  assert.equal(typeof readGit, 'function');
  const commit = readGit('rev-parse', 'HEAD').trim();
  assert.match(commit, /^[0-9a-f]{40}$/);
  const tree = readGit('rev-parse', commit + '^{tree}').trim();
  assert.match(tree, /^[0-9a-f]{40}$/);
  const entry = readGit('ls-tree', '-z', commit, '--', 'package.json');
  if (entry === '') return {commit, tree, installed: false, packageIdentity: null};
  const match = /^(100644|100755) blob ([0-9a-f]{40})\tpackage\.json\0$/.exec(entry);
  assert.ok(match, 'A direct ordinary committed package manifest is required');
  const sizeText = readGit('cat-file', '-s', match[2]).trim();
  assert.match(sizeText, /^(0|[1-9][0-9]*)$/);
  const bytes = Number(sizeText);
  assert.ok(Number.isSafeInteger(bytes) && bytes <= 2_000_000, 'Bounded committed package metadata is required');
  const payload = readGit('cat-file', 'blob', match[2]);
  assert.ok(typeof payload === 'string' && Buffer.byteLength(payload) <= bytes,
    'Bounded committed package payload is required');
  // installedGit trims command output. The object size is authoritative; this
  // selection consumes only JSON metadata and does not claim a raw-byte hash.
  const installed = JSON.parse(payload).version === '2.1.0-rc.18';
  return {commit, tree, installed, packageIdentity: {mode: match[1], blob: match[2], declaredBytes: bytes}};
}

export function verifyInstalledLedgerPrefix({ledgerBaseline, commit, tree, scope, readGit, protectedPath}) {
  assert.equal(typeof readGit, 'function');
  assert.equal(typeof protectedPath, 'function');
  assert.equal(ledgerBaseline.commit, HISTORICAL_COMMIT);
  assert.equal(ledgerBaseline.tree, HISTORICAL_TREE);
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.match(tree, /^[0-9a-f]{40}$/);
  const entries = (ref, expectedTree) => {
    assert.equal(readGit('rev-parse', ref + '^{tree}').trim(), expectedTree);
    const raw = readGit('ls-tree', '-rz', ref);
    assert.ok(typeof raw === 'string' && raw.endsWith('\0'), 'Complete NUL-framed source entries required');
    const rows = raw.split('\0'); rows.pop();
    const result = new Map();
    for (const row of rows) {
      const match = /^(100644|100755|120000) blob ([0-9a-f]{40})\t([^\0]+)$/.exec(row);
      assert.ok(match, 'Malformed ledger-prefix source entry');
      const name = match[3];
      assert.ok(!name.startsWith('/') && !name.includes('\\') &&
        name.split('/').every(part => part && part !== '.' && part !== '..' && part !== '.git') &&
        !/[\x00-\x1f\x7f]/.test(name), 'Unsafe ledger-prefix source path');
      assert.ok(!result.has(name), 'Duplicate ledger-prefix source path');
      result.set(name, {mode: match[1], blob: match[2]});
    }
    return result;
  };
  const original = entries(HISTORICAL_COMMIT, HISTORICAL_TREE);
  const baseline = entries(INSTALLED_COMMIT, INSTALLED_TREE);
  const current = entries(commit, tree);
  const selected = map => [...map].filter(([name]) => protectedPath(name))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const prefix = selected(original);
  assert.equal(prefix.length, 288, 'Historical protected inventory differs');
  assert.deepEqual(selected(baseline), prefix, 'Historical-to-installed protected set/mode/blob differs');
  for (const [name, identity] of prefix)
    assert.deepEqual(current.get(name), identity, 'Original ledger protected identity changed: ' + name);
  const additions = selected(current).filter(([name]) => !baseline.has(name));
  for (const [name, identity] of additions)
    assert.ok(identity.mode === '100644' || identity.mode === '100755', 'Installed protected addition is not regular: ' + name);
  const added = additions.map(([name]) => name);
  assert.equal(scope.schema, 'agijobsv0/discovery-installed-protected-scope/v1');
  assert.equal(scope.sourceCommit, commit);
  assert.equal(scope.sourceTree, tree);
  assert.ok(Number.isSafeInteger(scope.inputCount) && scope.inputCount === current.size,
    'Typed complete source input count differs');
  for (const key of ['manifestSha256', 'verifierSha256', 'scopeVerifierSha256'])
    assert.match(scope[key], /^[0-9a-f]{64}$/);
  for (const key of ['completeTrackedSourceVerified', 'generatedFilesOutOfScope', 'packageSourceProofRequiredSeparately'])
    assert.equal(scope[key], true);
  for (const key of ['releaseQualified', 'publicationApproved', 'executionApproved', 'settlementApproved'])
    assert.equal(scope[key], false);
  assert.ok(Array.isArray(scope.admitted) && scope.admitted.every(name => typeof name === 'string'));
  assert.equal(new Set(scope.admitted).size, scope.admitted.length);
  assert.deepEqual([...scope.admitted].sort(), added, 'Installed protected additions differ from independent complete source set');
  return {protectedFiles: prefix.length, added, sourceCommit: commit, sourceTree: tree,
    sourceReviewed: false, releaseQualified: false, publicationApproved: false};
}

export function verifyLedgerSourceClosure({commit, installed, readGit}) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof installed, 'boolean');
  assert.equal(readGit('rev-parse', 'HEAD').trim(), commit, 'Selected ledger source HEAD changed');
  if (installed) readGit('diff', '--cached', '--quiet', commit);
  assert.equal(readGit('rev-parse', 'HEAD').trim(), commit, 'Selected ledger source HEAD changed during closure');
}
