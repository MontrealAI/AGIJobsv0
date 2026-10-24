// SPDX-License-Identifier: MIT
'use strict';
// Reuse one immutable, accepted anonymous-download receipt. New consumer
// installation, source/pack checks and every live release lease remain separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SOURCE=Object.freeze({commit:'031bdb5d055c8bad896daa076baea2b5e17b242c',
  tree:'330e0e58268ed32990f04278fc543c71db45fd46',
  sourceHash:'54769dbfde99ae13708a33292866f0ca7e6b8b7792a7a944f76bf2fbf1de1358',
  catalogSha256:'d1c3cb9a5c3eb96e9e5eb111b83a713786ec18ed1213a407cd77bbaf018c5adb'});
const VERSION='1.41.0',RELEASE_ID=422636845,RUN_ID=40076340788;
const RECEIPT_PATH=path.resolve(__dirname,'../../config/discovery-alpha141-retained-public-assets-v1.json');
const RECEIPT_SHA256='56f42c02d933f72022466ef4b782220b8d3d7e94925066f8adfc1c3902789d6a';
const PROOF_URL='https://github.com/MontrealAI/AGI-Alpha-Agent-v0/tree/24b278e46a25049ec63f0ca059d5f555d487369a/docs/delivery/recovery-20261023/completion-qualification/alpha141-final-public';
const PROOF_ZIP_SHA256='88f70ffaf738b728a181d8c95e3732c2bc0e8f99fd9065439b7be189d08c6d82';
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const matches=alpha=>Object.entries(SOURCE).every(([key,value])=>alpha?.[key]===value);
const publicUrl=name=>'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/releases/download/v'+VERSION+'/'+encodeURIComponent(name);
function receipt() {
  assert.equal(fs.realpathSync(RECEIPT_PATH),RECEIPT_PATH,'Retained receipt path must be direct');
  const fd=fs.openSync(RECEIPT_PATH,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  let raw;
  try {
    const before=fs.fstatSync(fd);assert.ok(before.isFile()&&before.size===22913,'Exact accepted receipt byte count differs');
    raw=Buffer.alloc(before.size+1);let used=0;
    while(used<raw.length){const n=fs.readSync(fd,raw,used,raw.length-used,null);if(!n)break;used+=n;}
    const after=fs.fstatSync(fd);assert.equal(used,before.size);
    for(const key of ['dev','ino','mode','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key]);
    raw=raw.subarray(0,used);
  } finally {fs.closeSync(fd);}
  assert.equal(sha(raw),RECEIPT_SHA256,'Retained acceptance bytes differ from the reviewed original');
  const record=JSON.parse(raw.toString('utf8'));
  assert.equal(record.schema,'delivery/public-alpha141-asset-verification/v1');
  assert.equal(record.source,SOURCE.commit);assert.equal(record.releaseId,RELEASE_ID);assert.equal(record.tag,'v'+VERSION);
  assert.equal(record.allPublicAssetsVerified,true);assert.equal(record.exactInventoryAndChecksumSet,true);
  assert.deepEqual(record.failures,[]);assert.equal(record.publicationMutations,0);
  assert.equal(record.assets.length,106);assert.equal(new Set(record.assets.map(row=>row.name)).size,106);
  for(const row of record.assets)assert.equal(row.publicGET,true);
  return record;
}
function profile(alpha,version) {
  assert.ok(matches(alpha),'Retained profile requires the exact reviewed Alpha 1.41 source tuple');
  assert.equal(version,VERSION);
  return {...SOURCE,version:VERSION,requiredNames:receipt().assets.map(row=>row.name),
    packManifests:[{name:'browser-packs.json',prefix:'browser',distribution:'browser'},
      {name:'site-packs.json',prefix:'site',distribution:'site'},
      {name:'alpha-agent-v1.41.0-public-validation-packs.json',prefix:'alpha-agent-v1.41.0-public-validation',distribution:null}]};
}
function validateInventory(assets) {
  const record=receipt();
  assert.ok(Array.isArray(assets));assert.equal(assets.length,record.assets.length,'Complete live Alpha asset set changed');
  const expected=new Map(record.assets.map(row=>[row.name,row])),seen=new Set();
  for(const asset of assets) {
    const row=expected.get(asset.name);assert.ok(row&&!seen.has(asset.name),'Unknown or duplicate live Alpha asset');seen.add(asset.name);
    assert.equal(asset.id,row.id);assert.equal(asset.size,row.bytes);assert.equal(asset.digest,'sha256:'+row.sha256,
      'Live asset identity differs from the retained anonymous body observation');
    assert.equal(asset.url,publicUrl(row.name),'Live asset URL differs from the accepted public release route');
  }
  return expected;
}
function reader(alpha,release,qualification,assets,freshReader) {
  assert.ok(matches(alpha));assert.equal(release.id,RELEASE_ID);assert.equal(release.tag_name,'v'+VERSION);
  assert.equal(qualification.runId,RUN_ID);assert.equal(qualification.runAttempt,1);
  assert.equal(qualification.releaseId,RELEASE_ID);assert.equal(qualification.releaseTag,'v'+VERSION);
  assert.equal(typeof freshReader,'function');const expected=validateInventory(assets);
  return async(asset,options={})=>{
    const row=expected.get(asset.name);assert.ok(row);assert.equal(asset.id,row.id);assert.equal(asset.size,row.bytes);
    assert.equal(asset.digest,'sha256:'+row.sha256);
    assert.equal(asset.url,publicUrl(row.name));
    // Structural metadata and the operator source ZIP still receive fresh bytes.
    if(options.keep||options.fileDescriptor!==undefined)return freshReader(asset,options);
    return {id:asset.id,name:asset.name,bytes:row.bytes,sha256:row.sha256,publicUrl:asset.url,
      httpStatus:200,authorizationHeaderSent:false,
      retainedObservation:{scope:'Original accepted anonymous HTTPS body observation; no new body request here.',
        evidence:PROOF_URL,proofZipSha256:PROOF_ZIP_SHA256,receiptSha256:RECEIPT_SHA256,
        sourceCommit:SOURCE.commit,releaseId:RELEASE_ID,freshBodyRequest:false}};
  };
}
module.exports={SOURCE,VERSION,RELEASE_ID,RUN_ID,RECEIPT_SHA256,PROOF_URL,PROOF_ZIP_SHA256,matches,receipt,profile,validateInventory,reader};
