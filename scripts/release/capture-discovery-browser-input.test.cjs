// SPDX-License-Identifier: MIT
'use strict';
// Inert common packet/API metadata only. No browser, native consumer, ZIP or supplied module runs.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('./capture-discovery-browser-input.cjs'),{fixture}=require('./discovery-browser-packet-fixtures.cjs');
function roots(f) {
  const directory=fs.mkdtempSync(path.join('/dev/shm','jobs-browser-inert-')),root=path.join(directory,'source');
  fs.mkdirSync(path.join(root,'config'),{recursive:true});
  fs.writeFileSync(path.join(root,'config/discovery-installed-browser-input-v1.json'),JSON.stringify(f.binding));
  fs.writeFileSync(path.join(root,'config/discovery-installed-alpha-v1.json'),JSON.stringify(f.pin));
  return {directory,root,output:path.join(directory,'captured')};
}
test('unset common binding or wrong reviewed Alpha source cannot select browser acceptance',()=>{
  const f=fixture();assert.doesNotThrow(()=>C.select(f.binding,f.pin));
  assert.throws(()=>C.select({...f.binding,state:'UNSET_PENDING_AUTHENTICATED_ALPHA_ARTIFACT'},f.pin));
  assert.throws(()=>C.select(f.binding,{...f.pin,sourceHash:'1'.repeat(64)}));
  assert.throws(()=>C.select(f.binding,{...f.pin,catalogSha256:'1'.repeat(64)}));
});
test('common 17-file public Git packet retains all original bytes plus Jobs primary aliases',async()=>{
  const f=fixture(),r=roots(f);
  try {const result=await C.capture({root:r.root,output:r.output,api:f.api,rawBody:f.rawBody});
    assert.deepEqual(fs.readFileSync(path.join(r.output,'workspace.json')),f.workspace);
    assert.deepEqual(fs.readFileSync(path.join(r.output,'request.txt')),f.request);
    for(const name of C.PACKET)assert.deepEqual(fs.readFileSync(path.join(r.output,'packet',name)),f.packet.get(name));
    assert.equal(Object.keys(result.packetMembers).length,17);assert.equal(result.authority,'none');
    assert.equal(f.calls.length,8,'One authentication uses only eight original metadata REST reads');
    assert.ok(f.calls.every(route=>!route.includes('/zip')&&!route.startsWith('contents/')&&!route.startsWith('git/blobs/')));
    assert.equal(f.rawCalls.length,59,'All17 packet files and41 source inputs plus catalog use immutable raw Git bodies');
    assert.ok(f.rawCalls.every(call=>/^[a-f0-9]{40}$/.test(call.commit)&&call.maxBytes>0));
    assert.equal(fs.existsSync(path.join(r.output,'custody.json')),false);
  } finally{fs.rmSync(r.directory,{recursive:true,force:true});}
});
test('live original main run, required capability steps and artifact digest all remain mandatory',async()=>{
  for(const change of ['pr','source','step','archive']) {
    const f=fixture();if(change==='pr')f.run.event='pull_request';if(change==='source')f.run.head_sha='1'.repeat(40);
    if(change==='step')f.job.steps[1].conclusion='skipped';if(change==='archive')f.artifact.digest='sha256:'+'9'.repeat(64);
    const r=roots(f);try{await assert.rejects(C.capture({root:r.root,output:r.output,api:f.api,rawBody:f.rawBody}));assert.equal(fs.existsSync(r.output),false);}
    finally{fs.rmSync(r.directory,{recursive:true,force:true});}
  }
});
test('public packet requires complete exact Git tree and actual raw Git object identities',async()=>{
  for(const change of ['truncated','extra','custody','git-bytes','source-git-bytes']) {
    const f=fixture(),t=f.binding.transport,tree=f.records.get('git/trees/'+t.tree+'?recursive=1');
    if(change==='truncated')tree.truncated=true;
    if(change==='extra')tree.tree.push({...tree.tree[0],path:t.path+'/unselected-extra.json'});
    if(change==='custody')f.binding.transport.custodyBytes++;
    if(change==='git-bytes')f.rawFiles.set(t.commit+':'+t.path+'/CUSTODY.json',Buffer.from('changed inert bytes'));
    if(change==='source-git-bytes'){
      const source=f.records.get('git/trees/'+f.pin.tree+'?recursive=1').tree[0];f.rawFiles.set(f.pin.commit+':'+source.path,Buffer.from('{ }'));}
    await assert.rejects(C.authenticate(f.binding,f.pin,f.api,f.rawBody));
  }
});
test('raw body mode, size and Git SHA1 binding refuse substitutions before JSON interpretation',async()=>{
  for(const change of ['mode','size','sha1']){
    const f=fixture(),t=f.binding.transport,entries=f.records.get('git/trees/'+t.tree+'?recursive=1').tree;
    const entry=entries.find(item=>item.path===t.path+'/CUSTODY.json');
    if(change==='mode')entry.mode='120000';if(change==='size')entry.size++;
    if(change==='sha1')f.rawFiles.set(t.commit+':'+entry.path,Buffer.alloc(entry.size,32));
    await assert.rejects(C.authenticate(f.binding,f.pin,f.api,f.rawBody));
  }
});
test('raw reader permission or rate failure stops without fallback, retry or output',async()=>{
  const f=fixture(),r=roots(f);let attempts=0;
  try{await assert.rejects(C.capture({root:r.root,output:r.output,api:f.api,rawBody:async()=>{
    attempts++;throw Error('Inert HTTP 403 rate or permission fixture');}}),/Inert HTTP 403/);
    assert.equal(attempts,1);assert.equal(fs.existsSync(r.output),false);
    assert.ok(f.calls.every(route=>!route.startsWith('git/blobs/')&&!route.includes('/zip')));
  }finally{fs.rmSync(r.directory,{recursive:true,force:true});}
});
test('same original mission, alternative route drafts and actual UI export journal are required',()=>{
  for(const change of ['workspace','draft','journal','page']){
    const f=fixture(),files=new Map(C.MEMBERS.map(name=>[name,Buffer.from(f.packet.get(name))]));
    const name=change==='workspace'?C.PREFIX+'jobs-browser-workspace.json':change==='draft'?C.PREFIX+'jobs-browser-request.json':
      change==='journal'?C.PREFIX+'browser-native-requests.json':C.PREFIX+'served/index.html';
    if(change==='page')files.set(name,Buffer.from('<main>changed inert page</main>'));
    else {const value=JSON.parse(files.get(name));if(change==='workspace')value.missionId='other';
      if(change==='draft')value.missionId='other';if(change==='journal')value.workspace.head='0'.repeat(64);files.set(name,Buffer.from(JSON.stringify(value)));}
    // Rebind the local member digest so this checks semantic journal/source linkage too.
    f.binding.members[name]={bytes:files.get(name).length,sha256:C.sha(files.get(name))};
    assert.throws(()=>C.validateFiles(files,f.binding));
  }
});

// Exact original observations are inert metadata, with no new source review or installed acceptance.
const originals=require('./fixtures/alpha141-original-browser-producer.json');
test('retained615/e31 selection and legacy workflow/job profile remain unchanged',()=>{
  const f=originals.legacy615;
  assert.equal(f.binding.producer.checkoutCommit,'61532fb82621a065e668fd11e57289dcfb65c67b');
  assert.equal(f.binding.transport.commit,'e31e74d1a5144973e6a22006dbe29ea628a80386');
  assert.doesNotThrow(()=>C.select(f.binding,f.pin));
  assert.deepEqual(C.producerProfile(f.binding),{workflowPath:C.WORKFLOW,jobName:'capability',jobId:null});
});
test('only original031b main-release metadata selects its namespaced job without claiming qualification',()=>{
  const {binding,run,job}=originals.alpha141;
  assert.deepEqual(C.producerProfile(binding),{workflowPath:'.github/workflows/agent-release.yml',
    jobName:'successor-capability / capability',jobId:120821426397});
  assert.doesNotThrow(()=>C.validRun(run,binding));assert.doesNotThrow(()=>C.validJob(job,binding));
  assert.equal(originals.heldBehaviorQualified,false);assert.equal(originals.publicationApproved,false);
  assert.equal(originals.installedCompatibilityAccepted,false);assert.equal(originals.externalExecution,'unprovisioned');
  assert.throws(()=>C.select(binding,{}),'Raw observations are not a reviewed source/binding configuration');
});
test('finite031b binding refuses mixed paths and changed source/run/attempt/workflow/artifact identities',()=>{
  const original=originals.alpha141.binding;
  const changes=[['workflowPath',C.WORKFLOW],['workflowPath','.github/workflows/unknown.yml'],
    ...['sourceHash','catalogSha256'].map(key=>[key,'0'.repeat(64)]),
    ...['runId','runAttempt','workflowId'].map(key=>['producer.'+key,original.producer[key]+1]),
    ['producer.runAttempt',true],['producer.event','pull_request'],['producer.headBranch','another-branch'],
    ...['headCommit','checkoutCommit','checkoutTree'].map(key=>['producer.'+key,'0'.repeat(40)]),
    ['producer.checkoutParents',[...original.producer.checkoutParents].reverse()],
    ['artifact.id',original.artifact.id+1],['artifact.name','successor-capability-unknown'],
    ['artifact.digest','sha256:'+'0'.repeat(64)],['artifact.sizeInBytes',original.artifact.sizeInBytes+1]];
  for(const [key,value]of changes){const f=structuredClone(original),parts=key.split('.');
    (parts.length===1?f:f[parts[0]])[parts.at(-1)]=value;
    assert.throws(()=>C.producerProfile(f),key);}
  const mixed=structuredClone(original);mixed.producer=structuredClone(originals.legacy615.binding.producer);
  mixed.artifact=structuredClone(originals.legacy615.binding.artifact);
  assert.throws(()=>C.producerProfile(mixed),'Legacy producer cannot borrow the main-release workflow');
});
test('original031b live/captured run and job validators preserve exact identity and every required step',()=>{
  const f=originals.alpha141;
  const changes=[['id',f.run.id+1],['run_attempt',2],['workflow_id',f.run.workflow_id+1],
    ['head_sha','0'.repeat(40)],['head_branch','later-main'],['event','pull_request'],
    ['path',C.WORKFLOW],['status','queued'],['conclusion','failure']];
  for(const [key,value]of changes)assert.throws(()=>C.validRun({...f.run,[key]:value},f.binding),key);
  for(const [key,value]of [['id',f.job.id+1],['name','capability'],['name','other / capability'],
    ['run_id',f.job.run_id+1],['head_sha','0'.repeat(40)],['status','queued'],['conclusion','failure']]){
    assert.throws(()=>C.validJob({...f.job,[key]:value},f.binding),key);}
  for(const name of C.STEPS){const job=structuredClone(f.job);job.steps.find(s=>s.name===name).conclusion='skipped';
    assert.throws(()=>C.validJob(job,f.binding),name);}
});
test('original031b workflow and namespaced job reach only source metadata with no packet or raw execution',async()=>{
  const observed=originals.alpha141;
  async function metadataStage(change=()=>{}) {
    const binding=structuredClone(observed.binding),run=structuredClone(observed.run),job=structuredClone(observed.job);
    // Only the outer selection framing is mocked. This is not a genuine source review or public transport.
    binding.schema=C.SCHEMA;binding.state='REVIEWED_AUTHENTICATED_ALPHA_ARTIFACT';
    binding.transport={...originals.legacy615.binding.transport,path:'evidence/discovery-browser-inputs-v1/'+binding.producer.headCommit};
    const pin={status:'REVIEWED_FINAL_SOURCE',commit:binding.producer.checkoutCommit,tree:binding.producer.checkoutTree,
      sourceHash:binding.sourceHash,catalogSha256:binding.catalogSha256};
    const workflow={id:run.workflow_id,path:run.path};change({binding,run,job,workflow});
    const p=binding.producer,calls=[],records=new Map([['actions/workflows/'+p.workflowId,workflow],['actions/runs/'+p.runId,run],
      ['actions/runs/'+p.runId+'/attempts/'+p.runAttempt+'/jobs?per_page=100&page=1',{total_count:1,jobs:[job]}]]);
    try {await C.authenticate(binding,pin,async route=>{calls.push(route);
      if(route==='git/commits/'+p.checkoutCommit)throw Error('METADATA_STAGE_ONLY_SOURCE_NOT_READ');
      assert.ok(records.has(route),'Unexpected metadata route');return structuredClone(records.get(route));},
    async()=>assert.fail('No raw source/packet body may be read by a metadata control'));
    }catch(error){error.metadataCalls=calls;throw error;}
    assert.fail('Source/packet authentication is intentionally not performed');
  }
  await assert.rejects(metadataStage(),error=>error.message==='METADATA_STAGE_ONLY_SOURCE_NOT_READ'&&error.metadataCalls.length===4);
  for(const change of [f=>f.workflow.path=C.WORKFLOW,f=>f.workflow.id++,f=>f.job.name='capability',f=>f.job.id++]){
    await assert.rejects(metadataStage(change),error=>error.message!=='METADATA_STAGE_ONLY_SOURCE_NOT_READ');}
});
