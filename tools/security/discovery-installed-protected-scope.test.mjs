// SPDX-License-Identifier: MIT
// Fixed reviewed policy identity checks; no Git process or supplied module is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertReviewedInstalledPolicy,REVIEWED_INSTALLED_POLICY} from './discovery-installed-protected-scope.mjs';
const hash=name=>createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex');
test('installed scope uses independently frozen policy bytes and refuses replacement digests',()=>{
  const pins={manifest:hash('../../config/discovery-installed-candidate-v1.json'),
    verifier:hash('../../scripts/release/discovery-installed-profile.py')};
  assert.deepEqual(pins,REVIEWED_INSTALLED_POLICY);assert.doesNotThrow(()=>assertReviewedInstalledPolicy(pins));
  for(const name of ['manifest','verifier'])assert.throws(()=>assertReviewedInstalledPolicy({...pins,[name]:'a'.repeat(64)}));
});
