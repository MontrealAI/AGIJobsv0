'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const protectedPath = (name) => name.endsWith('.sol') ||
  /(^|\/)hardhat\.config\.[cm]?[jt]s$/.test(name) ||
  /^(config|deployment-config|scripts\/v2|scripts\/config|scripts\/deploy)\//.test(name) ||
  /^scripts\/(generate-constants(?:-impl)?\.ts|constants\.ts|release\/audit-dependencies\.)/.test(name) ||
  ['foundry.toml', 'remappings.txt'].includes(name);
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 20 * 1024 * 1024 });
const names = (value) => value.split('\0').filter(Boolean);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// This digest pins the reviewed record itself, not just paths supplied by it.
// Changing this trust anchor requires a new independent source review.
const REVIEWED_RECORD_SHA256 = '27be0ccbd3dd023f259a1936ae8db20be12ed2f1ebea45df80d4d21081de715d';
const reviewedRecord = () => ({
  bytes: fs.readFileSync(path.join(__dirname, 'reviewed-source-pr3967.json')),
  digest: REVIEWED_RECORD_SHA256,
});

function verifyReviewedSource({ root, baseline, head, bytes, digest }) {
  assert.equal(sha256(bytes), digest, 'Reviewed-source record digest mismatch');
  const record = JSON.parse(bytes);
  assert.equal(record.schemaVersion, 1, 'Unsupported reviewed-source record');
  assert.equal(baseline, record.dependencyBaseline, 'Reviewed-source dependency baseline mismatch');
  const checkpoint = record.reviewedSourceCheckpoint;
  for (const sha of [baseline, checkpoint]) assert.match(sha, /^[0-9a-f]{40}$/);
  git(['merge-base', '--is-ancestor', baseline, checkpoint], root);
  git(['merge-base', '--is-ancestor', checkpoint, head], root);
  const transitions = record.transitions;
  assert.equal(transitions.length, 4, 'Exactly four reviewed transitions required');
  const paths = transitions.map((entry) => entry.path).sort();
  assert.equal(new Set(paths).size, paths.length, 'Duplicate reviewed transition');
  assert(paths.every(protectedPath), 'Reviewed transition must be protected');
  const changed = names(git(['diff', '--name-only', '-z', baseline, checkpoint], root)).filter(protectedPath).sort();
  assert.deepEqual(changed, paths, 'Reviewed checkpoint transition set mismatch');
  for (const entry of transitions) {
    assert.notEqual(entry.before, entry.after, 'Missing reviewed transition');
    for (const [ref, identity] of [[baseline, entry.before], [checkpoint, entry.after]]) {
      assert.match(identity, /^[0-9a-f]{40}$/);
      assert.equal(git(['rev-parse', ref + ':' + entry.path], root).trim(), identity,
        'Reviewed blob mismatch: ' + entry.path);
      assert.equal(git(['cat-file', '-t', identity], root).trim(), 'blob');
    }
  }
  assert.deepEqual(names(git(['diff', '--name-only', '-z', checkpoint, head], root)).filter(protectedPath), [],
    'Protected source differs from reviewed checkpoint');
  return checkpoint;
}

function checkSource(options = {}) {
  return checkSourceImpl(options, reviewedRecord());
}

function checkSourceImpl({ root = ROOT, env = process.env } = {}, trustedRecord) {
  // CI supplies the event's immutable base SHA. Local checks use the fetched
  // main ref. Compare from the merge base so unrelated base-branch changes do
  // not become changes attributed to this PR, and never fall back to rc.3.
  const requestedBase = env.DEPENDENCY_PRESERVATION_BASE_SHA;
  if (env.GITHUB_ACTIONS === 'true') assert(requestedBase, 'PR base SHA is required in Actions');
  if (requestedBase !== undefined) assert.match(requestedBase, /^[0-9a-f]{40}$/i, 'Invalid PR base SHA');
  const baseRef = requestedBase ?? 'refs/remotes/origin/main';
  const baseTip = git(['rev-parse', '--verify', baseRef + '^{commit}'], root).trim();
  const baseline = git(['merge-base', baseTip, 'HEAD'], root).trim();
  assert.match(baseline, /^[0-9a-f]{40}$/i, 'A merge base is required');
  const changed = names(git(['diff', '--name-only', '-z', baseline, 'HEAD'], root));
  const head = git(['rev-parse', 'HEAD'], root).trim();
  assert.equal(sha256(trustedRecord.bytes), trustedRecord.digest, 'Reviewed-source record digest mismatch');
  const record = JSON.parse(trustedRecord.bytes);
  let reviewedReachable = false;
  try {
    git(['merge-base', '--is-ancestor', record.reviewedSourceCheckpoint, head], root);
    reviewedReachable = true;
  } catch { /* Ordinary branches retain the strict dependency-only guard. */ }
  let generatedSourceBaseline = baseline;
  const reconcileReviewedSource = reviewedReachable && baseline === record.dependencyBaseline;
  if (reconcileReviewedSource) {
    generatedSourceBaseline = verifyReviewedSource({ root, baseline, head, ...trustedRecord });
  } else {
    assert.deepEqual(changed.filter(protectedPath), [], 'Protected source changed in the PR');
  }
  const before = JSON.parse(git(['show', baseline + ':package-lock.json'], root)).packages;
  const after = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages;
  const preserved = {};
  for (const name of ['hardhat', 'solc', 'ethers', '@openzeppelin/contracts', '@prb/math',
    '@ethereum-attestation-service/eas-contracts', '@ethereum-attestation-service/eas-sdk']) {
    const key = 'node_modules/' + name;
    assert(before[key] && after[key], name + ' must remain installed');
    const fields = ['version', 'resolved', 'integrity'];
    assert.deepEqual(fields.map((field) => after[key][field]), fields.map((field) => before[key][field]), name);
    preserved[name] = after[key].version;
  }
  return { baseline, baseTip, head, generatedSourceBaseline,
    protectedSourceChanged: changed.some(protectedPath), reviewedSourceReconciled: reconcileReviewedSource,
    selectedDependencyIdentitiesPreserved: preserved };
}

function compareGeneratedSources(root, worktree) {
  const files = names(git(['ls-files', '-z'], root)).filter(protectedPath);
  const generated = names(git(['diff', '--name-only', '-z'], worktree)).filter(protectedPath);
  const local = names(git(['diff', '--name-only', '-z'], root)).filter(protectedPath);
  assert.deepEqual(local.sort(), generated.sort(), 'Generated protected-file changes differ from baseline');
  for (const name of files) {
    assert.deepEqual(fs.readFileSync(path.join(root, name)), fs.readFileSync(path.join(worktree, name)), name);
  }
  assert.deepEqual(names(git(['ls-files', '--others', '--exclude-standard', '-z'], root)).filter(protectedPath), [],
    'Unexpected generated Solidity/configuration file');
  return { files, generated };
}

function checkGenerated() {
  const result = checkSource();
  assert(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'Unexpected Node preload settings');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-baseline-generator-'));
  const worktree = path.join(temp, 'source');
  let added = false;
  try {
    git(['worktree', 'add', '--quiet', '--detach', worktree, result.generatedSourceBaseline]);
    added = true;
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(worktree, 'node_modules'), 'dir');
    const cli = path.join(ROOT, 'node_modules/ts-node/dist/bin.js');
    execFileSync(process.execPath, [cli, '--compiler-options', '{"module":"commonjs"}',
      'scripts/generate-constants.ts'], { cwd: worktree, timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' } });
    // deploy:local also calls the unchanged ENS loader, which persists computed
    // alias namehash/label metadata. Reproduce that exact baseline operation;
    // comparing only the constants generator misses this legitimate output.
    execFileSync(process.execPath, ['-e',
      "require('./scripts/config').loadEnsConfig({ network: 'hardhat' })"],
    { cwd: worktree, timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' } });
    const { files, generated } = compareGeneratedSources(ROOT, worktree);
    return { ...result, mode: 'generated', comparedFiles: files.length,
      baselineGeneratorReproduced: true, baselineEnsNormalizationReproduced: true,
      generatedFiles: generated.map((name) => ({ path: name, sha256: sha256(fs.readFileSync(path.join(ROOT, name))) })),
      scope: 'Identical verified-source-generated and ENS-normalized files in disposable checkouts; no generated deployment settings are committed.' };
  } finally {
    if (added) git(['worktree', 'remove', '--force', worktree]);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { protectedPath, checkSource, checkGenerated,
  // Explicit fixture-only injection. The CLI and public checks never consume
  // record paths, digests or checkpoint overrides from arguments/environment.
  _test: { verifyReviewedSource, checkSourceWithRecord: checkSourceImpl, compareGeneratedSources } };
if (require.main === module) {
  try {
    assert(process.argv.length === 3 && ['source', 'generated'].includes(process.argv[2]),
      'Use source or generated');
    console.log(JSON.stringify(process.argv[2] === 'generated' ? checkGenerated() : checkSource(), null, 2));
  } catch (error) {
    console.error('PRESERVATION_FAILED:', error.message);
    process.exitCode = 1;
  }
}
