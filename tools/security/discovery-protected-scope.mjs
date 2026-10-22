// SPDX-License-Identifier: MIT
// One finite Discovery candidate transition; no deployed source or scanner waiver.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const DISCOVERY_PROTECTED_ADDITIONS = Object.freeze([
  'config/discovery-lab-alpha-source.json',
  'config/discovery-lab-source-baseline-v1.json',
  'config/discovery-lab-source-candidate-v1.json'
]);
export const DISCOVERY_SCOPE_ORIGIN = '285034830b6cddc47c7e1002ee85a8b008b9763d';
export const REVIEWED_DISCOVERY_POLICY = Object.freeze({manifest:'ebee1b8c2bbdf2d7084d433296d6a4e1fe7bf54b9809e24b75947980e0b7550d', verifier:'4da6958cd88f4e596aaa5947f398d2367009bb9bfe487fcfa1d0bf17b4cd348b'});
export function assertReviewedDiscoveryPolicy(pins) {
  assert.equal(pins.manifest, REVIEWED_DISCOVERY_POLICY.manifest, 'Discovery manifest differs from independently reviewed fixed bytes');
  assert.equal(pins.verifier, REVIEWED_DISCOVERY_POLICY.verifier, 'Discovery verifier differs from independently reviewed fixed bytes');
}
const BASE_COMMIT = '83065adf18a6ee987f8fa479a496a052d35db682';
const BASE_TREE = '77ded62b991e8cca28bfd849593153f61ac72d86';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', ['--no-replace-objects', '-C', root, ...args],
  {encoding:'utf8', maxBuffer:16 * 1024 * 1024, timeout:30_000}).trim();

/** Finite tree proof, separately tested from the actual source/package verifier. */
export function assessDiscoveryProtectedAdditions({changes, historicalEntries, currentEntries}) {
  assert.deepEqual([...changes].sort(), [...DISCOVERY_PROTECTED_ADDITIONS],
    'Only the three explicitly reviewed Discovery configuration additions are admitted');
  for (const name of DISCOVERY_PROTECTED_ADDITIONS) {
    assert.equal(Object.hasOwn(historicalEntries, name), false, 'An existing protected input cannot be replaced');
    const item = currentEntries[name];
    assert.ok(item && item.mode === '100644' && item.type === 'blob' && /^[a-f0-9]{40}$/.test(item.blob),
      `Discovery configuration must be a regular immutable Git blob: ${name}`);
  }
  return [...DISCOVERY_PROTECTED_ADDITIONS];
}
function entries(root, ref) {
  return Object.fromEntries(git(root, 'ls-tree', '-r', ref).split('\n').filter(Boolean).map(line => {
    const match = /^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match, 'Unsupported Git tree entry');
    return [match[4], {mode:match[1], type:match[2], blob:match[3]}];
  }));
}

/** This installed Discovery gate always requires the complete reviewed candidate. */
export function validateDiscoveryProtectedScope(root, baselineCommit, changes) {
  const historicalEntries = entries(root, baselineCommit), currentEntries = entries(root, 'HEAD');
  const admitted = assessDiscoveryProtectedAdditions({changes, historicalEntries, currentEntries});
  assert.equal(git(root, 'rev-parse', BASE_COMMIT + '^{tree}'), BASE_TREE);
  assert.equal(git(root, 'merge-base', BASE_COMMIT, 'HEAD'), BASE_COMMIT, 'Discovery source must descend from the fixed baseline');
  assert.equal(git(root, 'merge-base', DISCOVERY_SCOPE_ORIGIN, 'HEAD'), DISCOVERY_SCOPE_ORIGIN,
    'The captured-input/source-profile predecessor must remain in ancestry');
  assert.equal(git(root, 'diff', '--name-only', 'HEAD'), '', 'Scope proof requires clean committed tracked inputs');
  const manifest = 'config/discovery-lab-source-candidate-v1.json';
  const verifier = 'scripts/release/discovery-lab-profile.py';
  const pins = {};
  for (const [key, name] of [['manifest', manifest], ['verifier', verifier], ['scopeVerifier', 'tools/security/discovery-protected-scope.mjs']]) {
    const current = fs.readFileSync(path.join(root, name));
    const immutable = execFileSync('git', ['--no-replace-objects', '-C', root, 'show', 'HEAD:' + name],
      {maxBuffer:16 * 1024 * 1024, timeout:30_000});
    assert.ok(current.equals(immutable), `Installed scope policy differs from immutable HEAD: ${name}`);
    pins[key] = sha(immutable);
  }
  assertReviewedDiscoveryPolicy(pins);
  // Reuse the separately reviewed finite verifier; observe actual tracked inputs,
  // not its expected set. The profile checks all baseline blobs/modes, each new
  // byte and the three exact validator/test-isolation transitions, and can never publish.
  // Generated build/test reports are not tracked source; package qualification
  // and the pre-build candidate workflow still reject unexpected source files.
  const script = `import hashlib,json,pathlib,runpy,subprocess,sys
root=pathlib.Path(sys.argv[1]); policy=runpy.run_path(str(root/'scripts/release/discovery-lab-profile.py'))
actual=subprocess.check_output(['git','-C',str(root),'ls-files','--cached','-z']).decode().rstrip('\\0').split('\\0')
selection=policy['select'](manifest_sha256=sys.argv[2],verifier_sha256=sys.argv[3],scope_verifier_sha256=sys.argv[4])
print(json.dumps(policy['validate_source'](root,selection,paths=actual),sort_keys=True))`;
  const env = {...process.env, PYTHONPATH:'', PYTHONNOUSERSITE:'1', PYTHONDONTWRITEBYTECODE:'1'};
  const result = JSON.parse(execFileSync('python3', ['-I', '-c', script, root, pins.manifest, pins.verifier, pins.scopeVerifier],
    {env, encoding:'utf8', maxBuffer:1_000_000, timeout:60_000}));
  assert.equal(result.repository, 'MontrealAI/AGIJobsv0');
  assert.equal(result.baseCommit, BASE_COMMIT); assert.equal(result.baseTree, BASE_TREE);
  assert.equal(result.sourcePackageOnly, true); assert.equal(result.releaseQualified, false);
  assert.equal(result.releaseIdentity, null); assert.equal(result.publicationApproved, false);
  assert.equal(result.executionApproved, false);
  return {admitted, origin:DISCOVERY_SCOPE_ORIGIN, manifestSha256:pins.manifest, verifierSha256:pins.verifier, scopeVerifierSha256:pins.scopeVerifier,
    inputCount:result.inputCount, sourcePackageOnly:true, releaseQualified:false, publicationApproved:false, executionApproved:false};
}
