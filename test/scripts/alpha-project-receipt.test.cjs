'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { keccak256, Interface } = require('ethers');
const { abi, profile } = require('../../integrations/alpha-agent/verify-receipt.cjs');
const { verifyProjectReceipt } = require('../../integrations/alpha-agent/project-receipt.cjs');
const registry='0x1111111111111111111111111111111111111111',worker='0x2222222222222222222222222222222222222222',stake='0x3333333333333333333333333333333333333333',token='0x4444444444444444444444444444444444444444';
const h=n=>'0x'+n.repeat(64);
const tokenAbi=new Interface(['function token() view returns (address)','function decimals() view returns (uint8)']);
async function projectTransfer(projectId='receipt-project',amountBaseUnits='7000') {
  const base='../../integrations/alpha-agent/vendor/alpha/';
  const {canonical}=await import(base+'docs/assets/successor/engine.mjs');
  const {createProject,publicDataOpportunity}=await import(base+'examples/successor-project/engine.mjs');
  const {createRecord}=await import(base+'examples/successor-workbench/mission-record.mjs');
  const {example}=await import(base+'examples/successor-workbench/engine.mjs');
  const {createBrief}=await import(base+'examples/alpha-discovery/engine.mjs');
  const {importAlphaProject,runProjectTransfer}=await import('../../integrations/alpha-agent/project-transfer.mjs');
  const sourceHash='a'.repeat(64),source=path=>({repository:'MontrealAI/AGI-Alpha-Agent-v0',commit:'b'.repeat(40),path,sha256:'c'.repeat(64)});
  const project=await createProject({projectId,cycleId:'receipt-cycle',sourceHash,discoveryBytes:canonical(await createBrief(publicDataOpportunity(),sourceHash)),record:await createRecord({missionId:'receipt-task',sourceHash,spec:example('public-data')}),choices:{family:'public-data',selection:'explicit-user-selection',duplicatePolicy:'sum-all-rows-no-deduplication',unitPolicy:'unchanged-integer-units',dataRights:'synthetic'},sources:{discovery:source('examples/alpha-discovery/engine.mjs'),mission:source('examples/successor-workbench/mission-record.mjs')}});
  return runProjectTransfer(await importAlphaProject(canonical(project),{amountBaseUnits,compiledAt:'2026-10-16T00:00:00.000Z'}));
}
async function fixture(event='ResultSubmitted') {
  const raw=await projectTransfer(),transfer=JSON.parse(raw),resultHash='0x'+transfer.history.at(-1).sha256;
  const expected={transactionHash:h('1'),event,jobId:'42',worker,minimumConfirmations:2};
  let args;
  if(event==='ResultSubmitted') {Object.assign(expected,{resultHash,resultURI:'ipfs://exact-project-result'});args=[42,worker,resultHash,expected.resultURI,'agent'];}
  else if(event==='AgentAssigned')args=[42,worker,'agent'];
  else if(event==='JobCompleted'){expected.success=true;args=[42,true];}
  else args=[42,worker];
  const encoded=abi.encodeEventLog(abi.getEvent(event),args);
  const receipt={hash:h('1'),status:1,blockNumber:10,blockHash:h('2'),logs:[{...encoded,address:registry,index:0,transactionHash:h('1'),blockHash:h('2'),blockNumber:10}]};
  const state={decimals:18,reward:'7000',specHash:'0x'+transfer.work.specSha256,resultHash,worker,token};
  const provider={getNetwork:async()=>({chainId:31337n}),getTransactionReceipt:async()=>receipt,getBlock:async()=>({hash:h('2')}),getBlockNumber:async()=>11,getCode:async()=>'0x6000',call:async tx=>{
    if(tx.to.toLowerCase()===token.toLowerCase())return tokenAbi.encodeFunctionResult('decimals',[state.decimals]);
    if(tx.to.toLowerCase()===stake.toLowerCase())return tokenAbi.encodeFunctionResult('token',[state.token]);
    const method=abi.parseTransaction(tx);
    if(method.name==='stakeManager')return abi.encodeFunctionResult('stakeManager',[stake]);
    assert.equal(method.name,'jobs');assert.equal(tx.blockTag,10);
    return abi.encodeFunctionResult('jobs',[registry,state.worker,state.reward,0,0,h('0'),state.resultHash,state.specHash,0]);
  }};
  const trustedDeployment={backend:profile.backend,chainId:31337,registry,runtimeKeccak256:keccak256('0x6000'),scope:'disposable-local-fixture',token,rpcUrl:'must-not-be-exported'};
  return {raw,provider,expected,trustedDeployment,state};
}
for(const event of ['AgentAssigned','ResultSubmitted','JobCompleted','JobFinalized'])test('read-only '+event+' verification binds project, token, work and result (RPC fixture)',async()=>{
  const f=await fixture(event),output=JSON.parse(await verifyProjectReceipt(f.raw,f));
  assert.equal(output.original.raw,f.raw);assert.equal(output.receipt.event,event);assert.equal(output.productionApproved,false);assert.equal(output.payoutReconciled,false);assert.equal(output.settlement,'not-connected');assert.equal(output.deployment.rpcUrl,undefined);assert.equal(output.receipt.finalizationEventProven,event==='JobFinalized');
});
for(const [name,mutation] of Object.entries({
  'wrong token decimals':f=>{f.state.decimals=6;},
  'different contract reward':f=>{f.state.reward='14000';},
  'unrelated job specification':f=>{f.state.specHash=h('9');},
  'unrelated result bytes':f=>{f.state.resultHash=h('9');},
  'unrelated worker':f=>{f.state.worker=registry;},
  'another economic token':f=>{f.state.token=registry;},
  'false deployment scope':f=>{f.trustedDeployment.scope='mainnet-production';},
  'mainnet profile with mock token':f=>{f.trustedDeployment.scope='reviewed-deployment';},
  'submitted digest substitution':f=>{f.expected.resultHash=h('9');},
  'reorg after event and state reads':f=>{let count=0;f.provider.getBlock=async()=>({hash:++count>2?h('9'):h('2')});},
}))test('rejects '+name,async()=>{const f=await fixture();mutation(f);await assert.rejects(verifyProjectReceipt(f.raw,f));});

test('assignment from identical CSV cannot be attached to another project or a different proposed amount',async()=>{
  const f=await fixture('AgentAssigned');
  for(const [projectId,amount] of [['other-project','7000'],['receipt-project','14000']]) {
    const other=await projectTransfer(projectId,amount);
    assert.equal(JSON.parse(other).work.nativeSpecSha256,JSON.parse(f.raw).work.nativeSpecSha256);
    assert.notEqual(JSON.parse(other).work.specSha256,JSON.parse(f.raw).work.specSha256);
    await assert.rejects(verifyProjectReceipt(other,f),/SPEC_BINDING/);
  }
});

test('reviewed deployment rejects a mock token before and after exported profile mutation attempts',async()=>{
  const f=await fixture('AgentAssigned');f.trustedDeployment.scope='reviewed-deployment';
  await assert.rejects(verifyProjectReceipt(f.raw,f),/JOBS_PROJECT_TOKEN/);
  assert.throws(()=>{profile.token.address=f.trustedDeployment.token;},TypeError);
  await assert.rejects(verifyProjectReceipt(f.raw,f),/JOBS_PROJECT_TOKEN/);
  assert.equal(profile.token.address,'0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA');
});

test('cached JSON poisoning before verifier import cannot replace trusted reviewed token or ABI pins',async()=>{
  const {spawnSync}=require('node:child_process'),f=await fixture('AgentAssigned');
  const json=require.resolve('../../integrations/alpha-agent/jobregistry-v2.json'),verifier=require.resolve('../../integrations/alpha-agent/verify-receipt.cjs'),project=require.resolve('../../integrations/alpha-agent/project-receipt.cjs');
  const program=`'use strict';const assert=require('node:assert/strict'),fs=require('node:fs');const cached=require(${JSON.stringify(json)});cached.token.address=${JSON.stringify(token)};cached.abi.length=0;cached.historicalDeployment.addresses.JobRegistry=${JSON.stringify(worker)};const {profile}=require(${JSON.stringify(verifier)});assert.equal(profile.token.address,'0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA');assert.ok(profile.abi.length>0);assert.notEqual(profile.historicalDeployment.addresses.JobRegistry,${JSON.stringify(worker)});assert.equal(Object.isFrozen(profile.token),true);const {verifyProjectReceipt}=require(${JSON.stringify(project)});verifyProjectReceipt(fs.readFileSync(0,'utf8'),{provider:{},trustedDeployment:{scope:'reviewed-deployment',token:${JSON.stringify(token)}},expected:{event:'AgentAssigned'}}).then(()=>{throw Error('poisoned token accepted');},error=>{assert.match(error.message,/JOBS_PROJECT_TOKEN/);}).catch(error=>{process.stderr.write(error.message);process.exitCode=1;});`;
  const result=spawnSync(process.execPath,['-e',program],{input:f.raw,encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr);
});

test('project receipt public API record cannot be replaced through its owned export alias',()=>{
  const api=require('../../integrations/alpha-agent/project-receipt.cjs');assert.equal(Object.isFrozen(api),true);assert.throws(()=>{api.verifyProjectReceipt=()=>{throw Error('substituted verifier');};},TypeError);assert.equal(api.verifyProjectReceipt,verifyProjectReceipt);
});
