// SPDX-License-Identifier: MIT
// Native acceptance consumes the saved, extracted capsule; no source checkout is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canonical, BINDING_KEYS, STAGES, RESOURCE_KEYS} from './discovery-lab-contract.mjs';
import {DISCOVERY_LAB_ADMISSION_CHECKS} from './discovery-lab-work-request.mjs';
const ROUTE = 'AGIALPHA';
const ROUTE_ID = 'jobs-agialpha';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function boundedSource(file, maxBytes = 2_000_000) {
  assert.equal(fs.realpathSync(file), file, 'Source path or ancestor is a symlink');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    assert.ok(before.isFile() && before.size <= maxBytes, 'Input must be a bounded regular file');
    const bytes = Buffer.alloc(before.size + 1); let used = 0;
    while (used < bytes.length) {const n = fs.readSync(fd, bytes, used, bytes.length-used, null); if (!n) break; used += n;}
    const after = fs.fstatSync(fd);
    assert.equal(used, before.size, 'Input grew or was truncated during capture');
    for (const key of ['dev','ino','mode','size','mtimeMs','ctimeMs']) assert.equal(after[key], before[key], 'Input changed during capture');
    return Buffer.from(bytes.subarray(0,used));
  } finally {fs.closeSync(fd);}
}

export function parseNativeArguments(args) {
  const supported = new Set(['--installed-root','--manifest-sha256','--archive-sha256','--archive-bytes','--output','--workspace','--request']);
  assert.ok(Array.isArray(args) && args.length % 2 === 0, 'Use explicit named argument/value pairs');
  const result = {};
  for (let index=0; index<args.length; index+=2) {
    const key=args[index], value=args[index+1];
    assert.ok(supported.has(key) && !Object.hasOwn(result,key), 'Unsupported or duplicate native argument');
    assert.ok(typeof value==='string' && value && !value.startsWith('--'), 'Missing native argument value');
    result[key]=value;
  }
  for (const key of supported) assert.ok(Object.hasOwn(result,key), 'Missing '+key);
  assert.ok(hash(result['--manifest-sha256']), 'An independently selected installed manifest SHA-256 is required');
  assert.ok(hash(result['--archive-sha256']), 'An independently selected archive SHA-256 is required');
  assert.ok(/^[1-9][0-9]{0,7}$/.test(result['--archive-bytes'])&&Number(result['--archive-bytes'])<=20_000_000,
    'An independently selected canonical bounded archive byte count is required');
  for (const key of ['--installed-root','--output','--workspace','--request']) {
    if(Object.hasOwn(result,key)) assert.ok(path.isAbsolute(result[key]), 'Explicit absolute paths are required');
  }
  assert.ok(!Object.hasOwn(result,'--request') || Object.hasOwn(result,'--workspace'), 'An exported request needs its retained workspace');
  return result;
}

export function assertStrongerSuccessor(initial,stronger) {
  assert.equal(stronger?.state,'accepted');
  assert.ok(hash(initial.campaignDigest) && hash(stronger.campaignDigest),'Unique current campaign identities are required');
  assert.notEqual(stronger.campaignDigest,initial.campaignDigest,'A distinct stronger campaign identity is required');
  assert.notEqual(stronger.resultDigest,initial.resultDigest,'A distinct retained accepted successor is required');
  let ancestor=stronger.parent, matched=false;
  for(let depth=0;ancestor&&depth<8;depth++,ancestor=ancestor.parent) {
    if(ancestor.campaignDigest===initial.campaignDigest && ancestor.resultDigest===initial.resultDigest && canonical(ancestor.bindings)===canonical(initial.bindings)) {matched=true;break;}
  }
  assert.ok(matched,'The stronger campaign must descend from the exact source-bound predecessor');
  assert.equal(stronger.bindings.missionId,initial.bindings.missionId);
  assert.ok(stronger.bindings.revision>initial.bindings.revision);
  assert.equal(stronger.charter.purpose,initial.charter.purpose);
  assert.ok(stronger.charter.controls>=initial.charter.controls && stronger.charter.memory>=initial.charter.memory);
  assert.ok(initial.charter.operations.every(operation=>stronger.charter.operations.includes(operation)));
  assert.ok(stronger.charter.controls>initial.charter.controls || stronger.charter.memory>initial.charter.memory
    ||stronger.charter.operations.some(operation=>!initial.charter.operations.includes(operation)),'A real monotone extension is required');
  assert.equal(stronger.result.reuse.priorPurposePreservedOnOldSlice,true);
  assert.equal(stronger.result.reuse.acceptedPredecessorPreserved,true);
  assert.ok(stronger.result.reuse.retainedFactors.length>0,'Actual retained factor evidence is required');
}

// Each path owns a separate Alpha module namespace and audit state. Nothing from
// the constructed regression is imported into the original exported mission.
async function runInstalledMission({installedRoot,manifestSha256,archiveSha256,archiveBytes,retainedWorkspaceRaw,retainedRequestRaw,phase}) {
  const primary=phase==='primary';
  const prefix=primary?'':'regression/';
  const {openInstalled} = await import('./discovery-installed-runtime.mjs');
  const {inspectInstalledRequest} = await import('./discovery-installed-operator.mjs');
  const installed = await openInstalled({installedRoot,manifestSha256,archiveSha256,archiveBytes});
  let phaseFiles={},progressFiles={};
  try {
    const modules = await Promise.all(['discovery-lab','discovery-lab-history','workspace','discovery-lab-contract',
      'discovery-lab-inspector','discovery-lab-receipts','discovery-lab-docket','discovery-lab-evidence-history'].map(installed.loadAlpha));
    const [runtime,history,workspace,contract,{createInspector},receipts,docket,evidence] = modules;
    const inspectCampaign=createInspector(installed.sources);
    let saved=primary ? await workspace.parseWorkspace(retainedWorkspaceRaw) : await workspace.createWorkspace();
    const inputWorkspaceRaw=primary ? retainedWorkspaceRaw : contract.canonical(saved);
    const files={[prefix+'workspace.input.json']:inputWorkspaceRaw};phaseFiles=files;
    const campaignIdentities=view=>view.discovery.campaigns.map(record=>({campaignDigest:record.campaignDigest,
      resultDigest:record.resultDigest,state:record.state,bindings:record.bindings}));
    const primaryBefore=primary ? campaignIdentities(await workspace.inspectWorkspace(saved)) : null;
    const imports=[], refusedAttempts=[];
    const zero=()=>Object.fromEntries(RESOURCE_KEYS.map(key=>[key,0]));
    const limitsFor = record => {
      const out=zero();
      for(let item=record;item;item=item.parent) for(const key of ['acquisitions','search','checking','installations']) out[key]+=item.charter.budget[key];
      out.checking+=DISCOVERY_LAB_ADMISSION_CHECKS+contract.DISCOVERY_LAB_INSPECTION_CHECKS;
      return {...out,memoryBytes:8_000_000,storageBytes:8_000_000,workerCapacity:4,elapsedMs:120_000};
    };
    async function campaign(charter,parent=null) {
      const attempt=await history.startPayload(saved,charter,installed.sources,parent?.campaignDigest||null);
      saved=await workspace.recordDiscoveryEvent(saved,'lab-started',attempt);
      const started=performance.now(), result=runtime.runCampaign(charter,{parent:parent?.result||null});
      const checked=history.verifyForRecording(charter,result,parent?.result||null);
      saved=await workspace.recordDiscoveryEvent(saved,'lab-completed',await history.completedPayload(attempt.attempt,result,
        Math.ceil(performance.now()-started),checked.verificationResources));
      return (await workspace.inspectWorkspace(saved)).discovery.campaigns.at(-1);
    }
    let initial=null;
    if(primary) {
      assert.ok(saved.events.length+1<=workspace.LIMITS.events,'Original mission has no capacity for one returned receipt');
    } else {
      initial=await campaign(runtime.DEFAULT_CHARTER);
      assert.equal(initial.state,'accepted','Constructed regression needs its own accepted predecessor');
      for(const [key,value] of Object.entries(installed.sources)) assert.equal(initial.bindings[key],value);
      assert.ok(saved.events.length+14<=workspace.LIMITS.events,'Constructed regression history lacks bounded capacity');
    }
    async function requestFor(record,stage='evolve',changeLimits=null) {
      const limits=limitsFor(record);if(changeLimits)changeLimits(limits);
      const request=await history.workRequest(record,ROUTE,limits);request.stage=stage;
      request.inputArtifacts=record.artifacts.slice(0,STAGES.indexOf(stage)).map(artifact=>artifact.digest);
      return request;
    }
    async function importRequest(record,name,requestRaw,expectedState) {
      const previous=primary&&imports.length===0?inputWorkspaceRaw:contract.canonical(saved), previousEvents=contract.canonical(saved.events);
      const beforeHead=saved.events.at(-1).digest, beforeCount=saved.events.length;
      const beforeDocket=await docket.createDiscoveryDocket(saved);
      const beforeCosts=contract.parseBounded(beforeDocket.files['08_cost_ledgers/costs.json']);
      const result=await inspectInstalledRequest({installedRoot,manifestSha256,archiveSha256,archiveBytes,workspaceRaw:previous,requestRaw});
      const base=prefix+'imports/'+String(imports.length+1).padStart(2,'0')+'-'+name;
      progressFiles[base+'.request.txt']=requestRaw;
      if(typeof result.rawReceipt==='string')progressFiles[base+'.receipt.json']=result.rawReceipt;
      if(result.receiptEnvelope)progressFiles[base+'.envelope.json']=contract.canonical(result.receiptEnvelope);
      if(typeof result.workspaceRaw==='string')progressFiles[prefix+'last-return.workspace.json']=result.workspaceRaw;
      if(typeof result.docketRaw==='string')progressFiles[prefix+'last-return.docket.json']=result.docketRaw;
      assert.ok(typeof result.rawReceipt==='string' && typeof result.workspaceRaw==='string' && typeof result.docketRaw==='string');
      const receipt=contract.parseBounded(result.rawReceipt), next=await workspace.parseWorkspace(result.workspaceRaw);
      assert.equal(receipt.original,requestRaw,'Actual receiver must retain exact typed request bytes');
      assert.equal(receipt.state,expectedState);assert.equal(receipt.authority,'none');
      assert.equal(receipt.commission.capBaseUnits,'0');assert.equal(receipt.lifecycle.commission,'DRAFT_NOT_SUBMITTED');
      assert.equal(contract.canonical(next.events.slice(0,beforeCount)),previousEvents,'Original event prefix changed');
      assert.equal(next.events.length,beforeCount+1,'One actual receipt needs exactly one appended event');
      const appended=next.events.at(-1);
      assert.equal(appended.kind,'lab-evidence-attached');assert.equal(appended.previous,beforeHead);
      assert.equal(appended.payload.kind,'receiver-receipt');assert.equal(appended.payload.campaignDigest,record.campaignDigest);
      assert.equal(appended.payload.record.raw,result.rawReceipt,'Raw receiver bytes were not retained in mission history');
      assert.equal(contract.canonical(appended.payload.record),contract.canonical(result.receiptEnvelope));
      assert.equal(contract.canonical(result.receiptEnvelope.source),contract.canonical(installed.source),'Receipt source differs from installed receiver');
      const independentlyChecked=await receipts.inspectReceiverReceipt(result.receiptEnvelope,receipts.makeReceiverContext(record),
        {expectedReceiverSources:[installed.source]});
      const independentlyExported=await docket.exportDiscoveryDocket(next);
      assert.equal(result.docketRaw,independentlyExported,'Operator docket differs from independent installed Alpha export');
      assert.equal((await docket.verifyDiscoveryDocket(result.docketRaw,{expectedMissionId:saved.missionId,
        expectedWorkspaceHead:appended.digest})).verified,true);
      const afterCosts=contract.parseBounded(contract.parseBounded(result.docketRaw).files['08_cost_ledgers/costs.json']);
      const beforeVector=beforeCosts.receiverInspectionByRoute[ROUTE_ID]||zero();
      const afterVector=afterCosts.receiverInspectionByRoute[ROUTE_ID];assert.ok(afterVector);
      for(const key of RESOURCE_KEYS) assert.equal(afterVector[key],['memoryBytes','workerCapacity'].includes(key)
        ? Math.max(beforeVector[key],receipt.resources.totalUsed[key]) : beforeVector[key]+receipt.resources.totalUsed[key],
      'Docket omitted or duplicated the returned receiver cost '+key);
      files[base+'.request.txt']=requestRaw;files[base+'.receipt.json']=result.rawReceipt;
      files[base+'.envelope.json']=contract.canonical(result.receiptEnvelope);
      imports.push({case:name,requestFile:base+'.request.txt',receiptFile:base+'.receipt.json',envelopeFile:base+'.envelope.json',
        campaignDigest:record.campaignDigest,receiptId:independentlyChecked.receiptId,beforeHead,afterHead:appended.digest,
        beforeEvents:beforeCount,afterEvents:next.events.length,state:receipt.state,resources:receipt.resources.totalUsed});
      saved=next;
      return result;
    }
    if(primary) {
      const original=await contract.parseWorkRequest(retainedRequestRaw);
      const candidates=(await workspace.inspectWorkspace(saved)).discovery.campaigns.filter(record=>
        BINDING_KEYS.every(key=>record.bindings[key]===original[key]));
      assert.equal(candidates.length,1,'Original request must bind one campaign in the retained mission');
      const record=candidates[0];assert.equal(record.state,'accepted');
      assert.equal(original.commission.route,ROUTE_ID,'Original exported request must use the AGIALPHA route');
      for(const [key,value] of Object.entries(installed.sources)) assert.equal(record.bindings[key],value,
        'Original mission source differs from this installed Alpha');
      // This is the only receiver invocation and the only appended event in the
      // primary path. Construction and successor controls run in another mission.
      await importRequest(record,'original-exported-request',retainedRequestRaw,'local-checked');
      assert.equal(imports.length,1);
    } else {
      for(const stage of STAGES) {
        await importRequest(initial,'accepted-'+stage,contract.canonical(await requestFor(initial,stage)),'local-checked');
      }
      const incomplete=await requestFor(initial,'evolve',limits=>{limits.checking-=contract.DISCOVERY_LAB_INSPECTION_CHECKS;});
      const incompleteResult=await importRequest(initial,'missing-inspection-reserve',contract.canonical(incomplete),'inconclusive');
      assert.ok(contract.parseBounded(incompleteResult.rawReceipt).checker.report.reasons.includes('CONSERVATIVE_REPLAY_CHECK_INCOMPLETE'));
      // The invalid payload is checked by the actual installed receiver. It is
      // outside the accepted campaign and remains a separate raw failed attempt.
      const invalid=await requestFor(initial,'learn');invalid.payload.result.stages[0].program.errorBound+=1;
      invalid.payloadDigest=await contract.payloadDigest(invalid.payload);
      const invalidRaw=contract.canonical(invalid);
      const failed=await installed.receiver(invalidRaw,{expectedBindings:Object.fromEntries(BINDING_KEYS.map(key=>[key,initial.bindings[key]])),
        expectedCommission:Object.fromEntries(['id','branch','route'].map(key=>[key,invalid.commission[key]])),inspectCampaign});
      assert.notEqual(failed.state,'local-checked');assert.equal(failed.authority,'none');
      const refusedBase=prefix+'refused/rehashed-invalid-measurement';
      files[refusedBase+'.request.txt']=invalidRaw;files[refusedBase+'.receipt.json']=JSON.stringify(failed);
      refusedAttempts.push({case:'rehashed-invalid-measurement',state:failed.state,requestFile:refusedBase+'.request.txt',
        receiptFile:refusedBase+'.receipt.json',resources:failed.resources.totalUsed,admitted:false,
        reason:'Constructed regression payload differs from its accepted campaign; raw failed work retained outside its admitted docket.'});
      const negative=await campaign({...structuredClone(runtime.DEFAULT_CHARTER),noise:1,accuracy:0},initial);
      assert.equal(negative.state,'rejected');await assert.rejects(history.workRequest(negative,ROUTE,limitsFor(negative)));
      const exhausted=await campaign({...structuredClone(runtime.DEFAULT_CHARTER),budget:{...runtime.DEFAULT_CHARTER.budget,search:0}},initial);
      assert.equal(exhausted.state,'inconclusive');await assert.rejects(history.workRequest(exhausted,ROUTE,limitsFor(exhausted)));
      const stronger=await campaign({...structuredClone(runtime.DEFAULT_CHARTER),controls:4,memory:16,operations:['flip-z','flip-w']},initial);
      assertStrongerSuccessor(initial,stronger);
      await importRequest(stronger,'stronger-successor',contract.canonical(await requestFor(stronger)),'local-checked');
      assert.equal(imports.length,8,'Constructed regression must retain all eight admitted inspection results');
    }
    if(!primary) {
      assert.equal(imports.length,8);assert.equal(refusedAttempts.length,1);
      const attempts=[...imports.map(item=>({case:item.case,admitted:true,receiptFile:item.receiptFile,resources:item.resources})),
        ...refusedAttempts.map(item=>({case:item.case,admitted:false,receiptFile:item.receiptFile,resources:item.resources}))];
      files[prefix+'attempt-costs.json']=contract.canonical({schema:'agijobsv0/discovery-installed-attempt-costs/v1',
        scope:'constructed-regression',missionId:saved.missionId,costsComplete:false,attempts});
    }
    const first=imports[0], duplicate=contract.parseBounded(files[first.envelopeFile]);
    const beforeDuplicate=contract.canonical(saved), beforeDuplicateDocket=await docket.exportDiscoveryDocket(saved);
    await assert.rejects(workspace.recordDiscoveryEvent(saved,'lab-evidence-attached',
      await evidence.evidencePayload(first.campaignDigest,'receiver-receipt',duplicate)),/Duplicate/);
    assert.equal(contract.canonical(saved),beforeDuplicate);assert.equal(await docket.exportDiscoveryDocket(saved),beforeDuplicateDocket);
    const workspaceRaw=contract.canonical(saved), reopened=await workspace.parseWorkspace(workspaceRaw);
    const reopenedWorkspaceRaw=contract.canonical(reopened), docketRaw=await docket.exportDiscoveryDocket(saved);
    const reopenedDocketRaw=await docket.exportDiscoveryDocket(reopened);
    assert.equal(workspaceRaw,reopenedWorkspaceRaw);assert.equal(docketRaw,reopenedDocketRaw);
    const inspected=await workspace.inspectWorkspace(reopened);
    assert.equal((await docket.verifyDiscoveryDocket(docketRaw,{expectedMissionId:saved.missionId,
      expectedWorkspaceHead:inspected.head})).verified,true);
    if(primary) {
      assert.equal(contract.canonical(campaignIdentities(inspected)),contract.canonical(primaryBefore),
        'Primary return constructed, removed or changed an original campaign');
      assert.equal(saved.events.length,contract.parseBounded(inputWorkspaceRaw).events.length+1);
    } else assert.deepEqual(inspected.discovery.campaigns.map(record=>record.state),['accepted','rejected','inconclusive','accepted']);
    for(const item of imports) assert.ok(reopened.events.some(event=>event.kind==='lab-evidence-attached'
      && event.payload.kind==='receiver-receipt' && event.payload.record.raw===files[item.receiptFile]));
    files[prefix+'workspace.json']=workspaceRaw;files[prefix+'workspace.reopened.json']=reopenedWorkspaceRaw;
    files[prefix+'docket.json']=docketRaw;files[prefix+'docket.reopened.json']=reopenedDocketRaw;
    const report={schema:primary?'agijobsv0/discovery-installed-native-evidence/v1':'agijobsv0/discovery-installed-constructed-regression/v1',
      scope:primary?'primary-original-exported-mission-return':'constructed-regression',
      scopeDetails:primary?'Exactly one actual extracted Jobs receiver return into the exact exported mission. No construction or regression evidence is inserted into that original history.':'Separate newly constructed native regression mission through the same extracted operator and Alpha bytes. Its costs, receipts and docket do not aggregate with the primary mission.',
      node:process.version,jobs:{commit:installed.manifest.jobs.commit,tree:installed.manifest.jobs.tree},
      alpha:{commit:installed.manifest.alpha.commit,tree:installed.manifest.alpha.tree,sourceHash:installed.manifest.alpha.sourceHash},
      capsule:installed.capsule,route:ROUTE,authority:'none',currencyCapBaseUnits:'0',
      inputWorkspace:primary?'retained-exported-workspace':'constructed-native-through-installed-alpha',
      inputRequest:primary?'original-exported-typed-bytes':'native-exported-exact-typed-bytes',
      missionId:saved.missionId,historyStates:inspected.discovery.campaigns.map(record=>record.state),
      receiptImports:{count:imports.length,eventPrefixPreserved:true,rawReceiptsPreserved:true,costsRetained:true,deduplicated:true,records:imports},
      docket:{sha256:sha(docketRaw),reopenedSha256:sha(reopenedDocketRaw),workspaceSha256:sha(workspaceRaw),
        reopenedWorkspaceSha256:sha(reopenedWorkspaceRaw),byteIdentical:true},
      negativeControls:primary?{duplicateRejectedWithoutChangingHistory:true}:{rejectedNotExported:true,inconclusiveNotExported:true,
        acceptedPredecessorPreserved:true,strongerSuccessorPreserved:true,duplicateRejectedWithoutChangingHistory:true},
      refusedAttempts,historyInspectionCosts:history.auditSnapshot(),coldSourceCapture:installed.coldSourceCapture,
      ...(!primary?{attemptCostsFile:prefix+'attempt-costs.json'}:{}),
      costScope:'Actual receiver attempts and admitted receipt costs retained. Invalid-request refusal raw costs are separate; total system/heap/energy/provider costs remain incomplete.',
      files:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,{bytes:Buffer.byteLength(raw),sha256:sha(raw)}]))};
    return {report,files};
  } catch(cause) {
    const failure=new Error('Installed acceptance failed in '+phase,{cause});
    failure.acceptancePhase=phase;failure.evidenceFiles={...phaseFiles,...progressFiles};throw failure;
  } finally {installed.close();}
}


/** A missing primary export always fails; constructed regressions are additional. */
export async function qualifyDiscoveryLabReceiver({installedRoot,manifestSha256,archiveSha256,archiveBytes,retainedWorkspaceRaw,retainedRequestRaw}) {
  assert.ok(typeof retainedWorkspaceRaw==='string'&&retainedWorkspaceRaw.length>0,
    'The exact original exported workspace is required; native construction is not a fallback');
  assert.ok(typeof retainedRequestRaw==='string'&&retainedRequestRaw.length>0,
    'The exact original exported request is required; native construction is not a fallback');
  assert.ok(retainedWorkspaceRaw.length<=2_000_000&&retainedRequestRaw.length<=2_000_000,'Primary input exceeds its UTF-16 bound');
  const primary=await runInstalledMission({installedRoot,manifestSha256,archiveSha256,archiveBytes,retainedWorkspaceRaw,retainedRequestRaw,phase:'primary'});
  let regression;
  try {regression=await runInstalledMission({installedRoot,manifestSha256,archiveSha256,archiveBytes,retainedWorkspaceRaw:null,retainedRequestRaw:null,phase:'constructed-regression'});}
  catch(error) {error.evidenceFiles={...primary.files,...(error.evidenceFiles||{})};throw error;}
  assert.notEqual(primary.report.missionId,regression.report.missionId,'Regression must be a separately constructed mission');
  assert.deepEqual(primary.report.jobs,regression.report.jobs);assert.deepEqual(primary.report.alpha,regression.report.alpha);
  assert.deepEqual(primary.report.capsule,regression.report.capsule);
  const files={...primary.files,...regression.files};
  assert.equal(Object.keys(files).length,Object.keys(primary.files).length+Object.keys(regression.files).length,'Mission evidence paths overlap');
  const report={...primary.report,acceptanceProtocol:'primary-browser-return-plus-separated-constructed-regression/v2',
    constructedRegression:regression.report,
    missionSeparation:{distinctMissionIds:true,receiptCountsCombined:false,costLedgersCombined:false,
      primaryConstructionEventsAdded:0,primaryReceiptEventsAdded:1},
    files:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,{bytes:Buffer.byteLength(raw),sha256:sha(raw)}]))};
  return {report,files};
}

/** Save bounded raw evidence without replacing an earlier attempt or user file. */
export function writeNativeEvidence(output,files,report) {
  assert.ok(path.isAbsolute(output)&&!fs.existsSync(output),'Explicit absent evidence output is required');
  const records=Object.entries(files);assert.ok(records.length<=256,'Native evidence member count exceeds bound');
  let total=0;
  for(const [name,raw] of records) {
    assert.ok(/^[A-Za-z0-9_./-]+$/.test(name)&&!name.startsWith('/')
      &&name.split('/').length<=32&&name.split('/').every(part=>part&&part!=='.'&&part!=='..'&&part!=='.git'),
    'Native evidence path is invalid');
    assert.equal(typeof raw,'string');const bytes=Buffer.byteLength(raw);total+=bytes;
    assert.ok(bytes<=2_000_000&&total<=32_000_000,'Native evidence byte bound exceeded');
    const target=path.join(path.dirname(output),name);
    assert.ok(target!==output&&!fs.existsSync(target),'Native evidence would replace an earlier file');
  }
  const reportRaw=JSON.stringify(report,null,2)+'\n';assert.ok(Buffer.byteLength(reportRaw)<=2_000_000);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  for(const [name,raw] of records) {
    const target=path.join(path.dirname(output),name);fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,raw,{flag:'wx',mode:0o600});
  }
  fs.writeFileSync(output,reportRaw,{flag:'wx',mode:0o600});
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let output=null,inputFiles={};
  try {
    const args=parseNativeArguments(process.argv.slice(2));output=args['--output'];
    assert.equal(fs.existsSync(output),false,'Evidence output already exists');
    const retainedWorkspaceRaw=boundedSource(args['--workspace']).toString('utf8');
    const retainedRequestRaw=boundedSource(args['--request']).toString('utf8');
    inputFiles={'workspace.input.json':retainedWorkspaceRaw,'primary.request.input.txt':retainedRequestRaw};
    const {report,files}=await qualifyDiscoveryLabReceiver({installedRoot:args['--installed-root'],
      manifestSha256:args['--manifest-sha256'],archiveSha256:args['--archive-sha256'],
      archiveBytes:Number(args['--archive-bytes']),retainedWorkspaceRaw,retainedRequestRaw});
    writeNativeEvidence(output,files,report);
    console.log(JSON.stringify({state:'ACTUAL_INSTALLED_NATIVE_ACCEPTANCE_COMPLETE',output,
      reportSha256:sha(fs.readFileSync(output)),capsule:report.capsule,receiptImports:report.receiptImports.count,
      constructedRegressionImports:report.constructedRegression.receiptImports.count,
      docketSha256:report.docket.sha256,authority:'none'}));
  } catch(error) {
    if(output&&!fs.existsSync(output)) {
      try {
        const files={...inputFiles,...(error.evidenceFiles||{})};
        const failure={schema:'agijobsv0/discovery-installed-native-failure/v1',state:'FAILED_NOT_QUALIFIED',
          phase:error.acceptancePhase||'input-or-source-capture',node:process.version,
          reason:String(error.cause?.message||error.message).slice(0,2000),authority:'none',
          files:Object.fromEntries(Object.entries(files).map(([name,raw])=>[name,{bytes:Buffer.byteLength(raw),sha256:sha(raw)}]))};
        writeNativeEvidence(path.join(path.dirname(output),'native-failure.json'),files,failure);
      } catch(saveError) {console.error('Failure artifacts could not be saved: '+saveError.message);}
    }
    console.error(error.stack||error.message);process.exitCode=1;
  }
}
