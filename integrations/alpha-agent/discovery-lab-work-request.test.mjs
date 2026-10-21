// SPDX-License-Identifier: MIT
// Transport-policy doubles below do not establish native campaign acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { canonical, payloadDigest, validateBindings, validateResources, BINDING_KEYS, RESOURCE_KEYS, STAGES } from './discovery-lab-contract.mjs';
import { DISCOVERY_LAB_ADMISSION_SCHEMA, DISCOVERY_LAB_ADMISSION_CHECKS, discoveryLabReceiverCapabilities, inspectDiscoveryLabWorkRequest, receiveDiscoveryLabWorkRequest }
  from './discovery-lab-work-request.mjs';
const ROUTE = 'jobs-agialpha', CURRENCY = 'AGIALPHA18';
const original = JSON.parse(readFileSync(new URL('./fixtures/discovery-lab-request.json', import.meta.url), 'utf8'));
function fixture() {
  const request = structuredClone(original);
  request.commission = {...request.commission, route:ROUTE, currency:CURRENCY, branch:ROUTE+'-example'};
  const expectedBindings = Object.fromEntries(BINDING_KEYS.map(key => [key, request[key]]));
  const expectedCommission = Object.fromEntries(['id','branch','route'].map(key => [key, request.commission[key]]));
  const resourceUsed = Object.fromEntries(RESOURCE_KEYS.map(key => [key, 0]));
  return {request, options:{expectedBindings, expectedCommission,
    inspectCampaign:async () => ({accepted:false,resourceUsed,reasons:['Transport fixture is not a semantic campaign.']})}};
}
const inspect = (f) => inspectDiscoveryLabWorkRequest(canonical(f.request), f.options);
const rejects = (f, code) => assert.rejects(inspect(f), error => error.code === code);

test('capabilities distinguish synthetic inspection from unsupported submission and unprovisioned execution', () => {
  const c = discoveryLabReceiverCapabilities();
  assert.equal(c.route, ROUTE); assert.equal(c.currency, CURRENCY);
  assert.equal(c.admission, 'local-inspection-only'); assert.equal(c.submission, 'unsupported');
  assert.equal(c.externalExecution, 'unprovisioned'); assert.equal(c.authority, 'none');
});
for (const stage of STAGES) test('all six discriminators receive an actual current checker call: '+stage, async () => {
  const f = fixture(); f.request.stage = stage; let calls = 0;
  const policyDouble = f.options.inspectCampaign;
  f.options.inspectCampaign = async (payload, context) => {
    calls++; assert.deepEqual(payload, f.request.payload); assert.equal(context.request.stage, stage);
    assert.ok(context.limits.checking < f.request.resourceLimits.checking);
    assert.ok(context.limits.memoryBytes < f.request.resourceLimits.memoryBytes);
    assert.ok(context.limits.storageBytes < f.request.resourceLimits.storageBytes); return policyDouble();
  };
  const r = await inspect(f); assert.equal(calls,1); assert.equal(r.state,'local-rejected');
  assert.equal(r.original,canonical(f.request)); assert.equal(r.lifecycle.commission,'DRAFT_NOT_SUBMITTED');
  assert.equal(r.lifecycle.reservedBaseUnits,'0'); assert.equal(r.lifecycle.execution,'unprovisioned');
  assert.equal(r.capabilityAcceptance,'not-granted-by-import'); assert.equal(r.authority,'none');
});
for (const key of BINDING_KEYS) test('stale independently frozen '+key+' rejects before checker', async () => {
  const f=fixture(); f.options.expectedBindings[key] = key === 'revision' ? 1 : key === 'missionId'
    ? 'capability-10000000-0000-4000-8000-000000000000' : 'a'.repeat(64);
  let called=false; f.options.inspectCampaign=async()=>{called=true;};
  await rejects(f,'DISCOVERY_LAB_STALE_BINDINGS'); assert.equal(called,false);
});
test('import cannot choose its trusted expected bindings or checker', async () => {
  const f=fixture(); delete f.options.inspectCampaign;
  await rejects(f,'DISCOVERY_LAB_INSPECTOR_REQUIRED');
  f.request.inspectCampaign='accepted'; await assert.rejects(inspect(f));
});
for (const key of ['id','branch']) test('logical commission '+key+' binds the separately selected branch',async()=>{
  const f=fixture(); f.options.expectedCommission[key]='different'; await rejects(f,'DISCOVERY_LAB_COMMISSION_BINDING');
});
test('the other currency route is rejected without conversion', async()=>{
  const f=fixture(); f.request.commission.route=ROUTE==='manager-usdc'?'jobs-agialpha':'manager-usdc';
  f.request.commission.currency=CURRENCY==='USDC6'?'AGIALPHA18':'USDC6';
  await rejects(f,'DISCOVERY_LAB_WRONG_ROUTE');
});
test('no shared commission branch can silently select a second route', async()=>{
  const f=fixture(); f.options.expectedCommission.route=ROUTE==='manager-usdc'?'jobs-agialpha':'manager-usdc';
  await rejects(f,'DISCOVERY_LAB_EXPECTED_COMMISSION');
});
for(const [field,value] of [['capBaseUnits','1'],['status','SUBMITTED'],['currency','USD']])
test('money or submission cannot be imported: '+field,async()=>{
  const f=fixture(); f.request.commission[field]=value; await assert.rejects(inspect(f));
});
test('outer payload digest changes do not establish semantic acceptance',async()=>{
  const f=fixture(); f.request.payload.claim='accepted'; f.request.payloadDigest=await payloadDigest(f.request.payload);
  const r=await inspect(f); assert.equal(r.state,'local-rejected'); assert.equal(r.checker.report.accepted,false);
});
test('a semantic checker result still grants no imported capability or operational authority',async()=>{
  const f=fixture(); f.options.inspectCampaign=async()=>({accepted:true,
    resourceUsed:Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),reasons:[]});
  const r=await inspect(f); assert.equal(r.state,'local-checked'); assert.equal(r.authority,'none');
  assert.equal(r.capabilityAcceptance,'not-granted-by-import'); assert.equal(r.lifecycle.execution,'unprovisioned');
});
test('checker work beyond a resource limit remains charged and inconclusive',async()=>{
  const f=fixture(); f.request.resourceLimits.checking=DISCOVERY_LAB_ADMISSION_CHECKS;
  f.options.inspectCampaign=async()=>({accepted:true,
    resourceUsed:{...Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),checking:1},reasons:[]});
  const r=await inspect(f); assert.equal(r.state,'inconclusive');
  assert.equal(r.checker.withinResourceEnvelope,false); assert.equal(r.checker.report.resourceUsed.checking,1);
});
test('incomplete, unsafe or authority-bearing checker reports are rejected',async()=>{
  for(const report of [{accepted:true},{accepted:true,resourceUsed:{},reasons:[]},
    {accepted:true,resourceUsed:Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),reasons:[],authority:'sign'},
    {accepted:false,resourceUsed:Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),reasons:[]}]){
    const f=fixture(); f.options.inspectCampaign=async()=>report; await assert.rejects(inspect(f));
  }
});
test('checker mutation cannot rewrite the request being inspected',async()=>{
  const f=fixture(); f.options.inspectCampaign=async(payload)=>{
    payload.changed=true;return {accepted:true,resourceUsed:Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),reasons:[]};
  }; await assert.rejects(inspect(f), TypeError);
});
test('unsupported schemas and external modes stay explicit without invoking a checker',async()=>{
  const f=fixture(); let calls=0; f.options.inspectCampaign=async()=>{calls++;};
  f.request.schema='legacy-int-csv/v1';
  assert.equal((await receiveDiscoveryLabWorkRequest(canonical(f.request),f.options)).state,'unsupported');
  f.request.schema=original.schema; f.request.executionMode='real-external';
  assert.equal((await receiveDiscoveryLabWorkRequest(canonical(f.request),f.options)).state,'unprovisioned');
  assert.equal(calls,0);
});
test('duplicate keys, unsafe numbers, payload tampering and unknown envelope fields reject',async()=>{
  const f=fixture(), raw=canonical(f.request);
  await assert.rejects(inspectDiscoveryLabWorkRequest(raw.replace('"revision":0','"revision":0,"revision":0'),f.options));
  await assert.rejects(inspectDiscoveryLabWorkRequest(raw.replace('"revision":0','"revision":9007199254740992'),f.options));
  f.request.payload.changed=true; await assert.rejects(inspect(f));
  delete f.request.payload.changed; f.request.authority='sign'; await assert.rejects(inspect(f));
});
test('direct-object data never invokes getters or hides symbol, non-enumerable or array-extra data',()=>{
  let called=false;
  const getter=Object.defineProperty({},'x',{enumerable:true,get(){called=true;return 1;}});
  assert.throws(()=>canonical(getter)); assert.equal(called,false);
  assert.throws(()=>canonical({[Symbol('hidden')]:1}));
  assert.throws(()=>canonical(Object.defineProperty({},'hidden',{value:1})));
  const extra=[1]; extra.silent=2; assert.throws(()=>canonical(extra));
  assert.throws(()=>canonical(Object.create({inherited:1})));
});

for (const reason of ['BUDGET_EXHAUSTED','stage:SEARCH_TRUNCATED','CHECK_INCOMPLETE'])
test('incomplete checking at the resource cap remains inconclusive: '+reason,async()=>{
  const f=fixture(); f.request.resourceLimits.checking=DISCOVERY_LAB_ADMISSION_CHECKS+1;
  f.options.inspectCampaign=async()=>({accepted:false,resourceUsed:{...Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),checking:1},reasons:[reason]});
  assert.equal((await inspect(f)).state,'inconclusive');
});
for (const target of ['expectedBindings','expectedCommission'])
test('trusted context cannot change while the installed checker is suspended: '+target,async()=>{
  const f=fixture(); let resumed; const suspended=new Promise(resolve=>{resumed=resolve;});
  let entered; const started=new Promise(resolve=>{entered=resolve;});
  f.options.inspectCampaign=async()=>{entered(); await suspended; return {accepted:true,resourceUsed:Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),reasons:[]};};
  const pending=inspect(f); await started;
  if(target==='expectedBindings') f.options.expectedBindings.sourceDigest='a'.repeat(64);
  else f.options.expectedCommission.branch='changed';
  resumed(); await assert.rejects(pending,error=>error.code==='DISCOVERY_LAB_CONTEXT_CHANGED');
});
test('checker receives a deeply frozen request, payload and limits',async()=>{
  const f=fixture(); const prior=f.options.inspectCampaign;
  f.options.inspectCampaign=async(payload,ctx)=>{assert.ok(Object.isFrozen(payload));assert.ok(Object.isFrozen(ctx));
    assert.ok(Object.isFrozen(ctx.request.commission));assert.ok(Object.isFrozen(ctx.limits));return prior();};
  assert.equal((await inspect(f)).state,'local-rejected');
});

test('direct binding and resource validators reject getters before reading values',()=>{
  const f=fixture();let invoked=false;
  const bindings={...f.options.expectedBindings};Object.defineProperty(bindings,'sourceDigest',{enumerable:true,get(){invoked=true;return 'a'.repeat(64);}});
  assert.throws(()=>validateBindings(bindings));assert.equal(invoked,false);
  const resources={...f.request.resourceLimits};Object.defineProperty(resources,'checking',{enumerable:true,get(){invoked=true;return 1;}});
  assert.throws(()=>validateResources(resources));assert.equal(invoked,false);
});

test('input/copy/receipt bytes and declared admission units are charged before checker work',async()=>{
  const f=fixture();let limits;const prior=f.options.inspectCampaign;
  f.options.inspectCampaign=async(payload,ctx)=>{limits=ctx.limits;return prior();};
  const r=await inspect(f);assert.equal(r.resources.receiverUsed.checking,DISCOVERY_LAB_ADMISSION_CHECKS);
  assert.equal(r.resources.receiverUsed.storageBytes,Buffer.byteLength(JSON.stringify(r)));
  assert.ok(r.resources.receiverUsed.memoryBytes>Buffer.byteLength(r.original));
  assert.ok(r.resources.receiverUsed.elapsedMs>=0);
  assert.equal(limits.checking,f.request.resourceLimits.checking-DISCOVERY_LAB_ADMISSION_CHECKS);
  assert.equal(r.resources.totalUsed.storageBytes,r.resources.receiverUsed.storageBytes);
});
test('insufficient receiver reservation stops before native work and remains inconclusive',async()=>{
  const f=fixture();f.request.resourceLimits.storageBytes=0;let calls=0;
  f.options.inspectCampaign=async()=>{calls++;};const r=await inspect(f);
  assert.equal(r.state,'inconclusive');assert.equal(r.reason,'RECEIVER_RESERVATION_UNAVAILABLE');
  assert.equal(r.resources.reservationAvailable,false);assert.equal(r.checker.report,null);assert.equal(calls,0);
  assert.ok(r.resources.totalUsed.storageBytes>0);
});
test('failed trusted-context admission retains current receiver charges',async()=>{
  const f=fixture();f.options.expectedBindings.sourceDigest='a'.repeat(64);
  await assert.rejects(inspect(f),error=>error.code==='DISCOVERY_LAB_STALE_BINDINGS'
    && error.resourceUsed.checking===DISCOVERY_LAB_ADMISSION_CHECKS && error.resourceUsed.memoryBytes>0
    && error.resourceAccounting==='current-failed-attempt-charge' && error.authority==='none');
});
test('an inspector exception retains its unresolved native resource reservation',async()=>{
  const f=fixture();f.options.inspectCampaign=async()=>{throw Error('synthetic interruption');};
  await assert.rejects(inspect(f),error=>error.nativeResourceReservation.checking>0
    && error.resourceAccounting==='receiver-charge-retained; native-budget-reservation-unresolved'
    && error.resourceUsed.checking===DISCOVERY_LAB_ADMISSION_CHECKS);
});

for (const key of ['memoryBytes','storageBytes'])
test('unused receiver reserve cannot enlarge the inspector allowance: '+key,async()=>{
  const f=fixture();f.options.inspectCampaign=async(payload,ctx)=>({accepted:true,
    resourceUsed:{...Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),[key]:ctx.limits[key]+1},reasons:[]});
  const r=await inspect(f);assert.equal(r.state,'inconclusive');
  assert.equal(r.checker.nativeWithinResourceEnvelope,false);assert.equal(r.reason,'NATIVE_RESOURCE_ENVELOPE_EXCEEDED');
  assert.ok(r.resources.totalUsed[key]<=f.request.resourceLimits[key]);
});
test('resource sums cannot overflow the strict safe-integer vector or discard component costs',async()=>{
  const f=fixture();f.request.resourceLimits=Object.fromEntries(RESOURCE_KEYS.map(k=>[k,Number.MAX_SAFE_INTEGER]));
  f.options.inspectCampaign=async()=>({accepted:true,resourceUsed:{...Object.fromEntries(RESOURCE_KEYS.map(k=>[k,0])),checking:Number.MAX_SAFE_INTEGER},reasons:[]});
  await assert.rejects(inspect(f),error=>error.code==='DISCOVERY_LAB_RESOURCE_OVERFLOW'
    &&error.resourceUsed.checking===DISCOVERY_LAB_ADMISSION_CHECKS
    &&error.checkerResourceUsed.checking===Number.MAX_SAFE_INTEGER
    &&error.resourceTotalsExact.checking===(BigInt(Number.MAX_SAFE_INTEGER)+BigInt(DISCOVERY_LAB_ADMISSION_CHECKS)).toString());
});

test('unsupported and unprovisioned probes retain their admission costs',async()=>{
  const f=fixture();f.request.schema='unsupported/v1';
  const r=await receiveDiscoveryLabWorkRequest(canonical(f.request),f.options);
  assert.equal(r.resourceUsed.checking,DISCOVERY_LAB_ADMISSION_CHECKS);
  assert.equal(r.resourceUsed.storageBytes,Buffer.byteLength(JSON.stringify(r)));
  assert.ok(r.resourceUsed.memoryBytes>Buffer.byteLength(canonical(f.request)));
});
test('malformed receiver probes retain current failed-attempt charges',async()=>{
  await assert.rejects(receiveDiscoveryLabWorkRequest('{"bad":'),error=>error.resourceUsed.checking===DISCOVERY_LAB_ADMISSION_CHECKS
    &&error.resourceUsed.memoryBytes>0&&error.authority==='none');
});

test('native helper exports can be imported from a stdin module without executing its CLI',()=>{
  const script=`const helper=await import(${JSON.stringify(new URL('./discovery-lab-native-test.mjs',import.meta.url).href)});
    if(typeof helper.boundedSource!=='function')throw Error('missing helper');`;
  assert.equal(execFileSync(process.execPath,['--input-type=module','-'],{input:script,encoding:'utf8'}),'');
});

for(const mode of ['supported','unsupported'])
test('final receipt serialization is included in measured elapsed cost: '+mode,async()=>{
  const f=fixture();f.request.resourceLimits.elapsedMs=100;
  f.request.payload.padding='x'.repeat(20_000);f.request.payloadDigest=await payloadDigest(f.request.payload);
  f.options.inspectCampaign=async()=>({accepted:true,resourceUsed:Object.fromEntries(RESOURCE_KEYS.map(key=>[key,0])),reasons:[]});
  if(mode==='unsupported')f.request.schema='unsupported/v1';
  let clock=0;const stringify=JSON.stringify,descriptor=Object.getOwnPropertyDescriptor(performance,'now');
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
  JSON.stringify=function(value,...rest){const encoded=stringify.call(this,value,...rest);
    if(value?.schema===DISCOVERY_LAB_ADMISSION_SCHEMA&&value.state==='local-checked'
      ||mode==='unsupported'&&value?.state==='unsupported')clock+=101;
    return encoded;
  };
  let result,finished;
  try{result=await receiveDiscoveryLabWorkRequest(canonical(f.request),f.options);finished=clock;}
  finally{JSON.stringify=stringify;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
  assert.ok(finished>100,'instrumented final receipt serialization crossed the cap');
  const charged=mode==='supported'?result.resources.receiverUsed:result.resourceUsed;
  assert.ok(charged.elapsedMs>=finished,'final serialization must remain charged');
  assert.equal(charged.storageBytes,Buffer.byteLength(JSON.stringify(result)));
  if(mode==='supported'){assert.equal(result.state,'inconclusive');assert.equal(result.checker.withinResourceEnvelope,false);}
});

test('shared-workspace evidence requires a source-bound monotone successor and preserved purpose',async()=>{
  const {assertStrongerSuccessor}=await import('./discovery-lab-native-test.mjs');
  const bindings=fixture().options.expectedBindings;
  const initial={state:'accepted',campaignDigest:'3'.repeat(64),resultDigest:'1'.repeat(64),bindings,
    charter:{purpose:'finite-test-purpose',controls:3,memory:8,operations:['flip-z']}};
  const successor={state:'accepted',campaignDigest:'4'.repeat(64),resultDigest:'2'.repeat(64),parent:initial,bindings:{...bindings,revision:bindings.revision+1},
    charter:{...initial.charter,controls:4,memory:16,operations:['flip-z','flip-w']},
    result:{reuse:{priorPurposePreservedOnOldSlice:true,acceptedPredecessorPreserved:true,retainedFactors:['capacity']}}};
  assert.doesNotThrow(()=>assertStrongerSuccessor(initial,successor));
  assert.throws(()=>assertStrongerSuccessor(initial,{...successor,parent:null}));
  assert.throws(()=>assertStrongerSuccessor(initial,{...successor,parent:{...initial,campaignDigest:'5'.repeat(64)}}));
  assert.throws(()=>assertStrongerSuccessor({...initial,campaignDigest:null},successor));
  assert.throws(()=>assertStrongerSuccessor(initial,{...successor,parent:{...initial,bindings:{...bindings,sourceDigest:'a'.repeat(64)}}}));
  assert.throws(()=>assertStrongerSuccessor(initial,{...successor,charter:initial.charter}));
  assert.throws(()=>assertStrongerSuccessor(initial,{...successor,charter:{...successor.charter,memory:1}}));
  assert.throws(()=>assertStrongerSuccessor(initial,{...successor,charter:{...successor.charter,operations:['flip-w']}}));
  assert.throws(()=>assertStrongerSuccessor(initial,{...successor,result:{reuse:{...successor.result.reuse,priorPurposePreservedOnOldSlice:false}}}));
});
