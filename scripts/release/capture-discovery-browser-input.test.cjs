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
