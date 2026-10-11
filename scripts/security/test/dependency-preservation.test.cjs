'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkSource } = require('../check-dependency-preservation.cjs');

const dependencies = ['hardhat', 'solc', 'ethers', '@openzeppelin/contracts', '@prb/math',
  '@ethereum-attestation-service/eas-contracts', '@ethereum-attestation-service/eas-sdk'];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-preservation-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), value);
  };
  const commit = (message) => { git('add', '.'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const lock = (version) => JSON.stringify({ packages: Object.fromEntries(dependencies.map((name) =>
    ['node_modules/' + name, { version, resolved: 'https://example.invalid/' + name + '/' + version, integrity: 'sha512-' + version }])) });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Preservation test');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  write('package-lock.json', lock('1.0.0'));
  write('config/network.json', '{"reviewed":1}\n');
  const original = commit('original baseline');
  // Model independently reviewed changes merged after the release baseline.
  write('package-lock.json', lock('2.0.0'));
  write('config/network.json', '{"reviewed":2}\n');
  const base = commit('later reviewed main changes');
  git('update-ref', 'refs/remotes/origin/main', base);
  git('switch', '-qc', 'repair');
  write('README.md', 'Dependency-only candidate fixture\n');
  const head = commit('candidate');
  return { root, git, write, commit, original, base, head };
}

test('preservation uses the current PR base and accepts previously reviewed source and dependency changes', (t) => {
  const f = fixture(t);
  const result = checkSource({ root: f.root, env: { GITHUB_ACTIONS: 'true', DEPENDENCY_PRESERVATION_BASE_SHA: f.base } });
  assert.equal(result.baseline, f.base);
  assert.equal(result.baseTip, f.base);
  assert.equal(result.head, f.head);
  assert.equal(result.selectedDependencyIdentitiesPreserved.hardhat, '2.0.0');
  assert.throws(() => checkSource({ root: f.root, env: { DEPENDENCY_PRESERVATION_BASE_SHA: f.original } }), /Protected source changed/);
  assert.equal(checkSource({ root: f.root, env: {} }).baseline, f.base);
});

test('base-branch changes after divergence are not attributed to the PR', (t) => {
  const f = fixture(t);
  f.git('switch', '-q', 'main');
  f.write('config/network.json', '{"reviewed":3}\n');
  const advancedBase = f.commit('unrelated new main change');
  f.git('switch', '-q', 'repair');
  const result = checkSource({ root: f.root, env: { DEPENDENCY_PRESERVATION_BASE_SHA: advancedBase } });
  assert.equal(result.baseline, f.base);
  assert.equal(result.baseTip, advancedBase);
});

test('a protected change actually introduced by the PR still fails', (t) => {
  const f = fixture(t);
  f.write('config/network.json', '{"unreviewed":true}\n');
  f.commit('unexpected protected change');
  assert.throws(() => checkSource({ root: f.root, env: {} }), /Protected source changed/);
});

test('selected installed identities still cannot drift from the current baseline', (t) => {
  const f = fixture(t);
  const lock = JSON.parse(fs.readFileSync(path.join(f.root, 'package-lock.json'), 'utf8'));
  lock.packages['node_modules/hardhat'].integrity = 'sha512-unexpected';
  f.write('package-lock.json', JSON.stringify(lock));
  f.commit('unexpected identity change');
  assert.throws(() => checkSource({ root: f.root, env: {} }), /hardhat/);
});

test('missing, malformed and unavailable CI base evidence fails closed', (t) => {
  const f = fixture(t);
  assert.throws(() => checkSource({ root: f.root, env: { GITHUB_ACTIONS: 'true' } }), /PR base SHA is required/);
  for (const value of ['', 'HEAD', '--help']) {
    assert.throws(() => checkSource({ root: f.root, env: { DEPENDENCY_PRESERVATION_BASE_SHA: value } }), /Invalid PR base SHA/);
  }
  assert.throws(() => checkSource({ root: f.root, env: { DEPENDENCY_PRESERVATION_BASE_SHA: 'a'.repeat(40) } }));
});
