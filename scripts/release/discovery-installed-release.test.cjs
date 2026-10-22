// SPDX-License-Identifier: MIT
'use strict';
// Inert evidence-format and resolver decisions. These fixtures claim no native run or approval.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const Q=require('./discovery-installed-qualification.cjs');
const P=require('./publish-discovery-installed.cjs');
const source={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40)};
const alpha={commit:'c'.repeat(40),tree:'d'.repeat(40),sourceHash:'e'.repeat(64)};
const run={id:1,run_attempt:1,repository:{full_name:Q.REPOSITORY},head_sha:source.sourceCommit,path:Q.WORKFLOW,
  status:'completed',conclusion:'success',head_branch:'main',event:'push'};
function nativeFixture() {
  const members=new Map(),vector={acquisitions:0,search:0,checking:1,memoryBytes:2,storageBytes:3,workerCapacity:1,installations:0,elapsedMs:1};
  const paths=['00_manifest.md','01_claims_matrix.md','02_environment.md','03_benchmark_tasks/spec.json','04_baselines/comparison.json',
    '05_agialpha_runs/run.json','06_proof_bundles/capability.json','07_replay_logs/replay.json','08_cost_ledgers/costs.json',
    '09_safety_ledgers/safety.json','10_validator_reports/review.json','11_alpha_wu_calibration/status.json','12_summary_tables/outcome.json'];
  function mission(prefix,missionId,cases) {
    const events=[],records=[],costs=Object.fromEntries(Object.keys(vector).map(name=>[name,0]));
    for(const [index,name] of cases.entries()) {
      const request=JSON.stringify({missionId,case:name}),receipt={schema:'agijobsv0/discovery-lab-admission/v1',original:request,
        requestSha256:Q.hash(request),bindings:{missionId},authority:'none',state:'local-checked',
        commission:{route:'jobs-agialpha',currency:'AGIALPHA18',capBaseUnits:'0'},lifecycle:{commission:'DRAFT_NOT_SUBMITTED'},resources:{totalUsed:vector}};
      const rawReceipt=JSON.stringify(receipt),envelope={raw:rawReceipt,source:{repository:Q.REPOSITORY,commit:source.sourceCommit,tree:source.sourceTree}};
      const event={sequence:index,kind:'lab-evidence-attached',previous:events.at(-1)?.digest||null,
        payload:{kind:'receiver-receipt',campaignDigest:Q.hash(missionId+name),record:envelope}};
      event.digest=Q.hash('successor-omega/v1:capability-event\0'+Q.canonical({missionId,sequence:index,kind:event.kind,previous:event.previous,payload:event.payload}));
      events.push(event);const base=prefix+'imports/'+String(index+1).padStart(2,'0')+'-inert';
      members.set(base+'.receipt.json',Buffer.from(rawReceipt));members.set(base+'.request.txt',Buffer.from(request));
      members.set(base+'.envelope.json',Buffer.from(JSON.stringify(envelope)));
      records.push({case:name,requestFile:base+'.request.txt',receiptFile:base+'.receipt.json',envelopeFile:base+'.envelope.json',
        receiptId:Q.hash(missionId+'receipt'+index),campaignDigest:event.payload.campaignDigest,beforeEvents:index,afterEvents:index+1,
        beforeHead:event.previous,afterHead:event.digest,resources:vector});
      for(const key of Object.keys(vector))costs[key]=['memoryBytes','workerCapacity'].includes(key)?Math.max(costs[key],vector[key]):costs[key]+vector[key];
    }
    const workspace={schema:'successor-capability-workspace/v2',missionId,events},
      input={schema:'successor-capability-workspace/v1',missionId,events:[]};
    const files=Object.fromEntries(paths.map(name=>[name,'{}']));
    files['05_agialpha_runs/run.json']=JSON.stringify({workspace,attachments:{missionId,workspaceHead:events.at(-1).digest}});
    files['08_cost_ledgers/costs.json']=JSON.stringify({receiverInspectionByRoute:{'jobs-agialpha':costs},currenciesCombined:false,totalComplete:false});
    const docket={schema:'successor-discovery-evidence-docket/v1',format:'bounded-canonical-file-map',files,
      checksums:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,Q.hash(raw)]))};
    const workspaceRaw=Buffer.from(JSON.stringify(workspace)),docketRaw=Buffer.from(JSON.stringify(docket));
    for(const name of ['workspace.json','workspace.reopened.json'])members.set(prefix+name,workspaceRaw);
    for(const name of ['docket.json','docket.reopened.json'])members.set(prefix+name,docketRaw);
    members.set(prefix+'workspace.input.json',Buffer.from(JSON.stringify(input)));
    return {missionId,receiptImports:{count:records.length,eventPrefixPreserved:true,rawReceiptsPreserved:true,costsRetained:true,deduplicated:true,records},
      negativeControls:{rejectedNotExported:true,inconclusiveNotExported:true,acceptedPredecessorPreserved:true,strongerSuccessorPreserved:true,duplicateRejectedWithoutChangingHistory:true},
      docket:{sha256:Q.hash(docketRaw),reopenedSha256:Q.hash(docketRaw),workspaceSha256:Q.hash(workspaceRaw),reopenedWorkspaceSha256:Q.hash(workspaceRaw),byteIdentical:true}};
  }
  const primary=mission('','inert-primary-format-only',['original-exported-request']);
  const regression=mission('regression/','inert-regression-format-only',['learn','think','design','strategise','execute','evolve'].map(stage=>'accepted-'+stage).concat(['missing-inspection-reserve','stronger-successor']));
  const refusedRequest=JSON.stringify({missionId:regression.missionId,case:'invalid-measurement'});
  const refusedReceipt={original:refusedRequest,bindings:{missionId:regression.missionId},requestSha256:Q.hash(refusedRequest),authority:'none',state:'local-rejected',resources:{totalUsed:vector}};
  members.set('regression/refused/inert.request.txt',Buffer.from(refusedRequest));members.set('regression/refused/inert.receipt.json',Buffer.from(JSON.stringify(refusedReceipt)));
  regression.refusedAttempts=[{case:'rehashed-invalid-measurement',admitted:false,requestFile:'regression/refused/inert.request.txt',receiptFile:'regression/refused/inert.receipt.json',resources:vector}];
  regression.attemptCostsFile='regression/attempt-costs.json';
  members.set(regression.attemptCostsFile,Buffer.from(JSON.stringify({schema:'agijobsv0/discovery-installed-attempt-costs/v1',
    scope:'constructed-regression',missionId:regression.missionId,costsComplete:false,attempts:[
      ...regression.receiptImports.records.map(record=>({case:record.case,admitted:true,receiptFile:record.receiptFile,resources:record.resources})),
      ...regression.refusedAttempts.map(record=>({case:record.case,admitted:false,receiptFile:record.receiptFile,resources:record.resources}))]})));
  const custody={archiveSha256:'f'.repeat(64),installedManifestSha256:'1'.repeat(64),archiveBytes:100};
  const report={schema:'agijobsv0/discovery-installed-native-evidence/v1',acceptanceProtocol:'primary-browser-return-plus-separated-constructed-regression/v2',
    node:'v24.21.0',authority:'none',currencyCapBaseUnits:'0',inputWorkspace:'retained-exported-workspace',inputRequest:'original-exported-typed-bytes',...primary,
    jobs:{commit:source.sourceCommit,tree:source.sourceTree},alpha,capsule:{sha256:custody.archiveSha256,bytes:custody.archiveBytes,manifestSha256:custody.installedManifestSha256},
    missionSeparation:{distinctMissionIds:true,receiptCountsCombined:false,costLedgersCombined:false,primaryConstructionEventsAdded:0,primaryReceiptEventsAdded:1},
    constructedRegression:{schema:'agijobsv0/discovery-installed-constructed-regression/v1',scope:'constructed-regression',
      node:'v24.21.0',authority:'none',currencyCapBaseUnits:'0',jobs:{commit:source.sourceCommit,tree:source.sourceTree},alpha,
      capsule:{sha256:custody.archiveSha256,bytes:custody.archiveBytes,manifestSha256:custody.installedManifestSha256},
      inputWorkspace:'constructed-native-through-installed-alpha',inputRequest:'native-exported-exact-typed-bytes',
      historyStates:['accepted','rejected','inconclusive','accepted'],...regression},
    files:Object.fromEntries([...members].map(([name,raw])=>[name,{bytes:raw.length,sha256:Q.hash(raw)}]))};
  report.constructedRegression.files=Object.fromEntries(Object.entries(report.files).filter(([name])=>name.startsWith('regression/')));
  const refresh=()=>members.set('native-evidence.json',Buffer.from(JSON.stringify(report)));
  refresh();return {members,report,custody,refresh};
}
test('source policy preflight refuses inert mismatched selected bytes before invoking a verifier',()=>{
  const root=fs.mkdtempSync(path.join('/dev/shm','jobs-policy-data-'));
  const paths={'manifestSha256':'config/discovery-installed-candidate-v1.json',
    'verifierSha256':'scripts/release/discovery-installed-profile.py',
    'scopeVerifierSha256':'tools/security/discovery-installed-protected-scope.mjs'};
  try {
    for(const name of Object.values(paths)){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),'{}');}
    const pins=Object.fromEntries(Object.keys(paths).map(name=>[name,Q.hash(Buffer.from('{}'))]));
    for(const name of Object.keys(paths))assert.throws(()=>Q.sourceProof({root,...pins,[name]:'a'.repeat(64)}),/Selected source policy bytes differ before verifier execution/);
    const indirect=path.join(root,'indirect');fs.symlinkSync(root,indirect);
    assert.throws(()=>Q.sourceProof({root:indirect,...pins}),/source root must be direct/);
  } finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('only the exact successful main push qualifies as an installed release producer',()=>{
  assert.doesNotThrow(()=>Q.validateRun(run,source));
  for(const change of [{head_sha:'f'.repeat(40)},{event:'pull_request'},{head_branch:'feature'},{conclusion:'skipped'},
    {path:'.github/workflows/source-release-rc16.yml'},{run_attempt:0}])assert.throws(()=>Q.validateRun({...run,...change},source));
});
test('server job steps must actually succeed; skipped or duplicate named steps cannot substitute',()=>{
  const job={id:2,run_id:1,run_attempt:1,head_sha:source.sourceCommit,name:Q.PRODUCER,status:'completed',conclusion:'success',
    steps:[{name:'actual',status:'completed',conclusion:'success'}]};
  Q.validateJob(job,run,Q.PRODUCER,['actual']);
  assert.throws(()=>Q.validateJob({...job,steps:[{...job.steps[0],conclusion:'skipped'}]},run,Q.PRODUCER,['actual']));
  assert.throws(()=>Q.validateJob({...job,steps:[...job.steps,...job.steps]},run,Q.PRODUCER,['actual']));
  assert.throws(()=>Q.validateJob({...job,run_attempt:2},run,Q.PRODUCER,['actual']));
});
test('original GitHub artifact metadata must bind downloaded bytes and exact producer',()=>{
  const raw=Buffer.from('inert original archive');
  const artifact={id:3,name:'original',expired:false,workflow_run:{id:1,head_sha:run.head_sha,head_branch:'main'},digest:'sha256:'+Q.hash(raw),size_in_bytes:raw.length};
  Q.validateArtifact(artifact,run,'original',raw);
  assert.throws(()=>Q.validateArtifact(artifact,run,'original',Buffer.from('other bytes')));
  assert.throws(()=>Q.validateArtifact({...artifact,workflow_run:{...artifact.workflow_run,id:2}},run,'original',raw));
  assert.throws(()=>Q.validateArtifact({...artifact,expired:true},run,'original',raw));
});
test('native report requires raw same-history bytes, retained receipt and exact installed source',()=>{
  const f=nativeFixture();Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0'});
  f.report.receiptImports.rawReceiptsPreserved=false;f.refresh();
  assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0'}));
});
test('reopen or raw artifact substitution cannot be hidden behind successful booleans',()=>{
  for(const name of ['workspace.json','docket.reopened.json','imports/01-inert.receipt.json']) {
    const f=nativeFixture();f.members.set(name,Buffer.from('changed inert bytes'));
    assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0'}));
  }
  const f=nativeFixture();f.members.delete('imports/01-inert.receipt.json');delete f.report.files['imports/01-inert.receipt.json'];f.refresh();
  assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0'}));
});
test('all retained native sidecars are enumerated and pinned runtime identity is mandatory',()=>{
  const f=nativeFixture();f.members.set('unlisted.txt',Buffer.from('inert extra'));
  assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0'}));
  f.members.delete('unlisted.txt');assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'22.23.3'}));
});
test('primary browser return and constructed regression cannot substitute or share missions',()=>{
  for(const mutation of [
    report=>{delete report.constructedRegression;},
    report=>{report.receiptImports.count=2;},
    report=>{report.constructedRegression.missionId=report.missionId;},
    report=>{report.constructedRegression.receiptImports.count=7;},
    report=>{report.constructedRegression.receiptImports.records[0].requestFile='imports/01-inert.request.txt';},
    report=>{report.constructedRegression.receiptImports.records[0].receiptId=report.receiptImports.records[0].receiptId;},
  ]) {
    const f=nativeFixture();mutation(f.report);f.refresh();
    assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0'}));
  }
  const f=nativeFixture(),browser={workspace:Buffer.from(JSON.stringify(JSON.parse(f.members.get('workspace.input.json')),null,2)),
    request:f.members.get('imports/01-inert.request.txt')};
  assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0',browser}),/original source-bound browser mission/);
});
test('a publication template, caller boolean or mismatched external record hash grants no approval',()=>{
  const raw=Buffer.from('{"schema":"unselected","publicationApproved":true}');
  assert.throws(()=>Q.publicationRecord(Q.json(raw),{source,selection:{},alpha,selectorSha256:Q.hash(raw),raw}));
  assert.throws(()=>Q.publicationRecord({}, {source,selection:{},alpha,selectorSha256:'f'.repeat(64),raw}));
  assert.throws(()=>Q.json(Buffer.from('{"approved":false,"approved":true}')));
});
test('generic review text cannot replace actual exact-source case review',async()=>{
  const reference='https://github.com/MontrealAI/AGIJobsv0/pull/1#issuecomment-2';
  const record={reviewReferences:[reference],scannerReviews:{javascript:{results:[{resultSha256:'f'.repeat(64),disposition:'Demonstrably false positive',reviewReferences:[reference]}]}}};
  await assert.rejects(Q.reviewReferences(async()=>({html_url:reference,body:'Looks good',id:2}),record,source));
  await assert.rejects(Q.reviewReferences(async()=>({html_url:reference,body:source.sourceCommit+' generic review',id:2}),record,source));
});
test('the selected quality decision must discuss the same actual result, source and disposition',async()=>{
  const reference='https://github.com/MontrealAI/AGIJobsv0/pull/1#issuecomment-2',resultSha256='f'.repeat(64),
    disposition='Acknowledged nonsecurity quality';
  const record={reviewReferences:[reference],scannerReviews:{javascript:{results:[{resultSha256,disposition,reviewReferences:[reference]}]}},
    qualityDisposition:{cases:[{resultSha256:'e'.repeat(64),decision:disposition,reviewReference:reference}]}};
  const api=async()=>({html_url:reference,body:[source.sourceCommit,resultSha256,disposition].join(' '),id:2});
  await assert.rejects(Q.reviewReferences(api,record,source),/selected quality decision/);
  record.qualityDisposition.cases[0].resultSha256=resultSha256;
  assert.deepEqual((await Q.reviewReferences(api,record,source))[0].coveredResults,[{resultSha256,disposition}]);
});
function scannerFixture(results=[]) {
  const config=Buffer.from('inert scanner config'),workflow=Buffer.from('inert scanner workflow');
  const inherited=['integrations/alpha-agent/inert.mjs'],additional=['scripts/release/discovery-installed-qualification.cjs',
    'scripts/release/publish-discovery-installed.cjs','scripts/release/discovery-installed-release-dispatch.cjs',
    'scripts/release/capture-discovery-browser-input.cjs','tools/security/discovery-installed-protected-scope.mjs',
    'tools/security/validate-codeql-remediation.mjs'],extracted=[...inherited,...additional].sort();
  const producerRun={id:4,run_attempt:1,path:'.github/workflows/static-analysis.yml'};
  // The actual inherited JS sidecar does not have configPath/workflowSha256 fields.
  const before={schema:'agijobsv0/codeql-scope/2',source:source.sourceCommit,tree:source.sourceTree,run:4,attempt:1,
    event:'push',ref:'refs/heads/main',configSha256:Q.hash(config),requiredExtractedFiles:inherited};
  const scan={tool:{driver:{name:'CodeQL'}},properties:{codeqlConfigSummary:{inert:true}},results,
    invocations:[{executionSuccessful:true,toolExecutionNotifications:[{descriptor:{id:'codeql-action/overlay-disabled'}},
      {descriptor:{id:'js/diagnostics/successfully-extracted-files'},locations:extracted.map(uri=>({physicalLocation:{artifactLocation:{uri}}}))}]}]};
  const sarif=Buffer.from(JSON.stringify({version:'2.1.0',runs:[scan]}));
  const members=new Map([['javascript.sarif',sarif],['source-scope-before.json',Buffer.from(JSON.stringify(before))],
    ['source-scope-after.json',Buffer.from(JSON.stringify(before))],['source-extraction.json',Buffer.from(JSON.stringify({
      source:source.sourceCommit,tree:source.sourceTree,run:4,attempt:1,sarifSha256:Q.hash(sarif),rawResultCount:results.length,
      successfulExtractionFiles:extracted,requiredExtractedFiles:inherited,missingRequiredExtractedFiles:[]}))]]);
  const review={sourceCommit:source.sourceCommit,tree:source.sourceTree,toolComponents:[scan.tool.driver],
    codeqlConfigSummary:scan.properties.codeqlConfigSummary,rawRecords:Object.fromEntries([...members].map(([name,raw])=>[name,Q.hash(raw)])),
    requiredExtractedFiles:extracted,configSha256:Q.hash(config),workflowSha256:Q.hash(workflow),extractedFiles:extracted,
    results:results.map((raw,rawResultIndex)=>({rawResultIndex,resultSha256:Q.hash(Q.canonical(raw)),ruleId:raw.ruleId,
      path:raw.locations[0].physicalLocation.artifactLocation.uri,region:raw.locations[0].physicalLocation.region,
      justification:'Inert format fixture requires actual independent review before publication.',regressionEvidence:['inert-fixture-only'],
      disposition:'Demonstrably false positive'}))};
  const git=(command,object)=>{assert.equal(command,'show');return object.endsWith(':.github/codeql/config-integrations.yml')?config:workflow;};
  return {members,review,options:{source,language:'javascript',git,producerRun}};
}
test('inherited JavaScript sidecars remain usable while new release source must actually be extracted',()=>{
  for(const name of ['capture-discovery-browser-input.cjs','discovery-installed-protected-scope.mjs','validate-codeql-remediation.mjs']) {
    const f=scannerFixture();assert.equal(Q.scannerReview(f.members,f.review,f.options).results,0);
    f.review.requiredExtractedFiles=f.review.requiredExtractedFiles.filter(file=>!file.endsWith(name));
    assert.throws(()=>Q.scannerReview(f.members,f.review,f.options),/additional installed extraction inventory/);
  }
});
test('raw scanner result multiplicity is retained by exact result index',()=>{
  const result={ruleId:'inert/rule',locations:[{physicalLocation:{artifactLocation:{uri:'integrations/alpha-agent/inert.mjs'},region:{startLine:1}}}]};
  const f=scannerFixture([result,result]);assert.equal(Q.scannerReview(f.members,f.review,f.options).results,2);
  f.review.results[1].rawResultIndex=0;assert.throws(()=>Q.scannerReview(f.members,f.review,f.options));
});
test('ZIP reader accepts ordinary inert data and refuses duplicate or traversal members without extraction',()=>{
  const make=entries=>execFileSync('python3',['-I','-c',
    'import io,zipfile,json,sys\nb=io.BytesIO()\nz=zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED)\nfor n,v in json.loads(sys.argv[1]):z.writestr(n,v)\nz.close();sys.stdout.buffer.write(b.getvalue())',JSON.stringify(entries)],{maxBuffer:1_000_000});
  assert.equal(Q.zipMembers(make([['inert.json','{}']])).get('inert.json').toString(),'{}');
  assert.throws(()=>Q.zipMembers(make([['../outside','inert']])));
  assert.throws(()=>Q.zipMembers(make([['same','one'],['same','two']])));
});
test('publisher verifies exact downloaded asset inventory and bytes',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-assets-inert-'));
  try {
    const provenance=Buffer.from(JSON.stringify({productionApproved:false,authority:'none',profile:'jobs-discovery-installed-v1'}));
    fs.writeFileSync(path.join(directory,'provenance.json'),provenance);
    P.verifyAssets(directory,{'provenance.json':Q.hash(provenance)});
    fs.writeFileSync(path.join(directory,'unlisted.txt'),'inert');
    assert.throws(()=>P.verifyAssets(directory,{'provenance.json':Q.hash(provenance)}));
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('final publication leases bind prerequisite, exact draft and assets with current main read last',async()=>{
  const expected={'SHA256SUMS.txt':{sha256:'d'.repeat(64),bytes:1},'jobs.tar.gz':{sha256:'e'.repeat(64),bytes:2}};
  const draft={id:10,tag_name:Q.TAG,target_commitish:source.sourceCommit,draft:true,prerelease:true,name:'Inert draft',body:'Inert metadata fixture',
    created_at:'2026-10-22T00:00:00Z',updated_at:'2026-10-22T00:00:00Z',
    assets:Object.entries(expected).map(([name,item],index)=>({id:index+1,name,size:item.bytes,digest:'sha256:'+item.sha256}))};
  const prerequisite={id:20,tag_name:'source-v2.1.0-rc.17',target_commitish:'c'.repeat(40),draft:false,prerelease:true,
    published_at:'2026-10-22T00:00:00Z',assets:[{id:30,name:'source.tar.gz',size:3,digest:'sha256:'+'f'.repeat(64)}]};
  const record={prerequisite:{commit:'c'.repeat(40),tree:'d'.repeat(40)}};
  const original={['releases/tags/'+Q.TAG]:draft,'releases/tags/source-v2.1.0-rc.17':prerequisite,
    ['git/ref/tags/'+Q.TAG]:{object:{type:'commit',sha:source.sourceCommit}},
    'git/ref/tags/source-v2.1.0-rc.17':{object:{type:'commit',sha:record.prerequisite.commit}},
    ['git/commits/'+record.prerequisite.commit]:{tree:{sha:record.prerequisite.tree}},'git/ref/heads/main':{object:{sha:source.sourceCommit}}};
  const leases={source,record,expected,draft:P.draftLease(draft,expected),prerequisite:P.prerequisiteLease(prerequisite)};
  const calls=[],api=async route=>{calls.push(route);return structuredClone(original[route]);};
  assert.equal(await P.verifyPublicationLeases(api,leases),draft.id);assert.equal(calls.at(-1),'git/ref/heads/main');
  for(const mutate of [
    state=>{state['git/ref/heads/main'].object.sha='f'.repeat(40);},
    state=>{state['releases/tags/'+Q.TAG].id++;},
    state=>{state['releases/tags/'+Q.TAG].draft=false;},
    state=>{state['releases/tags/'+Q.TAG].target_commitish='f'.repeat(40);},
    state=>{state['releases/tags/'+Q.TAG].assets[0].id++;},
    state=>{state['releases/tags/'+Q.TAG].assets[0].digest='sha256:'+'f'.repeat(64);},
    state=>{state['git/ref/tags/'+Q.TAG].object.sha='f'.repeat(40);},
    state=>{state['releases/tags/source-v2.1.0-rc.17'].id++;},
    state=>{state['git/ref/tags/source-v2.1.0-rc.17'].object.sha='f'.repeat(40);},
  ]) {
    const changed=structuredClone(original);mutate(changed);
    await assert.rejects(P.verifyPublicationLeases(async route=>structuredClone(changed[route]),leases));
  }
});
test('saved standalone installer must match the selected finite profile, immutable Git and installed archive',()=>{
  const raw=Buffer.from('# Inert installer identity fixture; never executed.\n');
  const sha256=Q.hash(raw),blob=require('node:crypto').createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
  const custody={installer:{path:Q.INSTALLER_ASSET,sourcePath:Q.INSTALLER_PATH,bytes:raw.length,sha256}};
  const finite={changes:{[Q.INSTALLER_PATH]:{after:{mode:'100644',sha256}}}},
    manifest={files:{[Q.INSTALLER_PATH]:{mode:'100644',bytes:raw.length,sha256}}};
  const git=(...args)=>args[0]==='show'?raw:'100644 blob '+blob+'\t'+Q.INSTALLER_PATH+'\0';
  const options={source,finite,manifest,git};
  assert.equal(Q.validateInstaller(raw,custody,options).sourceGitBlob,blob);
  assert.throws(()=>Q.validateInstaller(Buffer.from('different inert bytes'),custody,options));
  assert.throws(()=>Q.validateInstaller(raw,custody,{...options,finite:{changes:{}}}),/selected finite source/);
  assert.throws(()=>Q.validateInstaller(raw,custody,{...options,git:()=>''}),/immutable source Git blob/);
  assert.throws(()=>Q.validateInstaller(raw,custody,{...options,manifest:{files:{}}}),/same source-bound standalone installer/);
});
test('consumer bootstrap evidence retains the same installer and exact extraction custody',()=>{
  const f=nativeFixture(),installerRaw=Buffer.from('# Inert saved installer, never executed.\n'),
    selection={profile:'jobs-discovery-installed-v1',manifestSha256:'a'.repeat(64),verifierSha256:'b'.repeat(64),scopeVerifierSha256:'c'.repeat(64)};
  f.custody.archiveBytes=100;f.custody.installer={path:Q.INSTALLER_ASSET,sourcePath:Q.INSTALLER_PATH,bytes:installerRaw.length,sha256:Q.hash(installerRaw)};
  f.members.set('bootstrap/'+Q.INSTALLER_ASSET,installerRaw);
  f.members.set('bootstrap/installer-custody.json',Buffer.from(JSON.stringify({schema:'agijobsv0/discovery-installed-bootstrap/v1',node:'v24.21.0',
    installer:f.custody.installer,jobsCommit:source.sourceCommit,sourceSelection:selection,archiveSha256:f.custody.archiveSha256,
    installedManifestSha256:f.custody.installedManifestSha256,authority:'none'})));
  f.members.set('bootstrap/installation-custody.json',Buffer.from(JSON.stringify({schema:'agijobsv0/discovery-installed-extraction/v1',
    archiveSha256:f.custody.archiveSha256,archiveBytes:100,installedManifestSha256:f.custody.installedManifestSha256,
    authority:'none',state:'EXTRACTED_INACTIVE_LOCAL_REVIEW_ONLY'})));
  const options={source,alpha,custody:f.custody,version:'24.21.0',bootstrap:{selection,installerRaw}};
  assert.equal(Q.validateNative(f.members,options).bootstrap.installer.sha256,Q.hash(installerRaw));
  f.members.set('bootstrap/'+Q.INSTALLER_ASSET,Buffer.from('other inert installer'));
  assert.throws(()=>Q.validateNative(f.members,options),/different saved standalone installer bytes/);
  f.members.set('bootstrap/'+Q.INSTALLER_ASSET,installerRaw);
  f.members.set('bootstrap/installation-custody.json',Buffer.from(JSON.stringify({schema:'agijobsv0/discovery-installed-extraction/v1',archiveSha256:'f'.repeat(64)})));
  assert.throws(()=>Q.validateNative(f.members,options));
});
test('extracted consumers bootstrap from the saved standalone installer without a source checkout',()=>{
  const workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/discovery-installed-release.yml'),'utf8');
  const consumer=workflow.slice(workflow.indexOf('\n  native:'),workflow.indexOf('\n  publish:'));
  assert.ok(!consumer.includes('actions/checkout@'));
  assert.ok(!consumer.includes('discovery-installed-package.py'));
  assert.ok(consumer.includes('name: Verify saved standalone installer'));
  assert.ok(consumer.includes('assert.equal(crypto.createHash(\'sha256\').update(installer).digest(\'hex\'),process.env.INSTALLER_SHA256)'));
  assert.ok(consumer.includes("'/discovery-native-evidence/bootstrap/install-discovery-installed.py'"));
  assert.ok(consumer.includes("cp.execFileSync('python3',['-I',installer,'--archive',archive"));
  assert.ok(consumer.includes("'/discovery-installed/INSTALLATION_CUSTODY.json'"));
  assert.ok(workflow.includes('${{ runner.temp }}/discovery-installed-producer/install-discovery-installed.py'));
});
test('saved tar manifest is independently bound without evaluating a contained module',()=>{
  const entries={};
  const put=(name,value)=>{entries[name]=Buffer.from(value);};
  const contract='export const inert = true;';
  const sources={'examples/successor-capability/discovery-lab-contract.mjs':Q.hash(contract)};
  for(let index=0;index<40;index++)sources['inert/'+index+'.json']=Q.hash('{}');
  const sourceHash=Q.hash(Q.canonical(sources)),frozenAlpha={...alpha,sourceHash};
  for(const [name] of Object.entries(sources))put('alpha/'+name,name.endsWith('.mjs')?contract:'{}');
  put('alpha/docs/successor/capabilities/sources.json',JSON.stringify({schema:'successor-capability-source/v1',sourceHash,sources}));
  put('alpha/examples/successor-capability/discovery-lab-inspector.mjs','export const inertInspector = true;');
  put('integrations/alpha-agent/discovery-lab-contract.mjs',contract);
  const files=Object.fromEntries(Object.entries(entries).map(([name,raw])=>[name,{bytes:raw.length,sha256:Q.hash(raw),mode:'100644'}]));
  const manifest={schema:'agijobsv0/discovery-installed/v1',profile:'jobs-discovery-installed-v1',version:Q.VERSION,
    authority:'none',currencyCapBaseUnits:'0',externalExecution:'unprovisioned',productionQualified:false,
    jobs:{commit:source.sourceCommit,tree:source.sourceTree},alpha:{...frozenAlpha,status:'REVIEWED_FINAL_SOURCE',
      inspectorSha256:files['alpha/examples/successor-capability/discovery-lab-inspector.mjs'].sha256},files};
  put('INSTALLED_SOURCE.json',JSON.stringify(manifest));
  const make=()=>execFileSync('python3',['-I','-c',
    'import io,tarfile,gzip,json,sys,base64\nb=io.BytesIO()\nz=tarfile.open(fileobj=b,mode="w")\nfor n,v in json.loads(sys.argv[1]).items():\n r=base64.b64decode(v);i=tarfile.TarInfo(n);i.mode=0o644;i.size=len(r);z.addfile(i,io.BytesIO(r))\nz.close();sys.stdout.buffer.write(gzip.compress(b.getvalue(),mtime=0))',
    JSON.stringify(Object.fromEntries(Object.entries(entries).map(([name,raw])=>[name,raw.toString('base64')])))],{maxBuffer:1_000_000});
  const custody={installedManifestSha256:Q.hash(entries['INSTALLED_SOURCE.json'])};
  assert.equal(Q.installedArchive(make(),custody,source,frozenAlpha).version,Q.VERSION);
  entries['integrations/alpha-agent/discovery-lab-contract.mjs']=Buffer.from('changed inert source');
  assert.throws(()=>Q.installedArchive(make(),custody,source,frozenAlpha));
});
test('rehashed docket metadata cannot hide omitted raw receiver costs',()=>{
  const f=nativeFixture(),docket=JSON.parse(f.members.get('docket.json'));
  const ledger=JSON.parse(docket.files['08_cost_ledgers/costs.json']);ledger.receiverInspectionByRoute['jobs-agialpha'].checking=0;
  docket.files['08_cost_ledgers/costs.json']=JSON.stringify(ledger);docket.checksums['08_cost_ledgers/costs.json']=Q.hash(docket.files['08_cost_ledgers/costs.json']);
  const raw=Buffer.from(JSON.stringify(docket));
  for(const name of ['docket.json','docket.reopened.json']) {f.members.set(name,raw);f.report.files[name]={bytes:raw.length,sha256:Q.hash(raw)};}
  f.report.docket.sha256=Q.hash(raw);f.report.docket.reopenedSha256=Q.hash(raw);f.refresh();
  assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0'}),/receiver costs/);
});
function alphaPublicationFixture() {
  const sources=Object.fromEntries(Array.from({length:41},(_,i)=>['inert/'+i+'.json',Q.hash('{}')]));
  const pin={...alpha,sourceHash:Q.hash(Q.canonical(sources))};
  const qualification={releaseTag:'v1.38.0',releaseId:8,runId:9,runAttempt:1};
  const catalog=Buffer.from(JSON.stringify({schema:'successor-capability-source/v1',sourceHash:pin.sourceHash,sources}));
  const sourceMap={schema:'agialpha.capability-operator-guide.v1',commit:pin.commit,version:'1.38.0',sourceHash:pin.sourceHash,
    files:Object.fromEntries(Object.entries(sources).map(([name,sha])=>[name,{archivePath:'capability/'+name,sourceSha256:sha,packagedSha256:sha}]))};
  const entries=[['capability/source-map.json',JSON.stringify(sourceMap)],['capability/docs/successor/capabilities/sources.json',catalog.toString()],
    ...Object.keys(sources).map(name=>['capability/'+name,'{}'])];
  const zip=()=>execFileSync('python3',['-I','-c',
    'import io,zipfile,json,sys\nb=io.BytesIO()\nz=zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED)\nfor n,v in json.loads(sys.argv[1]):z.writestr(n,v)\nz.close();sys.stdout.buffer.write(b.getvalue())',JSON.stringify(entries)],{maxBuffer:1_000_000});
  const payloads=new Map([['alpha-agent-v1.38.0-operator-guide.zip',zip()],['alpha_factory_v1-1.38.0-py3-none-any.whl',Buffer.from('inert wheel')],
    ['alpha-agent-v1.38.0-source.zip',Buffer.from('inert source archive')],['alpha_factory_v1-1.38.0.tar.gz',Buffer.from('inert sdist')],
    ['requirements-agent.lock',Buffer.from('inert lock')],['model.bin',Buffer.from('inert model')]]);
  for(const kind of ['browser','site'])payloads.set(kind+'-packs.json',Buffer.from(JSON.stringify({schema:'agialpha.release-packs.v1',
    commit:pin.commit,version:'1.38.0',files:[],packs:[{name:'model.bin',bytes:payloads.get('model.bin').length,sha256:Q.hash(payloads.get('model.bin'))}]})));
  const manifest={repository:'MontrealAI/AGI-Alpha-Agent-v0',commit:pin.commit,version:'1.38.0',
    workflow_run:'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/actions/runs/9',maximum_asset_bytes:Q.ALPHA_ASSET_MAX_BYTES,
    historical_ci:{commit:pin.commit,repository:'MontrealAI/AGI-Alpha-Agent-v0',ref:'refs/heads/main',required:true},
    distributions:Object.fromEntries(['browser','site'].map(kind=>[kind,{manifest:kind+'-packs.json',packs:1,files:0}]))};
  const records={
    ['git/commits/'+pin.commit]:{sha:pin.commit,tree:{sha:pin.tree}},
    'git/ref/heads/main':{object:{sha:'f'.repeat(40)}},
    ['compare/'+pin.commit+'...'+'f'.repeat(40)]:{status:'ahead',behind_by:0,base_commit:{sha:pin.commit}},
    'releases/tags/v1.38.0':{id:8,tag_name:'v1.38.0',draft:false,prerelease:false,published_at:'2026-10-22T01:00:00Z'},
    'git/ref/tags/v1.38.0':{object:{type:'tag',sha:'1'.repeat(40)}},
    ['git/tags/'+'1'.repeat(40)]:{object:{type:'commit',sha:pin.commit}},
    'actions/runs/9':{id:9,run_attempt:1,repository:{full_name:'MontrealAI/AGI-Alpha-Agent-v0'},path:'.github/workflows/agent-release.yml',
      head_sha:pin.commit,head_branch:'main',event:'push',status:'completed',conclusion:'success'},
  };
  const calls=[],apiCalls=[];
  const refresh=({manifestInventory=true,manifestRaw}={})=>{
    if(manifestInventory)manifest.assets=[...payloads].filter(([name])=>!['release-manifest.json','SHA256SUMS'].includes(name))
      .map(([name,raw])=>({name,bytes:raw.length,sha256:Q.hash(raw)}));
    payloads.set('release-manifest.json',manifestRaw||Buffer.from(JSON.stringify(manifest)));
    payloads.set('SHA256SUMS',Buffer.from([...payloads].filter(([name])=>name!=='SHA256SUMS').sort(([a],[b])=>a.localeCompare(b))
      .map(([name,raw])=>Q.hash(raw)+'  '+name).join('\n')+'\n'));
    const assets=[...payloads].sort(([a],[b])=>a.localeCompare(b)).map(([name,raw],index)=>({id:index+20,name,size:raw.length,
      state:'uploaded',digest:'sha256:'+Q.hash(raw),browser_download_url:'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/releases/download/v1.38.0/'+name}));
    records['releases/8/assets?per_page=100&page=1']=assets;records['releases/tags/v1.38.0'].assets=assets;
  };
  refresh();
  const api=async route=>{apiCalls.push(route);assert.ok(!route.startsWith('contents/')&&!route.startsWith('git/blobs/'));assert.ok(records[route],route);return structuredClone(records[route]);};
  const fixture={pin,qualification,records,payloads,manifest,entries,zip,refresh,calls,apiCalls,api};
  const fetcher=async(url,options)=>{
    assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['Accept-Encoding'],'identity');
    const name=decodeURIComponent(new URL(url).pathname.split('/').at(-1));calls.push(name);assert.ok(payloads.has(name));
    const raw=fixture.transportFault?.(name,payloads.get(name))||payloads.get(name);
    fixture.afterDownload?.(name);return new Response(raw,{headers:{'content-length':String(raw.length)}});
  };
  fixture.assetOptions={readAsset:(asset,options)=>Q.readPublicAlphaAsset(asset,{...options,fetcher})};
  fixture.authenticatedCatalog={raw:catalog,sha256:Q.hash(catalog)};
  fixture.verify=()=>Q.verifyAlphaPublication(api,qualification,pin,fixture.authenticatedCatalog,fixture.assetOptions);
  return fixture;
}
test('actual public Alpha qualification must bind released tag, exactmain run and downloaded catalog source',async()=>{
  const f=alphaPublicationFixture(),{api,qualification,pin,authenticatedCatalog,assetOptions,records}=f;
  const proof=await f.verify();
  assert.equal(proof.sourceIsOfficialMainAncestor,true);assert.equal(proof.publicAssets.allPublicAssetsDownloaded,true);
  assert.equal(proof.publicAssets.assetCount,f.payloads.size);assert.equal(proof.publicAssets.operatorGuide.sourceInputs,41);
  assert.deepEqual(f.calls.sort(),[...f.payloads.keys()].sort());
  assert.equal(f.apiCalls.filter(route=>route==='releases/8/assets?per_page=100&page=1').length,2);
  assert.equal(f.apiCalls.filter(route=>route==='actions/runs/9').length,2);
  await assert.rejects(Q.verifyAlphaPublication(api,qualification,pin,{...authenticatedCatalog,sha256:'f'.repeat(64)},assetOptions),/catalog differs/);
  records['actions/runs/9'].conclusion='failure';
  await assert.rejects(f.verify());
  records['actions/runs/9'].conclusion='success';records['git/tags/'+'1'.repeat(40)].object.sha='f'.repeat(40);
  await assert.rejects(f.verify());
});
test('public Alpha acceptance rejects missing, corrupted, extra and incomplete public bytes',async()=>{
  {const f=alphaPublicationFixture();f.transportFault=(name,raw)=>name==='model.bin'?Buffer.alloc(raw.length,88):raw;
    await assert.rejects(f.verify(),/digest differs/);}
  {const f=alphaPublicationFixture();f.records['releases/8/assets?per_page=100&page=1']=f.records['releases/8/assets?per_page=100&page=1'].filter(a=>a.name!=='requirements-agent.lock');
    await assert.rejects(f.verify(),/inventory differ/);}
  {const f=alphaPublicationFixture();f.manifest.assets.pop();f.refresh({manifestInventory:false});
    await assert.rejects(f.verify(),/manifest inventory/);}
  {const f=alphaPublicationFixture();f.payloads.set('extra.bin',Buffer.from('not in manifest'));f.refresh({manifestInventory:false});
    await assert.rejects(f.verify(),/manifest inventory/);}
});
test('public Alpha cannot qualify a self-consistent inventory missing software or historical qualification',async()=>{
  for(const name of ['requirements-agent.lock','alpha-agent-v1.38.0-source.zip','alpha_factory_v1-1.38.0.tar.gz','alpha_factory_v1-1.38.0-py3-none-any.whl']) {
    const f=alphaPublicationFixture();f.payloads.delete(name);f.refresh();await assert.rejects(f.verify(),/software asset|wheel is required/);
  }
  for(const change of [{commit:'f'.repeat(40)},{repository:'another/repository'},{ref:'refs/heads/feature'},{required:false}]) {
    const f=alphaPublicationFixture();Object.assign(f.manifest.historical_ci,change);f.refresh();await assert.rejects(f.verify(),/historical qualification/);
  }
});
test('public Alpha source manifest, operator source map and raw catalog/source bodies are all bound',async()=>{
  for(const change of [{commit:'f'.repeat(40)},{workflow_run:'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/actions/runs/10'},{version:'1.39.0'}]) {
    const f=alphaPublicationFixture();Object.assign(f.manifest,change);f.refresh();await assert.rejects(f.verify());
  }
  {const f=alphaPublicationFixture();f.entries.find(([name])=>name==='capability/inert/0.json')[1]='changed';
    f.payloads.set('alpha-agent-v1.38.0-operator-guide.zip',f.zip());f.refresh();await assert.rejects(f.verify(),/operator source input/);}
  {const f=alphaPublicationFixture();f.entries.find(([name])=>name==='capability/docs/successor/capabilities/sources.json')[1]='{}';
    f.payloads.set('alpha-agent-v1.38.0-operator-guide.zip',f.zip());f.refresh();await assert.rejects(f.verify(),/operator catalog differs/);}
});
test('public Alpha metadata accepts original Python Unicode spelling and rejects duplicate decoded fields',async()=>{
  {const f=alphaPublicationFixture();f.manifest.description='valid é';f.refresh();
    const raw=Buffer.from(f.payloads.get('release-manifest.json').toString().replace('é','\\u00e9'));
    f.refresh({manifestInventory:false,manifestRaw:raw});assert.equal((await f.verify()).publicAssets.sourceManifestSha256,Q.hash(raw));}
  {const f=alphaPublicationFixture(),raw=Buffer.from(f.payloads.get('release-manifest.json').toString().replace('{"repository":','{"repository":"duplicate","repository":'));
    f.refresh({manifestInventory:false,manifestRaw:raw});await assert.rejects(f.verify(),/Duplicate public Alpha JSON field/);}
});
test('public Alpha leases are re-read after downloads and source never uses cached public-release metadata',async()=>{
  {const f=alphaPublicationFixture();f.afterDownload=name=>{if(name==='model.bin')f.records['actions/runs/9'].run_attempt=2;};await assert.rejects(f.verify(),/producer changed/);}
  {const f=alphaPublicationFixture();f.afterDownload=name=>{if(name==='model.bin')f.records['git/tags/'+'1'.repeat(40)].object.sha='f'.repeat(40);};await assert.rejects(f.verify(),/tag changed/);}
  {const f=alphaPublicationFixture();f.afterDownload=name=>{if(name==='model.bin')f.records['releases/8/assets?per_page=100&page=1'][0].digest='sha256:'+'f'.repeat(64);};await assert.rejects(f.verify(),/assets changed/);}
  {const f=alphaPublicationFixture();f.afterDownload=name=>{if(name==='model.bin') {
    f.records['git/ref/heads/main'].object.sha='9'.repeat(40);
    f.records['compare/'+f.pin.commit+'...'+'9'.repeat(40)]={status:'diverged',behind_by:1,base_commit:{sha:f.pin.commit}};
  }};await assert.rejects(f.verify(),/left official main ancestry/);}
  {const f=alphaPublicationFixture();f.afterDownload=name=>{if(name==='model.bin') {
    f.records['git/ref/heads/main'].object.sha='9'.repeat(40);
    f.records['compare/'+f.pin.commit+'...'+'9'.repeat(40)]={status:'ahead',behind_by:0,base_commit:{sha:f.pin.commit}};
  }};assert.equal((await f.verify()).officialMain,'9'.repeat(40));}
  const code=fs.readFileSync(path.join(__dirname,'discovery-installed-qualification.cjs'),'utf8');
  assert.ok(code.includes('verifyAlphaPublication(alphaReleaseApi,record.alphaQualification'));
  assert.ok(code.includes('alphaReleaseApi=options.alphaApi||liveApi(process.env.GH_TOKEN,ALPHA_REPOSITORY)'));
});
test('public Alpha release host boundary permits450MB and larger assets without requiring immutability',()=>{
  const f=alphaPublicationFixture(),base=f.records['releases/8/assets?per_page=100&page=1'][0];
  for(const size of [450_000_000,450_000_001,Q.ALPHA_ASSET_MAX_BYTES])assert.equal(Q.alphaPublicAssetIdentity({...base,size},'v1.38.0').size,size);
  for(const size of [false,-1,Q.ALPHA_ASSET_MAX_BYTES+1])assert.throws(()=>Q.alphaPublicAssetIdentity({...base,size},'v1.38.0'));
  assert.equal(Object.hasOwn(f.records['releases/tags/v1.38.0'],'immutable'),false);
});
test('public Alpha stream rejects truncated/overflow/HTML bytes and redirects outside release hosting',async()=>{
  const raw=Buffer.from('known public asset'),asset={id:1,name:'asset.bin',size:raw.length,digest:'sha256:'+Q.hash(raw),url:'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/releases/download/v1.38.0/asset.bin'};
  const read=fetcher=>Q.readPublicAlphaAsset(asset,{fetcher});
  assert.equal((await read(async()=>new Response(raw))).sha256,Q.hash(raw));
  await assert.rejects(read(async()=>new Response(raw.subarray(1))),/truncated/);
  await assert.rejects(read(async()=>new Response(Buffer.concat([raw,Buffer.from('x')]))),/exceeded/);
  await assert.rejects(read(async()=>new Response(Buffer.alloc(raw.length,60))),/digest differs/);
  let requests=0;
  await assert.rejects(read(async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://example.invalid/asset'}});}),/left GitHub/);
  assert.equal(requests,1);
  let calls=0;
  const proof=await read(async(url,options)=>{
    assert.equal(options.headers.Authorization,undefined);calls++;
    return calls===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/public/file?opaque=public'}}):new Response(raw);
  });
  assert.equal(proof.authorizationHeaderSent,false);assert.equal(calls,2);
});
test('rc17 and rc18 applicability retains the original suite and admits no unknown or false version',()=>{
  const dispatch=require('./discovery-installed-release-dispatch.cjs');
  assert.deepEqual(dispatch.editionForVersion('2.1.0-rc.17'),{edition:'rc17',selected:'true'});
  assert.deepEqual(dispatch.editionForVersion('2.1.0-rc.18'),{edition:'rc18',selected:'false'});
  for(const version of [null,false,true,'false','2.1.0-rc.16','2.1.0-rc.19','2.1.0-rc.18 '])assert.throws(()=>dispatch.editionForVersion(version));
  const workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/source-release-rc16.yml'),'utf8');
  assert.equal(dispatch.assertRoutingSource(workflow),true);
  for(const changed of [
    workflow.replace("if: steps.release-version.outputs.edition == 'rc17'",'if: false'),
    workflow.replace("if: steps.release-version.outputs.edition == 'rc18'",'if: false'),
    workflow.replace(dispatch.inheritedCommand,dispatch.inheritedCommand.replace(' test/scripts/source-profile-rc16.test.cjs','')),
    workflow.replace('python3 -B scripts/release/test-discovery-installed-archive.py','true'),
    workflow.replace(' integrations/alpha-agent/discovery-installed-runtime.test.mjs',''),
    workflow.replace(' tools/security/discovery-installed-protected-scope.test.mjs',''),
    workflow.replace('  validate:\n','  validate:\n    if: false\n'),
    workflow.replace('        id: release-version','        if: false\n        id: release-version'),
  ])assert.throws(()=>dispatch.assertRoutingSource(changed));
});
test('saved producer inventory includes every common original packet member with no substituted summary',()=>{
  const C=require('./capture-discovery-browser-input.cjs'),{fixture}=require('./discovery-browser-packet-fixtures.cjs'),f=fixture();
  const members=new Map([['jobs-discovery-installed.tar.gz',Buffer.from('inert archive identity only')],
    ['jobs-discovery-installed.tar.gz.custody.json',Buffer.from('{}')],[Q.INSTALLER_ASSET,Buffer.from('# inert')],
    ['browser-inputs/workspace.json',f.workspace],['browser-inputs/request.txt',f.request],
    ...[...f.packet].map(([name,raw])=>['browser-inputs/packet/'+name,raw])]);
  assert.equal(members.size,22);assert.doesNotThrow(()=>Q.assertProducerInventory(members));
  members.delete('browser-inputs/packet/CUSTODY.json');assert.throws(()=>Q.assertProducerInventory(members),/common 17-file packet/);
  members.set('browser-inputs/packet/CUSTODY.json',f.packet.get('CUSTODY.json'));members.set('browser-inputs/custody.json',Buffer.from('{}'));
  assert.throws(()=>Q.assertProducerInventory(members),/common 17-file packet/);assert.equal(C.PACKET.length,17);
});
test('qualification reuses common packet authentication and preserves every retained original byte',async()=>{
  const {fixture}=require('./discovery-browser-packet-fixtures.cjs'),f=fixture();
  const alpha={commit:f.pin.commit,tree:f.pin.tree,sourceHash:f.pin.sourceHash};
  const browser={workspace:f.workspace,request:f.request,packet:new Map(f.packet)};
  assert.equal((await Q.verifyBrowserInput(f.api,browser,alpha,f.pin,f.binding,f.rawBody)).missionId,f.binding.missionId);
  browser.packet.set('metadata/run.json',Buffer.from('{}'));
  await assert.rejects(Q.verifyBrowserInput(f.api,browser,alpha,f.pin,f.binding,f.rawBody),/Retained common browser packet member differs/);
  browser.packet=new Map(f.packet);browser.request=Buffer.from(JSON.stringify(JSON.parse(f.request),null,2));
  await assert.rejects(Q.verifyBrowserInput(f.api,browser,alpha,f.pin,f.binding,f.rawBody),/request alias differs/);
});
test('installed consumers cannot rebuild semantically equal original browser request bytes',()=>{
  const f=nativeFixture();f.report.inputWorkspace='retained-exported-workspace';f.report.inputRequest='original-exported-typed-bytes';
  f.report.receiptImports.records[0].case='original-exported-request';f.refresh();
  const browser={workspace:f.members.get('workspace.input.json'),request:f.members.get(f.report.receiptImports.records[0].requestFile)};
  Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0',browser});
  assert.throws(()=>Q.validateNative(f.members,{source,alpha,custody:f.custody,version:'24.21.0',browser:{...browser,request:Buffer.from('{ }')}}),/rebuilt or replaced/);
});
