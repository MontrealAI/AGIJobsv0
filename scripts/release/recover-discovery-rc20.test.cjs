// SPDX-License-Identifier: MIT
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const CODE=__dirname+path.sep;
const R=require(CODE+'recover-discovery-rc20.cjs'),D=require(CODE+'anonymous-alpha-metadata-diagnostic.cjs');
const Q=require(CODE+'discovery-installed-qualification.cjs'),P=require(CODE+'publish-discovery-installed.cjs');
const BASE=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jobs-rc20-tests-')),ARTIFACT=path.join(BASE,'original-creation.zip');
fs.writeFileSync(ARTIFACT,Buffer.from('UEsDBBQACAAIAMWQV10AAAAAAAAAAAAAAAA5AAAAZGlzY292ZXJ5LWluc3RhbGxlZC1yZWxlYXNlLWFzc2V0cy5jcmVhdGlvbi1yZXNwb25zZS5qc29urZVdj9M6EIb/ijUSd2nz0Tab5gghUBEsaFn2HC6OQCia2JPUwrEj20npVv3vKGm7WnqxK1SuIk3GzzueL++gswpyWHvfujwMsZXTWvp1V065aUJLrXHhjdHeEqrX1+Hrd9cfTOn6KLSkCB25cJ4k8SJbZjMIAJ0j74q/xwwPRAiga5VBcYY+GN2l+N0rjQ0FCktSewhg7Rt1pvRI4Wm2xzrstMe6JjG5WlRVVsblfJZVZVRepcksgQCkgPwhhgCw82tjId+BMrXUkMNBbYLcS6Pdt9L476djcbbMkiwJQBtBxWCCm9VNetcso0+rt/PbL/X2dnX9cihGjx7teTFG4yljnSPLjfak/Xg1qcN4MUuzV/3LOQRQ2yNjlBmK8FRhB5gLfw/9xeJNafyLxerZrGLbnh+GACqjlNmQfaannpQOHyAPQKnry4FS17vQ+DXZYnAfGqeW7rn2f5o8Anbjp5BiQDqP1tJ54/8R9IjYhWajye5344yM7K503Mp29L9I4TEIAjC2Ri3v8WKwsfXAG4f6Es4IgACoJ31ZhQ6EXdha2SPf7sfoOMmeRHE5/QwFAfhtS5DDG+OH+XNki17Spjia265Ukg+llJ4KFM2wPipUjvaPN8S/b4sfm9Xt5/9VJdz860f8+H5AY10Miw9yENJx05PdTvpkGk+jieXTJBp9bE2+4KZppJduDTlUVzyKKE2zimYxp5hwGV1VURSlZcrjueBLUS4oiiGAI33YkWx1kmBSO49KkWC/awmLlYfc244CkE3TeSwVHe8TQGvpuGVPPtwSehIFesghiZJ0EkeTZPYlzvIozeP46/huiGd9xiy69dFLd0qdnjLIv30fk1CiOi6vw+972Z6bSiO2kMNdh0pWksSjeyrDUU0sDaVjzlR+g5b+YfdkDeOdtaT5lh2eAem3U/YfEXOms5wmpem0YK01PWnUnAJmrKylRsXWxnkSjHopSHNiqAWjn62SXHpmWrLj/KFiSjbSuynsfwFQSwcI9Of4evACAADvBwAAUEsBAi0DFAAIAAgAxZBXXfTn+HrwAgAA7wcAADkAAAAAAAAAAAAgAICBAAAAAGRpc2NvdmVyeS1pbnN0YWxsZWQtcmVsZWFzZS1hc3NldHMuY3JlYXRpb24tcmVzcG9uc2UuanNvblBLBQYAAAAAAQABAGcAAABXAwAAAAA=','base64'));
process.on('exit',()=>fs.rmSync(BASE,{recursive:true,force:true}));
const receipt=Q.json(Q.zipMembers(fs.readFileSync(ARTIFACT)).get(R.FIXED.creationMember));
const copy=value=>structuredClone(value),source={sourceCommit:R.FIXED.sourceCommit,sourceTree:R.FIXED.sourceTree};
function release(){return {...copy(receipt),updated_at:'2026-10-23T18:06:20Z',assets:R.ASSETS.map(a=>({...a,state:'uploaded',
  browser_download_url:'https://github.com/'+R.FIXED.repository+'/releases/download/'+R.FIXED.tag+'/'+a.name}))};}
function fixture() {
  const base=fs.mkdtempSync(path.join(BASE,'case-')),root=path.join(base,'source');fs.mkdirSync(root);
  const state={release:release(),main:'3'.repeat(40),tag:null,patches:0,qualifications:0,downloads:[],events:[],duplicates:false};
  const record={source:{commit:R.FIXED.sourceCommit,tree:R.FIXED.sourceTree},prerequisite:{commit:'1'.repeat(40),tree:'2'.repeat(40)}};
  const prerequisite={...release(),id:17,tag_name:'source-v2.1.0-rc.17',draft:false,published_at:'2026-10-22T00:00:00Z'};
  const api=async route=>{
    state.events.push('read:'+route);
    if(route.startsWith('releases?'))return [copy(state.release),...(state.duplicates?[{...copy(state.release),id:999}]:[])];
    if(route==='releases/'+R.FIXED.releaseId)return copy(state.release);
    if(route==='releases/tags/source-v2.1.0-rc.17')return copy(prerequisite);
    if(route==='git/ref/heads/main')return {object:{sha:state.main}};
    if(route==='git/ref/tags/'+R.FIXED.tag)return state.tag?{object:{type:'commit',sha:state.tag}}:null;
    if(route==='git/ref/tags/source-v2.1.0-rc.17')return {object:{type:'commit',sha:record.prerequisite.commit}};
    if(route==='git/commits/'+record.prerequisite.commit)return {tree:{sha:record.prerequisite.tree}};
    throw Error('Unexpected fixture route '+route);
  };
  const deps={Q:{...Q,sourceProof:()=>copy(source)},P:{...P,publicationRecordBytes:async()=>Buffer.from(JSON.stringify(record))},api,
    download:async(directory,current,published)=>{state.downloads.push({directory,id:current.id,published});},verify:()=>{},
    validateEpoch:()=>({tooling:{sourceCommit:'3'.repeat(40),sourceTree:'4'.repeat(40)},payload:source}),
    toolingGates:async()=>({sourceCommit:'3'.repeat(40),state:'QUALIFIED_TOOLING_NOT_PAYLOAD_PUBLICATION'}),
    qualify:async()=>{state.qualifications++;state.events.push('qualification');},
    patch:async()=>{state.patches++;state.events.push('PATCH:'+R.FIXED.releaseId);state.release.draft=false;
      state.release.published_at='2026-10-23T19:00:00Z';state.tag=R.FIXED.sourceCommit;}};
  const opts={root,artifact:ARTIFACT,output:path.join(base,'recovery'),execute:true};
  return {state,deps,opts,base,cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
async function inOwnerContext(operation) {
  const env={GITHUB_REPOSITORY:R.FIXED.repository,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
    GITHUB_SHA:'3'.repeat(40),QUALIFICATION_RUN_ID:String(R.FIXED.runId),PUBLICATION_RECORD_COMMIT:R.FIXED.recordCommit,PUBLICATION_RECORD_SHA256:R.FIXED.recordSha256,GITHUB_ACTOR:'MontrealAI',GITHUB_REPOSITORY_OWNER:'MontrealAI'},before={};
  for(const [k,v]of Object.entries(env)){before[k]=process.env[k];process.env[k]=v;}
  try{return await operation();}finally{for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
test('original artifact ZIP, exact creation bytes and owned empty response authenticate together',()=>{
  assert.equal(R.creationReceipt(ARTIFACT,Q,P).id,R.FIXED.releaseId);
  const dir=fs.mkdtempSync(path.join(BASE,'receipt-'));
  try {const file=path.join(dir,'altered.zip'),raw=fs.readFileSync(ARTIFACT);raw[raw.length-1]^=1;fs.writeFileSync(file,raw);
    assert.throws(()=>R.creationReceipt(file,Q,P),/Original creation artifact differs/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('release adoption refuses wrong repository, target, tag, title, body and creation identity',()=>{
  for(const mutation of [r=>r.id++,r=>r.url+='x',r=>r.target_commitish='a'.repeat(40),r=>r.tag_name+='x',r=>r.name+='x',r=>r.body+='x',r=>r.created_at='2026-01-01']) {
    const r=release();mutation(r);assert.throws(()=>R.releaseIdentity(r,receipt,P));
  }
});
test('seven original IDs, names, sizes, SHA digests, upload states and count all remain mandatory',()=>{
  for(const mutation of [r=>r.assets[0].id++,r=>r.assets[0].name+='x',r=>r.assets[0].size++,r=>r.assets[0].digest='sha256:'+'a'.repeat(64),
    r=>r.assets[0].state='starter',r=>r.assets.pop(),r=>r.assets.push(copy(r.assets[0]))]) {
    const r=release();mutation(r);assert.throws(()=>R.releaseIdentity(r,receipt,P));
  }
});
test('the reviewed asset constants cannot be changed by a caller',()=>{
  assert.throws(()=>R.ASSETS[0].id++);assert.throws(()=>R.EXPECTED[R.ASSETS[0].name].bytes++);
});
test('inspect authenticates original ownership/readback but cannot qualify or mutate',async()=>{
  const f=fixture();try{const value=await R.recover({...f.opts,execute:false},f.deps);
    assert.equal(value.state,'INSPECTED_NO_MUTATION');assert.equal(f.state.qualifications,0);assert.equal(f.state.patches,0);assert.equal(f.state.downloads.length,1);
    const plan=JSON.parse(fs.readFileSync(path.join(f.opts.output,'plan.json')));assert.equal(plan.original403.cause,'UNESTABLISHED');
  }finally{f.cleanup();}
});
test('recovery qualifies tooling and original f7, rechecks both original draft downloads and applies only one fixed-ID PATCH',async()=>{
  const f=fixture();try{const value=await inOwnerContext(()=>R.recover(f.opts,f.deps));
    assert.equal(value.state,'ORIGINAL_RELEASE_RECOVERED_PUBLIC_BYTES_VERIFIED');assert.equal(f.state.qualifications,1);assert.equal(f.state.patches,1);
    assert.deepEqual(f.state.downloads.map(d=>d.published),[false,false,true]);assert.ok(f.state.events.indexOf('qualification')<f.state.events.indexOf('PATCH:'+R.FIXED.releaseId));
    assert.equal(f.state.events[f.state.events.indexOf('PATCH:'+R.FIXED.releaseId)-1],'read:git/ref/heads/main');
    assert.ok(fs.existsSync(path.join(f.opts.output,'mutation-intent.json')));assert.ok(fs.existsSync(path.join(f.opts.output,'completed.json')));
  }finally{f.cleanup();}
});
test('already-published retry performs anonymous public verification and no second mutation',async()=>{
  const f=fixture();try{f.state.release.draft=false;f.state.release.published_at='2026-10-23T19:00:00Z';f.state.tag=R.FIXED.sourceCommit;
    const value=await R.recover(f.opts,f.deps);assert.equal(value.state,'ALREADY_PUBLIC_VERIFIED');
    assert.equal(f.state.qualifications,0);assert.equal(f.state.patches,0);assert.deepEqual(f.state.downloads.map(d=>d.published),[true]);
  }finally{f.cleanup();}
});
test('missing original ownership/ambiguous tag stops before a recovery mutation',async()=>{
  const f=fixture();try{f.state.duplicates=true;await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/exactly one release/);
    assert.equal(f.state.patches,0);assert.equal(f.state.qualifications,0);
  }finally{f.cleanup();}
});
test('main movement before qualification and during final lease cannot be disguised',async()=>{
  for(const phase of ['before','during']){const f=fixture();try {
    if(phase==='before')f.state.main='a'.repeat(40);else f.deps.qualify=async()=>{f.state.main='a'.repeat(40);};
    await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/main moved/);assert.equal(f.state.patches,0);
  }finally{f.cleanup();}}
});
test('an anonymous403 from fresh original qualification preserves the draft and cannot publish',async()=>{
  const f=fixture();try{f.deps.qualify=async()=>{throw Error('Anonymous Alpha metadata read failed: HTTP403');};
    await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/HTTP403/);assert.equal(f.state.patches,0);assert.equal(f.state.release.draft,true);
    assert.ok(!fs.existsSync(path.join(f.opts.output,'mutation-intent.json')));
  }finally{f.cleanup();}
});
test('concurrent original-asset edits during qualification are refused before PATCH',async()=>{
  const f=fixture();try{f.deps.qualify=async()=>{f.state.release.assets[0].id++;};
    await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/Original seven asset identities differ/);assert.equal(f.state.patches,0);
  }finally{f.cleanup();}
});
test('readback failure remains visible and cannot be turned into a mutation',async()=>{
  const f=fixture();try{f.deps.download=async()=>{throw Error('draft byte SHA mismatch');};
    await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/SHA mismatch/);assert.equal(f.state.patches,0);assert.equal(f.state.qualifications,0);
  }finally{f.cleanup();}
});
test('uncertain PATCH retains an intent; later observed publication verifies with zero further PATCHes',async()=>{
  const f=fixture();try{const patch=f.deps.patch;f.deps.patch=async()=>{await patch();throw Error('connection ended');};
    await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/outcome is uncertain/);assert.equal(f.state.patches,1);
    assert.ok(fs.existsSync(path.join(f.opts.output,'mutation-intent.json')));assert.ok(!fs.existsSync(path.join(f.opts.output,'completed.json')));
    const again=await R.recover({...f.opts,output:path.join(f.base,'read-only-reconciliation')},f.deps);
    assert.equal(again.state,'ALREADY_PUBLIC_VERIFIED');assert.equal(f.state.patches,1);
  }finally{f.cleanup();}
});
test('original-main owner guard refuses branch execution, new source, nonowner and nondispatch contexts',()=>{
  const env={GITHUB_REPOSITORY:R.FIXED.repository,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'3'.repeat(40),QUALIFICATION_RUN_ID:String(R.FIXED.runId),PUBLICATION_RECORD_COMMIT:R.FIXED.recordCommit,PUBLICATION_RECORD_SHA256:R.FIXED.recordSha256,
    GITHUB_ACTOR:'MontrealAI',GITHUB_REPOSITORY_OWNER:'MontrealAI'};R.executionGuard(env);
  for(const change of [{GITHUB_REF:'refs/heads/feature'},{GITHUB_SHA:R.FIXED.sourceCommit},{GITHUB_ACTOR:'other'},{GITHUB_EVENT_NAME:'push'}])assert.throws(()=>R.executionGuard({...env,...change}));
});
test('new failure diagnostics keep exact anonymous URL/status and safe rate-limit evidence with one request',async()=>{
  let calls=0;const observed=[],body=JSON.stringify({message:'API rate limit exceeded for 192.0.2.1.',documentation_url:'https://docs.github.com/rest/overview/resources-in-the-rest-api'});
  const fetcher=D.diagnosticFetch(async(url,options)=>{calls++;assert.ok(!new Headers(options.headers).has('authorization'));
    return new Response(body,{status:403,headers:{'x-ratelimit-limit':'60','x-ratelimit-remaining':'0','x-ratelimit-reset':'1234','x-github-request-id':'AAAA:BBBB','set-cookie':'must never appear'}});
  },{observe:d=>observed.push(d)});
  await assert.rejects(fetcher(D.PREFIX+'actions/workflows/391067735',{redirect:'error',headers:{Accept:'application/vnd.github+json'}}),error=>{
    assert.equal(error.diagnostic.url,D.PREFIX+'actions/workflows/391067735');assert.equal(error.diagnostic.status,403);return !error.message.includes('192.0.2.1');});
  assert.equal(calls,1);assert.equal(observed[0].body.messageClass,'API rate limit exceeded');assert.equal(observed[0].headers['x-ratelimit-remaining'],'0');
  assert.ok(!JSON.stringify(observed).includes('must never appear'));
});
test('diagnostics redact unknown body fields and credentials, bound body bytes and never follow/retry a403',async()=>{
  let calls=0;const secret='Bearer sensitive-fixture-token',observed=[];
  const fetcher=D.diagnosticFetch(async()=>{calls++;return new Response(JSON.stringify({message:secret,token:secret,error:secret}),{status:403,
    headers:{location:'https://example.invalid/token','x-ratelimit-reset':secret,'x-github-request-id':secret}});},{observe:d=>observed.push(d)});
  await assert.rejects(fetcher(D.PREFIX+'actions/runs/39841271826',{redirect:'error'}),error=>!error.message.includes(secret));
  assert.equal(calls,1);assert.ok(!JSON.stringify(observed).includes(secret));assert.deepEqual(Object.keys(observed[0].headers),['content-type']);
  const diag=await D.failureDiagnostic(D.PREFIX+'actions/runs/1',new Response('x'.repeat(20000),{status:403}));
  assert.equal(diag.body.truncated,true);assert.equal(diag.body.observedBytes,8192);
});
test('diagnostic observer preserves successful/authorized transports without changing request options',async()=>{
  const options={redirect:'error',headers:{Authorization:'Bearer inert-existing-workflow-token'}};let actual;
  const response=new Response('{}',{status:403});const fetcher=D.diagnosticFetch(async(url,input)=>{actual=input;return response;});
  assert.equal(await fetcher(D.PREFIX+'releases/1',options),response);assert.equal(actual,options);
  const success=new Response('{}',{status:200});assert.equal(await D.diagnosticFetch(async()=>success)(D.PREFIX+'actions/runs/1',{redirect:'error'}),success);
});
test('diagnostic wrapper restores fetch after failure without auth fallback',async()=>{
  const original=global.fetch;global.fetch=async()=>new Response('{"message":"Forbidden"}',{status:403});const stub=global.fetch;
  try{await assert.rejects(D.withAnonymousDiagnostics(()=>global.fetch(D.PREFIX+'actions/runs/1',{redirect:'error'})),/Anonymous Alpha metadata/);assert.equal(global.fetch,stub);}
  finally{global.fetch=original;}
});
function deltaFixture() {
  const epoch={manifestSha256:'5'.repeat(64),verifierSha256:'6'.repeat(64),scopeVerifierSha256:'7'.repeat(64)},before={},after={},manifest={changes:{}};
  for(const name of R.TOOLING_PATHS) {
    before[name]=R.TOOLING_BEFORE[name]===null?null:{mode:'100644',sha256:R.TOOLING_BEFORE[name]};
    const hash=name==='config/discovery-installed-candidate-v1.json'?epoch.manifestSha256:
      name==='scripts/release/discovery-installed-profile.py'?epoch.verifierSha256:
      name==='tools/security/discovery-installed-protected-scope.mjs'?epoch.scopeVerifierSha256:'8'.repeat(64);
    after[name]={mode:'100644',sha256:hash};manifest.changes[name]={after:{mode:'100644',sha256:hash}};
  }
  return {changed:[...R.TOOLING_PATHS],before,after,manifest,epoch};
}
test('dual epoch admits only nine finite tooling leaves with all original before and exact current after bytes',()=>{
  const f=deltaFixture();R.validateToolingDelta(f.changed,f.before,f.after,f.manifest,f.epoch);
  for(const mutate of [g=>g.changed.push('contracts/AGIJobManager.sol'),g=>g.changed.pop(),
    g=>g.before['scripts/release/discovery-installed-qualification.cjs'].sha256='9'.repeat(64),
    g=>g.before['scripts/release/recover-discovery-rc20.cjs']={mode:'100644',sha256:'8'.repeat(64)},
    g=>g.after['scripts/release/recover-discovery-rc20.cjs'].mode='100755',
    g=>g.after['scripts/release/recover-discovery-rc20.cjs'].sha256='9'.repeat(64),
    g=>g.after['config/discovery-installed-candidate-v1.json'].sha256='9'.repeat(64)]) {
    const g=deltaFixture();mutate(g);assert.throws(()=>R.validateToolingDelta(g.changed,g.before,g.after,g.manifest,g.epoch));
  }
});
test('default payload qualification still refuses moved main; an internally validated epoch keeps actual tool main explicit',()=>{
  const moved={object:{sha:'3'.repeat(40)}};
  assert.throws(()=>Q.assertQualificationMain(moved,source),/Actual main moved/);
  assert.doesNotThrow(()=>Q.assertQualificationMain({object:{sha:R.FIXED.sourceCommit}},source));
  assert.doesNotThrow(()=>Q.assertQualificationMain(moved,source,{tooling:{sourceCommit:'3'.repeat(40)}}));
  assert.throws(()=>Q.assertQualificationMain({object:{sha:'4'.repeat(40)}},source,{tooling:{sourceCommit:'3'.repeat(40)}}));
});
test('recovery epoch cannot select another payload, producer, record, schema or tooling root',async()=>{
  await inOwnerContext(async()=>{
    const e=R.toolingEpoch();
    for(const change of [{payloadCommit:'a'.repeat(40)},{producerRunId:R.FIXED.runId+1},{recordCommit:'a'.repeat(40)},
      {recordSha256:'a'.repeat(64)},{schema:'unreviewed'},{toolingRoot:'/other'},{toolingCommit:'a'.repeat(40)}])
      assert.throws(()=>R.validateRecoveryEpoch({...e,...change},source,R.options('/source','/output')));
    assert.throws(()=>R.validateRecoveryEpoch({...e,approved:true},source,R.options('/source','/output')));
  });
});
test('new tooling failures or epoch rejection cannot promote the original owned draft',async()=>{
  for(const phase of ['epoch','gates']){const f=fixture();try{
    if(phase==='epoch')f.deps.validateEpoch=()=>{throw Error('Unexpected runtime source delta');};
    else f.deps.toolingGates=async()=>{throw Error('Current recovery tool checks pending');};
    await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/Unexpected runtime|checks pending/);
    assert.equal(f.state.patches,0);assert.equal(f.state.qualifications,0);assert.equal(f.state.release.draft,true);
  }finally{f.cleanup();}}
});
test('a changed current-tool gate after payload qualification is freshly refused before PATCH',async()=>{
  const f=fixture();let calls=0,changed=false;
  try{f.deps.toolingGates=async()=>{calls++;if(changed)throw Error('Current tool rerun failed');return {state:'qualified'};};
    f.deps.qualify=async()=>{changed=true;};
    await assert.rejects(inOwnerContext(()=>R.recover(f.opts,f.deps)),/tool rerun failed/);
    assert.equal(calls,2);assert.equal(f.state.patches,0);assert.equal(f.state.release.draft,true);
    assert.ok(fs.existsSync(path.join(f.opts.output,'tooling-qualification.json')));
    assert.ok(!fs.existsSync(path.join(f.opts.output,'mutation-intent.json')));
  }finally{f.cleanup();}
});
test('workflow keeps owner-main publication guards, sibling complete checkouts and the same permissions',()=>{
  const text=fs.readFileSync(path.join(CODE,'../../.github/workflows/discovery-installed-release.yml'),'utf8');
  const recovery=text.slice(text.indexOf('\n  recover-rc20:'));
  assert.ok(recovery.includes("inputs.operation == 'recover-owned-rc20'"));
  for(const marker of ["github.ref == 'refs/heads/main'","github.actor == github.repository_owner",'path: jobs-tool','path: jobs-payload',
    'ref: '+R.FIXED.sourceCommit,'fetch-depth: 0','persist-credentials: false','contents: write','actions: read','checks: read','security-events: read',
    'R.fetchCreationArtifact(artifact, R.originalModules(root).Q)','R.executionGuard()','execute: true'])assert.ok(recovery.includes(marker),marker);
  assert.ok(!recovery.includes('filter:')&&!recovery.includes('secrets.')&&!recovery.includes('actions/download-artifact'));
  assert.equal((recovery.match(/path: jobs-/g)||[]).length,2);assert.equal((recovery.match(/fetch-depth: 0/g)||[]).length,2);
  assert.ok(text.slice(text.indexOf('\n  publish:'),text.indexOf('\n  recover-rc20:')).includes("inputs.operation != 'recover-owned-rc20'"));
});
test('payload observer and inherited consumer share their real private module brand across separate checkouts',async()=>{
  const root=fs.mkdtempSync(path.join(BASE,'service-roots-')),tool=path.join(root,'tool'),payload=path.join(root,'payload');
  const serviceName='scripts/release/source-codeql-service-rc16.cjs',fixtureName='test/scripts/source-codeql-service-fixture-rc16.cjs';
  const dependencies=[serviceName,fixtureName,'scripts/release/source-native-gates-rc16.cjs','scripts/release/qualify-source-release.cjs',
    'scripts/release/check-release-ci.js','ci/required-contexts.json','ci/required-companion-contexts.json',
    'scripts/release/source-profile-rc16.cjs','scripts/release/source-profile-rc17.json',
    'integrations/alpha-agent/pinned-alpha-checkout.cjs','scripts/release/source-scanner-review-bindings-rc16.cjs'];
  for(const checkout of [tool,payload]) {
    fs.mkdirSync(checkout,{recursive:true});fs.writeFileSync(path.join(checkout,'package.json'),'{}');
    for(const name of dependencies) {
      const target=path.join(checkout,name);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(CODE,'../..',name),target);
    }
  }
  const toolObserver=require(path.join(tool,serviceName)),payloadConsumer=require(path.join(payload,serviceName));
  assert.equal(fs.readFileSync(path.join(tool,serviceName)).equals(fs.readFileSync(path.join(payload,serviceName))),true);
  assert.notEqual(toolObserver,payloadConsumer);
  const toolProof=await require(path.join(tool,fixtureName)).syntheticServiceProof(),
    payloadProof=await require(path.join(payload,fixtureName)).syntheticServiceProof();
  const sha='a'.repeat(40),tree='c'.repeat(40);
  assert.doesNotThrow(()=>toolObserver.assertFinalServices(toolProof,{sha,tree}));
  assert.throws(()=>payloadConsumer.assertFinalServices(toolProof,{sha,tree}),/Positive authenticated/);
  const selected=Q.sourceServiceObserver(payload);assert.equal(selected,payloadConsumer);
  assert.doesNotThrow(()=>selected.assertFinalServices(payloadProof,{sha,tree}));
  const nativeGate=require(path.join(payload,'scripts/release/source-native-gates-rc16.cjs'));
  assert.ok(nativeGate.evaluate([],[],sha,toolProof).failures.includes('Processed exact-main CodeQL service evidence: invalid'));
  const accepted=nativeGate.evaluate([],[],sha,payloadProof);
  assert.ok(!accepted.failures.includes('Processed exact-main CodeQL service evidence: invalid'));
  assert.ok(accepted.pending.length+accepted.failures.length>0,'Missing real gates must remain unqualified');
  for(const proof of [{},structuredClone(payloadProof),JSON.parse(JSON.stringify(payloadProof)),toolProof])
    {assert.throws(()=>selected.assertFinalServices(proof,{sha,tree}),/Positive authenticated/);
      assert.ok(nativeGate.evaluate([],[],sha,proof).failures.includes('Processed exact-main CodeQL service evidence: invalid'));}
  for(const epoch of [{sha:'b'.repeat(40),tree},{sha,tree:'b'.repeat(40)}])
    assert.throws(()=>selected.assertFinalServices(payloadProof,epoch),/Positive authenticated/);
  const sameRoot=path.resolve(CODE,'../..'),sameObserver=Q.sourceServiceObserver(sameRoot);
  assert.equal(sameObserver,require(CODE+'source-codeql-service-rc16.cjs'));
  const sameProof=await require(path.join(sameRoot,fixtureName)).syntheticServiceProof();
  assert.doesNotThrow(()=>sameObserver.assertFinalServices(sameProof,{sha,tree}));
  fs.rmSync(root,{recursive:true,force:true});
});
