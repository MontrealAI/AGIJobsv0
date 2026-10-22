// SPDX-License-Identifier: MIT
'use strict';
// Explicit next-profile software publisher. It cannot select or waive rc16/rc17 source profiles.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const Q=require('./discovery-installed-qualification.cjs');
const RECORD_PATH='docs/successor/evidence/discovery-installed-publication-review.json';
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
    assert.ok(response.ok,'Publication server read failed: HTTP '+response.status);
    const chunks=[];let size=0;const reader=response.body.getReader();
    try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;assert.ok(size<=16_000_000);chunks.push(Buffer.from(item.value));}}
    finally{await reader.cancel();}return Q.json(Buffer.concat(chunks));
  };
}
async function tagCommit(api,tag) {
  let object=(await api('git/ref/tags/'+tag,{absent:true}))?.object;
  for(let depth=0;object?.type==='tag'&&depth<4;depth++)object=(await api('git/tags/'+object.sha)).object;
  assert.ok(!object||object.type==='commit','Unsupported publication tag object');return object?.sha||null;
}
async function requireAbsent(api,tag) {
  assert.equal(await tagCommit(api,tag),null,'Tag already exists; this publisher never overwrites it');
  assert.equal(await api('releases/tags/'+tag,{absent:true}),null,'Release already exists; preserve prior assets');
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
  assert.ok(Number.isSafeInteger(release.id)&&release.id>0);assert.equal(release.draft,true);assert.equal(release.prerelease,true);
  assert.equal(release.tag_name,Q.TAG);assert.ok(typeof release.name==='string'&&typeof release.body==='string');
  return Object.fromEntries(['id','tag_name','target_commitish','draft','prerelease','name','body','created_at','updated_at']
    .map(key=>[key,release[key]]).concat([['assets',assetLease(release.assets,expected)]]));
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
  const current=await api('releases/tags/'+Q.TAG);
  assert.deepEqual(draftLease(current,expected),draft,'Verified draft identity, state or assets changed');
  assert.equal(current.target_commitish,source.sourceCommit,'Draft target differs from qualified source');
  const tag=await tagCommit(api,Q.TAG);assert.ok(tag===null||tag===source.sourceCommit,'Publication tag changed');
  // This is deliberately the final server read before publishing this exact release ID.
  assert.equal((await api('git/ref/heads/main')).object?.sha,source.sourceCommit,'Actual main moved before publication');
  return current.id;
}
async function publish(options,{api=apiClient(process.env.GH_TOKEN),command=gh}={}) {
  assert.equal(process.env.GITHUB_REPOSITORY,Q.REPOSITORY);
  assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.GITHUB_ACTOR,process.env.GITHUB_REPOSITORY_OWNER,'Owner-selected software publication only');
  const {root,recordCommit,recordSha256,output}=options;
  const source=Q.sourceProof(options);assert.equal(source.sourceCommit,process.env.GITHUB_SHA);
  const remote=await api('contents/'+RECORD_PATH+'?ref='+recordCommit);
  assert.equal(remote.type,'file');assert.equal(remote.encoding,'base64');
  const recordBytes=Buffer.from(remote.content.replace(/\s+/g,''),'base64');assert.equal(Q.hash(recordBytes),recordSha256);
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
  await requireAbsent(api,Q.TAG);
  command(['release','create',Q.TAG,'--repo',Q.REPOSITORY,'--target',source.sourceCommit,'--draft','--prerelease',
    '--title','Jobs Discovery installed '+Q.VERSION,'--notes','Qualified installed local-review software; zero currency authority. See source-bound provenance, original hosted evidence and explicit operational limits.']);
  command(['release','upload',Q.TAG,...Object.keys(files).sort().map(name=>path.join(output,name)),'--repo',Q.REPOSITORY]);
  const draft=await api('releases/tags/'+Q.TAG);assert.equal(draft.draft,true);assert.equal(draft.prerelease,true);
  assert.deepEqual(draft.assets.map(item=>item.name).sort(),Object.keys(files).sort());
  const expected=Object.fromEntries(Object.entries(files).map(([name,sha256])=>[name,{sha256,bytes:fs.statSync(path.join(output,name)).size}]));
  const draftSnapshot=draftLease(draft,expected);assert.equal(draft.target_commitish,source.sourceCommit);
  const downloaded=path.join(privateRoot,'draft-readback');fs.mkdirSync(downloaded,{mode:0o700});
  command(['release','download',Q.TAG,'--repo',Q.REPOSITORY,'--dir',downloaded]);verifyAssets(downloaded,files);
  const draftTag=await tagCommit(api,Q.TAG);
  if(draftTag===null)assert.equal(draft.target_commitish,source.sourceCommit,'Uncreated draft tag must retain the exact qualified source');
  else assert.equal(draftTag,source.sourceCommit);
  assert.equal((await api('git/ref/heads/main')).object?.sha,source.sourceCommit,'Actual main moved before publication');
  // Reobserve all live gates and original bytes immediately before making the verified draft public.
  await Q.qualify({...options,recordFile,recordSha256,output:path.join(privateRoot,'final-qualified'),api});
  const finalDownloaded=path.join(privateRoot,'final-draft-readback');fs.mkdirSync(finalDownloaded,{mode:0o700});
  command(['release','download',Q.TAG,'--repo',Q.REPOSITORY,'--dir',finalDownloaded]);verifyAssets(finalDownloaded,files);
  const leasedReleaseId=await verifyPublicationLeases(api,{source,record,prerequisite:prerequisiteSnapshot,draft:draftSnapshot,expected});
  command(['api','--method','PATCH','repos/'+Q.REPOSITORY+'/releases/'+leasedReleaseId,'--field','draft=false','--field','prerelease=true']);
  const released=await api('releases/tags/'+Q.TAG);assert.equal(released.draft,false);assert.equal(released.prerelease,true);
  assert.equal(released.id,leasedReleaseId);assert.deepEqual(assetLease(released.assets,expected),draftSnapshot.assets);
  assert.equal(await tagCommit(api,Q.TAG),source.sourceCommit,'Published tag differs from the qualified source');
  const publicReadback=path.join(privateRoot,'public-readback');fs.mkdirSync(publicReadback,{mode:0o700});
  command(['release','download',Q.TAG,'--repo',Q.REPOSITORY,'--dir',publicReadback]);verifyAssets(publicReadback,files);
  const observation={schema:'agijobsv0/discovery-installed-public-byte-observation/v1',releaseId:released.id,tag:Q.TAG,
    sourceCommit:source.sourceCommit,sourceTree:source.sourceTree,assets:Object.entries(files).map(([name,sha256])=>({name,sha256})),
    draftAndPublicBytesIndependentlyDownloaded:true,productionApproved:false,authority:'none'};
  fs.writeFileSync(path.join(privateRoot,'public-byte-observation.json'),JSON.stringify(observation,null,2)+'\n',{flag:'wx'});return observation;
}
module.exports={args,RECORD_PATH,apiClient,tagCommit,requireAbsent,verifyAssets,assetLease,draftLease,prerequisiteLease,verifyPublicationLeases,publish};
if(require.main===module) {
  (async()=>publish(args(process.argv.slice(2))))().then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
