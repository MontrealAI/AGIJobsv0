// SPDX-License-Identifier: MIT
'use strict';
// Inert shared-contract bytes and API metadata only. No browser, campaign or module is executed.
const C=require('./capture-discovery-browser-input.cjs');
function fixture() {
  const commit='a'.repeat(40),tree='b'.repeat(40),parent='c'.repeat(40),missionId='capability-inert-packet-fixture',campaignDigest='d'.repeat(64);
  const page=Buffer.from('<main>Inert shared packet fixture</main>'),sourceFiles=new Map();
  for(let index=0;index<40;index++)sourceFiles.set('inert/'+index+'.json',Buffer.from('{}'));
  sourceFiles.set('scripts/templates/successor-capability/index.html',page);
  const sources=Object.fromEntries([...sourceFiles].map(([name,raw])=>[name,C.sha(raw)])),sourceHash=C.sha(C.canonical(sources));
  const catalog={schema:'successor-capability-source/v1',sourceHash,sources},catalogRaw=Buffer.from(JSON.stringify(catalog));
  const workspace=Buffer.from(JSON.stringify({schema:'successor-capability-workspace/v1',missionId,revision:0,
    authority:[],paymentRoute:'none',events:[{digest:'e'.repeat(64)}]}));
  const draft={schema:'successor-discovery-work-request/v1',missionId,sourceDigest:sourceHash,executionMode:'synthetic-local'};
  const managerRequest=Buffer.from(JSON.stringify({...draft,commission:{id:'inert-alternative',branch:'manager',route:'manager-usdc',currency:'USDC6',capBaseUnits:'0',status:'DRAFT_NOT_SUBMITTED'}}));
  const request=Buffer.from(JSON.stringify({...draft,commission:{id:'inert-alternative',branch:'jobs',route:'jobs-agialpha',currency:'AGIALPHA18',capBaseUnits:'0',status:'DRAFT_NOT_SUBMITTED'}}));
  const binding={schema:C.SCHEMA,state:'REVIEWED_AUTHENTICATED_ALPHA_ARTIFACT',repository:C.REPOSITORY,workflowPath:C.WORKFLOW,
    producer:{runId:1,runAttempt:1,workflowId:2,event:'push',headBranch:'main',headCommit:commit,checkoutCommit:commit,checkoutTree:tree,checkoutParents:[parent]},
    artifact:{id:3,name:'successor-capability-'+commit,digest:'sha256:'+'1'.repeat(64),sizeInBytes:100},
    sourceHash,pageSha256:C.sha(page),catalogSha256:C.sha(catalogRaw),inventorySha256:null,members:null,campaignDigest,missionId,
    workspaceSha256:C.sha(workspace),requestSha256:C.sha(managerRequest),transport:null};
  const exports={schema:'actual-browser-native-request-exports/v1',missionId,campaignDigest,sourceHash,pageSha256:binding.pageSha256,
    workspace:{file:'fleet-browser-workspace.json',sha256:binding.workspaceSha256,jobsFile:'jobs-browser-workspace.json',jobsSha256:binding.workspaceSha256,
      revision:0,eventPrefix:['e'.repeat(64)],head:'e'.repeat(64)},requests:{'manager-usdc':{file:'fleet-browser-request.json',sha256:binding.requestSha256,currency:'USDC6'},
      'jobs-agialpha':{file:'jobs-browser-request.json',sha256:C.sha(request),currency:'AGIALPHA18'}},
    scope:'Actual UI downloads from one unchanged pre-Fleet mission; alternative unsubmitted zero-cap drafts'};
  const packet=new Map(),put=(name,value)=>packet.set(name,Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)));
  put('source.json',{commit,trackedDiff:'',source:catalog});put('exact-checkout.json',{commit,tree,source:catalog,files:sources});
  put(C.PREFIX+'served/index.html',page);put(C.PREFIX+'served/sources.json',catalogRaw);
  put(C.PREFIX+'fleet-browser-workspace.json',workspace);put(C.PREFIX+'jobs-browser-workspace.json',workspace);
  put(C.PREFIX+'fleet-browser-request.json',managerRequest);put(C.PREFIX+'jobs-browser-request.json',request);
  put(C.PREFIX+'browser-native-requests.json',exports);
  put(C.PREFIX+'fleet-native/native-proof.json',{schema:'actual-browser-fleet-native-return/v1',alphaCommit:commit,alphaTree:tree,
    campaignDigest,sourceHash,workspaceSha256:binding.workspaceSha256,requestSha256:binding.requestSha256});
  put(C.PREFIX+'journey.json',{passed:true,pageErrors:[],checks:C.CHECKS,pageSha256:binding.pageSha256,source:catalog,fleetLocalReview:{requestExports:exports}});
  binding.members=Object.fromEntries([...packet].map(([name,raw])=>[name,{bytes:raw.length,sha256:C.sha(raw)}]));
  const originalInventory={...binding.members,'other-original-member.txt':{bytes:1,sha256:C.sha('x')}};
  binding.inventorySha256=C.sha(C.canonical(originalInventory));
  const run={id:1,run_attempt:1,workflow_id:2,head_sha:commit,head_branch:'main',event:'push',path:C.WORKFLOW,status:'completed',conclusion:'success',
    repository:{full_name:C.REPOSITORY},head_repository:{full_name:C.REPOSITORY}};
  const job={id:4,name:'capability',run_id:1,run_attempt:1,head_sha:commit,status:'completed',conclusion:'success',
    steps:C.STEPS.map(name=>({name,status:'completed',conclusion:'success'}))};
  const artifact={id:3,name:binding.artifact.name,digest:binding.artifact.digest,size_in_bytes:100,expired:false,workflow_run:{id:1,head_sha:commit}};
  const sourceCommit={sha:commit,tree:{sha:tree},parents:[{sha:parent}]};
  for(const [name,value]of Object.entries({run,jobs:{total_count:1,jobs:[job]},artifacts:{total_count:1,artifacts:[artifact]},
    'checkout-commit':sourceCommit,'public-commit':sourceCommit}))put('metadata/'+name+'.json',value);
  put('CUSTODY.json',{schema:'successor/discovery-browser-artifact-custody/v1',
    ...Object.fromEntries(['repository','workflowPath','producer','artifact','sourceHash','pageSha256','catalogSha256','members'].map(key=>[key,binding[key]])),inventory:originalInventory});
  const custody=packet.get('CUSTODY.json'),transportCommit='f'.repeat(40),transportTree='2'.repeat(40);
  binding.transport={repository:C.REPOSITORY,commit:transportCommit,tree:transportTree,path:'evidence/discovery-browser-inputs-v1/'+commit,
    custodySha256:C.sha(custody),custodyBytes:custody.length,custodyGitBlob:C.blob(custody)};
  const records=new Map(),blobs=new Map(),entry=(name,raw)=>({path:name,mode:'100644',type:'blob',sha:C.blob(raw),size:raw.length});
  const retain=raw=>blobs.set(C.blob(raw),{sha:C.blob(raw),encoding:'base64',size:raw.length,content:raw.toString('base64')});
  for(const raw of packet.values())retain(raw);for(const raw of sourceFiles.values())retain(raw);retain(catalogRaw);
  records.set('actions/workflows/2',{id:2,path:C.WORKFLOW});records.set('actions/runs/1',run);
  records.set('actions/runs/1/attempts/1/jobs?per_page=100&page=1',{total_count:1,jobs:[job]});records.set('actions/artifacts/3',artifact);
  records.set('git/commits/'+commit,sourceCommit);records.set('git/commits/'+transportCommit,{sha:transportCommit,tree:{sha:transportTree}});
  records.set('git/trees/'+transportTree+'?recursive=1',{sha:transportTree,truncated:false,
    tree:[...packet].map(([name,raw])=>entry(binding.transport.path+'/'+name,raw))});
  records.set('git/trees/'+tree+'?recursive=1',{sha:tree,truncated:false,
    tree:[...[...sourceFiles].map(([name,raw])=>entry(name,raw)),entry('docs/successor/capabilities/sources.json',catalogRaw)]});
  const calls=[],rawCalls=[],rawFiles=new Map();
  for(const [name,raw]of packet)rawFiles.set(transportCommit+':'+binding.transport.path+'/'+name,Buffer.from(raw));
  for(const [name,raw]of sourceFiles)rawFiles.set(commit+':'+name,Buffer.from(raw));
  rawFiles.set(commit+':docs/successor/capabilities/sources.json',catalogRaw);
  const api=async route=>{calls.push(route);if(!records.has(route))throw Error('Unexpected inert API route '+route);return structuredClone(records.get(route));};
  const rawBody=async options=>{rawCalls.push({...options});const raw=rawFiles.get(options.commit+':'+options.path);
    if(!raw)throw Error('Unexpected inert raw path');return Buffer.from(raw);};
  const pin={status:'REVIEWED_FINAL_SOURCE',commit,tree,sourceHash,catalogSha256:binding.catalogSha256};
  return {binding,config:binding,pin,packet,workspace,request,api,rawBody,rawFiles,rawCalls,records,blobs,run,job,artifact,calls};
}
module.exports={fixture};
