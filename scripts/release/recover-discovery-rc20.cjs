// SPDX-License-Identifier: MIT
'use strict';
// Recovery tooling has a separate review epoch. Payload bytes remain the original f7 source.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const D=require('./anonymous-alpha-metadata-diagnostic.cjs');
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const FIXED=Object.freeze({repository:'MontrealAI/AGIJobsv0',releaseId:422158983,tag:'discovery-v2.1.0-rc.20',
  sourceCommit:'f7c00e668fe31ce1ea907f0006b6c14dc9db5e01',sourceTree:'17c1cf5ccca47d427401e2832433e325d5e10563',
  sourceCommitDate:'2026-10-23T17:20:46Z',
  runId:39994300685,creationArtifactId:12521657234,creationArtifactSha256:'9f921673405bcc46286bb2b00cf55ec75be74456f995b916567eacce3105502b',
  creationSha256:'e67e74be17f44a7299299f532cc45fe6d7ba0c5c17569a7ac341528db9190538',creationBytes:2031,
  creationMember:'discovery-installed-release-assets.creation-response.json',
  recordCommit:'a0114afd51d03e97d6bbf66c7ab77d6e89c8c84e',recordSha256:'1b08267c5cee0a44cbb23790c8cc48ef02b40e99927db33540b345150b935985',
  manifestSha256:'315734059e8e8693a1a1c81a68286437d6bf6481f6e3232f23b53fed254de112',
  verifierSha256:'9a4663f6092c475ae8bd850397fcc2a87452de67781b3ab78cc1c8406945b737',
  scopeVerifierSha256:'691986b3b07b58bcb2392f9e78a5ee32a200ff3cb14a86a2ffcae525ef68b46d'});
const SOURCE_MODULES=Object.freeze({
  'discovery-installed-qualification.cjs':'286495bbad3c0de398964efe6717c8f8d4a1bdafeb21990d62f780a65bde73ce',
  'publish-discovery-installed.cjs':'2eb1c51abcdc25357e95ff08c681ac683297e92ad29559e44224f9a8303b75a0',
  'capture-discovery-browser-input.cjs':'170ef450c718e6a54719a970939d68a3b46b443adb017eadf15e35ab6c7adcfe'});
const TOOLING_BEFORE=Object.freeze({
  '.github/workflows/discovery-installed-release.yml':'7ee1166946a656976f660badbd08d817114ea493f3674e8bb12b9bf20d99396b',
  'config/discovery-installed-candidate-v1.json':FIXED.manifestSha256,
  'scripts/release/discovery-installed-profile.py':FIXED.verifierSha256,
  'scripts/release/discovery-installed-qualification.cjs':SOURCE_MODULES['discovery-installed-qualification.cjs'],
  'scripts/release/discovery-installed-release.test.cjs':'adf751ee24cf8eadf1f59e9652ecd05a5775b22166b287f1b0270035667d8933',
  'tools/security/discovery-installed-protected-scope.mjs':FIXED.scopeVerifierSha256,
  'scripts/release/anonymous-alpha-metadata-diagnostic.cjs':null,'scripts/release/recover-discovery-rc20.cjs':null,
  'scripts/release/recover-discovery-rc20.test.cjs':null});
const TOOLING_PATHS=Object.freeze(Object.keys(TOOLING_BEFORE).sort());
const ASSETS=Object.freeze([{"id":669951940,"name":"SHA256SUMS.txt","size":555,"digest":"sha256:aa9ddb538fd0c89a14936809794f4ad65f6ed6b5ae665d325873b3ab85fd204d"},{"id":669951960,"name":"install-discovery-installed.py","size":6581,"digest":"sha256:0e5c5fd49530a55f1e6f14531ede72e143bd1d5b29029ae8c9adc610b48337c2"},{"id":669951977,"name":"installed-qualification-evidence.zip","size":10852044,"digest":"sha256:e7b9e9cbb19771c1400b760caf9440d489b7552a17c5ceee1cb200b546162a1c"},{"id":669952002,"name":"jobs-discovery-installed.tar.gz","size":457348,"digest":"sha256:5ae312997ce3e2685760e621954828a82ded714cc245339fcfcdd5245373ccfa"},{"id":669952036,"name":"provenance.json","size":3544,"digest":"sha256:e943dbfd14b37e97f998b8d8b4a00bb1b34f66d9ae9a3a2b9d10221dc16e302b"},{"id":669952051,"name":"publication-review.json","size":2925023,"digest":"sha256:1b08267c5cee0a44cbb23790c8cc48ef02b40e99927db33540b345150b935985"},{"id":669952073,"name":"qualification.json","size":632369,"digest":"sha256:964873d491ca85becd1bb01802e6be82ca7777ee01af4def9f0e94485ed624e0"}].map(Object.freeze));
const EXPECTED=Object.freeze(Object.fromEntries(ASSETS.map(a=>[a.name,Object.freeze({bytes:a.size,sha256:a.digest.slice(7)})])));
function read(file,limit=64_000_000) {
  assert.equal(fs.realpathSync(file),path.resolve(file),'Recovery input must be direct');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{const before=fs.fstatSync(fd);assert.ok(before.isFile()&&before.size<=limit);const raw=Buffer.alloc(before.size+1);let bytes=0;
    while(bytes<raw.length){const n=fs.readSync(fd,raw,bytes,raw.length-bytes,null);if(!n)break;bytes+=n;}
    const after=fs.fstatSync(fd);for(const key of ['dev','ino','mode','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key]);
    assert.equal(bytes,before.size);return raw.subarray(0,bytes);
  }finally{fs.closeSync(fd);}
}
function originalModules(root) {
  assert.ok(path.isAbsolute(root));assert.equal(fs.realpathSync(root),path.resolve(root));
  for(const [name,digest]of Object.entries(SOURCE_MODULES))assert.equal(sha(read(path.join(root,'scripts/release',name),2_000_000)),digest,'Original source module differs: '+name);
  return {Q:require(path.join(root,'scripts/release/discovery-installed-qualification.cjs')),
    P:require(path.join(root,'scripts/release/publish-discovery-installed.cjs'))};
}
function creationReceipt(artifact,Q,P) {
  const zip=read(artifact,1_000_000);assert.equal(sha(zip),FIXED.creationArtifactSha256,'Original creation artifact differs');
  const members=Q.zipMembers(zip);assert.deepEqual([...members.keys()],[FIXED.creationMember]);
  const raw=members.get(FIXED.creationMember);assert.equal(raw.length,FIXED.creationBytes);assert.equal(sha(raw),FIXED.creationSha256);
  const receipt=Q.json(raw);assert.equal(receipt.id,FIXED.releaseId);P.createdIdentity(receipt,FIXED);return receipt;
}
function sourceCommitTimestamp(root,source) {
  assert.equal(source.sourceCommit,FIXED.sourceCommit);assert.equal(source.sourceTree,FIXED.sourceTree);
  const raw=execFileSync('git',['--no-replace-objects','--no-pager','-C',root,'-c','protocol.allow=never',
    '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null',
    'cat-file','commit',FIXED.sourceCommit],{timeout:30_000,maxBuffer:1_000_000,
    env:{...Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:'',GIT_TERMINAL_PROMPT:'0'}});
  assert.equal(crypto.createHash('sha1').update(Buffer.from('commit '+raw.length+'\0')).update(raw).digest('hex'),FIXED.sourceCommit,
    'Original commit metadata object differs');
  const headers=raw.toString('utf8').split('\n\n',1)[0].split('\n');assert.equal(headers[0],'tree '+FIXED.sourceTree);
  const committers=headers.filter(line=>line.startsWith('committer '));assert.equal(committers.length,1);
  const match=/^committer .+ <[^>\n]+> ([0-9]+) [+-][0-9]{4}$/.exec(committers[0]);assert.ok(match,'Original commit timestamp is required');
  const timestamp=new Date(Number(match[1])*1000).toISOString().replace('.000Z','Z');
  assert.equal(timestamp,FIXED.sourceCommitDate,'Original source commit date differs');return timestamp;
}
function releaseIdentity(release,receipt,P,{published=false}={}) {
  for(const key of ['id','url','tag_name','target_commitish','name','body'])assert.equal(release[key],receipt[key],'Original owned release identity differs: '+key);
  for(const key of ['id','node_id','login','type'])assert.equal(release.author?.[key],receipt.author?.[key],'Original owned release author differs: '+key);
  assert.equal(release.id,FIXED.releaseId);assert.equal(release.draft,!published);assert.equal(release.prerelease,true);
  // GitHub uses draft creation time before publication and the tagged commit date after publication.
  assert.equal(release.created_at,published?FIXED.sourceCommitDate:receipt.created_at,'Original owned release phase timestamp differs');
  assert.deepEqual(P.assetLease(release.assets,EXPECTED),ASSETS,'Original seven asset identities differ');
  for(const a of release.assets)assert.equal(a.state,'uploaded','Incomplete asset cannot be recovered');
  if(published){assert.match(release.published_at||'',/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(new Date(release.published_at).toISOString(),release.published_at.replace('Z','.000Z'));
    assert.ok(Date.parse(release.published_at)>=Date.parse(receipt.created_at),'Publication cannot precede original draft creation');
  }else assert.equal(release.published_at,receipt.published_at);return release;
}
async function ownedRelease(api,receipt,P) {
  const matches=(await P.releaseInventory(api)).filter(a=>a.tag_name===FIXED.tag);
  assert.equal(matches.length,1,'Original tag must identify exactly one release');assert.equal(matches[0].id,FIXED.releaseId);
  const release=await api('releases/'+FIXED.releaseId);return releaseIdentity(release,receipt,P,{published:!release.draft});
}
function verifyManifest(directory,Q) {
  const sums=read(path.join(directory,'SHA256SUMS.txt'),4096).toString('utf8'),names=ASSETS.map(a=>a.name).filter(n=>n!=='SHA256SUMS.txt').sort();
  const expected=names.map(n=>EXPECTED[n].sha256+'  '+n).join('\n')+'\n';assert.equal(sums,expected,'Original SHA manifest differs');
  const provenance=Q.json(read(path.join(directory,'provenance.json'))),qualification=Q.json(read(path.join(directory,'qualification.json')));
  for(const obj of [provenance,qualification]) {
    assert.equal(obj.source.commit||obj.source.sourceCommit,FIXED.sourceCommit);assert.equal(obj.source.tree||obj.source.sourceTree,FIXED.sourceTree);
    assert.equal(obj.authority,'none');assert.equal(obj.productionApproved,false);assert.equal(obj.currencyCapBaseUnits,'0');
  }
  assert.equal(provenance.publicationRecord.commit,FIXED.recordCommit);assert.equal(provenance.publicationRecord.sha256,FIXED.recordSha256);
  assert.equal(provenance.qualifiedProducer.id,FIXED.runId);assert.equal(qualification.producerRun.id,FIXED.runId);
  assert.equal(qualification.publicationRecordSha256,FIXED.recordSha256);assert.equal(sha(read(path.join(directory,'publication-review.json'))),FIXED.recordSha256);
}
async function downloadPublic(directory,release,Q,P,receipt) {
  releaseIdentity(release,receipt,P,{published:true});
  for(const asset of release.assets) {
    const url='https://github.com/'+FIXED.repository+'/releases/download/'+encodeURIComponent(FIXED.tag)+'/'+encodeURIComponent(asset.name);
    assert.equal(asset.browser_download_url,url,'Public Jobs download URL differs');
    const fd=fs.openSync(path.join(directory,asset.name),'wx',0o600);
    try{await Q.readPublicAlphaAsset({...asset,url},{fileDescriptor:fd});}finally{fs.closeSync(fd);}
  }
  P.verifyAssets(directory,Object.fromEntries(ASSETS.map(a=>[a.name,a.digest.slice(7)])));
}
function executionGuard(env=process.env) {
  assert.equal(env.GITHUB_REPOSITORY,FIXED.repository);assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');
  assert.equal(env.GITHUB_REF,'refs/heads/main');assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
  assert.notEqual(env.GITHUB_SHA,FIXED.sourceCommit,'Recovery tooling must be a separately reviewed main descendant');
  assert.ok(env.GITHUB_ACTOR&&env.GITHUB_REPOSITORY_OWNER);assert.equal(env.GITHUB_ACTOR,env.GITHUB_REPOSITORY_OWNER,'Owner-selected original-main recovery only');
  assert.equal(env.QUALIFICATION_RUN_ID,String(FIXED.runId));assert.equal(env.PUBLICATION_RECORD_COMMIT,FIXED.recordCommit);
  assert.equal(env.PUBLICATION_RECORD_SHA256,FIXED.recordSha256);
}
function options(root,output) {return {root,output,manifestSha256:FIXED.manifestSha256,verifierSha256:FIXED.verifierSha256,
  scopeVerifierSha256:FIXED.scopeVerifierSha256,runId:FIXED.runId,recordCommit:FIXED.recordCommit,recordSha256:FIXED.recordSha256};}
function toolingEpoch() {
  const root=path.resolve(__dirname,'../..');
  return {schema:'agijobsv0/discovery-rc20-recovery-epoch/v1',toolingRoot:root,toolingCommit:process.env.GITHUB_SHA,
    manifestSha256:sha(read(path.join(root,'config/discovery-installed-candidate-v1.json'),2_000_000)),
    verifierSha256:sha(read(path.join(root,'scripts/release/discovery-installed-profile.py'),2_000_000)),
    scopeVerifierSha256:sha(read(path.join(root,'tools/security/discovery-installed-protected-scope.mjs'),2_000_000)),
    payloadCommit:FIXED.sourceCommit,producerRunId:FIXED.runId,recordCommit:FIXED.recordCommit,recordSha256:FIXED.recordSha256};
}
function validateToolingDelta(changed,before,after,manifest,epoch) {
  assert.deepEqual([...changed].sort(),TOOLING_PATHS,'Recovery tooling must change only the exact nine reviewed leaves');
  assert.deepEqual(Object.keys(before).sort(),TOOLING_PATHS);assert.deepEqual(Object.keys(after).sort(),TOOLING_PATHS);
  for(const name of TOOLING_PATHS) {
    if(TOOLING_BEFORE[name]===null)assert.equal(before[name],null,'Recovery addition must be absent from payload');
    else assert.equal(before[name]?.sha256,TOOLING_BEFORE[name],'Recovery before-image differs: '+name);
    if(before[name])assert.equal(before[name].mode,'100644');assert.equal(after[name]?.mode,'100644');
    const expected=name==='config/discovery-installed-candidate-v1.json'?epoch.manifestSha256:
      name==='scripts/release/discovery-installed-profile.py'?epoch.verifierSha256:
      name==='tools/security/discovery-installed-protected-scope.mjs'?epoch.scopeVerifierSha256:manifest.changes?.[name]?.after?.sha256;
    assert.match(expected||'',/^[a-f0-9]{64}$/);assert.equal(after[name].sha256,expected,'Recovery tool after-image differs: '+name);
  }
}
function validateRecoveryEpoch(epoch,source,payloadOptions) {
  executionGuard();
  assert.deepEqual(Object.keys(epoch||{}).sort(),['schema','toolingRoot','toolingCommit','manifestSha256','verifierSha256','scopeVerifierSha256',
    'payloadCommit','producerRunId','recordCommit','recordSha256'].sort());
  assert.equal(epoch.schema,'agijobsv0/discovery-rc20-recovery-epoch/v1');assert.equal(epoch.payloadCommit,FIXED.sourceCommit);
  assert.equal(epoch.producerRunId,FIXED.runId);assert.equal(epoch.recordCommit,FIXED.recordCommit);assert.equal(epoch.recordSha256,FIXED.recordSha256);
  assert.equal(source.sourceCommit,FIXED.sourceCommit);assert.equal(source.sourceTree,FIXED.sourceTree);
  if(payloadOptions){assert.equal(payloadOptions.runId,FIXED.runId);assert.equal(payloadOptions.recordCommit,FIXED.recordCommit);assert.equal(payloadOptions.recordSha256,FIXED.recordSha256);}
  const root=path.resolve(__dirname,'../..');assert.equal(epoch.toolingRoot,root);assert.equal(fs.realpathSync(root),root);
  assert.equal(epoch.toolingCommit,process.env.GITHUB_SHA);
  const ToolQ=require('./discovery-installed-qualification.cjs'),toolSource=ToolQ.sourceProof({root,manifestSha256:epoch.manifestSha256,
    verifierSha256:epoch.verifierSha256,scopeVerifierSha256:epoch.scopeVerifierSha256});
  assert.equal(toolSource.sourceCommit,epoch.toolingCommit);assert.notEqual(toolSource.sourceCommit,FIXED.sourceCommit);
  const git=(...args)=>execFileSync('git',['--no-replace-objects','--no-pager','-C',root,'-c','protocol.allow=never',
    '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null',...args],
  {timeout:30_000,maxBuffer:2_000_000,env:{...Object.fromEntries(Object.entries(process.env).filter(([n])=>!n.startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:'',GIT_TERMINAL_PROMPT:'0'}});
  assert.equal(git('rev-parse',FIXED.sourceCommit+'^{tree}').toString().trim(),FIXED.sourceTree);
  assert.equal(git('merge-base',FIXED.sourceCommit,toolSource.sourceCommit).toString().trim(),FIXED.sourceCommit,'Original payload ancestry is required');
  const changed=git('diff','--name-only','-z',FIXED.sourceCommit,toolSource.sourceCommit).toString().split('\0').filter(Boolean),before={},after={};
  for(const name of TOOLING_PATHS) {
    const metadata=git('ls-tree',FIXED.sourceCommit,'--',name).toString().trim();
    if(metadata){assert.ok(metadata.startsWith('100644 blob '));before[name]={mode:'100644',sha256:sha(git('show',FIXED.sourceCommit+':'+name))};}
    else before[name]=null;
    after[name]={mode:fs.statSync(path.join(root,name)).mode&0o111?'100755':'100644',sha256:sha(read(path.join(root,name),2_000_000))};
  }
  validateToolingDelta(changed,before,after,ToolQ.json(read(path.join(root,'config/discovery-installed-candidate-v1.json'),2_000_000)),epoch);
  return {schema:epoch.schema,tooling:toolSource,payload:{sourceCommit:source.sourceCommit,sourceTree:source.sourceTree},
    changedPaths:TOOLING_PATHS,producerRunId:FIXED.runId,recordCommit:FIXED.recordCommit,recordSha256:FIXED.recordSha256};
}
async function pages(api,route,key) {
  const items=[],seen=new Set();let total;
  for(let page=1;page<=20;page++){const value=await api(route+(route.includes('?')?'&':'?')+'per_page=100&page='+page);
    assert.ok(Array.isArray(value[key])&&Number.isSafeInteger(value.total_count)&&value.total_count>=0&&value.total_count<=2000);
    if(total===undefined)total=value.total_count;assert.equal(total,value.total_count);
    for(const item of value[key]){assert.ok(Number.isSafeInteger(item.id)&&item.id>0&&!seen.has(item.id));seen.add(item.id);items.push(item);}
    if(value[key].length<100){assert.equal(items.length,total);return items;}}
  throw Error('Recovery tool inventory exceeds bounded pagination');
}
async function verifyToolingGates(epoch,api,Q) {
  const root=path.resolve(__dirname,'../..'),tool=epoch.tooling;
  const runs=await pages(api,'actions/runs?head_sha='+tool.sourceCommit,'workflow_runs'),checks=await pages(api,'commits/'+tool.sourceCommit+'/check-runs','check_runs');
  const inherited=require('./qualify-source-release-rc16.cjs'),codeql=require('./source-codeql-service-rc16.cjs');
  const git=(...args)=>execFileSync('git',['--no-replace-objects','--no-pager','-C',root,'-c','protocol.allow=never',
    '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null',...args],
  {encoding:'utf8',timeout:30_000,maxBuffer:32_000_000,env:{...Object.fromEntries(Object.entries(process.env).filter(([n])=>!n.startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:'',GIT_TERMINAL_PROMPT:'0'}});
  const services=await codeql.observeFinalServices({sha:tool.sourceCommit,tree:tool.sourceTree,git,runs,
    api:async(method,route)=>{assert.equal(method,'GET');return api(route);},download:async id=>Q.download('actions/artifacts/'+id+'/zip')});
  const excluded=[Q.PRODUCER,...Q.NODES.map(Q.CONSUMER),'Select reviewed Discovery source','Publish qualified Discovery installed prerelease','Recover original Discovery rc20 draft'];
  const state=inherited.evaluate(runs.filter(r=>r.path!==Q.WORKFLOW),checks.filter(c=>!excluded.includes(c.name)),tool.sourceCommit,services);
  assert.equal(state.ready,true,'Current recovery-tool source gates must qualify: '+[...state.failures,...state.pending].join('; '));
  const selected=runs.filter(r=>r.head_sha===tool.sourceCommit&&r.event==='push'&&r.head_branch==='main'&&r.path===Q.WORKFLOW)
    .sort((a,b)=>b.run_number-a.run_number||b.run_attempt-a.run_attempt)[0];assert.ok(selected,'Current recovery-tool producer is required');
  Q.validateRun(selected,tool);const jobs=await pages(api,'actions/runs/'+selected.id+'/attempts/'+selected.run_attempt+'/jobs','jobs');
  for(const name of [Q.PRODUCER,...Q.NODES.map(Q.CONSUMER)]){const found=jobs.filter(j=>j.name===name);assert.equal(found.length,1);Q.validateJob(found[0],selected,name,[]);}
  return {sourceCommit:tool.sourceCommit,sourceTree:tool.sourceTree,workflowRunId:selected.id,state:'QUALIFIED_TOOLING_NOT_PAYLOAD_PUBLICATION'};
}
async function verifyRecoveryLeases(api,{source,record,prerequisite,draft,expected,epoch,P,receipt}) {
  assert.deepEqual(P.prerequisiteLease(await api('releases/tags/source-v2.1.0-rc.17')),prerequisite);
  assert.equal(await P.tagCommit(api,'source-v2.1.0-rc.17'),record.prerequisite.commit);
  assert.equal((await api('git/commits/'+record.prerequisite.commit)).tree?.sha,record.prerequisite.tree);
  const matches=(await P.releaseInventory(api)).filter(r=>r.tag_name===FIXED.tag);assert.equal(matches.length,1);assert.equal(matches[0].id,draft.id);
  const current=await api('releases/'+draft.id);releaseIdentity(current,receipt,P);
  assert.deepEqual(P.draftLease(current,expected),draft);assert.equal(current.target_commitish,source.sourceCommit);
  const tag=await P.tagCommit(api,FIXED.tag);assert.ok(tag===null||tag===FIXED.sourceCommit);
  assert.equal((await api('git/ref/heads/main')).object?.sha,epoch.tooling.sourceCommit,'Actual recovery-tool main moved before publication');return current.id;
}
async function fetchCreationArtifact(file,Q) {
  assert.ok(path.isAbsolute(file)&&!fs.existsSync(file));assert.equal(fs.realpathSync(path.dirname(file)),path.dirname(file));
  const raw=await Q.download('actions/artifacts/'+FIXED.creationArtifactId+'/zip');assert.equal(sha(raw),FIXED.creationArtifactSha256);
  fs.writeFileSync(file,raw,{flag:'wx',mode:0o600});return file;
}
async function recover({root,artifact,output,execute=false},{Q,P,api,download,qualify,patch,verify=verifyManifest,observe=()=>{},
  validateEpoch=validateRecoveryEpoch,toolingGates=verifyToolingGates,timestamp=sourceCommitTimestamp}={}) {
  if(!Q||!P)({Q,P}=originalModules(root));api=api||P.apiClient(process.env.GH_TOKEN);
  download=download||((directory,release,published)=>published?downloadPublic(directory,release,Q,P,receipt):P.downloadAssets(directory,release,EXPECTED));
  const ToolQ=require('./discovery-installed-qualification.cjs');
  qualify=qualify||(opts=>D.withAnonymousDiagnostics(()=>ToolQ.qualify(opts),{observe}));
  patch=patch||(()=>execFileSync('gh',['api','--method','PATCH','repos/'+FIXED.repository+'/releases/'+FIXED.releaseId,
    '--field','draft=false','--field','prerelease=true'],{timeout:90_000,maxBuffer:1_000_000,stdio:['ignore','pipe','pipe']}));
  assert.ok(path.isAbsolute(output)&&!fs.existsSync(output)&&!path.resolve(output).startsWith(path.resolve(root)+path.sep));
  assert.equal(fs.realpathSync(path.dirname(output)),path.resolve(path.dirname(output)),'Recovery output parent must be direct');
  const source=Q.sourceProof(options(root,output));assert.equal(source.sourceCommit,FIXED.sourceCommit);assert.equal(source.sourceTree,FIXED.sourceTree);
  assert.equal(timestamp(root,source),FIXED.sourceCommitDate);
  const receipt=creationReceipt(artifact,Q,P),release=await ownedRelease(api,receipt,P),alreadyPublic=!release.draft;
  const tag=await P.tagCommit(api,FIXED.tag);assert.ok(tag===null||tag===FIXED.sourceCommit,'Original tag source differs');
  if(alreadyPublic)assert.equal(tag,FIXED.sourceCommit);
  fs.mkdirSync(output,{mode:0o700});
  const save=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  save('plan.json',{schema:'agijobsv0/discovery-rc20-recovery-plan/v1',releaseId:FIXED.releaseId,source,
    toolingEpoch:'Separate reviewed recovery helper; original payload/source remain unchanged',assets:ASSETS,
    timestamps:{originalDraftCreatedAt:receipt.created_at,sourceCommitDate:FIXED.sourceCommitDate,observedCreatedAt:release.created_at,publishedAt:release.published_at},
    state:alreadyPublic?'ALREADY_PUBLIC_VERIFY_ONLY':execute?'QUALIFICATION_PENDING':'INSPECTED_NO_MUTATION',
    original403:{requestUrl:'UNAVAILABLE_IN_ORIGINAL_LOG',cause:'UNESTABLISHED'},authority:'none'});
  save('initial-release-observation.json',release);
  const first=path.join(output,alreadyPublic?'public-readback':'draft-readback');fs.mkdirSync(first,{mode:0o700});
  await download(first,release,alreadyPublic);verify(first,Q);
  if(alreadyPublic){save('completed.json',{state:'ALREADY_PUBLIC_VERIFIED',releaseId:FIXED.releaseId,assets:ASSETS});return {state:'ALREADY_PUBLIC_VERIFIED',releaseId:FIXED.releaseId};}
  if(!execute)return {state:'INSPECTED_NO_MUTATION',releaseId:FIXED.releaseId};
  executionGuard();const epoch=toolingEpoch(),validated=validateEpoch(epoch,source,options(root,output));
  assert.equal((await api('git/ref/heads/main')).object?.sha,validated.tooling.sourceCommit,'Actual recovery-tool main moved before recovery');
  const toolEvidence=await toolingGates(validated,api,ToolQ);save('tooling-qualification.json',toolEvidence);
  const recordBytes=await P.publicationRecordBytes(api,FIXED.recordCommit,FIXED.recordSha256),record=Q.json(recordBytes);
  const recordFile=path.join(output,'original-publication-review.json');fs.writeFileSync(recordFile,recordBytes,{flag:'wx',mode:0o600});
  const prerequisite=P.prerequisiteLease(await api('releases/tags/source-v2.1.0-rc.17'));
  await qualify({...options(root,path.join(output,'fresh-original-qualification')),recordFile,api,recoveryEpoch:epoch});
  const final=await ownedRelease(api,receipt,P);assert.deepEqual(P.draftLease(final,EXPECTED),P.draftLease(release,EXPECTED),'Draft changed during recovery');
  save('final-draft-release-observation.json',final);
  const second=path.join(output,'final-draft-readback');fs.mkdirSync(second,{mode:0o700});await download(second,final,false);verify(second,Q);
  const finalEpoch=validateEpoch(epoch,source,options(root,output));assert.deepEqual(finalEpoch,validated,'Recovery tooling source changed');
  const finalToolEvidence=await toolingGates(finalEpoch,api,ToolQ);save('final-tooling-qualification.json',finalToolEvidence);
  const id=await verifyRecoveryLeases(api,{source,record,prerequisite,draft:P.draftLease(final,EXPECTED),expected:EXPECTED,epoch:validated,P,receipt});assert.equal(id,FIXED.releaseId);
  save('mutation-intent.json',{operation:'PATCH',releaseId:id,fields:{draft:false,prerelease:true},outcome:'UNOBSERVED'});
  try{await patch();}catch {throw Error('Original release PATCH outcome is uncertain; retain intent and inspect release ID before another mutation');}
  const observedPublished=await api('releases/'+id);save('post-publication-release-observation.json',observedPublished);
  const published=releaseIdentity(observedPublished,receipt,P,{published:true});assert.equal(await P.tagCommit(api,FIXED.tag),FIXED.sourceCommit);
  const publicDir=path.join(output,'public-readback');fs.mkdirSync(publicDir,{mode:0o700});await download(publicDir,published,true);verify(publicDir,Q);
  save('completed.json',{state:'ORIGINAL_RELEASE_RECOVERED_PUBLIC_BYTES_VERIFIED',releaseId:id,assets:ASSETS,authority:'none'});
  return {state:'ORIGINAL_RELEASE_RECOVERED_PUBLIC_BYTES_VERIFIED',releaseId:id};
}
module.exports={FIXED,SOURCE_MODULES,TOOLING_BEFORE,TOOLING_PATHS,ASSETS,EXPECTED,read,originalModules,creationReceipt,sourceCommitTimestamp,releaseIdentity,ownedRelease,
  verifyManifest,downloadPublic,executionGuard,options,toolingEpoch,validateToolingDelta,validateRecoveryEpoch,verifyToolingGates,verifyRecoveryLeases,fetchCreationArtifact,recover};
if(require.main===module){const [mode,root,artifact,output]=process.argv.slice(2);
  assert.ok(['inspect','recover'].includes(mode),'Use inspect|recover ORIGINAL_ROOT CREATION_ARTIFACT ABSENT_OUTPUT');
  recover({root,artifact,output,execute:mode==='recover'},{observe:value=>process.stderr.write(JSON.stringify(value)+'\n')})
    .then(value=>console.log(JSON.stringify(value,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});}
