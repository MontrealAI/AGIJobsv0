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
// Independent literal contract derived from the reviewed Alpha615 publisher recipe.
// This is the fixed-name set, not a total release-asset count; all declared packs are additional.
const EXPECTED_ALPHA_615_FIXED_ASSETS=[
  'AGI_ALPHA_Unified_Publication_Final.md',
  'AGI_ALPHA_Unified_Publication_Final.pdf',
  'ASCENSION_CYCLE.md',
  'ASCENSION_CYCLE_ENGINEERING.md',
  'ASCENSION_CYCLE_HANDOFF.md',
  'ASCENSION_PROTOCOL.md',
  'ASCENSION_STACK_RELEASE.md',
  'BUSINESS3.md',
  'CAPABILITIES.md',
  'CAPABILITY_WORKSPACE.md',
  'COMPOUNDING_LAB.md',
  'CURRENT_MAINNET_DEPLOYMENT.md',
  'CURRICULUM_LAB.md',
  'DECISION_STUDIO.md',
  'DEMOS.md',
  'DEMO_AUDIT_2026-10-01.md',
  'DEMO_VALIDATION.md',
  'DISCOVERY.md',
  'DISCOVERY_LAB_CONTINUATION_2026-10-21.md',
  'DISCOVERY_LAB_DEPLOYMENT_COMPATIBILITY.json',
  'DISCOVERY_LAB_DEPLOYMENT_COMPATIBILITY.md',
  'DISCOVERY_LAB_EVIDENCE_DOCKET.md',
  'DISCOVERY_LAB_FOUNDATION_REPRODUCTION.json',
  'DISCOVERY_LAB_FUTURE_PROTOCOL.md',
  'DISCOVERY_LAB_MODEL_REVIEW.json',
  'DISCOVERY_LAB_PAPER_TO_CODE.md',
  'DISCOVERY_LAB_README.md',
  'DISCOVERY_LAB_REAL_TASK_ADAPTER.md',
  'DISCOVERY_LAB_RELEASE_NOTES.md',
  'DISCOVERY_LAB_SOURCES.json',
  'DISCOVERY_LAB_SPECIFICATION.md',
  'ECOSYSTEM_ADAPTERS.md',
  'EXPERIENCE.md',
  'FACTORY_GUIDE.md',
  'GOVERNANCE.md',
  'INSIGHT_ATLAS.md',
  'MAINNET_DEPLOYMENT.md',
  'MAINNET_READINESS.md',
  'MANUSCRIPT_ALIGNMENT.md',
  'MARK_WALLET.md',
  'MATS.md',
  'MUZERO.md',
  'NATIVE_BUDGET_RESERVATIONS.md',
  'NOVA_SEED_STUDIO.md',
  'NOVA_SEED_STUDIO_ENGINEERING.md',
  'ONBOARDING.md',
  'OPERATIONS.md',
  'OUT_EXECUTE.md',
  'PAGES_GUIDE.md',
  'PAPER_UPLOADS.md',
  'PROOF_BLOOM.md',
  'RELEASE_NOTES_1.38.0.md',
  'RELEASE_READINESS.md',
  'REPOSITORY_GUIDE.md',
  'SHA256SUMS',
  'START_HERE.md',
  'SUCCESSOR.md',
  'SUCCESSOR_ACCEPTANCE.md',
  'SUCCESSOR_ALPHA.md',
  'SUCCESSOR_ALPHA_CONTINUITY.md',
  'SUCCESSOR_ALPHA_DEPLOYMENT.md',
  'SUCCESSOR_ARCHITECTURE.md',
  'SUCCESSOR_ASCENSION.md',
  'SUCCESSOR_COMPUTER_USE.md',
  'SUCCESSOR_OPERATIONS.md',
  'SUCCESSOR_PACKAGING.md',
  'SUCCESSOR_SOURCES.json',
  'SUPPLIER_BROWSER_ADAPTER.md',
  'TRANSFORMATIONAL_DISCOVERY.md',
  'TRANSFORMATIONAL_IMPLEMENTATION.md',
  'TRANSFORMATIONAL_LOCAL_MODEL.md',
  'TRANSFORMATIONAL_MATH.md',
  'TRANSFORMATIONAL_POLICY_STUDY.md',
  'TRANSFORMATIONAL_PUBLIC_PILOT.md',
  'TRANSFORMATIONAL_SOURCE_AUDIT.md',
  'VALIDATION.md',
  'WHITEPAPER_IMPLEMENTATION.md',
  'alpha-agent-v1.38.0-mainnet-record.zip',
  'alpha-agent-v1.38.0-manuscript.zip',
  'alpha-agent-v1.38.0-operator-guide.zip',
  'alpha-agent-v1.38.0-public-validation-packs.json',
  'alpha-agent-v1.38.0-source.zip',
  'alpha-agent-v1.38.0-validation.zip',
  'alpha_factory_v1-1.38.0-py3-none-any.whl',
  'alpha_factory_v1-1.38.0.tar.gz',
  'browser-packs.json',
  'computer-use-study-report-pack.zip',
  'ethereum-mainnet-2026-10-18.json',
  'install_agent.py',
  'release-manifest.json',
  'release_packs.py',
  'requirements-agent.lock',
  'site-packs.json',
  'source-manifest.json',
  'successor-alpha-workspace.html',
  'successor-preservation.json',
  'transformational-intelligence-workspace.html'
];
function alphaPublicationFixture() {
  const sources=Object.fromEntries(Array.from({length:41},(_,i)=>['inert/'+i+'.json',Q.hash('{}')]));
  const pin={commit:'61532fb82621a065e668fd11e57289dcfb65c67b',tree:'7814d1bd9dcd3845b349590e0bcac57ba93b3167',sourceHash:Q.hash(Q.canonical(sources))};
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
  for(const name of EXPECTED_ALPHA_615_FIXED_ASSETS)if(!payloads.has(name)&&!['release-manifest.json','SHA256SUMS'].includes(name))
    payloads.set(name,Buffer.from('inert fixed output '+name));
  for(const kind of ['mainnet-record','manuscript','validation'])payloads.set('alpha-agent-v1.38.0-'+kind+'.zip',Buffer.from('inert '+kind+' archive'));
  for(const name of ['successor-alpha-workspace.html','transformational-intelligence-workspace.html'])payloads.set(name,Buffer.from('<!doctype html><title>inert workspace</title>'));
  for(const[name,prefix]of [['browser-packs.json','browser'],['site-packs.json','site'],
    ['alpha-agent-v1.38.0-public-validation-packs.json','alpha-agent-v1.38.0-public-validation']]) {
    const packName=prefix+'-core-001.zip',packRaw=Buffer.from('inert '+prefix+' transport bytes'),logical=Buffer.from('inert logical file');
    payloads.set(packName,packRaw);
    payloads.set(name,Buffer.from(JSON.stringify({schema:'agialpha.release-packs.v1',commit:pin.commit,version:'1.38.0',
      max_asset_bytes:Q.ALPHA_ASSET_MAX_BYTES,total_bytes:logical.length,
      files:[{path:'fixture.txt',group:'core',bytes:logical.length,sha256:Q.hash(logical),
        parts:[{pack:packName,member:'fixture.txt',bytes:logical.length,sha256:Q.hash(logical)}]}],
      packs:[{name:packName,group:'core',bytes:packRaw.length,sha256:Q.hash(packRaw)}]})));
  }
  const manifest={repository:'MontrealAI/AGI-Alpha-Agent-v0',commit:pin.commit,version:'1.38.0',
    workflow_run:'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/actions/runs/9',maximum_asset_bytes:Q.ALPHA_ASSET_MAX_BYTES,
    historical_ci:{commit:pin.commit,repository:'MontrealAI/AGI-Alpha-Agent-v0',ref:'refs/heads/main',required:true},
    distributions:Object.fromEntries(['browser','site'].map(kind=>[kind,{manifest:kind+'-packs.json',packs:1,files:1}]))};
  const localName='alpha-agent-v1.38.0-validation.zip',publicName='alpha-agent-v1.38.0-public-validation-packs.json';
  manifest.validation_evidence={schema:'agialpha.validation-evidence.v1',commit:pin.commit,version:'1.38.0',
    local:{name:localName,bytes:payloads.get(localName).length,sha256:Q.hash(payloads.get(localName))},
    public:{manifest:publicName,bytes:payloads.get(publicName).length,sha256:Q.hash(payloads.get(publicName)),files:1,packs:1}};
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
  records['actions/runs/9/attempts/1/jobs?per_page=100&page=1']={total_count:3,jobs:['package','pages','publish'].map((name,index)=>
    ({id:1000+index,name,run_id:9,run_attempt:1,head_sha:pin.commit,head_branch:'main',status:'completed',conclusion:'success'}))};
  records['actions/runs/9/attempts/1/jobs?per_page=100&page=2']={total_count:3,jobs:[]};
  const calls=[],apiCalls=[];
  const refresh=({manifestInventory=true,manifestRaw}={})=>{
    if(manifestInventory)manifest.assets=[...payloads].filter(([name])=>!['release-manifest.json','SHA256SUMS'].includes(name))
      .map(([name,raw])=>({name,bytes:raw.length,sha256:Q.hash(raw)}));
    payloads.set('release-manifest.json',manifestRaw||Buffer.from(JSON.stringify(manifest)));
    payloads.set('SHA256SUMS',Buffer.from([...payloads].filter(([name])=>name!=='SHA256SUMS').sort(([a],[b])=>a.localeCompare(b))
      .map(([name,raw])=>Q.hash(raw)+'  '+name).join('\n')+'\n'));
    const assets=[...payloads].sort(([a],[b])=>a.localeCompare(b)).map(([name,raw],index)=>({id:index+20,name,size:raw.length,
      state:'uploaded',digest:'sha256:'+Q.hash(raw),browser_download_url:'https://github.com/MontrealAI/AGI-Alpha-Agent-v0/releases/download/v1.38.0/'+name}));
    for(const key of Object.keys(records))if(key.startsWith('releases/8/assets?per_page=100&page='))delete records[key];
    for(let offset=0;offset<=assets.length;offset+=100) {
      records['releases/8/assets?per_page=100&page='+(offset/100+1)]=assets.slice(offset,offset+100);
      if(assets.length-offset<100)break;
    }
    records['releases/tags/v1.38.0'].assets=assets;
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
// OWNED_ALPHA_PROFILE_HELPER_CASES_BEGIN
// Parsed inert metadata only: these cases do not execute the existing Python JSON/ZIP bridge.
function ownedAlphaProfileFixture() {
  const alpha={commit:'61532fb82621a065e668fd11e57289dcfb65c67b',tree:'7814d1bd9dcd3845b349590e0bcac57ba93b3167'};
  const profile=Q.reviewedAlphaReleaseProfile(alpha,'1.38.0'),receipts=profile.requiredNames.map(name=>{
    const raw=Buffer.from('owned inert '+name);return {name,bytes:raw.length,sha256:Q.hash(raw)};
  });
  // The canonical wheel already has exactly one row in the fixed source-name set.
  receipts.push({name:'optional-extra.bin',bytes:0,sha256:Q.hash('')});
  const packManifests=Object.create(null),manifest={distributions:{}};
  for(const selected of profile.packManifests) {
    const name=selected.prefix+'-core-001.zip',raw=Buffer.from('owned inert '+selected.prefix+' ZIP transport'),logical=Buffer.from('x'.repeat(101));
    receipts.push({name,bytes:raw.length,sha256:Q.hash(raw)});
    const value={schema:'agialpha.release-packs.v1',commit:alpha.commit,version:'1.38.0',max_asset_bytes:2**31-1,total_bytes:logical.length,
      files:[{path:'fixture.txt',group:'core',bytes:logical.length,sha256:Q.hash(logical),
        parts:[{pack:name,member:'fixture.txt',bytes:logical.length,sha256:Q.hash(logical)}]}],
      packs:[{name,group:'core',bytes:raw.length,sha256:Q.hash(raw)}]};
    packManifests[selected.name]=value;
    const control=receipts.find(row=>row.name===selected.name),controlRaw=Buffer.from(JSON.stringify(value));
    control.bytes=controlRaw.length;control.sha256=Q.hash(controlRaw);
    if(selected.distribution)manifest.distributions[selected.distribution]={manifest:selected.name,files:1,packs:1};
  }
  const local=receipts.find(row=>row.name==='alpha-agent-v1.38.0-validation.zip');
  const control=receipts.find(row=>row.name==='alpha-agent-v1.38.0-public-validation-packs.json');
  manifest.validation_evidence={schema:'agialpha.validation-evidence.v1',commit:alpha.commit,version:'1.38.0',
    local:{name:local.name,bytes:local.bytes,sha256:local.sha256},
    public:{manifest:control.name,bytes:control.bytes,sha256:control.sha256,files:1,packs:1}};
  return {alpha,profile,receipts,packManifests,manifest,
    verify:()=>Q.verifyAlphaProfilePacks(profile,manifest,receipts,packManifests)};
}
function ownedAlphaAttemptFixture({extras=0,attempt=2}={}) {
  const alpha={commit:'61532fb82621a065e668fd11e57289dcfb65c67b'},qualification={runId:9,runAttempt:attempt};
  const jobs=['package','pages','publish'].map((name,index)=>({id:100+index,name,run_id:9,run_attempt:attempt,head_sha:alpha.commit,head_branch:'main',status:'completed',conclusion:'success',
    started_at:'2026-10-22T21:00:00Z'}));
  jobs.splice(2,0,...Array.from({length:extras},(_,index)=>({id:1000+index,name:'carried-'+index,run_id:9,run_attempt:attempt,head_sha:alpha.commit,head_branch:'main',status:'completed',conclusion:'success',
    started_at:index<32?'2026-10-21T00:00:00Z':'2026-10-22T21:00:00Z'})));
  const calls=[],state={jobs,reply:null},api=async route=>{
    calls.push(route);const match=new RegExp('^actions/runs/9/attempts/'+attempt+'/jobs\\?per_page=100&page=([1-9][0-9]*)$').exec(route);
    assert.ok(match,'Unexpected owned selected-attempt endpoint '+route);const page=Number(match[1]);
    if(state.reply)return state.reply(page,route);
    return {total_count:state.jobs.length,jobs:structuredClone(state.jobs.slice((page-1)*100,page*100))};
  };
  return {alpha,qualification,jobs,state,calls,api,verify:()=>Q.alphaReleaseAttemptJobs(api,qualification,alpha)};
}
test('owned Alpha profile: independently literal97 fixed source outputs equal the complete reviewed profile',()=>{
  const f=ownedAlphaProfileFixture();assert.equal(EXPECTED_ALPHA_615_FIXED_ASSETS.length,97);
  assert.equal(new Set(EXPECTED_ALPHA_615_FIXED_ASSETS).size,97);
  assert.deepEqual([...f.profile.requiredNames].sort(),[...EXPECTED_ALPHA_615_FIXED_ASSETS].sort());
  assert.equal(f.receipts.filter(row=>row.name==='alpha_factory_v1-1.38.0-py3-none-any.whl').length,1);
});
test('owned Alpha profile: exact reviewed source/version and extra ordinary assets are accepted as metadata only',()=>{
  const f=ownedAlphaProfileFixture(),result=f.verify();assert.equal(result.sourceCommit,f.alpha.commit);assert.equal(result.sourceTree,f.alpha.tree);
  assert.equal(result.requiredAssetsVerified,true);assert.equal(result.packManifests.length,3);
  assert.ok(f.receipts.some(row=>row.name==='optional-extra.bin'));assert.equal(Object.hasOwn(result,'publicationApproved'),false);
});
test('owned Alpha profile: unknown commit tree and manifestversion cannot select a finite profile',()=>{
  for(const [alpha,version]of [[{commit:'a'.repeat(40),tree:'7814d1bd9dcd3845b349590e0bcac57ba93b3167'},'1.38.0'],
    [{commit:'61532fb82621a065e668fd11e57289dcfb65c67b',tree:'a'.repeat(40)},'1.38.0'],
    [{commit:'61532fb82621a065e668fd11e57289dcfb65c67b',tree:'7814d1bd9dcd3845b349590e0bcac57ba93b3167'},'1.38.1']])
    assert.throws(()=>Q.reviewedAlphaReleaseProfile(alpha,version),/reviewed/);
});
test('owned Alpha profile: each required asset omission refuses independently of mutually matching public controls',()=>{
  const original=ownedAlphaProfileFixture();
  for(const name of original.profile.requiredNames) {
    const f=ownedAlphaProfileFixture();f.receipts.splice(f.receipts.findIndex(row=>row.name===name),1);
    assert.throws(()=>Q.verifyAlphaProfileInventory(f.profile,f.receipts),name.endsWith('.whl')?/wheel is required/:/profile asset is absent/);
  }
});
test('owned Alpha profile: absent duplicate or wrongversion wheel refuses',()=>{
  for(const mode of ['absent','duplicate','wrongversion']) {
    const f=ownedAlphaProfileFixture(),wheel=f.receipts.find(row=>row.name.endsWith('.whl'));
    if(mode==='absent')f.receipts.splice(f.receipts.indexOf(wheel),1);
    if(mode==='duplicate')f.receipts.push({...wheel,name:'alpha_factory_v1-1.38.0-another.whl'});
    if(mode==='wrongversion')wheel.name='alpha_factory_v1-1.39.0-py3-none-any.whl';
    assert.throws(()=>Q.verifyAlphaProfileInventory(f.profile,f.receipts),/wheel/);
  }
});
test('owned Alpha profile: all three actual PACKFILE schemas and declaration counts are bound',()=>{
  for(const name of ownedAlphaProfileFixture().profile.packManifests.map(row=>row.name))for(const key of ['schema','commit','version']) {
    const f=ownedAlphaProfileFixture();f.packManifests[name][key]='wrong';assert.throws(f.verify);
  }
  for(const change of [d=>{d.manifest='site-packs.json';},d=>{d.files=0;},d=>{d.packs=true;},d=>{d.extra=1;}]) {
    const f=ownedAlphaProfileFixture();change(f.manifest.distributions.browser);assert.throws(f.verify);
  }
});
test('owned Alpha profile: files and packs must be nonempty arrays with strict rootfields and numeric types',()=>{
  for(const change of [p=>{p.files=[];},p=>{p.packs=[];},p=>{p.files={};},p=>{p.packs=null;},p=>{p.total_bytes=true;},
    p=>{p.total_bytes=-1;},p=>{p.max_asset_bytes=2**31;},p=>{p.max_asset_bytes=false;},p=>{p.extra=true;}]) {
    const f=ownedAlphaProfileFixture();change(f.packManifests['browser-packs.json']);assert.throws(f.verify);
  }
});
test('owned Alpha profile: borrowed duplicate or wrongprefix pack names cannot stand in for source packs',()=>{
  for(const change of [p=>{p.packs[0].name='model.bin';},p=>{p.packs[0].name='site-core-001.zip';},
    p=>{p.packs.push({...p.packs[0]});},p=>{p.packs[0].group='unknown';},p=>{p.packs[0].name='browser-core-002.zip';}]) {
    const f=ownedAlphaProfileFixture();change(f.packManifests['browser-packs.json']);assert.throws(f.verify);
  }
});
test('owned Alpha profile: every pack row requires actual observed name bytes and SHA',()=>{
  for(const mode of ['absent','bytes','sha']) {
    const f=ownedAlphaProfileFixture(),row=f.receipts.find(item=>item.name==='browser-core-001.zip');
    if(mode==='absent')f.receipts.splice(f.receipts.indexOf(row),1);else if(mode==='bytes')row.bytes++;else row.sha256='0'.repeat(64);
    assert.throws(f.verify);
  }
  for(const value of [true,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER]) {
    const f=ownedAlphaProfileFixture();f.packManifests['browser-packs.json'].packs[0].bytes=value;assert.throws(f.verify);
  }
  for(const value of [false,'invalid','F'.repeat(64)]) {
    const f=ownedAlphaProfileFixture();f.packManifests['browser-packs.json'].packs[0].sha256=value;assert.throws(f.verify);
  }
});
test('owned Alpha profile: logical file total intentionally differs from compressed ZIP byte total',()=>{
  const f=ownedAlphaProfileFixture(),value=f.packManifests['browser-packs.json'];
  assert.notEqual(value.total_bytes,value.packs.reduce((sum,row)=>sum+row.bytes,0));assert.equal(f.verify().packManifests[0].logicalBytes,101);
});
test('owned Alpha profile: validation evidence uses its distinct schema source and version',()=>{
  for(const change of [v=>{v.schema='agialpha.release-packs.v1';},v=>{v.commit='a'.repeat(40);},v=>{v.version='1.38.1';},
    v=>{v.extra=true;},v=>{delete v.local;},v=>{delete v.public;}]) {
    const f=ownedAlphaProfileFixture();change(f.manifest.validation_evidence);assert.throws(f.verify);
  }
});
test('owned Alpha profile: retained local validation ZIP name bytes and SHA are independently bound',()=>{
  for(const [key,value]of [['name','other.zip'],['bytes',0],['bytes',true],['sha256','0'.repeat(64)]]) {
    const f=ownedAlphaProfileFixture();f.manifest.validation_evidence.local[key]=value;assert.throws(f.verify);
  }
});
test('owned Alpha profile: public validation control name bytes SHA files and packs are independently bound',()=>{
  for(const [key,value]of [['manifest','browser-packs.json'],['bytes',0],['sha256','0'.repeat(64)],['files',0],['packs',true]]) {
    const f=ownedAlphaProfileFixture();f.manifest.validation_evidence.public[key]=value;assert.throws(f.verify);
  }
});
test('owned Alpha profile: duplicate or malformed observed asset identities refuse',()=>{
  for(const change of [f=>{f.receipts.push({...f.receipts[0]});},f=>{f.receipts[0].bytes=true;},
    f=>{f.receipts[0].bytes=-1;},f=>{f.receipts[0].sha256=false;}]) {
    const f=ownedAlphaProfileFixture();change(f);assert.throws(f.verify);
  }
});
test('owned Alpha jobs: genuine a2 inventory retains32 old timestamps while all38 rows bind attempt2',async()=>{
  const f=ownedAlphaAttemptFixture({extras:35}),result=await f.verify();
  assert.equal(result.runAttempt,2);assert.equal(result.completeInventory,true);assert.equal(result.requiredJobs.length,3);
  assert.equal(result.inventory[0].jobs.length,38);assert.ok(result.inventory[0].jobs.every(row=>row.run_attempt===2));
  assert.equal(result.inventory[0].jobs.filter(row=>row.started_at==='2026-10-21T00:00:00Z').length,32);
  assert.ok(result.requiredJobs.every(row=>row.headBranch==='main'));
  assert.deepEqual(f.calls,['actions/runs/9/attempts/2/jobs?per_page=100&page=1','actions/runs/9/attempts/2/jobs?per_page=100&page=2']);
});
test('owned Alpha jobs: actual pagination includes required publish on the last nonempty page',async()=>{
  const f=ownedAlphaAttemptFixture({extras:102}),result=await f.verify();
  assert.equal(result.inventory.length,3);assert.equal(result.inventory[1].jobs.at(-1).name,'publish');
  assert.equal(result.requiredJobs.find(row=>row.name==='publish').id,102);
});
test('owned Alpha jobs: every missing skipped failed cancelled queued or neutral required job refuses',async()=>{
  for(const name of ['package','pages','publish'])for(const mode of ['missing','skipped','failure','cancelled','queued','in_progress','neutral']) {
    const f=ownedAlphaAttemptFixture(),row=f.state.jobs.find(item=>item.name===name);
    if(mode==='missing')f.state.jobs.splice(f.state.jobs.indexOf(row),1);
    else if(['queued','in_progress'].includes(mode)){row.status=mode;row.conclusion=null;}else row.conclusion=mode;
    await assert.rejects(f.verify());
  }
});
test('owned Alpha jobs: duplicate required names or ids and wrong run source or selectedattempt refuse',async()=>{
  for(const mode of ['name','id','run','source','attempt']) {
    const f=ownedAlphaAttemptFixture(),row=f.state.jobs[0];
    if(mode==='name')f.state.jobs.push({...row,id:999});else if(mode==='id')f.state.jobs[1].id=row.id;
    else if(mode==='run')row.run_id=10;else if(mode==='source')row.head_sha='a'.repeat(40);else row.run_attempt=1;
    await assert.rejects(f.verify());
  }
});
test('owned Alpha jobs: wrong or missing main branch refuses for every required release job',async()=>{
  for(const name of ['package','pages','publish'])for(const branch of ['feature',undefined]) {
    const f=ownedAlphaAttemptFixture(),row=f.state.jobs.find(item=>item.name===name);
    if(branch===undefined)delete row.head_branch;else row.head_branch=branch;
    await assert.rejects(f.verify(),/release job branch differs/);
  }
  const f=ownedAlphaAttemptFixture(),before=await f.verify(),after=structuredClone(before);after.requiredJobs[0].headBranch='feature';
  assert.throws(()=>Q.alphaReleaseJobsLease(before,after),/jobs changed/);
});
test('owned Alpha jobs: complete totals framing and serviceerrors refuse without a fallback',async()=>{
  for(const mode of ['total','bool','truncated','nonarray','error','duplicatepage']) {
    const f=ownedAlphaAttemptFixture();
    f.state.reply=page=>{
      if(mode==='error')throw new Error('owned selected job API failure');
      if(mode==='nonarray')return {total_count:3,jobs:{}};
      if(mode==='bool')return {total_count:true,jobs:[]};
      if(mode==='duplicatepage')return {total_count:6,jobs:structuredClone(f.jobs)};
      if(mode==='truncated')return {total_count:4,jobs:page===1?structuredClone(f.jobs):[]};
      return {total_count:page===1?3:4,jobs:page===1?structuredClone(f.jobs):[]};
    };
    await assert.rejects(f.verify());
  }
});
test('owned Alpha jobs: actual source attempt endpoint and positive typed selectors are mandatory',async()=>{
  for(const value of [false,0,-1,1.5,'2']) {
    const f=ownedAlphaAttemptFixture();f.qualification.runAttempt=value;await assert.rejects(f.verify());assert.equal(f.calls.length,0);
  }
  const f=ownedAlphaAttemptFixture();f.qualification.runId=10;await assert.rejects(f.verify(),/Unexpected owned/);
});
test('owned Alpha jobs: fresh requiredjob identity movement refuses while exact repeated lease is retained',async()=>{
  const f=ownedAlphaAttemptFixture(),before=await f.verify(),same=await f.verify();
  assert.equal(Q.alphaReleaseJobsLease(before,same).after,same);
  f.state.jobs[0].id=999;const moved=await f.verify();assert.throws(()=>Q.alphaReleaseJobsLease(before,moved),/jobs changed/);
  for(const key of ['runId','runAttempt','sourceCommit']) {
    const after=structuredClone(same);after[key]=key==='sourceCommit'?'a'.repeat(40):99;
    assert.throws(()=>Q.alphaReleaseJobsLease(before,after),/lease changed/);
  }
});
// OWNED_ALPHA_PROFILE_HELPER_CASES_END
// These whole-publication integration fixtures remain for ordinary hosted CI.
// Local focused verification selects only OWNED_ALPHA_PROFILE_HELPER_CASES above.
test('public Alpha wholepublication requires the selected fullattempt jobs and retains their fresh lease',async()=>{
  const positive=alphaPublicationFixture(),proof=await positive.verify();
  assert.equal(proof.publicAssets.fullProducerJobs.before.requiredJobs.length,3);
  assert.equal(proof.publicAssets.fullProducerJobs.after.completeInventory,true);
  assert.equal(proof.publicAssets.reviewedProfile.version,'1.38.0');
  for(const name of ['package','pages','publish']) {
    const f=alphaPublicationFixture(),first=f.records['actions/runs/9/attempts/1/jobs?per_page=100&page=1'];
    first.jobs=first.jobs.filter(row=>row.name!==name);first.total_count=first.jobs.length;
    f.records['actions/runs/9/attempts/1/jobs?per_page=100&page=2'].total_count=first.jobs.length;
    await assert.rejects(f.verify(),/full Alpha release job missing/);assert.equal(f.calls.length,0);
  }
  const changed=alphaPublicationFixture();changed.afterDownload=name=>{
    if(name==='model.bin')changed.records['actions/runs/9/attempts/1/jobs?per_page=100&page=1'].jobs[0].id=9999;
  };
  await assert.rejects(changed.verify(),/jobs changed during download/);
});
test('public Alpha wholepublication refuses consistently omitted finiteoutputs and mismatched validation evidence',async()=>{
  for(const name of ['alpha-agent-v1.38.0-mainnet-record.zip','alpha-agent-v1.38.0-manuscript.zip',
    'alpha-agent-v1.38.0-validation.zip','alpha-agent-v1.38.0-public-validation-packs.json',
    'successor-alpha-workspace.html','transformational-intelligence-workspace.html',
    'install_agent.py','release_packs.py','source-manifest.json','computer-use-study-report-pack.zip',
    'ethereum-mainnet-2026-10-18.json','successor-preservation.json','START_HERE.md']) {
    const f=alphaPublicationFixture();f.payloads.delete(name);f.refresh();await assert.rejects(f.verify(),/reviewed public Alpha profile asset is absent/);
  }
  const f=alphaPublicationFixture();f.manifest.validation_evidence.public.files=0;f.refresh();await assert.rejects(f.verify());
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

function publicationRecordTransportFixture({large=false,bytes=null}={}) {
  const raw=bytes||Buffer.from(JSON.stringify({source:{commit:source.sourceCommit,tree:source.sourceTree},padding:large?'x'.repeat(1_100_000):'inert'})+'\n');
  const sha=require('node:crypto').createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
  const encoded=raw.toString('base64'),recordCommit='e'.repeat(40),calls=[];
  const entry={type:'file',path:P.RECORD_PATH,sha,size:raw.length,encoding:large?'none':'base64',content:large?'':encoded};
  const blob={sha,size:raw.length,encoding:'base64',content:encoded.match(/.{1,76}/g).join('\n')+'\n'};
  const api=async route=>{
    calls.push(route);
    if(route==='contents/'+P.RECORD_PATH+'?ref='+recordCommit)return structuredClone(entry);
    if(route==='git/blobs/'+sha)return structuredClone(blob);
    throw Error('Unexpected inert record route: '+route);
  };
  return {raw,sha,recordCommit,recordSha256:Q.hash(raw),entry,blob,calls,api};
}
test('publisher authenticates a large immutable Contents record before any release operation',async()=>{
  const f=publicationRecordTransportFixture({large:true}),checkpoint=Error('inert authenticated prerequisite checkpoint');
  const originalSourceProof=Q.sourceProof,keys=['GITHUB_REPOSITORY','GITHUB_EVENT_NAME','GITHUB_REF','GITHUB_ACTOR','GITHUB_REPOSITORY_OWNER','GITHUB_SHA'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-record-fixture-')),output=path.join(fixtureRoot,'publish');
  Q.sourceProof=()=>source;
  Object.assign(process.env,{GITHUB_REPOSITORY:Q.REPOSITORY,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'MontrealAI',GITHUB_REPOSITORY_OWNER:'MontrealAI',GITHUB_SHA:source.sourceCommit});
  try {
    assert.equal(fs.statSync(fixtureRoot).mode&0o777,0o700,'The owned publisher fixture must stage only under a private directory');
    assert.equal(fs.existsSync(output),false);
    const api=async route=>{if(route==='releases/tags/source-v2.1.0-rc.17'){f.calls.push(route);throw checkpoint;}return f.api(route);};
    await assert.rejects(P.publish({root:fixtureRoot,output,recordCommit:f.recordCommit,recordSha256:f.recordSha256},
      {api,command:()=>{throw Error('No release command is permitted in this inert fixture');}}),error=>error===checkpoint);
    assert.deepEqual(f.calls,['contents/'+P.RECORD_PATH+'?ref='+f.recordCommit,'git/blobs/'+f.sha,'releases/tags/source-v2.1.0-rc.17']);
    assert.equal(fs.existsSync(output),false);
  } finally {
    Q.sourceProof=originalSourceProof;
    for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
    fs.rmSync(fixtureRoot,{recursive:true,force:true});
  }
  assert.equal(fs.existsSync(fixtureRoot),false);
});
test('publication record transport preserves the small Contents base64 route',async()=>{
  const f=publicationRecordTransportFixture();
  assert.deepEqual(await P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256),f.raw);
  assert.deepEqual(f.calls,['contents/'+P.RECORD_PATH+'?ref='+f.recordCommit]);
});
test('publication record transport resolves large encoding-none metadata only by immutable blob SHA',async()=>{
  const f=publicationRecordTransportFixture({large:true});
  f.entry.download_url='https://example.invalid/mutable-record';
  assert.ok(f.raw.length>1_048_576);
  assert.deepEqual(await P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256),f.raw);
  assert.deepEqual(f.calls,['contents/'+P.RECORD_PATH+'?ref='+f.recordCommit,'git/blobs/'+f.sha]);
});
test('publication record transport refuses missing or mismatched Contents identity and size',async()=>{
  const mutations=[entry=>{delete entry.sha;},entry=>{entry.sha='not-a-blob';},entry=>{entry.path+='-other';},
    entry=>{entry.type='symlink';},entry=>{delete entry.size;},entry=>{entry.size=0;},entry=>{entry.size=-1;},
    entry=>{entry.size=1.5;},entry=>{entry.size=8_000_001;},entry=>{entry.encoding='utf-8';},entry=>{delete entry.content;}];
  for(const mutate of mutations){const f=publicationRecordTransportFixture();mutate(f.entry);await assert.rejects(P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256));}
  const f=publicationRecordTransportFixture({large:true});f.entry.content='unexpected embedded data';
  await assert.rejects(P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256));
  assert.equal(f.calls.length,1);
});
test('publication record transport refuses blob substitution and mismatched blob metadata',async()=>{
  for(const mutate of [blob=>{delete blob.sha;},blob=>{blob.sha='f'.repeat(40);},blob=>{blob.size++;},
    blob=>{blob.encoding='none';},blob=>{delete blob.content;},blob=>{blob.content={data:'invalid'};}]) {
    const f=publicationRecordTransportFixture({large:true});mutate(f.blob);
    await assert.rejects(P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256));
  }
  const f=publicationRecordTransportFixture({large:true});f.blob.content=Buffer.alloc(f.raw.length,120).toString('base64');
  await assert.rejects(P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256));
});
test('publication record transport rejects truncated and noncanonical base64 before trusting decoded bytes',async()=>{
  for(const mutate of [entry=>{entry.content=entry.content.slice(0,-1);},entry=>{entry.content=entry.content.slice(0,-4);},
    entry=>{entry.content+='AAAA';},entry=>{entry.content='!'+entry.content;},entry=>{entry.size++;}]) {
    const f=publicationRecordTransportFixture();mutate(f.entry);
    await assert.rejects(P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256));
  }
  const f=publicationRecordTransportFixture({bytes:Buffer.from('a')});f.entry.content='YR==';
  assert.deepEqual(Buffer.from(f.entry.content,'base64'),f.raw);
  await assert.rejects(P.publicationRecordBytes(f.api,f.recordCommit,f.recordSha256));
});
test('publication record transport retains independent record SHA256 and exact commit selectors',async()=>{
  const f=publicationRecordTransportFixture();
  await assert.rejects(P.publicationRecordBytes(f.api,f.recordCommit,'0'.repeat(64)));
  assert.deepEqual(f.calls,['contents/'+P.RECORD_PATH+'?ref='+f.recordCommit]);
  for(const [commit,hash] of [['main',f.recordSha256],[f.recordCommit,'not-a-digest']]) {
    const g=publicationRecordTransportFixture();await assert.rejects(P.publicationRecordBytes(g.api,commit,hash));assert.equal(g.calls.length,0);
  }
});
function actionsByteResponse({status=200,headers={},chunks=[],readError,cancelError}={}) {
  const state={reads:0,cancels:0};
  const reader={async read(){state.reads++;if(readError)throw readError;
    return chunks.length?{done:false,value:chunks.shift()}:{done:true};},
    async cancel(){state.cancels++;if(cancelError)throw cancelError;}};
  return {status,headers:new Headers(headers),body:{getReader:()=>reader,cancel:reader.cancel},state};
}
test('Actions byte download preserves ANSI log and binary archive bytes without terminal rendering',async()=>{
  for(const route of ['actions/jobs/12/logs','actions/artifacts/34/zip']) {
    const raw=Buffer.from([0x1b,0x5b,0x33,0x31,0x6d,0x00,0xff,0x0a]),calls=[];
    const response=actionsByteResponse({headers:{'content-length':String(raw.length)},chunks:[raw.subarray(0,3),raw.subarray(3)]});
    const bytes=await Q.download(route,{token:'inert-token',fetcher:async(url,options)=>{calls.push({url,options});return response;}});
    assert.deepEqual(bytes,raw);assert.equal(Q.hash(bytes),Q.hash(raw));assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://api.github.com/repos/'+Q.REPOSITORY+'/'+route);
    assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'manual');
    assert.equal(calls[0].options.headers.Authorization,'Bearer inert-token');assert.equal(response.state.cancels,1);
  }
});
test('Actions byte download follows approved storage redirects without forwarding credentials',async()=>{
  for(const host of ['results-receiver.actions.githubusercontent.com','owned123.blob.core.windows.net']) {
    const calls=[],raw=Buffer.from('original log\n'),redirect=actionsByteResponse({status:302,headers:{location:'https://'+host+'/signed?sig=inert'}}),
      response=actionsByteResponse({headers:{'content-length':String(raw.length),'content-encoding':'identity'},chunks:[raw]});
    const actual=await Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async(url,options)=>{calls.push({url,options});return calls.length===1?redirect:response;}});
    assert.deepEqual(actual,raw);assert.equal(calls.length,2);assert.equal(redirect.state.cancels,1);
    assert.equal(calls[1].options.redirect,'manual');assert.equal(calls[1].options.signal,calls[0].options.signal);
    assert.deepEqual(calls[1].options.headers,{Accept:'application/octet-stream','Accept-Encoding':'identity'});
    assert.ok(!Object.values(calls[1].options.headers).includes('inert-token'));
  }
});
test('Actions byte download refuses malformed selectors and missing existing token before any request',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('must not request');};
  for(const route of ['actions/jobs/0/logs','actions/jobs/12/logs?other=1','actions/artifacts/34/zip#other',
    'actions/runs/12/logs','../actions/jobs/12/logs','https://api.github.com/actions/jobs/12/logs'])
    await assert.rejects(Q.download(route,{token:'inert-token',fetcher}));
  await assert.rejects(Q.download('actions/jobs/12/logs',{token:'',fetcher}));assert.equal(calls,0);
});
test('Actions byte download rejects unsafe redirect authorities and schemes before a second request',async()=>{
  for(const location of ['http://owned123.blob.core.windows.net/x','https://evil.invalid/x',
    'https://api.github.com/repos/'+Q.REPOSITORY+'/actions/jobs/99/logs',
    'https://owned123.blob.core.windows.net.evil.invalid/x','https://results-receiver.actions.githubusercontent.com.evil.invalid/x',
    'https://name:secret@owned123.blob.core.windows.net/x','https://@owned123.blob.core.windows.net/x',
    'https://owned123.blob.core.windows.net:444/x','https://%6fwned123.blob.core.windows.net/x',
    'https://owned123.blob.core.windows.net/x#fragment','https://owned123.blob.core.windows.net/x#',
    'https://owned123.blob.core.windows.net\\other/x','//owned123.blob.core.windows.net/x',
    'https://127.0.0.1/x','https://localhost/x','https://owned123.blob.core.windows.net./x']) {
    let calls=0;const response=actionsByteResponse({status:302,headers:{location}});
    await assert.rejects(Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async()=>{calls++;return response;}}));
    assert.equal(calls,1);assert.equal(response.state.cancels,1);
  }
});
test('Actions byte download bounds redirects and rejects missing locations and non-success HTTP',async()=>{
  for(const status of [301,302,303,307,308]) {
    let calls=0;const responses=[];
    await assert.rejects(Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async()=>{
      calls++;const response=actionsByteResponse({status,headers:{location:'https://owned123.blob.core.windows.net/loop'}});responses.push(response);return response;
    }}),/redirect is absent or excessive/);
    assert.equal(calls,5);assert.ok(responses.every(x=>x.state.cancels===1));
  }
  for(const status of [302,300,304,400,403,404,500]) {
    let calls=0;const response=actionsByteResponse({status});
    await assert.rejects(Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async()=>{calls++;return response;}}));
    assert.equal(calls,1);assert.equal(response.state.cancels,1);
  }
});
test('Actions byte download retains the64MB stream bound and exact unencoded Content-Length',async()=>{
  for(const headers of [{'content-length':'64000001'},{'content-length':'2x'},{'content-length':'-1'},
    {'content-length':''},{'content-encoding':'gzip'},{'content-encoding':'br'}]) {
    const response=actionsByteResponse({headers,chunks:[Buffer.from('data')]});
    await assert.rejects(Q.download('actions/artifacts/34/zip',{token:'inert-token',fetcher:async()=>response}));
    assert.equal(response.state.reads,0);assert.equal(response.state.cancels,1);
  }
  for(const declared of ['2','4']) {
    const response=actionsByteResponse({headers:{'content-length':declared},chunks:[Buffer.from('abc')]});
    await assert.rejects(Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async()=>response}),/truncated/);
    assert.equal(response.state.cancels,1);
  }
  const chunk=Buffer.alloc(32_000_000),response=actionsByteResponse({chunks:[chunk,chunk,Buffer.from('x')]});
  await assert.rejects(Q.download('actions/artifacts/34/zip',{token:'inert-token',fetcher:async()=>response}),/existing bound/);
  assert.equal(response.state.reads,3);assert.equal(response.state.cancels,1);
});
test('Actions byte download shares one60second deadline across redirects and sanitizes failures',async()=>{
  const original=AbortSignal.timeout,controller=new AbortController();let deadlines=0,calls=0;
  AbortSignal.timeout=millis=>{assert.equal(millis,60_000);deadlines++;return controller.signal;};
  const redirect=actionsByteResponse({status:302,headers:{location:'https://owned123.blob.core.windows.net/signed?sig=secret'}}),
    response=actionsByteResponse({readError:Error('untrusted signed URL or terminal text')});
  try {
    await assert.rejects(Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async(_url,options)=>{
      assert.equal(options.signal,controller.signal);calls++;if(calls===1)return redirect;controller.abort();return response;
    }}),error=>error.message==='Actions byte download stream failed');
    assert.equal(deadlines,1);assert.equal(calls,2);assert.equal(response.state.cancels,1);
  } finally {AbortSignal.timeout=original;}
  await assert.rejects(Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async()=>{throw Error('secret signed URL');}}),
    error=>error.message==='Actions byte download request failed');
  const badCleanup=actionsByteResponse({cancelError:Error('secret signed URL')});
  await assert.rejects(Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async()=>badCleanup}),
    error=>error.message==='Actions byte download cleanup failed');
});
test('Actions metadata API requires JSON Accept while redirected bytes retain octet-stream Accept',async()=>{
  const calls=[],raw=Buffer.from('original ANSI bytes\x1b[0m\n');
  const result=await Q.download('actions/jobs/12/logs',{token:'inert-token',fetcher:async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1) {
      if(options.headers.Accept!=='application/vnd.github+json')return actionsByteResponse({status:415});
      assert.equal(options.headers.Authorization,'Bearer inert-token');
      assert.equal(options.headers['Accept-Encoding'],'identity');
      return actionsByteResponse({status:302,headers:{location:'https://owned123.blob.core.windows.net/original'}});
    }
    assert.equal(options.headers.Accept,'application/octet-stream');assert.equal(options.headers['Accept-Encoding'],'identity');
    assert.ok(!Object.hasOwn(options.headers,'Authorization'));
    return actionsByteResponse({headers:{'content-length':String(raw.length)},chunks:[raw]});
  }});
  assert.deepEqual(result,raw);assert.equal(calls.length,2);assert.equal(calls[0].options.signal,calls[1].options.signal);
});
test('publisher reports the fixed metadata GET route and status before any release operation',async()=>{
  const f=publicationRecordTransportFixture(),originalSourceProof=Q.sourceProof,originalFetch=global.fetch;
  const keys=['GITHUB_REPOSITORY','GITHUB_EVENT_NAME','GITHUB_REF','GITHUB_ACTOR','GITHUB_REPOSITORY_OWNER','GITHUB_SHA'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const fixtureRoot=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-metadata-fixture-')),output=path.join(fixtureRoot,'publish');
  const token='inert-fixture-token',bodyText='remote-body-and-signed-url-must-not-appear';let failedBodyReads=0;
  Q.sourceProof=()=>source;
  Object.assign(process.env,{GITHUB_REPOSITORY:Q.REPOSITORY,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'MontrealAI',GITHUB_REPOSITORY_OWNER:'MontrealAI',GITHUB_SHA:source.sourceCommit});
  global.fetch=async(url,options)=>{
    const prefix='https://api.github.com/repos/'+Q.REPOSITORY+'/';assert.ok(url.startsWith(prefix));
    const route=url.slice(prefix.length);f.calls.push(route);
    assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.headers.Accept,'application/vnd.github+json');assert.equal(options.redirect,'error');
    if(route==='contents/'+P.RECORD_PATH+'?ref='+f.recordCommit)return new Response(JSON.stringify(f.entry),{status:200});
    assert.equal(route,'releases/tags/source-v2.1.0-rc.17');
    return {ok:false,status:404,get body(){failedBodyReads++;throw Error(bodyText);}};
  };
  try {
    assert.equal(fs.statSync(fixtureRoot).mode&0o777,0o700);
    await assert.rejects(P.publish({root:fixtureRoot,output,recordCommit:f.recordCommit,recordSha256:f.recordSha256},
      {api:P.apiClient(token),command:()=>{throw Error('No release command is permitted in this inert fixture');}}),error=>{
        assert.equal(error.message,'Publication server read failed: GET repos/'+Q.REPOSITORY+'/releases/tags/source-v2.1.0-rc.17 HTTP 404');
        assert.ok(!error.message.includes(token)&&!error.message.includes(bodyText)&&!error.message.includes('https://'));return true;
      });
    assert.deepEqual(f.calls,['contents/'+P.RECORD_PATH+'?ref='+f.recordCommit,'releases/tags/source-v2.1.0-rc.17']);
    assert.equal(failedBodyReads,0);assert.equal(fs.existsSync(output),false);assert.deepEqual(fs.readdirSync(fixtureRoot),[]);
  } finally {
    Q.sourceProof=originalSourceProof;global.fetch=originalFetch;
    for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
    fs.rmSync(fixtureRoot,{recursive:true,force:true});
  }
});
test('publisher metadata diagnostics preserve expected absence and successful JSON reads',async()=>{
  const originalFetch=global.fetch,calls=[],token='inert-fixture-token';
  global.fetch=async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1)return {ok:false,status:404,get body(){throw Error('Expected absence must not read a body');}};
    return new Response(JSON.stringify({id:12,state:'original-metadata'}),{status:200});
  };
  try {
    const api=P.apiClient(token);assert.equal(await api('git/ref/tags/inert-absent',{absent:true}),null);
    assert.deepEqual(await api('actions/runs/12'),{id:12,state:'original-metadata'});assert.equal(calls.length,2);
    assert.ok(calls.every(item=>item.url.startsWith('https://api.github.com/repos/'+Q.REPOSITORY+'/')));
    assert.ok(calls.every(item=>item.options.headers.Authorization==='Bearer '+token&&item.options.redirect==='error'));
  } finally {global.fetch=originalFetch;}
});
test('publisher metadata failures expose no response body or credential for other statuses',async()=>{
  const originalFetch=global.fetch,token='inert-fixture-token';let reads=0,calls=0;
  try {
    for(const [route,status] of [['check-runs/12',403],['actions/artifacts/34',500]]) {
      global.fetch=async()=>{calls++;return {ok:false,status,get body(){reads++;throw Error('untrusted remote body');}};};
      await assert.rejects(P.apiClient(token)(route),error=>error.message===
        'Publication server read failed: GET repos/'+Q.REPOSITORY+'/'+route+' HTTP '+status);
    }
    assert.equal(reads,0);assert.equal(calls,2);
  } finally {global.fetch=originalFetch;}
});
