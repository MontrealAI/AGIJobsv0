// SPDX-License-Identifier: MIT
// Transport-policy doubles below do not establish native campaign acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, payloadDigest, BINDING_KEYS, RESOURCE_KEYS, STAGES } from './discovery-lab-contract.mjs';
import { discoveryLabReceiverCapabilities, inspectDiscoveryLabWorkRequest, receiveDiscoveryLabWorkRequest }
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
    assert.deepEqual(context.limits, f.request.resourceLimits); return policyDouble();
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
  const f=fixture(); f.request.resourceLimits.checking=0;
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
  }; await rejects(f,'DISCOVERY_LAB_CHECKER_MUTATED_INPUT');
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
