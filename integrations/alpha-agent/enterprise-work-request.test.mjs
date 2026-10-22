// SPDX-License-Identifier: Apache-2.0
// Optional real-source checks require already installed fixed Alpha modules; no input selects a runtime path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnterpriseReceiver,enterpriseReceiverCapabilities,RECEIVER_ADMISSION_UNITS} from './enterprise-work-request.mjs';
import {canonical} from './discovery-lab-contract.mjs';
const runtime=globalThis.__ENTERPRISE_NATIVE_TEST_RUNTIME__ || null;
const route=enterpriseReceiverCapabilities().route;
const source={repository:'MontrealAI/AGI-Alpha-Agent-v0',commit:'4'.repeat(40),constructor:'1'.repeat(64),
  checker:'2'.repeat(64),closure:'3'.repeat(64)};
const binding={missionId:'capability-'+ 'a'.repeat(8)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(12),
  revision:4,eventHead:'5'.repeat(64),eventPrefixDigest:'6'.repeat(64),attempt:'enterprise-'+ 'b'.repeat(8)+'-'+ 'b'.repeat(4)
    +'-'+ 'b'.repeat(4)+'-'+ 'b'.repeat(4)+'-'+ 'b'.repeat(12),state:'FROZEN',freezeDigest:'7'.repeat(64),
  artifactDigests:['8'.repeat(64),'9'.repeat(64),'a'.repeat(64),'b'.repeat(64)],invocationId:null};
const limits={checkingUnits:5_000_000,elapsedMs:60_000,memoryBytes:32_000_000};
const literalContext=()=>({schema:'autonomous-enterprise-native-context/v1',source,binding,inspectionId:'literal-inspection',
  logicalCommissionId:'one-logical-commission',route,limits});
function literalTransport(context=literalContext()) {
  return {request:{schema:'autonomous-enterprise-native-request/v1',inspectionId:context.inspectionId,
    logicalCommissionId:context.logicalCommissionId,route:context.route,source:context.source,binding:context.binding,
    payloadDigest:'c'.repeat(64),docketDigest:'d'.repeat(64),payload:{workspace:{}},limits:context.limits,
    authority:[],externalSubmission:'NOT_SUBMITTED',settlement:'NOT_RUN'},docket:'{}'};
}
const causeCode=expected=>error=>error.cause?.code===expected && error.authority.length===0;

test('fixed route is an explicit zero-cap alternative with no installed-release or pilot claim',()=>{
  const capabilities=enterpriseReceiverCapabilities();
  assert.equal(capabilities.route.id,'jobs-agialpha');assert.equal(capabilities.route.currency,'AGIALPHA18');
  assert.equal(capabilities.route.decimals,18);assert.equal(capabilities.currencyCapBaseUnits,'0');
  assert.equal(capabilities.installedSourceCaptureQualified,false);assert.equal(capabilities.operationalPilot,'NOT_RUN');
  assert.deepEqual(capabilities.authority,[]);assert.equal(capabilities.externalSubmission,'NOT_SUBMITTED');
});
test('literal wrong token/context and stale source are rejected before invoking installed code',async()=>{
  let calls=0;const inspector=async()=>{calls++;throw Error('This literal fixture never qualifies semantics.');};
  const wrong=structuredClone(literalContext());wrong.route.tokenAddress='0x'+'0'.repeat(40);
  assert.throws(()=>createEnterpriseReceiver({installedContext:wrong,inspectNativeRequest:inspector}),/WRONG_ROUTE_OR_TOKEN/);
  for(const mutate of [x=>x.request.route.currency='USDC6',x=>x.request.source.commit='5'.repeat(40),
    x=>x.request.binding.revision++,x=>x.request.route.capBaseUnits='1']) {
    const input=structuredClone(literalTransport());mutate(input);
    const receiver=createEnterpriseReceiver({installedContext:literalContext(),inspectNativeRequest:inspector});
    await assert.rejects(receiver.receive(canonical(input)));assert.equal(receiver.exportJournal().records.length,0);
  }
  assert.equal(calls,0);
});
test('literal reservation refusal charges receiver work and starts no native inspection',async()=>{
  let calls=0;
  for(const caps of [{checkingUnits:RECEIVER_ADMISSION_UNITS,elapsedMs:60_000,memoryBytes:32_000_000},
    {checkingUnits:5_000_000,elapsedMs:0,memoryBytes:32_000_000},
    {checkingUnits:5_000_000,elapsedMs:60_000,memoryBytes:0}]) {
    const context=literalContext();context.limits=caps;
    const receiver=createEnterpriseReceiver({installedContext:context,inspectNativeRequest:async()=>{calls++;}});
    const result=await receiver.receive(canonical(literalTransport(context)));
    assert.equal(result.state,'INCONCLUSIVE');assert.equal(result.nativeReceipt,null);assert.equal(calls,0);
    assert.equal(result.resourceUsed.checkingUnits,RECEIVER_ADMISSION_UNITS);
    assert.equal(receiver.exportJournal().records[0].nativeReservationUnresolved,false);
  }
});
test('unavailable installed inspector retains its unknown reservation and restored journal forbids retry',async()=>{
  const context=literalContext();let calls=0;
  const originalFailure=Object.freeze(Error('Bounded test interruption before a native report.'));
  const inspector=async()=>{calls++;throw originalFailure;};
  const receiver=createEnterpriseReceiver({installedContext:context,inspectNativeRequest:inspector});
  const raw=canonical(literalTransport(context));
  await assert.rejects(receiver.receive(raw),error=>error.nativeResourceReservation?.checkingUnits>0
    && error.resourceAccounting==='RECEIVER_CHARGE_RETAINED_NATIVE_RESERVATION_UNRESOLVED'
    && Object.isFrozen(error) && Object.isFrozen(error.receiverResourceUsed)
    && Object.isFrozen(error.nativeResourceReservation) && Object.isFrozen(error.resourceUsed)
    && error.cause===originalFailure && error.originalTransport===raw
    && error.resourceUsed.checkingUnits===RECEIVER_ADMISSION_UNITS && error.nativeReceipt===null);
  const journal=receiver.exportJournal();assert.equal(journal.records[0].state,'INCONCLUSIVE');
  assert.equal(journal.records[0].nativeReservationUnresolved,true);
  const restored=createEnterpriseReceiver({installedContext:context,inspectNativeRequest:inspector,priorJournal:journal});
  await assert.rejects(restored.receive(raw),causeCode('ENTERPRISE_DUPLICATE_OR_UNCERTAIN_INSPECTION'));
  assert.equal(calls,1);
});

async function actualFixture(name,{uncertain=false,newLimits=limits}={}) {
  assert.ok(runtime?.native && runtime.workspace && runtime.protocol && runtime.source && runtime.frozen,
    'Supply reviewed fixed Alpha modules and one actual bounded frozen workspace; this is not installed-source qualification.');
  const value=runtime.protocol.copy(uncertain?runtime.reserved:runtime.frozen);
  const view=await runtime.workspace.inspectWorkspace(value),row=view.enterprises.attempts.at(-1);
  const context={schema:'autonomous-enterprise-native-context/v1',source:runtime.source,binding:{missionId:value.missionId,
    revision:value.revision,eventHead:view.head,eventPrefixDigest:await runtime.protocol.digest({missionId:value.missionId,
      revision:value.revision,eventDigests:value.events.map(e=>e.digest)}),attempt:row.attempt,state:row.state,
    freezeDigest:row.freeze.digest,artifactDigests:row.freeze.artifactDigests,invocationId:row.invocation?.invocationId || null},
    inspectionId:route.id+'-'+name,logicalCommissionId:'shared-enterprise-local-commission',route,limits:newLimits};
  const exported=await runtime.native.createNativeExport(value,{attempt:row.attempt,inspectionId:context.inspectionId,
    logicalCommissionId:context.logicalCommissionId,route:route.id,source:runtime.source,limits:newLimits});
  return {context,exported,raw:canonical(exported)};
}
const realOptions={skip:runtime?false:'NOT_RUN: no independently installed Alpha test runtime supplied'};
test('actual bounded frozen history and unchanged thirteen-section docket reach the real native inspector',realOptions,async()=>{
  const fixture=await actualFixture('accepted');let calls=0;
  const receiver=createEnterpriseReceiver({installedContext:fixture.context,inspectNativeRequest:async(...args)=>{
    calls++;return runtime.native.inspectNativeRequest(...args);}});
  const before=canonical(fixture.exported),result=await receiver.receive(fixture.raw);
  assert.equal(result.state,'LOCAL_CHECKED');assert.equal(result.nativeReceipt.state,'ACCEPTED_LOCAL_INSPECTION');
  assert.equal(result.originalTransport,fixture.raw);assert.equal(canonical(fixture.exported),before);
  assert.equal(result.resourceUsed.checkingUnits,RECEIVER_ADMISSION_UNITS+result.nativeReceipt.resourceUsed.checkingUnits);
  assert.ok(result.nativeResourceReservation.checkingUnits<=fixture.context.limits.checkingUnits-RECEIVER_ADMISSION_UNITS);
  assert.ok(result.resourceUsed.memoryBytes<=fixture.context.limits.memoryBytes);
  assert.equal(result.receiverResourceUsed.memoryBytes-Buffer.byteLength(canonical(result),'utf8'),
    4*Buffer.byteLength(fixture.raw,'utf8')+2*Buffer.byteLength(canonical(fixture.context),'utf8'));
  assert.equal(result.binding.missionId,runtime.frozen.missionId);
  assert.equal(result.currencyCapBaseUnits,'0');assert.equal(result.reconciliation,'RECEIVER_HISTORY_COMMIT_REQUIRED');
  assert.deepEqual(result.authority,[]);assert.equal(result.installedSourceCaptureQualified,false);
  assert.equal(Object.keys(JSON.parse(fixture.exported.docket).files).length,13);
  await assert.rejects(receiver.receive(fixture.raw),causeCode('ENTERPRISE_DUPLICATE_OR_UNCERTAIN_INSPECTION'));
  const restored=createEnterpriseReceiver({installedContext:fixture.context,inspectNativeRequest:runtime.native.inspectNativeRequest,
    priorJournal:receiver.exportJournal()});
  await assert.rejects(restored.receive(fixture.raw),causeCode('ENTERPRISE_DUPLICATE_OR_UNCERTAIN_INSPECTION'));assert.equal(calls,1);
});
test('atomic receipt custody admits one concurrent actual inspection and rejects the duplicate',realOptions,async()=>{
  const fixture=await actualFixture('concurrent');
  const receiver=createEnterpriseReceiver({installedContext:fixture.context,inspectNativeRequest:runtime.native.inspectNativeRequest});
  const reports=await Promise.allSettled([receiver.receive(fixture.raw),receiver.receive(fixture.raw)]);
  assert.equal(reports.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(reports.filter(r=>r.status==='rejected').length,1);
  assert.equal(receiver.exportJournal().records.length,1);
});
test('actual uncertain invocation stays inconclusive and never becomes completed work',realOptions,async()=>{
  const fixture=await actualFixture('uncertain',{uncertain:true});
  const receiver=createEnterpriseReceiver({installedContext:fixture.context,inspectNativeRequest:runtime.native.inspectNativeRequest});
  const result=await receiver.receive(fixture.raw);
  assert.equal(result.state,'INCONCLUSIVE');assert.equal(result.nativeReceipt.accepted,false);
  assert.equal(result.nativeReceipt.historicalState.futureSpent,'unknown-reservation-retained');
  assert.equal(result.nativeReceipt.historicalState.unresolvedReservation,true);
});
test('changed actual docket returns a charged negative before semantic replay',realOptions,async()=>{
  const fixture=await actualFixture('docket-refused');
  fixture.exported.docket+=' ';
  const receiver=createEnterpriseReceiver({installedContext:fixture.context,inspectNativeRequest:runtime.native.inspectNativeRequest});
  const result=await receiver.receive(canonical(fixture.exported));
  assert.equal(result.state,'LOCAL_REJECTED');assert.equal(result.nativeReceipt.work.knownReplayWork,0);
  assert.equal(result.nativeReceipt.work.unknownPartialReplay,false);
  assert.equal(result.resourceUsed.checkingUnits,2*RECEIVER_ADMISSION_UNITS);
});
test('inconsistent metadata from an actual native report cannot promote unresolved work',realOptions,async()=>{
  const changes=[report=>{report.work.measurement='different accounting denominator';},
    report=>{report.historicalState.futureSpent='unknown-reservation-retained';},
    report=>{report.historicalState.unresolvedReservation='false';}];
  for(let i=0;i<changes.length;i++) {
    const fixture=await actualFixture('metadata-'+i);
    const receiver=createEnterpriseReceiver({installedContext:fixture.context,inspectNativeRequest:async(...args)=>{
      const actual=await runtime.native.inspectNativeRequest(...args);changes[i](actual);return actual;}});
    await assert.rejects(receiver.receive(fixture.raw),error=>error.nativeResourceReservation!==null
      && error.resourceAccounting==='RECEIVER_CHARGE_RETAINED_NATIVE_RESERVATION_UNRESOLVED');
    assert.equal(receiver.exportJournal().records[0].nativeReservationUnresolved,true);
  }
});

test('a full actual native admission queue is known unstarted and grants no borrowed source identity',realOptions,async()=>{
  const fixture=await actualFixture('queue-full');
  assert.equal(runtime.native.MAX_NATIVE_INSPECTIONS,4);
  const running=Array.from({length:runtime.native.MAX_NATIVE_INSPECTIONS},()=>runtime.native.inspectNativeRequest(
    fixture.exported.request,fixture.context,{docket:fixture.exported.docket}));
  const receiver=createEnterpriseReceiver({installedContext:fixture.context,inspectNativeRequest:runtime.native.inspectNativeRequest});
  const result=await receiver.receive(fixture.raw);await Promise.all(running);
  assert.equal(result.state,'INCONCLUSIVE');assert.deepEqual(result.nativeReceipt.reasons,['NATIVE_INSPECTION_QUEUE_FULL_NOT_STARTED']);
  assert.equal(result.nativeReceipt.binding,null);assert.equal(result.nativeReceipt.source,null);
  assert.equal(result.nativeReceipt.work.knownReplayWork,0);assert.equal(result.nativeReceipt.work.unknownPartialReplay,false);
  assert.equal(result.resourceUsed.checkingUnits,2*RECEIVER_ADMISSION_UNITS);
  assert.equal(result.nativeReceipt.resourceUsed.memoryBytes,0);
  assert.equal(receiver.exportJournal().records[0].nativeReservationUnresolved,false);
  assert.equal(result.binding.missionId,fixture.context.binding.missionId);
  await assert.rejects(receiver.receive(fixture.raw),causeCode('ENTERPRISE_DUPLICATE_OR_UNCERTAIN_INSPECTION'));
});
