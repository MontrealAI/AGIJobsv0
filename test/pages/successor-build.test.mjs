// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyBuildPack, readBuildPack } from '../../scripts/pages/verify-successor-build.mjs';
import { digestObject } from '../../packages/successor-core/src/integrity.mjs';
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
    assert.deepEqual(readBuildPack(file),{});
    fs.appendFileSync(file,' ');
    assert.throws(()=>readBuildPack(file),/at most 2 MB/);
    fs.writeFileSync(file,'invalid');
    assert.throws(()=>readBuildPack(file),SyntaxError);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
