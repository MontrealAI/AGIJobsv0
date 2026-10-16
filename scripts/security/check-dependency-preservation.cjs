'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const p = require('./source-preservation-lib.cjs');
const ROOT = path.resolve(__dirname, '../..');
const BUNDLE_FILES = ['check-dependency-preservation.cjs', 'source-preservation-lib.cjs', 'unreleased-source-policy.index.json', 'unreleased-source-policy.json'];

function verifyBundleCopies(root, head) {
  for (const name of BUNDLE_FILES) {
    const local = fs.readFileSync(path.join(__dirname, name));
    const trackedName = 'scripts/security/' + name;
    const expected = p.inventory(root, head, (value) => value === trackedName);
    assert.equal(expected.length, 1, 'Missing policy bundle file');
    assert.deepEqual(p.fileEntry(root, trackedName), expected[0], 'Working policy file identity mismatch');
    assert.deepEqual(p.indexInventory(root, (value) => value === trackedName), expected, 'Staged policy file identity mismatch');
    const committed = p.git(root, ['show', head + ':' + trackedName], true);
    assert.deepEqual(committed, local, 'Candidate policy copy differs from executing pinned bundle: ' + name);
    assert.deepEqual(fs.readFileSync(path.join(root, 'scripts/security', name)), local, 'Working policy copy differs from pinned bundle: ' + name);
  }
}
// The event payload's merge_commit_sha is advisory: GitHub may regenerate the
// runtime merge after that payload snapshot. Prove the actual immutable runtime
// object instead, without fetching or substituting a mutable merge ref here.
function verifyEventCheckout({ root, checkoutHead, baseTip, context, env }) {
  p.oid(context.head, 'Event head');
  p.oid(context.base, 'Event base');
  if (context.merge) p.oid(context.merge, 'Payload merge');
  assert.equal(baseTip, context.base, 'PR event base mismatch');
  const head = p.commit(root, context.head);
  const runtimeSha = env.GITHUB_SHA ?? null;
  let runtimeMerge = null;
  if (runtimeSha !== null) {
    p.oid(runtimeSha, 'GitHub runtime SHA');
    assert.equal(p.commit(root, runtimeSha), runtimeSha, 'GitHub runtime SHA must name a commit');
    if (runtimeSha !== head) {
      const mergeParents = p.parents(root, runtimeSha);
      assert.deepEqual(mergeParents, [baseTip, head], 'Runtime merge must have exactly event base and head as ordered parents');
      const mergeTree = p.treeId(root, runtimeSha);
      assert.equal(mergeTree, p.treeId(root, head), 'Runtime merge tree differs from event head');
      runtimeMerge = { commit: runtimeSha, parents: mergeParents, tree: mergeTree };
    }
  }
  if (checkoutHead !== head) {
    assert(runtimeMerge, 'Runtime GITHUB_SHA proof is required for a merge checkout');
    assert.equal(checkoutHead, runtimeMerge.commit, 'Checkout is neither event head nor proven runtime merge');
  }
  return { head, checkoutHead, runtimeSha, runtimeMerge,
    payloadMerge: context.merge ?? null,
    payloadMergeMatchesRuntime: context.merge && runtimeSha ? context.merge === runtimeSha : null };
}
function checkSource(options = {}) {
  const { root = ROOT, env = process.env } = options;
  const requestedBase = env.DEPENDENCY_PRESERVATION_BASE_SHA;
  if (env.GITHUB_ACTIONS === 'true') assert(requestedBase, 'PR base SHA is required in Actions');
  if (requestedBase !== undefined) assert.match(requestedBase, /^[0-9a-f]{40}$/i, 'Invalid PR base SHA');
  p.history(root);
  const baseTip = p.commit(root, requestedBase ?? 'refs/remotes/origin/main');
  const checkoutHead = p.commit(root, 'HEAD');
  const context = options.context === undefined ? p.readContext(env) : options.context;
  const eventCheckoutBinding = context ? verifyEventCheckout({ root, checkoutHead, baseTip, context, env }) : null;
  const head = eventCheckoutBinding?.head ?? checkoutHead;
  const bases = p.git(root, ['merge-base', '--all', baseTip, head]).trim().split(/\s+/).filter(Boolean);
  assert.equal(bases.length, 1, 'Exactly one merge base is required'); const baseline = bases[0]; p.oid(baseline, 'Merge base');
  if (p.git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') assert.equal(baseTip, baseline, 'Complete base-divergence history is required for an advanced event base');
  const changed = p.names(p.git(root, ['diff', '--no-renames', '--name-only', '-z', baseline, head])).filter(p.protectedPath);
  const policy = options.policy === undefined ? p.defaultPolicy(context, __dirname) : options.policy;
  let record = null; let generatedSourceBaseline = baseline;
  if (policy) {
    assert(context, 'Verified PR context is required for a source transition');
    record = p.verifyRecord({ root, baseline, head, policy });
    assert.deepEqual(record.scope, { repository: context.repository, pullRequest: context.pullRequest }, 'Transition PR scope mismatch');
    generatedSourceBaseline = record.sourceCheckpoint;
    if (options.enforceBundle !== false) verifyBundleCopies(root, head);
    p.checkWorkingSource(root, head, { allowGenerated: options.allowGenerated === true, transition: true });
  } else {
    // Ordinary branches keep their existing zero-protected-diff rule and their
    // own event merge-base dependency anchor. No old transition is inherited.
    assert.deepEqual(changed, [], 'Protected source changed in the PR');
  }
  const dependencyBaseline = record ? record.dependencyBaseline : baseline;
  const before = p.selectedIdentities(p.lockAt(root, dependencyBaseline));
  p.selectedIdentities(p.lockAt(root, head)).forEach((entry, index) => assert.deepEqual(entry, before[index], entry.name));
  const filesystemLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  p.selectedIdentities(filesystemLock).forEach((entry, index) => assert.deepEqual(entry, before[index], entry.name));
  return { baseline, baseTip, head, checkoutHead, eventCheckoutBinding, headTree: p.treeId(root, head), generatedSourceBaseline, dependencyBaseline,
    mode: record ? 'unreleased-source-transition' : 'ordinary', protectedSourceChanged: changed.length > 0,
    exactTransitionCount: record?.transitionCount ?? 0,
    selectedDependencyIdentitiesPreserved: Object.fromEntries(before.map((entry) => [entry.name, entry.version])),
    selectedDependencyIdentities: before, sourcePolicyDigest: policy?.sha256 ?? null,
    trustScope: 'Functional source-integrity validation only. No independent approval boundary, completed security review, release identity or production approval is asserted.' };
}
function materialize(root, source, target, entries) {
  const ids = [...new Set(entries.map((e) => e.blob))];
  const packed = p.git(root, ['cat-file', '--batch'], true, ids.join('\n') + '\n');
  const contents = new Map(); let offset = 0;
  for (const id of ids) {
    const newline = packed.indexOf(10, offset); assert(newline >= 0, 'Invalid Git batch header');
    const [actual, type, sizeText] = packed.subarray(offset, newline).toString().split(' '); assert.equal(actual, id); assert.equal(type, 'blob');
    const size = Number(sizeText); assert(Number.isSafeInteger(size) && size >= 0); offset = newline + 1;
    const bytes = packed.subarray(offset, offset + size); assert.equal(bytes.length, size); contents.set(id, bytes); offset += size;
    assert.equal(packed[offset++], 10, 'Invalid Git batch delimiter');
  }
  assert.equal(offset, packed.length, 'Unexpected Git batch output');
  for (const entry of entries) {
    p.safePath(entry.path); assert(['100644','100755'].includes(entry.mode) && entry.type === 'blob');
    const filename = path.join(target, entry.path); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, contents.get(entry.blob)); fs.chmodSync(filename, entry.mode === '100755' ? 0o755 : 0o644);
  }
  for (const entry of entries) assert.deepEqual(p.fileEntry(target, entry.path), entry, 'Materialized source mismatch');
  return { source, tree: p.treeId(root, source), files: entries.length };
}
function generatedAllowedPaths(entries) {
  const names = new Set(entries.map((e) => e.path));
  return ['contracts/v2/Constants.sol', 'deployment-config/generated/protocol-defaults.json', 'scripts/generated/protocol-defaults.ts', names.has('config/ens.hardhat.json') ? 'config/ens.hardhat.json' : 'config/ens.json'];
}
function compareGenerated({ root, reference, entries, predicate = p.relevant }) {
  entries = entries.filter((entry) => predicate(entry.path));
  const expectedNames = entries.map((e) => e.path);
  assert.deepEqual(p.filesystemPaths(reference, predicate), expectedNames, 'Reference generation created/deleted unexpected source files');
  assert.deepEqual(p.filesystemPaths(root, predicate), expectedNames, 'Candidate generation created/deleted unexpected source files');
  const allowed = new Set(generatedAllowedPaths(entries)); const generated = [];
  for (const entry of entries) {
    const reproduced = p.fileEntry(reference, entry.path); const actual = p.fileEntry(root, entry.path);
    if (JSON.stringify(reproduced) !== JSON.stringify(entry)) {
      assert(allowed.has(entry.path), 'Recipe changed an undeclared generated product: ' + entry.path); generated.push(entry.path);
    }
    assert.deepEqual(actual, reproduced, 'Generated source differs from reviewed-source reproduction: ' + entry.path);
  }
  return generated.map((name) => ({ path: name, sha256: p.sha256(fs.readFileSync(path.join(root, name))) }));
}
function checkGenerated(options = {}) {
  const root = options.root ?? ROOT; const env = options.env ?? process.env;
  assert(!env.NODE_OPTIONS && !env.NODE_PATH, 'Unexpected Node preload settings');
  const result = checkSource({ ...options, allowGenerated: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-reviewed-source-generator-'));
  const reference = path.join(temp, 'source'); fs.mkdirSync(reference); const home = path.join(temp, 'home'); fs.mkdirSync(home);
  try {
    // Materialize immutable reviewed inputs, never candidate source, without a
    // full repository clone or modification of the candidate's Git metadata.
    const entries = p.inventory(root, result.generatedSourceBaseline, p.relevant);
    p.validateInventory(entries, p.relevant, 'Reproduction input inventory');
    const input = materialize(root, result.generatedSourceBaseline, reference, entries);
    const modules = path.resolve(root, 'node_modules'); assert(fs.statSync(modules).isDirectory(), 'Installed generator toolchain is required');
    fs.symlinkSync(modules, path.join(reference, 'node_modules'), 'dir');
    const cli = path.join(modules, 'ts-node/dist/bin.js');
    const cleanEnv = { PATH: env.PATH ?? '', HOME: home, CI: '1', TZ: 'UTC', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
    execFileSync(process.execPath, [cli, '--compiler-options', '{"module":"commonjs"}', 'scripts/generate-constants.ts'], { cwd: reference, env: cleanEnv, timeout: 60000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
    execFileSync(process.execPath, ['-e', "require('./scripts/config').loadEnsConfig({ network: 'hardhat' })"], { cwd: reference, env: cleanEnv, timeout: 60000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
    // Source-mode dirty checks are deliberately relaxed only for these exact
    // independently reproduced products; the index must still equal HEAD.
    assert.deepEqual(p.indexInventory(root, p.relevant), p.inventory(root, result.head, p.relevant), 'Staged source changes are not generated output');
    const predicate = result.mode === 'unreleased-source-transition' ? p.relevant : (name) => p.protectedPath(name) || p.EXTRA_OUTPUTS.includes(name);
    const generatedFiles = compareGenerated({ root, reference, entries, predicate });
    return { ...result, mode: 'generated', reproducedSource: input, comparedFiles: entries.filter((e) => p.protectedPath(e.path)).length,
      additionalGeneratedProductsCompared: p.EXTRA_OUTPUTS, reviewedSourceGeneratorReproduced: true, reviewedSourceEnsNormalizationReproduced: true, generatedFiles,
      environmentAssertions: { NodePreloadsRejected: true, applicationOverridesNotInherited: true, ephemeralHome: true, sourceMaterializedFromGit: true, candidateSourceExecutedForReference: false },
      toolchain: { node: process.version, declaredNode: fs.existsSync(path.join(reference, '.nvmrc')) ? fs.readFileSync(path.join(reference, '.nvmrc'), 'utf8').trim() : null, declaredNodeVersionEnforced: false, dependencyInstall: 'shared-existing-node_modules', independentInstalledToolchainIntegrityVerified: false },
      scope: 'Functional reproduction from immutable reviewed source using the existing shared installed toolchain. This is not independent toolchain integrity or a security review.' };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
module.exports = { protectedPath: p.protectedPath, checkSource, checkGenerated, compareGenerated, materialize, verifyBundleCopies, verifyEventCheckout };
if (require.main === module) {
  try {
    assert(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'Unexpected Node preload settings');
    const args = process.argv.slice(2); assert(['source','generated'].includes(args[0]) && (args.length === 1 || (args.length === 3 && args[1] === '--root')), 'Use source|generated [--root repository]');
    const options = args.length === 3 ? { root: path.resolve(args[2]) } : {};
    console.log(JSON.stringify(args[0] === 'source' ? checkSource(options) : checkGenerated(options), null, 2));
  } catch (error) { console.error('PRESERVATION_FAILED:', error.message); process.exitCode = 1; }
}
