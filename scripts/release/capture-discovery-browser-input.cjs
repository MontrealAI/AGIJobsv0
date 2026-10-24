// SPDX-License-Identifier: MIT
'use strict';
// Shared public Git packet contract. No Actions ZIP, credential or supplied module is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const REPOSITORY='MontrealAI/AGI-Alpha-Agent-v0',WORKFLOW='.github/workflows/successor-capability.yml';
const SCHEMA='manager/discovery-browser-input-artifact/v1',PREFIX='discovery-continuation/';
const MEMBERS=Object.freeze(['source.json','exact-checkout.json',...['served/index.html','served/sources.json',
  'fleet-browser-workspace.json','fleet-browser-request.json','jobs-browser-workspace.json','jobs-browser-request.json',
  'browser-native-requests.json','journey.json','fleet-native/native-proof.json'].map(name=>PREFIX+name)].sort());
const METADATA=Object.freeze(['run','jobs','artifacts','checkout-commit','public-commit'].map(name=>'metadata/'+name+'.json').sort());
const PACKET=Object.freeze([...MEMBERS,...METADATA,'CUSTODY.json'].sort());
const STEPS=Object.freeze(['Bind retained evidence to exact source','Saved future-task protocol, docket and real-task boundary acceptance',
  'Retain exact-source screenshots and journey evidence']);
// One retained original main-release invocation; never infer execution source from a moving ref.
const ALPHA141_PRODUCER=Object.freeze({runId:40076340788,runAttempt:1,workflowId:366358276,event:'push',headBranch:'main',
  headCommit:'031bdb5d055c8bad896daa076baea2b5e17b242c',checkoutCommit:'031bdb5d055c8bad896daa076baea2b5e17b242c',
  checkoutTree:'330e0e58268ed32990f04278fc543c71db45fd46',checkoutParents:Object.freeze([
    '1b693f4895a0da68f5647b55c8cb10e6d234f566','e5ecfe96066d687e2fa72cbf1032bda17a450f35'])});
const ALPHA141_ARTIFACT=Object.freeze({id:12552939436,name:'successor-capability-031bdb5d055c8bad896daa076baea2b5e17b242c',
  digest:'sha256:3f0f689fa10aafab8891ebce91a1d421ef0754b2a5ec4551a4d844879041c4b7',sizeInBytes:31457545});
function producerProfile(binding) {
  const p=binding.producer,a=binding.artifact;
  const original=binding.workflowPath!==WORKFLOW||p.headCommit===ALPHA141_PRODUCER.headCommit
    ||p.checkoutCommit===ALPHA141_PRODUCER.checkoutCommit||p.runId===ALPHA141_PRODUCER.runId
    ||p.workflowId===ALPHA141_PRODUCER.workflowId||a.id===ALPHA141_ARTIFACT.id;
  if(!original)return {workflowPath:WORKFLOW,jobName:'capability',jobId:null};
  assert.equal(binding.workflowPath,'.github/workflows/agent-release.yml');
  assert.deepEqual(p,ALPHA141_PRODUCER,'Only the retained exact Alpha141 producer tuple is admitted');
  assert.deepEqual(a,ALPHA141_ARTIFACT,'Only the retained exact Alpha141 artifact is admitted');
  assert.equal(binding.sourceHash,'54769dbfde99ae13708a33292866f0ca7e6b8b7792a7a944f76bf2fbf1de1358');
  assert.equal(binding.catalogSha256,'d1c3cb9a5c3eb96e9e5eb111b83a713786ec18ed1213a407cd77bbaf018c5adb');
  return {workflowPath:'.github/workflows/agent-release.yml',jobName:'successor-capability / capability',jobId:120821426397};
}
const CHECKS=Object.freeze(['saved-freeze','separate-bank','reload-before-execution','actual-frozen-invocations','all-seven-arms',
  'losses-and-ties','saved-reservation','real-task-NOT_RUN','malformed-receiver-rejected-without-history-change','docket-download',
  'reload-after-result','39-recorded-contracts','accessibility','320px']);
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const blob=raw=>crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const git=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const safe=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\\:\0]/.test(value)
  &&!value.startsWith('/')&&value.replace(/\/$/,'').split('/').every(item=>item&&item!=='.'&&item!=='..');
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(canonical).join(',')+']':
  '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}'):JSON.stringify(value);
const fields=(value,names)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...names].sort());};
const json=raw=>{const text=Buffer.from(raw).toString('utf8');assert.ok(Buffer.from(text).equals(Buffer.from(raw)));
  const value=JSON.parse(text);assert.equal(text.replace(/"(?:\\.|[^"\\])*"|\s+/g,item=>item[0]==='"'?item:''),JSON.stringify(value),
    'Duplicate or alternate JSON field spellings are refused');return value;};
function read(file) {
  assert.equal(fs.realpathSync(file),path.resolve(file));
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {const before=fs.fstatSync(fd);assert.ok(before.isFile()&&before.size<=2_000_000);
    const result=Buffer.alloc(before.size+1);let size=0;
    while(size<result.length){const n=fs.readSync(fd,result,size,result.length-size,null);if(!n)break;size+=n;}
    const after=fs.fstatSync(fd);assert.equal(size,before.size);
    for(const key of ['dev','ino','mode','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);return result.subarray(0,size);
  } finally{fs.closeSync(fd);}
}
async function publicApi(route) {
  assert.ok(/^[A-Za-z0-9_./?=&%-]+$/.test(route)&&!route.startsWith('/')&&!route.includes('..'));
  assert.ok(!route.includes('/zip'),'Only public immutable Git bytes and metadata are used');
  assert.ok(!route.startsWith('git/blobs/')&&!route.startsWith('contents/'),'Body bytes use immutable public raw Git paths');
  const response=await fetch('https://api.github.com/repos/'+REPOSITORY+'/'+route,{redirect:'error',signal:AbortSignal.timeout(30_000),
    headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
  assert.ok(response.ok,'Public Alpha evidence read failed: HTTP '+response.status);
  const chunks=[];let size=0;const reader=response.body.getReader();
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;assert.ok(size<=64_000_000);chunks.push(Buffer.from(item.value));}}
  finally{await reader.cancel();}return json(Buffer.concat(chunks));
}
function select(config,pin) {
  fields(config,['schema','state','repository','workflowPath','producer','artifact','sourceHash','pageSha256','catalogSha256',
    'inventorySha256','members','campaignDigest','missionId','workspaceSha256','requestSha256','transport']);
  assert.equal(config.schema,SCHEMA);assert.equal(config.state,'REVIEWED_AUTHENTICATED_ALPHA_ARTIFACT',
    'Actual final-source browser packet is UNSET; no browser/native acceptance is inferred');
  assert.equal(config.repository,REPOSITORY);producerProfile(config);
  const p=config.producer,a=config.artifact,t=config.transport;
  fields(p,['runId','runAttempt','workflowId','event','headBranch','headCommit','checkoutCommit','checkoutTree','checkoutParents']);
  for(const key of ['runId','runAttempt','workflowId'])assert.ok(positive(p[key]));
  assert.equal(p.event,'push');assert.equal(p.headBranch,'main');assert.equal(p.headCommit,p.checkoutCommit);
  for(const key of ['headCommit','checkoutCommit','checkoutTree'])assert.ok(git(p[key]));
  assert.ok(Array.isArray(p.checkoutParents)&&p.checkoutParents.length>=1&&p.checkoutParents.length<=2&&p.checkoutParents.every(git));
  fields(a,['id','name','digest','sizeInBytes']);assert.ok(positive(a.id)&&positive(a.sizeInBytes)&&a.sizeInBytes<=150_000_000);
  assert.equal(a.name,'successor-capability-'+p.checkoutCommit);assert.match(a.digest,/^sha256:[a-f0-9]{64}$/);
  for(const key of ['sourceHash','pageSha256','catalogSha256','inventorySha256','campaignDigest','workspaceSha256','requestSha256'])assert.ok(hash(config[key]));
  assert.ok(typeof config.missionId==='string'&&config.missionId.startsWith('capability-')&&config.missionId.length<=256);
  fields(config.members,MEMBERS);for(const member of Object.values(config.members)) {
    fields(member,['bytes','sha256']);assert.ok(positive(member.bytes)&&member.bytes<=2_000_000&&hash(member.sha256));}
  fields(t,['repository','commit','tree','path','custodySha256','custodyBytes','custodyGitBlob']);
  assert.equal(t.repository,REPOSITORY);for(const key of ['commit','tree','custodyGitBlob'])assert.ok(git(t[key]));
  assert.ok(hash(t.custodySha256)&&positive(t.custodyBytes)&&t.custodyBytes<=2_000_000);
  assert.equal(t.path,'evidence/discovery-browser-inputs-v1/'+p.headCommit);
  for(const [key,name]of [['workspaceSha256','fleet-browser-workspace.json'],['requestSha256','fleet-browser-request.json'],
    ['pageSha256','served/index.html'],['catalogSha256','served/sources.json']])assert.equal(config[key],config.members[PREFIX+name].sha256);
  assert.equal(pin.status,'REVIEWED_FINAL_SOURCE');assert.equal(p.checkoutCommit,pin.commit);assert.equal(p.checkoutTree,pin.tree);
  assert.equal(config.sourceHash,pin.sourceHash);assert.equal(config.catalogSha256,pin.catalogSha256);
  return config;
}
function validateFiles(files,binding) {
  assert.deepEqual([...files.keys()].sort(),MEMBERS);let bytes=0;
  for(const [name,raw]of files){assert.ok(Buffer.isBuffer(raw)&&positive(raw.length)&&raw.length<=2_000_000);bytes+=raw.length;
    assert.deepEqual(binding.members[name],{bytes:raw.length,sha256:sha(raw)});}assert.ok(bytes<=16*1024*1024);
  for(const [key,name]of [['workspaceSha256','fleet-browser-workspace.json'],['requestSha256','fleet-browser-request.json'],
    ['pageSha256','served/index.html'],['catalogSha256','served/sources.json']])assert.equal(sha(files.get(PREFIX+name)),binding[key]);
  const at=name=>json(files.get(name)),catalog=at(PREFIX+'served/sources.json'),source=at('source.json'),checkout=at('exact-checkout.json');
  assert.equal(catalog.schema,'successor-capability-source/v1');assert.equal(catalog.sourceHash,binding.sourceHash);
  assert.ok(catalog.sources&&typeof catalog.sources==='object'&&!Array.isArray(catalog.sources));
  assert.ok(Object.keys(catalog.sources).length>0&&Object.keys(catalog.sources).length<=256);
  for(const [name,digest]of Object.entries(catalog.sources))assert.ok(safe(name)&&!name.endsWith('/')&&hash(digest));
  assert.equal(sha(canonical(catalog.sources)),binding.sourceHash);
  assert.equal(source.commit,binding.producer.checkoutCommit);assert.equal(checkout.commit,binding.producer.checkoutCommit);
  assert.equal(checkout.tree,binding.producer.checkoutTree);assert.equal(source.trackedDiff,'');
  assert.deepEqual(source.source,catalog);assert.deepEqual(checkout.source,catalog);assert.deepEqual(checkout.files,catalog.sources);
  const workspace=at(PREFIX+'fleet-browser-workspace.json'),request=at(PREFIX+'fleet-browser-request.json'),jobs=at(PREFIX+'jobs-browser-request.json');
  assert.ok(files.get(PREFIX+'fleet-browser-workspace.json').equals(files.get(PREFIX+'jobs-browser-workspace.json')),
    'Both routes must retain the same original browser workspace bytes');
  for(const object of [workspace,request,jobs])assert.equal(object.missionId,binding.missionId);
  assert.ok(Array.isArray(workspace.events)&&workspace.events.length>0&&workspace.events.length<24);
  assert.equal(workspace.revision,workspace.events.length-1);assert.deepEqual(workspace.authority,[]);assert.equal(workspace.paymentRoute,'none');
  for(const [record,route,currency]of [[request,'manager-usdc','USDC6'],[jobs,'jobs-agialpha','AGIALPHA18']]) {
    assert.equal(record.commission.route,route);assert.equal(record.commission.currency,currency);assert.equal(record.commission.capBaseUnits,'0');}
  assert.equal(request.commission.id,jobs.commission.id);assert.notEqual(request.commission.branch,jobs.commission.branch);
  const withoutCommission=record=>Object.fromEntries(Object.entries(record).filter(([key])=>key!=='commission'));
  assert.deepEqual(withoutCommission(request),withoutCommission(jobs));
  const exports=at(PREFIX+'browser-native-requests.json'),proof=at(PREFIX+'fleet-native/native-proof.json'),journey=at(PREFIX+'journey.json');
  const expected={schema:'actual-browser-native-request-exports/v1',missionId:binding.missionId,campaignDigest:binding.campaignDigest,
    sourceHash:binding.sourceHash,pageSha256:binding.pageSha256,workspace:{file:'fleet-browser-workspace.json',sha256:binding.workspaceSha256,
      jobsFile:'jobs-browser-workspace.json',jobsSha256:binding.workspaceSha256,revision:workspace.revision,
      eventPrefix:workspace.events.map(event=>event.digest),head:workspace.events.at(-1).digest},
    requests:{'manager-usdc':{file:'fleet-browser-request.json',sha256:binding.requestSha256,currency:'USDC6'},
      'jobs-agialpha':{file:'jobs-browser-request.json',sha256:binding.members[PREFIX+'jobs-browser-request.json'].sha256,currency:'AGIALPHA18'}},
    scope:'Actual UI downloads from one unchanged pre-Fleet mission; alternative unsubmitted zero-cap drafts'};
  assert.deepEqual(exports,expected);assert.equal(proof.schema,'actual-browser-fleet-native-return/v1');
  assert.equal(proof.alphaCommit,binding.producer.checkoutCommit);assert.equal(proof.alphaTree,binding.producer.checkoutTree);
  for(const key of ['campaignDigest','sourceHash','workspaceSha256','requestSha256'])assert.equal(proof[key],binding[key]);
  assert.equal(journey.passed,true);assert.deepEqual(journey.pageErrors,[]);assert.deepEqual(journey.checks,CHECKS);
  assert.equal(journey.pageSha256,binding.pageSha256);assert.deepEqual(journey.source,catalog);assert.deepEqual(journey.fleetLocalReview?.requestExports,exports);
  return {catalog,workspace:files.get(PREFIX+'jobs-browser-workspace.json'),request:files.get(PREFIX+'jobs-browser-request.json')};
}
async function publicRawBody({commit,path:sourcePath,maxBytes}) {
  assert.ok(git(commit)&&safe(sourcePath)&&!sourcePath.endsWith('/')&&positive(maxBytes)&&maxBytes<=32_000_000);
  const url='https://raw.githubusercontent.com/'+REPOSITORY+'/'+commit+'/'+sourcePath.split('/').map(encodeURIComponent).join('/');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30_000),headers:{Accept:'application/octet-stream'}});
  assert.ok(response.ok,'Public immutable raw body read failed: HTTP '+response.status);
  const chunks=[];let size=0;const reader=response.body.getReader();
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;assert.ok(size<=maxBytes);chunks.push(Buffer.from(item.value));}}
  finally{await reader.cancel();}return Buffer.concat(chunks);
}
async function githubBlob(rawBody,entry,{commit,path:sourcePath,maxBytes=2_000_000,modes=['100644']}) {
  assert.equal(entry?.type,'blob');assert.ok(modes.includes(entry.mode)&&git(entry.sha)&&git(commit));
  assert.equal(entry.path,sourcePath);assert.ok(safe(sourcePath)&&!sourcePath.endsWith('/'));
  assert.ok(positive(entry.size)&&entry.size<=maxBytes,'Full Git tree must bind bounded raw file bytes');
  const raw=await rawBody({commit,path:sourcePath,maxBytes});
  assert.ok(Buffer.isBuffer(raw)&&raw.length===entry.size&&raw.length<=maxBytes);
  assert.equal(blob(raw),entry.sha,'Actual public Git blob SHA-1 differs');return raw;
}
async function fullTree(api,tree) {
  const result=await api('git/trees/'+tree+'?recursive=1');assert.equal(result.sha,tree);assert.equal(result.truncated,false);
  assert.ok(Array.isArray(result.tree)&&result.tree.length<=100_000);
  const names=new Set();for(const item of result.tree){assert.ok(safe(item.path)&&!names.has(item.path));names.add(item.path);}return result.tree;
}
function validRun(run,binding) {
  const p=binding.producer,profile=producerProfile(binding);
  for(const [key,value]of Object.entries({id:p.runId,run_attempt:p.runAttempt,workflow_id:p.workflowId,head_sha:p.headCommit,
    head_branch:p.headBranch,event:'push',path:profile.workflowPath,status:'completed',conclusion:'success'}))assert.equal(run[key],value);
}
function validJob(job,binding) {
  const profile=producerProfile(binding);assert.equal(job.name,profile.jobName);
  if(profile.jobId!==null)assert.equal(job.id,profile.jobId);
  assert.ok(positive(job.id));assert.equal(job.run_id,binding.producer.runId);assert.equal(job.head_sha,binding.producer.headCommit);
  assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
  for(const name of STEPS){const steps=job.steps.filter(step=>step.name===name);assert.equal(steps.length,1);
    assert.equal(steps[0].status,'completed');assert.equal(steps[0].conclusion,'success');}
}
function inventory(record,key) {
  assert.ok(Array.isArray(record[key])&&positive(record.total_count)&&record.total_count===record[key].length&&record.total_count<=100);
  assert.ok(record[key].every(item=>positive(item.id))&&new Set(record[key].map(item=>item.id)).size===record[key].length);return record[key];
}
function validArtifact(artifact,binding) {
  for(const [key,field]of [['id','id'],['name','name'],['digest','digest'],['size_in_bytes','sizeInBytes']])assert.equal(artifact[key],binding.artifact[field]);
  assert.equal(artifact.workflow_run?.id,binding.producer.runId);assert.equal(artifact.workflow_run?.head_sha,binding.producer.headCommit);
}
function validCommit(commit,binding) {
  assert.equal(commit.sha,binding.producer.checkoutCommit);assert.equal((commit.tree||commit.commit?.tree)?.sha,binding.producer.checkoutTree);
  assert.deepEqual(commit.parents?.map(item=>item.sha),binding.producer.checkoutParents);
}
async function authenticate(binding,pin,api=publicApi,rawBody=publicRawBody) {
  select(binding,pin);const p=binding.producer,t=binding.transport,profile=producerProfile(binding);
  const workflow=await api('actions/workflows/'+p.workflowId),run=await api('actions/runs/'+p.runId);
  assert.equal(workflow.id,p.workflowId);assert.equal(workflow.path,profile.workflowPath);validRun(run,binding);
  assert.equal(run.repository?.full_name,REPOSITORY);assert.equal(run.head_repository?.full_name,REPOSITORY);
  const jobs=[];let total;
  for(let page=1;page<=20;page++){const record=await api('actions/runs/'+p.runId+'/attempts/'+p.runAttempt+'/jobs?per_page=100&page='+page);
    assert.ok(Array.isArray(record.jobs)&&positive(record.total_count)&&record.total_count<=2000);
    if(total===undefined)total=record.total_count;assert.equal(record.total_count,total);jobs.push(...record.jobs);
    if(record.jobs.length<100){assert.equal(jobs.length,total);break;}assert.ok(page<20);}
  assert.ok(jobs.every(item=>positive(item.id))&&new Set(jobs.map(item=>item.id)).size===jobs.length);
  const capability=jobs.filter(item=>item.name===profile.jobName);assert.equal(capability.length,1);validJob(capability[0],binding);
  const sourceCommit=await api('git/commits/'+p.checkoutCommit);validCommit(sourceCommit,binding);
  const artifact=await api('actions/artifacts/'+binding.artifact.id);validArtifact(artifact,binding);assert.equal(artifact.expired,false);
  const transportCommit=t.commit===p.checkoutCommit?sourceCommit:await api('git/commits/'+t.commit);assert.equal(transportCommit.sha,t.commit);assert.equal(transportCommit.tree?.sha,t.tree);
  const entries=await fullTree(api,t.tree),prefix=t.path+'/';
  const selected=new Map(entries.filter(item=>item.path.startsWith(prefix)&&item.type!=='tree').map(item=>[item.path.slice(prefix.length),item]));
  assert.deepEqual([...selected.keys()].sort(),PACKET,'Exact common 17-file public packet inventory differs');
  const packet=new Map();for(const name of PACKET)packet.set(name,await githubBlob(rawBody,selected.get(name),{commit:t.commit,path:t.path+'/'+name}));
  const custodyRaw=packet.get('CUSTODY.json');assert.equal(custodyRaw.length,t.custodyBytes);assert.equal(sha(custodyRaw),t.custodySha256);
  assert.equal(selected.get('CUSTODY.json').sha,t.custodyGitBlob);const custody=json(custodyRaw);
  const wanted={schema:'successor/discovery-browser-artifact-custody/v1'};
  for(const key of ['repository','workflowPath','producer','artifact','sourceHash','pageSha256','catalogSha256','members'])wanted[key]=binding[key];
  fields(custody,[...Object.keys(wanted),'inventory']);for(const [key,value]of Object.entries(wanted))assert.deepEqual(custody[key],value);
  const original=custody.inventory;assert.ok(original&&typeof original==='object'&&!Array.isArray(original)&&Object.keys(original).length>0&&Object.keys(original).length<=2048);
  let expanded=0;for(const [name,item]of Object.entries(original)){assert.ok(safe(name));fields(item,['bytes','sha256']);
    assert.ok(Number.isSafeInteger(item.bytes)&&item.bytes>=0&&item.bytes<=32_000_000&&hash(item.sha256));expanded+=item.bytes;}
  assert.ok(expanded<=250_000_000);assert.equal(sha(canonical(original)),binding.inventorySha256);
  for(const name of MEMBERS)assert.deepEqual(original[name],binding.members[name]);
  const metadata=Object.fromEntries(METADATA.map(name=>[name.slice('metadata/'.length,-5),json(packet.get(name))]));
  validRun(metadata.run,binding);validCommit(metadata['checkout-commit'],binding);validCommit(metadata['public-commit'],binding);
  const capturedJobs=inventory(metadata.jobs,'jobs').filter(item=>item.name===profile.jobName);assert.equal(capturedJobs.length,1);validJob(capturedJobs[0],binding);
  const capturedArtifacts=inventory(metadata.artifacts,'artifacts').filter(item=>item.id===binding.artifact.id);assert.equal(capturedArtifacts.length,1);validArtifact(capturedArtifacts[0],binding);
  const files=new Map(MEMBERS.map(name=>[name,packet.get(name)])),result=validateFiles(files,binding);
  const sourceEntries=p.checkoutTree===t.tree?entries:await fullTree(api,p.checkoutTree),sourceByPath=new Map(sourceEntries.map(item=>[item.path,item]));
  for(const [name,digest]of Object.entries({...result.catalog.sources,'docs/successor/capabilities/sources.json':binding.catalogSha256})){
    const raw=await githubBlob(rawBody,sourceByPath.get(name),{commit:p.checkoutCommit,path:name,maxBytes:32_000_000,modes:['100644','100755']});
    assert.equal(sha(raw),digest,'Exact source catalog Git bytes differ');}
  return {...result,packet,binding,observation:{repository:REPOSITORY,producer:p,artifact:binding.artifact,transport:t,
    sourceHash:binding.sourceHash,pageSha256:binding.pageSha256,catalogSha256:binding.catalogSha256,missionId:binding.missionId,
    campaignDigest:binding.campaignDigest,packetMembers:Object.fromEntries([...packet].map(([name,raw])=>[name,{bytes:raw.length,sha256:sha(raw),gitBlob:blob(raw)}])),
    scope:'Authenticated common public Git packet, original artifact metadata and immutable raw Git bodies; no Actions ZIP or per-blob REST download.',authority:'none'}};
}
async function capture({root,output,api=publicApi,rawBody=publicRawBody}) {
  assert.ok(path.isAbsolute(root||'')&&path.isAbsolute(output||'')&&!fs.existsSync(output));
  root=fs.realpathSync(root);output=path.resolve(output);assert.ok(!output.startsWith(root+path.sep));
  const result=await authenticate(json(read(path.join(root,'config/discovery-installed-browser-input-v1.json'))),
    json(read(path.join(root,'config/discovery-installed-alpha-v1.json'))),api,rawBody);
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const outputs=new Map([['workspace.json',result.workspace],['request.txt',result.request],
    ...[...result.packet].map(([name,raw])=>['packet/'+name,raw])]);
  for(const [name,raw]of outputs){const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    fs.writeFileSync(target,raw,{flag:'wx',mode:0o600});}return result.observation;
}
module.exports={REPOSITORY,WORKFLOW,SCHEMA,PREFIX,MEMBERS,METADATA,PACKET,STEPS,CHECKS,producerProfile,validRun,validJob,select,authenticate,validateFiles,capture,read,json,sha,blob,canonical,publicApi,publicRawBody};
if(require.main===module) {
  const [root,output]=process.argv.slice(2);
  capture({root,output}).then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
}
