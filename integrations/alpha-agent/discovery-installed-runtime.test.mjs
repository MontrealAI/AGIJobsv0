// SPDX-License-Identifier: MIT
// Inert inventory framing only; no supplied module or installed runtime is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installedNames,installationCapsule,captureInstalled,validateInstalledAlphaCatalog} from './discovery-installed-runtime.mjs';
import {installedStatus,inspectInstalledRequest} from './discovery-installed-operator.mjs';
import {createModuleBoundary} from './discovery-installed-module-graph-runtime.mjs';

const selection={installedRoot:'/unused',manifestSha256:'a'.repeat(64),archiveSha256:'b'.repeat(64),archiveBytes:449643};
const custody={schema:'agijobsv0/discovery-installed-extraction/v1',archiveSha256:selection.archiveSha256,
  archiveBytes:selection.archiveBytes,installedManifestSha256:selection.manifestSha256,
  authority:'none',state:'EXTRACTED_INACTIVE_LOCAL_REVIEW_ONLY'};

const catalog141Raw=fs.readFileSync(new URL('./fixtures/alpha141-source-catalog.json',import.meta.url));
const catalog141=JSON.parse(catalog141Raw);
const alpha141={commit:'031bdb5d055c8bad896daa076baea2b5e17b242c',tree:'330e0e58268ed32990f04278fc543c71db45fd46',
  sourceHash:catalog141.sourceHash,catalogSha256:createHash('sha256').update(catalog141Raw).digest('hex')};

test('catalog admission retains the released41-source Alpha and admits exact031b metadata',()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../../config/discovery-installed-alpha-v1.json',import.meta.url)));
  const sources=Object.fromEntries(Object.entries(old.files).filter(([name])=>
    !['LICENSE','examples/successor-capability/discovery-lab-inspector.mjs'].includes(name)));
  validateInstalledAlphaCatalog({schema:'successor-capability-source/v1',sourceHash:old.sourceHash,sources},old);
  assert.equal(Object.keys(sources).length,41);assert.equal(Object.keys(catalog141.sources).length,53);
  validateInstalledAlphaCatalog(catalog141,alpha141);
});

test('an expanded catalog needs every exact031b source identity',()=>{
  for(const key of Object.keys(alpha141)) {
    assert.throws(()=>validateInstalledAlphaCatalog(catalog141,{...alpha141,[key]:'0'.repeat(alpha141[key].length)}));
    const omitted={...alpha141};delete omitted[key];assert.throws(()=>validateInstalledAlphaCatalog(catalog141,omitted));
  }
});

test('exact031b labels do not admit a truncated or changed source map',()=>{
  const changed=structuredClone(catalog141),first=Object.keys(changed.sources)[0];
  changed.sources[first]='0'.repeat(64);assert.throws(()=>validateInstalledAlphaCatalog(changed,alpha141));
  delete changed.sources[first];assert.throws(()=>validateInstalledAlphaCatalog(changed,alpha141));
});

test('extraction provenance requires an independent exact archive selection',()=>{
  const capsule=installationCapsule(selection,custody);
  assert.deepEqual(capsule,{sha256:selection.archiveSha256,bytes:selection.archiveBytes,manifestSha256:selection.manifestSha256});
  assert.ok(Object.isFrozen(capsule));
  for(const changed of [{archiveSha256:'c'.repeat(64)},{archiveBytes:449644},
    {archiveSha256:'c'.repeat(64),archiveBytes:449644},{installedManifestSha256:'c'.repeat(64)},
    {schema:'other'},{authority:'operator'},{state:'QUALIFIED'},{extra:true}]) {
    assert.throws(()=>installationCapsule(selection,{...custody,...changed}),/Extraction custody/);
  }
  for(const key of Object.keys(custody)) {
    const missing={...custody};delete missing[key];
    assert.throws(()=>installationCapsule(selection,missing),/Extraction custody/);
  }
});

test('mutable custody never supplies omitted or coerced external selection',async()=>{
  for(const key of ['archiveSha256','archiveBytes','manifestSha256']) {
    const missing={...selection};delete missing[key];
    assert.throws(()=>installationCapsule(missing,custody),/independently selected/);
    assert.throws(()=>captureInstalled(missing),/independently selected/);
    assert.throws(()=>installedStatus(missing),/option fields/);
    await assert.rejects(inspectInstalledRequest({...missing,workspaceRaw:'{}',requestRaw:'{}'}),/option fields/);
  }
  for(const archiveBytes of ['449643',true,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,20_000_001]) {
    assert.throws(()=>installationCapsule({...selection,archiveBytes},custody),/bounded positive safe integer/);
    assert.throws(()=>installedStatus({...selection,archiveBytes}),/bounded positive safe integer/);
  }
  assert.throws(()=>installationCapsule({...selection,archiveSha256:'B'.repeat(64)},custody),/archive SHA-256/);
});

test('provenance fields must be inert own data before any installed source capture',()=>{
  let reads=0;
  const getter={...selection};Object.defineProperty(getter,'archiveBytes',{get(){reads++;return 449643;}});
  assert.throws(()=>installationCapsule(getter,custody),/inert own data/);
  const custodyGetter={...custody};Object.defineProperty(custodyGetter,'archiveSha256',{get(){reads++;return selection.archiveSha256;}});
  assert.throws(()=>installationCapsule(selection,custodyGetter),/inert own data/);
  assert.throws(()=>installationCapsule(new Proxy(selection,{ownKeys(){reads++;return [];}}),custody));
  assert.throws(()=>installationCapsule(selection,new Proxy(custody,{ownKeys(){reads++;return [];}})));
  assert.equal(reads,0);
});

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
