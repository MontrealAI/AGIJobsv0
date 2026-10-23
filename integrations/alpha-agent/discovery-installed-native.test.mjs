// SPDX-License-Identifier: MIT
// These ordinary input-boundary tests do not load or execute an Alpha runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {parseNativeArguments,boundedSource,qualifyDiscoveryLabReceiver,writeNativeEvidence} from './discovery-installed-native.mjs';
const valid=['--installed-root','/installed/jobs','--manifest-sha256','a'.repeat(64),'--output','/evidence/native-evidence.json',
  '--workspace','/workspace.json','--request','/request.txt','--archive-sha256','b'.repeat(64),'--archive-bytes','449643'];

test('native acceptance requires externally selected archive/manifest and explicit unique paths',()=>{
  assert.equal(parseNativeArguments(valid)['--manifest-sha256'],'a'.repeat(64));
  for(const args of [valid.slice(0,-2),[...valid,'--output','/other.json'],[...valid,'--unknown','x'],
    valid.map(value=>value==='/installed/jobs'?'relative':value),
    valid.map(value=>value==='a'.repeat(64)?'a'.repeat(63):value),valid.slice(0,6),
    valid.filter((_,index)=>index!==6&&index!==7)]) {
    assert.throws(()=>parseNativeArguments(args));
  }
  assert.equal(parseNativeArguments(valid)['--request'],'/request.txt');
  assert.equal(parseNativeArguments(valid)['--archive-sha256'],'b'.repeat(64));
  assert.equal(parseNativeArguments(valid)['--archive-bytes'],'449643');
  for(const key of ['--archive-sha256','--archive-bytes']) {
    const index=valid.indexOf(key);
    assert.throws(()=>parseNativeArguments(valid.filter((_,i)=>i!==index&&i!==index+1)),/Missing/);
    assert.throws(()=>parseNativeArguments([...valid,key,valid[index+1]]),/duplicate/);
  }
  for(const value of ['0','-1','1.5','1e3','+449643','0449643','449643 ','20000001','9007199254740992']) {
    assert.throws(()=>parseNativeArguments(valid.map((item,index)=>index===valid.indexOf('--archive-bytes')+1?value:item)),/archive byte count/);
  }
  assert.throws(()=>parseNativeArguments(valid.map(item=>item==='b'.repeat(64)?'b'.repeat(63):item)),/archive SHA-256/);
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

test('hosted callers select both archive identities from the saved original producer custody',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/discovery-installed-release.yml',import.meta.url),'utf8');
  const step=workflow.split('      - name: Run extracted operator and same-history native acceptance\n')[1]?.split('      - name:')[0];
  assert.ok(step,'The actual extracted acceptance workflow step is required');
  const script=step.split("node <<'NODE'\n")[1]?.split('\n          NODE')[0]?.replace(/^          /gm,'');
  assert.ok(script,'The actual acceptance command is required');
  const original={installedManifestSha256:'a'.repeat(64),archiveSha256:'b'.repeat(64),archiveBytes:449643};
  const calls=[],reads=[];
  const fakeFs={readFileSync(filename,encoding){
    reads.push(filename);assert.equal(encoding,'utf8');
    assert.equal(filename,'/fixture/discovery-saved-producer/jobs-discovery-installed.tar.gz.custody.json');
    return JSON.stringify(original);
  },mkdirSync(){}};
  vm.runInNewContext(script,{require(name){
    if(name==='node:fs')return fakeFs;
    if(name==='node:child_process')return {execFileSync(...args){calls.push(args);}};
    assert.equal(name,'node:assert/strict');return assert;
  },process:{env:{RUNNER_TEMP:'/fixture'},execPath:process.execPath}},{timeout:1000});
  assert.equal(reads.length,1);assert.equal(calls.length,2);
  const statusArgs=Array.from(calls[0][1]);
  assert.deepEqual(statusArgs.slice(1),['status','/fixture/discovery-installed',original.installedManifestSha256,
    original.archiveSha256,String(original.archiveBytes)]);
  const nativeArgs=parseNativeArguments(Array.from(calls[1][1]).slice(1));
  assert.equal(nativeArgs['--manifest-sha256'],original.installedManifestSha256);
  assert.equal(nativeArgs['--archive-sha256'],original.archiveSha256);
  assert.equal(nativeArgs['--archive-bytes'],String(original.archiveBytes));
  assert.equal(nativeArgs['--workspace'],'/fixture/discovery-saved-producer/browser-inputs/workspace.json');
  assert.equal(nativeArgs['--request'],'/fixture/discovery-saved-producer/browser-inputs/request.txt');
});


test('a missing original primary export never falls back to constructed native work',async()=>{
  const options={installedRoot:'/unused',manifestSha256:'a'.repeat(64),archiveSha256:'b'.repeat(64),archiveBytes:449643};
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
