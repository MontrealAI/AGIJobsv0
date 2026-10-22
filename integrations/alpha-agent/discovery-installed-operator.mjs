// SPDX-License-Identifier: MIT
// Standalone extracted receiver; all requests remain zero-cap local review drafts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {captureInstalled,openInstalled,boundedInstalledBytes} from './discovery-installed-runtime.mjs';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
function dataOptions(input,names) {
  assert.ok(input&&typeof input==='object'&&!Array.isArray(input)&&!types.isProxy(input)
    && [Object.prototype,null].includes(Object.getPrototypeOf(input)));
  assert.deepEqual(Reflect.ownKeys(input).sort(),[...names].sort(),'Installed operator option fields differ');
  const result={};
  for(const name of names) {
    const item=Object.getOwnPropertyDescriptor(input,name);assert.ok(item&&Object.hasOwn(item,'value'),'Options require inert own fields');
    if(name==='archiveBytes')assert.ok(Number.isSafeInteger(item.value)&&item.value>0&&item.value<=20_000_000,
      'Independently selected archive bytes must be a bounded positive safe integer');
    else assert.equal(typeof item.value,'string');
    result[name]=item.value;
  }
  return Object.freeze(result);
}
export function installedStatus(input) {
  const options=dataOptions(input,['installedRoot','manifestSha256','archiveSha256','archiveBytes']);
  const installed=captureInstalled(options);
  return {schema:'agijobsv0/discovery-installed-status/v1',state:'SOURCE_AUTHENTICATED_LOCAL_REVIEW_AVAILABLE',
    jobs:installed.manifest.jobs,alpha:installed.manifest.alpha,capsule:installed.capsule,
    deploymentCompatibility:installed.deploymentCompatibility,files:installed.captured.size,bytes:installed.total,authority:'none',currency:'AGIALPHA18',currencyCapBaseUnits:'0',
    publicationApproved:false,executionApproved:false,settlementApproved:false,productionQualified:false,
    nativeQualification:'SEPARATE_FINAL_SOURCE_AND_ARCHIVE_QUALIFICATION_REQUIRED'};
}
export async function inspectInstalledRequest(input) {
  const options=dataOptions(input,['installedRoot','manifestSha256','archiveSha256','archiveBytes','workspaceRaw','requestRaw']);
  assert.ok(options.workspaceRaw.length<=2_000_000&&options.requestRaw.length<=2_000_000,'Installed input exceeds UTF-16 bound');
  const installed=await openInstalled({installedRoot:options.installedRoot,manifestSha256:options.manifestSha256,
    archiveSha256:options.archiveSha256,archiveBytes:options.archiveBytes});
  try {
    const [workspace,history,contract,receipts,evidence,docket,{createInspector}]=await Promise.all([
      'workspace','discovery-lab-history','discovery-lab-contract','discovery-lab-receipts',
      'discovery-lab-evidence-history','discovery-lab-docket','discovery-lab-inspector'].map(installed.loadAlpha));
    const original=await workspace.parseWorkspace(options.workspaceRaw);
    const view=await workspace.inspectWorkspace(original),request=await contract.parseWorkRequest(options.requestRaw);
    assert.equal(request.commission.route,'jobs-agialpha');assert.equal(request.commission.currency,'AGIALPHA18');
    assert.equal(request.commission.capBaseUnits,'0');assert.equal(request.executionMode,'synthetic-local');
    const matches=view.discovery.campaigns.filter(record=>contract.BINDING_KEYS.every(key=>record.bindings[key]===request[key]));
    assert.equal(matches.length,1,'A unique retained source-bound mission campaign is required');
    const campaign=matches[0];assert.equal(campaign.state,'accepted');assert.notEqual(campaign.lineageQualified,false);
    for(const key of ['modelDigest','evaluatorDigest','sourceDigest'])assert.equal(campaign.bindings[key],installed.sources[key],
      'Mission source differs from installed reviewed Alpha');
    const expected=await history.workRequest(campaign,'AGIALPHA',request.resourceLimits);
    expected.stage=request.stage;expected.inputArtifacts=campaign.artifacts.slice(0,contract.STAGES.indexOf(request.stage)).map(item=>item.digest);
    assert.equal(contract.canonical(request),contract.canonical(expected),'Request differs from the independently replayed mission draft');
    const expectedBindings=Object.fromEntries(contract.BINDING_KEYS.map(key=>[key,campaign.bindings[key]]));
    const expectedCommission=Object.fromEntries(['id','branch','route'].map(key=>[key,expected.commission[key]]));
    const receipt=await installed.receiver(options.requestRaw,{expectedBindings,expectedCommission,inspectCampaign:createInspector(installed.sources)});
    const rawReceipt=JSON.stringify(receipt),receiptEnvelope={raw:rawReceipt,source:installed.source};
    assert.equal(receipt.original,options.requestRaw,'Original exported request bytes must be retained');
    assert.equal(receipt.authority,'none');assert.equal(receipt.commission.capBaseUnits,'0');
    await receipts.inspectReceiverReceipt(receiptEnvelope,receipts.makeReceiverContext(campaign),{expectedReceiverSources:[installed.source]});
    const updated=await workspace.recordDiscoveryEvent(original,'lab-evidence-attached',
      await evidence.evidencePayload(campaign.campaignDigest,'receiver-receipt',receiptEnvelope));
    assert.equal(updated.events.length,original.events.length+1);
    assert.equal(contract.canonical(updated.events.slice(0,-1)),contract.canonical(original.events),'Original mission event prefix changed');
    const workspaceRaw=contract.canonical(updated),docketRaw=await docket.exportDiscoveryDocket(updated);
    assert.equal((await docket.verifyDiscoveryDocket(docketRaw)).verified,true);
    const reloaded=await workspace.parseWorkspace(workspaceRaw);
    assert.equal(await docket.exportDiscoveryDocket(reloaded),docketRaw,'Docket changed on workspace reopen');
    return {schema:'agijobsv0/discovery-installed-request-return/v1',requestRaw:options.requestRaw,rawReceipt,receiptEnvelope,
      workspaceRaw,docketRaw,eventPrefixPreserved:true,workspaceSha256:sha(workspaceRaw),docketSha256:sha(docketRaw),
      source:installed.source,capsule:installed.capsule,deploymentCompatibility:installed.deploymentCompatibility,coldSourceCapture:installed.coldSourceCapture,
      authority:'none',currencyCapBaseUnits:'0',externalExecution:'unprovisioned',settlement:'not-performed'};
  } finally {installed.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,installedRoot,manifestSha256,archiveSha256,archiveBytesRaw,...args]=process.argv.slice(2);
    assert.ok(typeof archiveBytesRaw==='string'&&/^[1-9][0-9]{0,7}$/.test(archiveBytesRaw),'Explicit canonical archive byte count required');
    const archiveBytes=Number(archiveBytesRaw);
    if(command==='status') {
      assert.equal(args.length,0,'Use status ROOT INSTALLED_MANIFEST_SHA256 ARCHIVE_SHA256 ARCHIVE_BYTES');
      console.log(JSON.stringify(installedStatus({installedRoot,manifestSha256,archiveSha256,archiveBytes}),null,2));
    } else {
      assert.equal(command,'inspect','Use status or inspect');assert.equal(args.length,3,
        'Use inspect ROOT INSTALLED_MANIFEST_SHA256 ARCHIVE_SHA256 ARCHIVE_BYTES WORKSPACE_JSON REQUEST_TEXT ABSENT_OUTPUT_JSON');
      const [workspacePath,requestPath,output]=args;
      assert.ok(path.isAbsolute(output)&&!fs.existsSync(output),'Explicit absent output path required');
      const result=await inspectInstalledRequest({installedRoot,manifestSha256,archiveSha256,archiveBytes,
        workspaceRaw:boundedInstalledBytes(path.resolve(workspacePath)).toString('utf8'),
        requestRaw:boundedInstalledBytes(path.resolve(requestPath)).toString('utf8')});
      fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
      console.log(JSON.stringify({state:'LOCAL_REVIEW_RETURNED',output,docketSha256:result.docketSha256,authority:'none'}));
    }
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
