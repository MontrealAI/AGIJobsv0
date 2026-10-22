// SPDX-License-Identifier: MIT
// Fixed policy identities plus real callers in a disposable copy of the committed source.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertReviewedInstalledPolicy,REVIEWED_INSTALLED_POLICY} from './discovery-installed-protected-scope.mjs';
let owned,isolatedRoot;
before(()=>{
  const root=fileURLToPath(new URL('../..',import.meta.url));
  owned=mkdtempSync(path.join(os.tmpdir(),'jobs-installed-callers-'));isolatedRoot=path.join(owned,'source');
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  execFileSync('git',['clone','--quiet','--no-hardlinks','--local','--no-checkout',root,isolatedRoot],{timeout:90000});
  execFileSync('git',['checkout','--quiet','--detach',head],{cwd:isolatedRoot,timeout:90000});
});
after(()=>{if(owned)rmSync(owned,{recursive:true,force:true});});
const hash=name=>createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex');
test('installed scope uses independently frozen policy bytes and refuses replacement digests',()=>{
  const pins={manifest:hash('../../config/discovery-installed-candidate-v1.json'),
    verifier:hash('../../scripts/release/discovery-installed-profile.py')};
  assert.deepEqual(pins,REVIEWED_INSTALLED_POLICY);assert.doesNotThrow(()=>assertReviewedInstalledPolicy(pins));
  for(const name of ['manifest','verifier'])assert.throws(()=>assertReviewedInstalledPolicy({...pins,[name]:'a'.repeat(64)}));
});

test('the actual inherited ledger caller uses the installed scope baseline and retains all denials',()=>{
  const root=isolatedRoot;
  const raw=execFileSync(process.execPath,['tools/security/validate-codeql-remediation.mjs','--require-closed'],
    {cwd:root,encoding:'utf8',timeout:90000,maxBuffer:2000000});
  const value=JSON.parse(raw);
  assert.equal(value.baselineResults,96);assert.equal(value.unchangedQueryConfiguration,true);
  assert.equal(value.productionApproved,false);
  const scope=value.discoveryScope;
  assert.equal(scope.schema,'agijobsv0/discovery-installed-protected-scope/v1');
  assert.equal(scope.completeTrackedSourceVerified,true);
  assert.equal(scope.generatedFilesOutOfScope,true);assert.equal(scope.packageSourceProofRequiredSeparately,true);
  assert.ok(scope.admitted.includes('config/discovery-installed-alpha-v1.json'));
  for(const key of ['releaseQualified','publicationApproved','executionApproved','settlementApproved'])assert.equal(scope[key],false);
});

test('actual dependency preservation admits only the complete fixed installed source and preserves dependencies',()=>{
  const root=isolatedRoot;
  const raw=execFileSync(process.execPath,['scripts/security/check-dependency-preservation.cjs','source'],
    {cwd:root,env:{...process.env,DEPENDENCY_PRESERVATION_BASE_SHA:'ba67d5d19ef7d9ac643f99f2b8f49c160714fdf6'},
      encoding:'utf8',timeout:90000,maxBuffer:2000000});
  const value=JSON.parse(raw);
  assert.equal(value.head,value.generatedSourceBaseline);
  assert.equal(value.installedSourceScope.completeTrackedSourceVerified,true);
  assert.equal(value.installedSourceScope.sourceCommit,value.head);
  assert.equal(value.installedSourceScope.publicationApproved,false);
  assert.equal(Object.keys(value.selectedDependencyIdentitiesPreserved).length,7);
});
