// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDiscoveryProtectedAdditions, DISCOVERY_PROTECTED_ADDITIONS as paths, assertReviewedDiscoveryPolicy, REVIEWED_DISCOVERY_POLICY, validateDiscoveryProtectedScope} from '../../tools/security/discovery-protected-scope.mjs';
const input = () => ({changes:[...paths], historicalEntries:{'config/ens.json':{mode:'100644', type:'blob', blob:'a'.repeat(40)}},
  currentEntries:Object.fromEntries(paths.map(name => [name, {mode:'100644', type:'blob', blob:'b'.repeat(40)}]))});
test('exactly the three additive regular configuration inputs receive finite admission', () => {
  assert.deepEqual(assessDiscoveryProtectedAdditions(input()), [...paths]);
});
test('additional contracts, old deployments and arbitrary configuration remain protected', () => {
  for (const name of ['contracts/v2/JobRegistry.sol', 'config/ens.json', 'deployments/old.json', 'docs/production/deployment-addresses.mainnet.json']) {
    const value = input(); value.changes.push(name);
    assert.throws(() => assessDiscoveryProtectedAdditions(value), /Only the three/);
  }
});
test('missing, duplicate and substituted change inventories cannot qualify', () => {
  for (const changes of [paths.slice(1), [...paths, paths[0]], [...paths.slice(1), 'config/other.json']]) {
    assert.throws(() => assessDiscoveryProtectedAdditions({...input(), changes}), /Only the three/);
  }
});
test('a preexisting protected path cannot be recast as an addition', () => {
  for (const name of paths) {
    const value = input(); value.historicalEntries[name] = {mode:'100644', type:'blob', blob:'a'.repeat(40)};
    assert.throws(() => assessDiscoveryProtectedAdditions(value), /existing protected/);
  }
});
test('symlinks, executable modes, absent blobs and malformed identities are refused', () => {
  for (const entry of [null, {mode:'120000', type:'blob', blob:'b'.repeat(40)}, {mode:'100755', type:'blob', blob:'b'.repeat(40)},
    {mode:'100644', type:'tree', blob:'b'.repeat(40)}, {mode:'100644', type:'blob', blob:'b'.repeat(39)}]) {
    const value = input(); value.currentEntries[paths[0]] = entry;
    assert.throws(() => assessDiscoveryProtectedAdditions(value), /regular immutable/);
  }
});

test('fixed reviewed policy pins reject rehashed descendant manifest and verifier substitutions', () => {
  assert.doesNotThrow(() => assertReviewedDiscoveryPolicy({...REVIEWED_DISCOVERY_POLICY, validateDiscoveryProtectedScope}));
  assert.throws(() => assertReviewedDiscoveryPolicy({...REVIEWED_DISCOVERY_POLICY, manifest:'f'.repeat(64)}), /manifest differs/);
  assert.throws(() => assertReviewedDiscoveryPolicy({...REVIEWED_DISCOVERY_POLICY, verifier:'f'.repeat(64)}), /verifier differs/);
});

test('empty protected delta cannot bypass required Discovery configuration presence', () => {
  assert.throws(() => validateDiscoveryProtectedScope(process.cwd(), 'HEAD', []), /Only the three/);
});
