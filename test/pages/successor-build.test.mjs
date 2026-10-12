// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyBuildPack, readBuildPack } from '../../scripts/pages/verify-successor-build.mjs';
import { digestObject } from '../../packages/successor-core/src/integrity.mjs';
import { compileJobs } from '../../packages/successor-core/src/compiler.mjs';
const directory=new URL('../../website/successor-build/',import.meta.url);
const page=fs.readFileSync(new URL('index.html',directory),'utf8');
const provenance=JSON.parse(fs.readFileSync(new URL('provenance.json',directory),'utf8'));
const ecosystem=JSON.parse(fs.readFileSync(new URL('../../website/data/ecosystem.json',import.meta.url),'utf8'));

test('portable workshop mirror retains exact source bytes, CSP and both deployment suites',()=>{
  assert.equal((page.match(/<main id="main">/g)||[]).length,1);
  assert.equal(createHash('sha256').update(page).digest('hex'),provenance.sha256);
  for(const content of [page.match(/<style>([\s\S]*?)<\/style>/)[1],page.match(/<script>([\s\S]*?)<\/script>/)[1]]){
    assert.ok(page.includes('sha256-'+createHash('sha256').update(content).digest('base64')));
  }
  assert.ok(page.includes("connect-src 'none'"));assert.ok(page.includes(ecosystem.token.address));
  for(const c of ecosystem.suites.flatMap(s=>s.contracts))assert.ok(page.includes(`https://etherscan.io/address/${c.address}#code`),c.name);
  for(const file of provenance.agijobsCompiler.files){
    const bytes=fs.readFileSync(new URL('../../'+file.path,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  }
  const alphaDirectory=new URL('../../scripts/pages/vendor/alpha-successor/',import.meta.url);
  const alphaProvenance=JSON.parse(fs.readFileSync(new URL('provenance.json',alphaDirectory),'utf8'));
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL('engine.mjs',alphaDirectory))).digest('hex'),alphaProvenance.sha256);
  const modelProvenance=JSON.parse(fs.readFileSync(new URL('model-provenance.json',alphaDirectory),'utf8'));
  let modelSource=fs.readFileSync(new URL('model.mjs',alphaDirectory),'utf8');
  assert.equal(createHash('sha256').update(modelSource).digest('hex'),modelProvenance.sha256);
  for(const [original,adapted] of modelProvenance.importRewrites)modelSource=modelSource.replace("from '"+adapted+"'","from '"+original+"'");
  assert.equal(createHash('sha256').update(modelSource).digest('hex'),modelProvenance.originalSha256);
});
test('Jobs consumer rejects changed integrity and false authority even with a recomputed digest',async()=>{
  await assert.rejects(verifyBuildPack({schema:'successor-build-example/v1',scope:'LOCAL_REHEARSAL',integrityDigest:'changed'}),/digest mismatch/);
  const record={schema:'successor-build-example/v1',scope:'LOCAL_REHEARSAL',token:{symbol:'AGIALPHA',address:ecosystem.token.address,chainId:1,decimals:18},admission:{decision:'ADMITTED',independentProof:true,specialistASI:true,authority:['act']}};
  await assert.rejects(verifyBuildPack({...record,integrityDigest:await digestObject('successor-build-example.v1',record)}),/cannot grant authority/);
});
test('recomputed digests cannot hide array-shaped objects or additional claims',async()=>{
  const record={schema:'successor-build-example/v1',scope:'LOCAL_REHEARSAL',token:{symbol:'AGIALPHA',address:ecosystem.token.address,chainId:1,decimals:18},admission:{decision:'HOLD',independentProof:false,specialistASI:false,authority:[]},settlement:{status:'NOT_CONNECTED',spentBaseUnits:'0',transactions:[],allowanceIs:'ILLUSTRATIVE_NOT_FUNDED'}};
  const forgeries=[
    ['admission',{authority:{length:0,grant:'ADMIN'}},/cannot grant authority/],
    ['admission',{authority:''},/cannot grant authority/],
    ['admission',{granted:true},/cannot grant authority/],
    ['settlement',{transactions:{length:0,paid:true}},/cannot attest live settlement/],
    ['settlement',{transactions:''},/cannot attest live settlement/],
    ['settlement',{transactionHash:'0x123'},/cannot attest live settlement/],
    ['settlement',{allowanceIs:'FUNDED'},/cannot attest live settlement/],
    ['token',{symbol:'USDC'},/Wrong token binding/],
  ];
  for(const [field,change,error] of forgeries){
    const forged={...record,[field]:{...record[field],...change}};
    await assert.rejects(verifyBuildPack({...forged,integrityDigest:await digestObject('successor-build-example.v1',forged)}),error);
  }
});
test('package reader enforces the byte limit on the bytes it actually reads',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'successor-reader-'));
  const file=path.join(directory,'pack.json');
  try{
    fs.writeFileSync(file,'{}'+' '.repeat(1999998));
    assert.equal(JSON.stringify(readBuildPack(file)),'{}');
    fs.appendFileSync(file,' ');
    assert.throws(()=>readBuildPack(file),/at most 2 MB/);
    fs.writeFileSync(file,'invalid');
    assert.throws(()=>readBuildPack(file),SyntaxError);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('a complete real export reproduces and rejects forged claims throughout its Alpha evidence',async()=>{
  const pack=readBuildPack(new URL('./fixtures/successor-build-pack.json',import.meta.url));
  assert.equal((await verifyBuildPack(pack)).recompilation,'MATCH');
  const mutations=[
    p=>{p.evaluation.institutional_verdict='ADMITTED';},
    p=>{p.evaluation.authority=['ADMIN'];},
    p=>{p.frozen.manifest.authority=['ADMIN'];},
    p=>{p.evaluation.granted=true;},
    p=>{p.discovery.selected.authority=['ADMIN'];},
    p=>{p.authority=['ADMIN'];},
    p=>{p.chronicle[0].inheritedAuthority=true;},
    p=>{p.chronicle[0].inheritedProof=true;},
    p=>{p.evaluation.missing=[];},
    p=>{p.request.language='fr';},
    p=>{p.frozen.release_hash='0'.repeat(64);},
    p=>{p.discovery.selected.artifact_hash='0'.repeat(64);},
    p=>{p.evaluation.cases[0].exact_output=false;},
    p=>{p.evaluation.totals_ns.current=0;},
    p=>{p.evaluation.local_verdict='ADMITTED';},
    p=>{p.evaluation.best_comparator='candidate';},
    p=>{p.evaluation.cases.pop();},
    p=>{p.evaluation.cases[0].case_index=1;},
    p=>{p.evaluation.cases[0].current_ns=-1;},
    p=>{p.evaluation.cases[2].events=64;},
    p=>{p.discovery.world.observation.nested_mean_ns+=1;},
    p=>{p.discovery.actual_candidates=1;},
    p=>{p.discovery.attempts.find(item=>item.artifact_hash!==p.discovery.selected.artifact_hash).correctness=false;},
    p=>{p.discovery.attempts.find(item=>item.artifact_hash!==p.discovery.selected.artifact_hash).rows+=1;},
    p=>{p.evaluation.timing_limitations='Independent authenticated benchmark.';},
    p=>{p.discovery.world.prediction='Independent proof already earned.';},
  ];
  for(const mutate of mutations){
    const {integrityDigest,...forged}=structuredClone(pack);mutate(forged);
    await assert.rejects(verifyBuildPack({...forged,integrityDigest:await digestObject('successor-build-example.v1',forged)}),/workshop|Workshop/);
  }
  const {integrityDigest,...failed}=structuredClone(pack);
  failed.evaluation.cases[0].exact_output=false;failed.evaluation.correctness=false;failed.evaluation.local_verdict='FAIL';
  await assert.rejects(verifyBuildPack({...failed,integrityDigest:await digestObject('successor-build-example.v1',failed)}),/deterministic evaluation outcomes/);
});
test('resealing a broader mission cannot turn the local workshop into payment authority',async()=>{
  const {integrityDigest,...forged}=readBuildPack(new URL('./fixtures/successor-build-pack.json',import.meta.url));
  const mission=forged.compilation.constitution;
  mission.authorityCeiling={level:'A4',externalEffects:true,permittedActions:['inspect-local','send-payment'],prohibitedActions:['self-admit']};
  mission.allowedActions=['inspect-local','send-payment'];
  const jobs=forged.compilation.graph.nodes.map(job=>({...job,permittedActions:[...mission.allowedActions],prohibitedActions:[...mission.authorityCeiling.prohibitedActions]}));
  forged.compilation=await compileJobs(mission,{jobs,edges:forged.compilation.graph.edges,now:forged.createdAt});
  await assert.rejects(verifyBuildPack({...forged,integrityDigest:await digestObject('successor-build-example.v1',forged)}),/local-only capability/);
  const {integrityDigest:oldDigest,...changed}=readBuildPack(new URL('./fixtures/successor-build-pack.json',import.meta.url));
  const altered=changed.compilation.graph.nodes.map((job,index)=>index===0?{...job,objective:'Silently replace the promised deliverable.'}:job);
  changed.compilation=await compileJobs(changed.compilation.constitution,{jobs:altered,edges:changed.compilation.graph.edges,now:changed.createdAt});
  await assert.rejects(verifyBuildPack({...changed,integrityDigest:await digestObject('successor-build-example.v1',changed)}),/pinned local template/);
});
