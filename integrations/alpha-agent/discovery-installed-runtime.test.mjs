// SPDX-License-Identifier: MIT
// Inert inventory framing only; no supplied module or installed runtime is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installedNames} from './discovery-installed-runtime.mjs';
import {createModuleBoundary} from './discovery-installed-module-graph-runtime.mjs';

test('installed directory traversal admits only manifest prefixes and bounded names',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-installed-inventory-'));
  try {
    fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data/input.json'),'{}');
    assert.deepEqual([...installedNames(root,['data/input.json'])],['data/input.json']);
    fs.mkdirSync(path.join(root,'extra'));
    assert.throws(()=>installedNames(root,['data/input.json']),/Unexpected installed directory|entry count/);
    fs.rmdirSync(path.join(root,'extra'));
    fs.writeFileSync(path.join(root,'data/extra.json'),'{}');
    assert.throws(()=>installedNames(root,['data/input.json']),/Unexpected installed member|entry count/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('installed inventory rejects excessive or ambiguous framing before traversal',()=>{
  assert.throws(()=>installedNames('/unused',Array(259).fill('a')),/inventory exceeds bound/);
  assert.throws(()=>installedNames('/unused',['a','a']),/Duplicate/);
  assert.throws(()=>installedNames('/unused',['a/'.repeat(32)+'file']),/depth exceeds bound/);
  assert.throws(()=>installedNames('/unused',['../file']),/Unsafe/);
});

test('the actual trusted Jobs receiver loads from captured bytes and hashes its captured source',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-captured-receiver-'));
  const names=['discovery-lab-work-request.mjs','discovery-lab-contract.mjs'];
  const captured=new Map(names.map(name=>[name,fs.readFileSync(new URL(name,import.meta.url))]));
  let boundary;
  try {
    for(const [name,raw] of captured)fs.writeFileSync(path.join(root,name),raw,{flag:'wx',mode:0o600});
    boundary=createModuleBoundary(root,captured,[names[0]],{[names[0]]:['node:fs','node:crypto']});
    const receiver=await boundary.importModule(names[0]),capabilities=receiver.discoveryLabReceiverCapabilities();
    const sha=raw=>createHash('sha256').update(raw).digest('hex');
    assert.equal(capabilities.source.adapterSha256,sha(captured.get(names[0])));
    assert.equal(capabilities.source.contractSha256,sha(captured.get(names[1])));
    assert.equal(capabilities.authority,'none');assert.equal(capabilities.route,'jobs-agialpha');
  } finally {boundary?.close();fs.rmSync(root,{recursive:true,force:true});}
});
