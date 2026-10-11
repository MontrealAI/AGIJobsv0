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

function checkSource({ root = ROOT, env = process.env } = {}) {
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
  assert.deepEqual(changed.filter(protectedPath), [], 'Protected source changed in the PR');
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
  return { baseline, baseTip, head: git(['rev-parse', 'HEAD'], root).trim(),
    protectedSourceChanged: false, selectedDependencyIdentitiesPreserved: preserved };
}

function checkGenerated() {
  const result = checkSource();
  assert(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'Unexpected Node preload settings');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-baseline-generator-'));
  const worktree = path.join(temp, 'source');
  let added = false;
  try {
    git(['worktree', 'add', '--quiet', '--detach', worktree, result.baseline]);
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
    const files = names(git(['ls-files', '-z'])).filter(protectedPath);
    const generated = names(git(['diff', '--name-only', '-z'], worktree)).filter(protectedPath);
    const local = names(git(['diff', '--name-only', '-z'])).filter(protectedPath);
    assert.deepEqual(local.sort(), generated.sort(), 'Generated protected-file changes differ from baseline');
    for (const name of files) {
      assert.deepEqual(fs.readFileSync(path.join(ROOT, name)), fs.readFileSync(path.join(worktree, name)), name);
    }
    assert.deepEqual(names(git(['ls-files', '--others', '--exclude-standard', '-z'])).filter(protectedPath), [],
      'Unexpected generated Solidity/configuration file');
    return { ...result, mode: 'generated', comparedFiles: files.length,
      baselineGeneratorReproduced: true, baselineEnsNormalizationReproduced: true,
      generatedFiles: generated.map((name) => ({ path: name, sha256: sha256(fs.readFileSync(path.join(ROOT, name))) })),
      scope: 'Identical baseline-generated and ENS-normalized files in disposable checkouts; no generated deployment settings are committed.' };
  } finally {
    if (added) git(['worktree', 'remove', '--force', worktree]);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { protectedPath, checkSource, checkGenerated };
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
