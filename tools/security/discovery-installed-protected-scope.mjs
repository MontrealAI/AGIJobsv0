// SPDX-License-Identifier: MIT
// Separately reviewed finite installed-source proof; old candidate/profile rules remain unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const REVIEWED_INSTALLED_POLICY=Object.freeze({
  manifest:'cf9d35bbe7754e60edf28063090fd7941759ba7dea3fb20c93ffc8c7fd046992',verifier:'0846255afd686b203f8cd215d85fb9c19a78d70fcc8fd3974831a45662ecc0c2'
});
export const INSTALLED_PROTECTED_BASELINE='83065adf18a6ee987f8fa479a496a052d35db682';
const MANIFEST='config/discovery-installed-candidate-v1.json';
const VERIFIER='scripts/release/discovery-installed-profile.py';
const SELF='tools/security/discovery-installed-protected-scope.mjs';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const env=()=>({...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_'))),
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_GLOBAL:'/dev/null',GIT_ALLOW_PROTOCOL:'',
  GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_ATTR_NOSYSTEM:'1'});
function bounded(file) {
  assert.equal(fs.realpathSync(file),path.resolve(file));
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {const before=fs.fstatSync(fd);assert.ok(before.isFile()&&before.size<=2_000_000);
    const raw=Buffer.alloc(before.size+1);let size=0;
    while(size<raw.length){const n=fs.readSync(fd,raw,size,raw.length-size,null);if(!n)break;size+=n;}
    const after=fs.fstatSync(fd);assert.equal(size,before.size);
    for(const key of ['dev','ino','mode','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);
    return raw.subarray(0,size);
  } finally{fs.closeSync(fd);}
}
export function assertReviewedInstalledPolicy(pins) {
  assert.ok(digest(REVIEWED_INSTALLED_POLICY.manifest)&&digest(REVIEWED_INSTALLED_POLICY.verifier),'Installed scope policy is not frozen');
  assert.equal(pins.manifest,REVIEWED_INSTALLED_POLICY.manifest,'Installed manifest differs from fixed reviewed bytes');
  assert.equal(pins.verifier,REVIEWED_INSTALLED_POLICY.verifier,'Installed verifier differs from fixed reviewed bytes');
}
export function auditInstalledGitRoot(root) {
  const verifier=bounded(path.join(root,VERIFIER));
  assertReviewedInstalledPolicy({manifest:sha(bounded(path.join(root,MANIFEST))),verifier:sha(verifier)});
  const script="import pathlib,sys; raw=sys.stdin.buffer.read(2000001); assert len(raw)<=2000000; p={'__file__':sys.argv[1],'__name__':'selected_source_audit'}; exec(compile(raw,sys.argv[1],'exec'),p); p['guard_git_metadata'](pathlib.Path(sys.argv[2]))";
  execFileSync('python3',['-I','-c',script,path.join(root,VERIFIER),root],
    {input:verifier,env:env(),timeout:30_000,maxBuffer:1_000_000});
}
export function installedGit(root,...args) {
  return execFileSync('git',['--no-replace-objects','--no-pager','-C',root,'-c','protocol.allow=never',
    '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null',...args],
    {env:env(),encoding:'utf8',timeout:30_000,maxBuffer:32_000_000}).trim();
}
export function validateInstalledProtectedScope(root,baselineCommit,changes) {
  auditInstalledGitRoot(root);
  const verifier=bounded(path.join(root,VERIFIER));
  const pins={manifest:sha(bounded(path.join(root,MANIFEST))),verifier:sha(verifier),
    scopeVerifier:sha(bounded(path.join(root,SELF)))};
  assertReviewedInstalledPolicy(pins);
  assert.equal(baselineCommit,INSTALLED_PROTECTED_BASELINE);
  for(const name of [MANIFEST,VERIFIER,SELF]) {
    const committed=execFileSync('git',['--no-replace-objects','--no-pager','-C',root,'-c','protocol.allow=never',
      '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','cat-file','blob','HEAD:'+name],
      {env:env(),timeout:30_000,maxBuffer:2_000_001});
    assert.ok(committed.equals(bounded(path.join(root,name))),'Installed policy differs from immutable committed source');
  }
  const script=`import json,pathlib,sys
r=pathlib.Path(sys.argv[1]); raw=sys.stdin.buffer.read(2000001); assert len(raw)<=2000000
p={'__file__':str(r/'${VERIFIER}'),'__name__':'selected_tracked_source'};exec(compile(raw,p['__file__'],'exec'),p)
s=p['select'](manifest_sha256=sys.argv[2],verifier_sha256=sys.argv[3],scope_verifier_sha256=sys.argv[4])
print(json.dumps(p['validate_tracked_source'](r,s),sort_keys=True))`;
  const result=JSON.parse(execFileSync('python3',['-I','-c',script,root,pins.manifest,pins.verifier,pins.scopeVerifier],
    {input:verifier,env:env(),encoding:'utf8',timeout:60_000,maxBuffer:1_000_000}));
  assert.equal(result.profile,'jobs-discovery-installed-v1');assert.equal(result.state,'TRACKED_SCANNER_SCOPE_ONLY');
  assert.equal(result.generatedFilesOutOfScope,true);assert.equal(result.packageSourceProofRequiredSeparately,true);
  for(const key of ['releaseQualified','publicationApproved','executionApproved','settlementApproved'])assert.equal(result[key],false);
  return {schema:'agijobsv0/discovery-installed-protected-scope/v1',admitted:[...changes].sort(),
    inputCount:result.inputCount,sourceCommit:result.sourceCommit,sourceTree:result.sourceTree,
    manifestSha256:pins.manifest,verifierSha256:pins.verifier,scopeVerifierSha256:pins.scopeVerifier,
    completeTrackedSourceVerified:true,generatedFilesOutOfScope:true,packageSourceProofRequiredSeparately:true,
    releaseQualified:false,publicationApproved:false,executionApproved:false,settlementApproved:false};
}
