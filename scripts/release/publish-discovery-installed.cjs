// SPDX-License-Identifier: MIT
'use strict';
// Explicit next-profile software publisher. It cannot select or waive rc16/rc17 source profiles.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const Q=require('./discovery-installed-qualification.cjs');
const RECORD_PATH='docs/successor/evidence/discovery-installed-publication-review.json';
const ASSET_NAMES=Object.freeze(['jobs-discovery-installed.tar.gz',Q.INSTALLER_ASSET,'installed-qualification-evidence.zip',
  'qualification.json','publication-review.json','provenance.json','SHA256SUMS.txt'].sort());
const RELEASE_TITLE='Jobs Discovery installed '+Q.VERSION;
const RELEASE_NOTES='Qualified installed local-review software; zero currency authority. See source-bound provenance, original hosted evidence and explicit operational limits.';
function args(values) {
  const [root,manifestSha256,verifierSha256,scopeVerifierSha256,runId,recordCommit,recordSha256,output]=values;
  assert.ok(path.isAbsolute(root||'') && path.isAbsolute(output||'') && !fs.existsSync(output));
  for(const value of [manifestSha256,verifierSha256,scopeVerifierSha256,recordSha256]) assert.match(value||'',/^[a-f0-9]{64}$/);
  assert.match(recordCommit||'',/^[a-f0-9]{40}$/);assert.ok(Number.isSafeInteger(Number(runId))&&Number(runId)>0);
  assert.ok(!output.startsWith(root+path.sep),'Publisher output must be outside the source');
  return {root,manifestSha256,verifierSha256,scopeVerifierSha256,runId:Number(runId),recordCommit,recordSha256,output};
}
function apiClient(token) {
  assert.ok(token,'Existing workflow token is required');
  return async(route,{absent=false}={})=>{
    assert.ok(/^[A-Za-z0-9_./?=&-]+$/.test(route)&&!route.startsWith('/'));
    const response=await fetch('https://api.github.com/repos/'+Q.REPOSITORY+'/'+route,{redirect:'error',signal:AbortSignal.timeout(30_000),
      headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
    if(absent&&response.status===404)return null;
    assert.ok(response.ok,'Publication server read failed: GET repos/'+Q.REPOSITORY+'/'+route+' HTTP '+response.status);
    const chunks=[];let size=0;const reader=response.body.getReader();
    try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;assert.ok(size<=16_000_000);chunks.push(Buffer.from(item.value));}}
    finally{await reader.cancel();}return Q.json(Buffer.concat(chunks));
  };
}
async function publicationRecordBytes(api,recordCommit,recordSha256) {
  assert.match(recordCommit||'',/^[a-f0-9]{40}$/);assert.match(recordSha256||'',/^[a-f0-9]{64}$/);
  const entry=await api('contents/'+RECORD_PATH+'?ref='+recordCommit);
  assert.equal(entry.type,'file');assert.equal(entry.path,RECORD_PATH);
  assert.match(entry.sha||'',/^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(entry.size)&&entry.size>0&&entry.size<=8_000_000,'Publication record size differs from its existing bound');
  assert.ok(entry.encoding==='base64'||entry.encoding==='none');assert.equal(typeof entry.content,'string');
  let encoded=entry.content;
  if(entry.encoding==='none') {
    assert.equal(entry.content,'','Encoding-none Contents metadata must not embed record bytes');
    const blob=await api('git/blobs/'+entry.sha);
    assert.equal(blob.sha,entry.sha);assert.equal(blob.size,entry.size);assert.equal(blob.encoding,'base64');
    assert.equal(typeof blob.content,'string');encoded=blob.content;
  }
  const canonical=encoded.replace(/[ \t\r\n]/g,'');
  assert.equal(canonical.length,4*Math.ceil(entry.size/3),'Publication record base64 length differs');
  assert.match(canonical,/^[A-Za-z0-9+/]*={0,2}$/);
  const bytes=Buffer.from(canonical,'base64');
  assert.equal(bytes.length,entry.size,'Publication record decoded size differs');
  assert.equal(bytes.toString('base64'),canonical,'Publication record base64 is not canonical');
  const sha=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  assert.equal(sha,entry.sha,'Publication record Git blob identity differs');
  assert.equal(Q.hash(bytes),recordSha256,'Publication record SHA256 differs');return bytes;
}
async function tagCommit(api,tag) {
  let object=(await api('git/ref/tags/'+tag,{absent:true}))?.object;
  for(let depth=0;object?.type==='tag'&&depth<4;depth++)object=(await api('git/tags/'+object.sha)).object;
  assert.ok(!object||object.type==='commit','Unsupported publication tag object');return object?.sha||null;
}
async function releaseInventory(api) {
  const rows=[],ids=new Set();
  for(let page=1;page<=20;page++) {
    const batch=await api('releases?per_page=100&page='+page);
    assert.ok(Array.isArray(batch)&&batch.length<=100,'A complete bounded release inventory page is required');
    for(const row of batch) {
      assert.ok(Number.isSafeInteger(row?.id)&&row.id>0&&!ids.has(row.id),'Duplicate or malformed release identity');
      assert.ok(typeof row.tag_name==='string'&&row.tag_name.length>0&&row.tag_name.length<=256);
      assert.equal(typeof row.draft,'boolean');assert.equal(typeof row.prerelease,'boolean');
      ids.add(row.id);rows.push(row);
    }
    if(batch.length<100)return rows;
  }
  throw Error('Release inventory did not terminate within bounded pagination');
}
async function requireAbsent(api,tag) {
  assert.equal(await tagCommit(api,tag),null,'Tag already exists; this publisher never overwrites it');
  assert.equal(await api('releases/tags/'+tag,{absent:true}),null,'Release already exists; preserve prior assets');
  const inventory=await releaseInventory(api);
  assert.equal(inventory.filter(row=>row.tag_name===tag).length,0,'A private draft or published release already reserves this tag');
  return inventory;
}
function draftMetadata(release) {
  assert.ok(Number.isSafeInteger(release?.id)&&release.id>0);assert.equal(release.draft,true);assert.equal(release.prerelease,true);
  assert.equal(release.tag_name,Q.TAG);assert.ok(typeof release.name==='string'&&typeof release.body==='string');
  return Object.fromEntries(['id','tag_name','target_commitish','draft','prerelease','name','body','created_at','updated_at']
    .map(key=>[key,release[key]]));
}
async function createdDraft(api,source,before) {
  assert.ok(Array.isArray(before));
  const matches=(await releaseInventory(api)).filter(row=>row.tag_name===Q.TAG);
  assert.equal(matches.length,1,'The newly created tag must identify exactly one draft');
  assert.ok(!before.some(row=>row.id===matches[0].id),'A historical release ID cannot be adopted');
  const current=await api('releases/'+matches[0].id);
  assert.deepEqual(draftMetadata(current),draftMetadata(matches[0]),'Created draft inventory and ID read differ');
  assert.equal(current.target_commitish,source.sourceCommit,'Created draft target differs from qualified source');
  assert.equal(current.name,RELEASE_TITLE,'Created draft title differs from this publication');
  assert.equal(current.body,RELEASE_NOTES,'Created draft notes differ from this publication');
  assert.deepEqual(current.assets,[],'Newly created draft must be empty before its own uploads');
  return current;
}
async function uploadAssets(release,directory,expected,{fetcher=fetch,token=process.env.GH_TOKEN}={}) {
  draftMetadata(release);assert.deepEqual(release.assets,[]);
  assert.deepEqual(Object.keys(expected).sort(),ASSET_NAMES);assert.equal(typeof fetcher,'function');
  assert.ok(typeof token==='string'&&token,'Existing workflow token is required');
  const cancel=async(body,operation)=>{if(body)try{await body.cancel();}catch{throw Error(operation+' cleanup failed');}};
  const uploaded=[];
  for(const name of ASSET_NAMES) {
    const operation='Release asset POST repos/'+Q.REPOSITORY+'/releases/'+release.id+'/assets?name='+name;
    const raw=Q.bounded(path.join(directory,name));
    assert.equal(raw.length,expected[name].bytes);assert.equal(Q.hash(raw),expected[name].sha256);
    let response;
    try {response=await fetcher('https://uploads.github.com/repos/'+Q.REPOSITORY+'/releases/'+release.id+'/assets?name='+name,
      {method:'POST',redirect:'error',signal:AbortSignal.timeout(90_000),body:raw,
        headers:{Accept:'application/vnd.github+json','Content-Type':'application/octet-stream',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});}
    catch {throw Error(operation+' request failed');}
    if(response.status!==201){await cancel(response.body,operation);throw Error(operation+' HTTP '+response.status);}
    assert.ok(response.body,operation+' response body is absent');
    let size=0;const chunks=[];const reader=response.body.getReader();
    try {while(true){let item;try{item=await reader.read();}catch{throw Error(operation+' response stream failed');}
      if(item.done)break;size+=item.value.byteLength;assert.ok(size<=1_000_000,'Bounded upload JSON is required');chunks.push(Buffer.from(item.value));}}
    finally {await cancel(reader,operation);}
    let asset;try {asset=Q.json(Buffer.concat(chunks));assert.equal(asset.name,name);assert.equal(asset.state,'uploaded');
      assetLease([asset],{[name]:expected[name]});}catch{throw Error('Fixed release-ID upload response identity differs');}
    uploaded.push(asset);
  }
  assetLease(uploaded,expected);return uploaded;
}
async function downloadAssets(directory,release,expected,{download=Q.downloadReleaseAsset}={}) {
  const assets=assetLease(release.assets,expected);assert.equal(typeof download,'function');
  assert.deepEqual(Object.keys(expected).sort(),ASSET_NAMES);
  for(const asset of assets) {
    const raw=await download(asset.id);assert.equal(raw.length,asset.size,'Release-ID asset byte count differs');
    assert.equal('sha256:'+Q.hash(raw),asset.digest,'Release-ID asset byte digest differs');
    fs.writeFileSync(path.join(directory,asset.name),raw,{flag:'wx',mode:0o600});
  }
  return verifyAssets(directory,Object.fromEntries(Object.entries(expected).map(([name,item])=>[name,item.sha256])));
}
function gh(values) {
  return execFileSync('gh',values,{timeout:90_000,maxBuffer:64_000_000,stdio:['ignore','pipe','pipe']});
}
function verifyAssets(directory,files) {
  assert.deepEqual(fs.readdirSync(directory).sort(),Object.keys(files).sort(),'Downloaded release asset inventory differs');
  for(const [name,expected] of Object.entries(files)) assert.equal(Q.hash(Q.bounded(path.join(directory,name))),expected,'Downloaded release bytes differ: '+name);
  const provenance=Q.json(Q.bounded(path.join(directory,'provenance.json')));
  assert.equal(provenance.productionApproved,false);assert.equal(provenance.authority,'none');
  assert.equal(provenance.profile,'jobs-discovery-installed-v1');return provenance;
}
function assetLease(assets,expected=null) {
  assert.ok(Array.isArray(assets)&&assets.length>0&&assets.length<=128);
  assert.equal(new Set(assets.map(item=>item.id)).size,assets.length);
  assert.equal(new Set(assets.map(item=>item.name)).size,assets.length);
  const result=assets.map(item=>{
    assert.ok(Number.isSafeInteger(item.id)&&item.id>0&&typeof item.name==='string');
    assert.ok(Number.isSafeInteger(item.size)&&item.size>=0);assert.match(item.digest||'',/^sha256:[a-f0-9]{64}$/);
    if(expected) {assert.ok(Object.hasOwn(expected,item.name));assert.equal(item.digest,'sha256:'+expected[item.name].sha256);
      assert.equal(item.size,expected[item.name].bytes);}
    return {id:item.id,name:item.name,size:item.size,digest:item.digest};
  }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  if(expected)assert.deepEqual(result.map(item=>item.name),Object.keys(expected).sort());
  return result;
}
function draftLease(release,expected) {
  return {...draftMetadata(release),assets:assetLease(release.assets,expected)};
}
function prerequisiteLease(release) {
  assert.ok(Number.isSafeInteger(release.id)&&release.id>0);assert.equal(release.draft,false);
  assert.equal(release.tag_name,'source-v2.1.0-rc.17');assert.ok(typeof release.published_at==='string'&&release.published_at);
  return Object.fromEntries(['id','tag_name','target_commitish','draft','prerelease','published_at']
    .map(key=>[key,release[key]]).concat([['assets',assetLease(release.assets)]]));
}
async function verifyPublicationLeases(api,{source,record,prerequisite,draft,expected}) {
  assert.deepEqual(prerequisiteLease(await api('releases/tags/source-v2.1.0-rc.17')),prerequisite,
    'Published prerequisite release or asset identities changed');
  assert.equal(await tagCommit(api,'source-v2.1.0-rc.17'),record.prerequisite.commit,'Prerequisite tag changed');
  assert.equal((await api('git/commits/'+record.prerequisite.commit)).tree?.sha,record.prerequisite.tree,'Prerequisite tree changed');
  const matches=(await releaseInventory(api)).filter(row=>row.tag_name===Q.TAG);
  assert.equal(matches.length,1,'The verified draft tag became ambiguous');assert.equal(matches[0].id,draft.id);
  const current=await api('releases/'+draft.id);
  assert.deepEqual(draftLease(current,expected),draft,'Verified draft identity, state or assets changed');
  assert.equal(current.target_commitish,source.sourceCommit,'Draft target differs from qualified source');
  const tag=await tagCommit(api,Q.TAG);assert.ok(tag===null||tag===source.sourceCommit,'Publication tag changed');
  // This is deliberately the final server read before publishing this exact release ID.
  assert.equal((await api('git/ref/heads/main')).object?.sha,source.sourceCommit,'Actual main moved before publication');
  return current.id;
}
async function publish(options,{api=apiClient(process.env.GH_TOKEN),command=gh,upload=uploadAssets,download=downloadAssets}={}) {
  assert.equal(process.env.GITHUB_REPOSITORY,Q.REPOSITORY);
  assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.GITHUB_ACTOR,process.env.GITHUB_REPOSITORY_OWNER,'Owner-selected software publication only');
  const {recordCommit,recordSha256,output}=options;
  const source=Q.sourceProof(options);assert.equal(source.sourceCommit,process.env.GITHUB_SHA);
  const recordBytes=await publicationRecordBytes(api,recordCommit,recordSha256);
  const record=Q.json(recordBytes);
  // The record is separate immutable public evidence so it can name the exact source commit.
  assert.equal(record.source?.commit,source.sourceCommit);assert.equal(record.source?.tree,source.sourceTree);
  const prerequisite=await api('releases/tags/source-v2.1.0-rc.17');assert.equal(prerequisite.draft,false);assert.equal(prerequisite.tag_name,'source-v2.1.0-rc.17');
  const prerequisiteSnapshot=prerequisiteLease(prerequisite);
  assert.equal(await tagCommit(api,prerequisite.tag_name),record.prerequisite?.commit,'Actual qualified prerequisite tag differs');
  assert.equal((await api('git/commits/'+record.prerequisite.commit)).tree?.sha,record.prerequisite.tree,'Qualified prerequisite tree differs');
  await requireAbsent(api,Q.TAG);
  const privateRoot=fs.mkdtempSync(path.join(path.dirname(output),'jobs-discovery-publish-'));fs.chmodSync(privateRoot,0o700);
  const recordFile=path.join(privateRoot,'publication-review.json');fs.writeFileSync(recordFile,recordBytes,{flag:'wx',mode:0o600});
  const qualified=path.join(privateRoot,'qualified');
  const proof=await Q.qualify({...options,recordFile,recordSha256,output:qualified,api});
  fs.mkdirSync(output,{mode:0o700});
  const evidenceArchive=path.join(output,'installed-qualification-evidence.zip');
  execFileSync('python3',['-I','-c',
    'import sys,pathlib,zipfile,stat\nr=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2])\nwith zipfile.ZipFile(o,"x",zipfile.ZIP_DEFLATED) as z:\n for p in sorted(r.iterdir()):\n  assert p.is_file() and not p.is_symlink() and p.stat().st_size<=64000000\n  i=zipfile.ZipInfo(p.name);i.date_time=(1980,1,1,0,0,0);i.external_attr=(stat.S_IFREG|0o644)<<16;z.writestr(i,p.read_bytes())',
    qualified,evidenceArchive],{timeout:30_000,maxBuffer:1_000_000});
  const files={'installed-qualification-evidence.zip':Q.hash(Q.bounded(evidenceArchive))};
  for(const [name,raw] of [
    ['jobs-discovery-installed.tar.gz',Q.bounded(path.join(qualified,'jobs-discovery-installed.tar.gz'))],
    [Q.INSTALLER_ASSET,Q.bounded(path.join(qualified,Q.INSTALLER_ASSET))],
    ['qualification.json',Q.bounded(path.join(qualified,'qualification.json'))],
    ['publication-review.json',recordBytes],
  ]) {fs.writeFileSync(path.join(output,name),raw,{flag:'wx'});files[name]=Q.hash(raw);}
  const provenance={schema:'agijobsv0/discovery-installed-release-provenance/v1',repository:Q.REPOSITORY,profile:'jobs-discovery-installed-v1',
    releaseVersion:Q.VERSION,tag:Q.TAG,source:{commit:source.sourceCommit,tree:source.sourceTree},
    selection:proof.selection,alpha:proof.alpha,capsule:proof.capsule,installer:proof.installer,qualifiedProducer:proof.producerRun,
    publicationRecord:{commit:recordCommit,path:RECORD_PATH,sha256:recordSha256},
    softwareReleaseQualified:true,productionApproved:false,authority:'none',currencyCapBaseUnits:'0',
    scope:'Installed local synthetic receiver/checker and preserved same-mission docket. No external execution, currency funding, settlement or mainnet operation.'};
  const raw=Buffer.from(JSON.stringify(provenance,null,2)+'\n');fs.writeFileSync(path.join(output,'provenance.json'),raw,{flag:'wx'});files['provenance.json']=Q.hash(raw);
  const sums=Buffer.from(Object.keys(files).sort().map(name=>files[name]+'  '+name).join('\n')+'\n');
  fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),sums,{flag:'wx'});files['SHA256SUMS.txt']=Q.hash(sums);
  assert.equal((await api('git/ref/heads/main')).object?.sha,source.sourceCommit,'Actual main moved before draft creation');
  const beforeDraft=await requireAbsent(api,Q.TAG);
  command(['release','create',Q.TAG,'--repo',Q.REPOSITORY,'--target',source.sourceCommit,'--draft','--prerelease',
    '--title',RELEASE_TITLE,'--notes',RELEASE_NOTES]);
  const created=await createdDraft(api,source,beforeDraft);
  const expected=Object.fromEntries(Object.entries(files).map(([name,sha256])=>[name,{sha256,bytes:fs.statSync(path.join(output,name)).size}]));
  const uploaded=assetLease(await upload(created,output,expected),expected);
  const draft=await api('releases/'+created.id);assert.equal(draft.draft,true);assert.equal(draft.prerelease,true);
  for(const key of ['id','tag_name','target_commitish','name','body','created_at'])assert.equal(draft[key],created[key],'Uploaded draft identity changed');
  assert.deepEqual(draft.assets.map(item=>item.name).sort(),Object.keys(files).sort());
  assert.deepEqual(assetLease(draft.assets,expected),uploaded,'Uploaded asset IDs changed before the initial draft read');
  const draftSnapshot=draftLease(draft,expected);assert.equal(draft.target_commitish,source.sourceCommit);
  const downloaded=path.join(privateRoot,'draft-readback');fs.mkdirSync(downloaded,{mode:0o700});
  await download(downloaded,draft,expected);
  const draftTag=await tagCommit(api,Q.TAG);
  if(draftTag===null)assert.equal(draft.target_commitish,source.sourceCommit,'Uncreated draft tag must retain the exact qualified source');
  else assert.equal(draftTag,source.sourceCommit);
  assert.equal((await api('git/ref/heads/main')).object?.sha,source.sourceCommit,'Actual main moved before publication');
  // Reobserve all live gates and original bytes immediately before making the verified draft public.
  await Q.qualify({...options,recordFile,recordSha256,output:path.join(privateRoot,'final-qualified'),api});
  const finalDownloaded=path.join(privateRoot,'final-draft-readback');fs.mkdirSync(finalDownloaded,{mode:0o700});
  const finalDraft=await api('releases/'+draft.id);assert.deepEqual(draftLease(finalDraft,expected),draftSnapshot);
  await download(finalDownloaded,finalDraft,expected);
  const leasedReleaseId=await verifyPublicationLeases(api,{source,record,prerequisite:prerequisiteSnapshot,draft:draftSnapshot,expected});
  command(['api','--method','PATCH','repos/'+Q.REPOSITORY+'/releases/'+leasedReleaseId,'--field','draft=false','--field','prerelease=true']);
  const released=await api('releases/'+leasedReleaseId);assert.equal(released.draft,false);assert.equal(released.prerelease,true);
  assert.equal(released.tag_name,Q.TAG);assert.equal(released.target_commitish,source.sourceCommit);
  assert.equal(released.id,leasedReleaseId);assert.deepEqual(assetLease(released.assets,expected),draftSnapshot.assets);
  assert.equal(await tagCommit(api,Q.TAG),source.sourceCommit,'Published tag differs from the qualified source');
  const publicReadback=path.join(privateRoot,'public-readback');fs.mkdirSync(publicReadback,{mode:0o700});
  await download(publicReadback,released,expected);
  const observation={schema:'agijobsv0/discovery-installed-public-byte-observation/v1',releaseId:released.id,tag:Q.TAG,
    sourceCommit:source.sourceCommit,sourceTree:source.sourceTree,assets:Object.entries(files).map(([name,sha256])=>({name,sha256})),
    draftAndPublicBytesIndependentlyDownloaded:true,productionApproved:false,authority:'none'};
  fs.writeFileSync(path.join(privateRoot,'public-byte-observation.json'),JSON.stringify(observation,null,2)+'\n',{flag:'wx'});return observation;
}
module.exports={args,RECORD_PATH,ASSET_NAMES,RELEASE_TITLE,RELEASE_NOTES,apiClient,publicationRecordBytes,tagCommit,releaseInventory,requireAbsent,createdDraft,uploadAssets,downloadAssets,verifyAssets,assetLease,draftLease,prerequisiteLease,verifyPublicationLeases,publish};
if(require.main===module) {
  (async()=>publish(args(process.argv.slice(2))))().then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
