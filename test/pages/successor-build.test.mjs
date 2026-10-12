// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyBuildPack } from '../../scripts/pages/verify-successor-build.mjs';
import { digestObject } from '../../packages/successor-core/src/integrity.mjs';
const directory=new URL('../../website/successor-build/',import.meta.url);
const page=fs.readFileSync(new URL('index.html',directory),'utf8');
const provenance=JSON.parse(fs.readFileSync(new URL('provenance.json',directory),'utf8'));
const ecosystem=JSON.parse(fs.readFileSync(new URL('../../website/data/ecosystem.json',import.meta.url),'utf8'));

test('portable workshop mirror retains exact source bytes, CSP and both deployment suites',()=>{
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
  const record={schema:'successor-build-example/v1',scope:'LOCAL_REHEARSAL',token:{address:ecosystem.token.address,chainId:1,decimals:18},admission:{decision:'ADMITTED',independentProof:true,specialistASI:true,authority:['act']}};
  await assert.rejects(verifyBuildPack({...record,integrityDigest:await digestObject('successor-build-example.v1',record)}),/cannot grant authority/);
});
