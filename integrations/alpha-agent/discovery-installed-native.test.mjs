// SPDX-License-Identifier: MIT
// These ordinary input-boundary tests do not load or execute an Alpha runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseNativeArguments,boundedSource,qualifyDiscoveryLabReceiver,writeNativeEvidence} from './discovery-installed-native.mjs';
const valid=['--installed-root','/installed/jobs','--manifest-sha256','a'.repeat(64),'--output','/evidence/native-evidence.json',
  '--workspace','/workspace.json','--request','/request.txt'];

test('native acceptance requires externally selected manifest and explicit unique paths',()=>{
  assert.equal(parseNativeArguments(valid)['--manifest-sha256'],'a'.repeat(64));
  for(const args of [valid.slice(0,-2),[...valid,'--output','/other.json'],[...valid,'--unknown','x'],
    valid.map(value=>value==='/installed/jobs'?'relative':value),
    valid.map(value=>value==='a'.repeat(64)?'a'.repeat(63):value),valid.slice(0,6),
    valid.filter((_,index)=>index!==6&&index!==7)]) {
    assert.throws(()=>parseNativeArguments(args));
  }
  assert.equal(parseNativeArguments(valid)['--request'],'/request.txt');
});

test('native artifact reads reject oversize or indirect files before interpretation',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-native-input-'));
  try {
    const file=path.join(folder,'input.json');fs.writeFileSync(file,'{}');
    assert.equal(boundedSource(file,2).toString(),'{}');
    assert.throws(()=>boundedSource(file,1),/bounded/);
    const link=path.join(folder,'indirect.json');fs.symlinkSync(file,link);
    assert.throws(()=>boundedSource(link),/symlink/);
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});


test('a missing original primary export never falls back to constructed native work',async()=>{
  const options={installedRoot:'/unused',manifestSha256:'a'.repeat(64)};
  await assert.rejects(qualifyDiscoveryLabReceiver(options),/original exported workspace is required/);
  await assert.rejects(qualifyDiscoveryLabReceiver({...options,retainedWorkspaceRaw:'{}'}),/original exported request is required/);
  await assert.rejects(qualifyDiscoveryLabReceiver({...options,retainedWorkspaceRaw:null,retainedRequestRaw:'{}'}),/original exported workspace is required/);
});


test('failure evidence can be retained without replacing a prior attempt',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-native-retained-failure-'));
  try {
    const output=path.join(folder,'native-failure.json');
    const files={'workspace.input.json':'{"missionId":"public-input"}'};
    const report={state:'FAILED_NOT_QUALIFIED',authority:'none'};
    writeNativeEvidence(output,files,report);
    assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).state,'FAILED_NOT_QUALIFIED');
    assert.equal(fs.readFileSync(path.join(folder,'workspace.input.json'),'utf8'),files['workspace.input.json']);
    assert.throws(()=>writeNativeEvidence(path.join(folder,'another.json'),files,report),/replace an earlier file/);
    assert.equal(fs.existsSync(path.join(folder,'another.json')),false);
    assert.throws(()=>writeNativeEvidence(path.join(folder,'invalid.json'),{'../outside.txt':'untrusted'},report),/path is invalid/);
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});
