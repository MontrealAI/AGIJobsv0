// SPDX-License-Identifier: MIT
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./alpha141-retained-public-assets.cjs'),Q=require('./discovery-installed-qualification.cjs');
const source={...R.SOURCE},release={id:R.RELEASE_ID,tag_name:'v'+R.VERSION};
const qualification={releaseId:R.RELEASE_ID,releaseTag:'v'+R.VERSION,runId:R.RUN_ID,runAttempt:1};
const assets=()=>R.receipt().assets.map(row=>({id:row.id,name:row.name,size:row.bytes,digest:'sha256:'+row.sha256,
  url:'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/releases/download/v'+R.VERSION+'/'+encodeURIComponent(row.name)}));

test('only the exact Alpha141 source and version select the new public profile',()=>{
  const p=Q.reviewedAlphaReleaseProfile(source,R.VERSION);assert.equal(p.requiredNames.length,106);
  assert.deepEqual([...p.requiredNames].sort(),assets().map(row=>row.name).sort());assert.equal(p.packManifests.length,3);
  for(const key of Object.keys(source)) {
    const changed={...source,[key]:'0'.repeat(source[key].length)};assert.equal(R.matches(changed),false);
    assert.throws(()=>Q.reviewedAlphaReleaseProfile(changed,R.VERSION));
  }
  assert.throws(()=>Q.reviewedAlphaReleaseProfile(source,'1.41.1'));
  const old=Q.reviewedAlphaReleaseProfile({commit:'61532fb82621a065e668fd11e57289dcfb65c67b',
    tree:'7814d1bd9dcd3845b349590e0bcac57ba93b3167'},'1.38.0');
  assert.ok(old.requiredNames.includes('RELEASE_NOTES_1.38.0.md'));
});

test('retained observations require the entire live asset identity set',()=>{
  assert.equal(R.validateInventory(assets()).size,106);
  for(const key of ['id','size','digest','url']) {
    const changed=assets();changed[0][key]=key==='id'||key==='size'?changed[0][key]+1:'changed';
    assert.throws(()=>R.validateInventory(changed));
  }
  assert.throws(()=>R.validateInventory(assets().slice(1)));
  const duplicate=assets();duplicate[1]={...duplicate[0]};assert.throws(()=>R.validateInventory(duplicate));
  const extra=assets();extra.push({...extra[0],name:'unreviewed.zip'});assert.throws(()=>R.validateInventory(extra));
});

test('new release/run/source selectors cannot borrow the old receipt',()=>{
  const fresh=async()=>{throw Error('unexpected fresh read');};
  for(const [key,value]of [['releaseId',1],['releaseTag','v1.41.1'],['runId',1],['runAttempt',2]])
    assert.throws(()=>R.reader(source,release,{...qualification,[key]:value},assets(),fresh));
  assert.throws(()=>R.reader(source,{...release,id:1},qualification,assets(),fresh));
  assert.throws(()=>R.reader({...source,commit:'0'.repeat(40)},release,qualification,assets(),fresh));
});

test('body reuse is explicit and structural/source bodies still invoke the fresh reader',async()=>{
  const called=[],fresh=async(asset,options)=>{called.push({asset,options});return {fresh:true};};
  const selected=assets(),read=R.reader(source,release,qualification,selected,fresh);
  const ordinary=selected.find(row=>row.name.endsWith('.whl')),observed=await read(ordinary);
  assert.equal(called.length,0);assert.equal(observed.retainedObservation.freshBodyRequest,false);
  assert.equal(observed.retainedObservation.sourceCommit,source.commit);assert.equal(observed.sha256,ordinary.digest.slice(7));
  assert.deepEqual(await read(selected.find(row=>row.name==='release-manifest.json'),{keep:true}),{fresh:true});
  assert.deepEqual(await read(selected.find(row=>row.name==='alpha-agent-v1.41.0-operator-guide.zip'),{fileDescriptor:0}),{fresh:true});
  assert.equal(called.length,2);
  await assert.rejects(read({...ordinary,digest:'sha256:'+'0'.repeat(64)}));
  await assert.rejects(read({...ordinary,url:'https://example.invalid/asset'}));
});
