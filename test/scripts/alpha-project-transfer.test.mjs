import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { canonical, digest } from '../../integrations/alpha-agent/vendor/alpha/docs/assets/successor/engine.mjs';
import * as alpha from '../../integrations/alpha-agent/vendor/alpha/examples/successor-project/engine.mjs';
import * as native from '../../integrations/alpha-agent/vendor/alpha/examples/successor-workbench/mission-record.mjs';
import { example, run } from '../../integrations/alpha-agent/vendor/alpha/examples/successor-workbench/engine.mjs';
import { createBrief } from '../../integrations/alpha-agent/vendor/alpha/examples/alpha-discovery/engine.mjs';
import { ALPHA_NATIVE_SOURCE, JOBS_COMPILER_SOURCE, RECEIVER_SOURCE } from '../../integrations/alpha-agent/project-native-source.mjs';
import { PROJECT_SOURCE, importAlphaProject, inspectProjectTransfer, runProjectTransfer } from '../../integrations/alpha-agent/project-transfer.mjs';

const sourceHash = 'a'.repeat(64), sources = { discovery: { repository:'MontrealAI/AGI-Alpha-Agent-v0',commit:'b'.repeat(40),path:'examples/alpha-discovery/engine.mjs',sha256:'c'.repeat(64) }, mission: {repository:'MontrealAI/AGI-Alpha-Agent-v0',commit:'b'.repeat(40),path:'examples/successor-workbench/mission-record.mjs',sha256:'d'.repeat(64)} };
const choices = { family:'public-data', selection:'explicit-user-selection', duplicatePolicy:'sum-all-rows-no-deduplication', unitPolicy:'unchanged-integer-units', dataRights:'synthetic' };
const options = { amountBaseUnits:'7000000000000000000', compiledAt:'2026-10-16T00:00:00.000Z' };
async function setup(csv) {
  const spec = example('public-data'); if(csv) spec.inputs.csv = csv;
  const record = await native.createRecord({ missionId:'mission-1', sourceHash, spec });
  const p = await alpha.createProject({projectId:'project-1',cycleId:'cycle-1',sourceHash,discoveryBytes:canonical(await createBrief(alpha.publicDataOpportunity(),sourceHash)),record,choices,sources});
  return canonical(p);
}
async function reseal(transfer) { delete transfer.sha256; transfer.sha256 = await alpha.exactDigest(canonical(transfer)); return canonical(transfer); }
test('native closure and compiler bytes match the reviewed source lock', () => {
  for(const file of ALPHA_NATIVE_SOURCE.files) {
    const bytes=fs.readFileSync(new URL('../../integrations/alpha-agent/vendor/alpha/'+file.path,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
  }
  for(const file of RECEIVER_SOURCE.files) {
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../'+file.path,import.meta.url))).digest('hex'),file.sha256,file.path);
  }
  for(const file of JOBS_COMPILER_SOURCE.files) {
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../'+file.path,import.meta.url))).digest('hex'),file.sha256,file.path);
  }
});
test('trusted source manifests reject array truncation and nested file mutations through every export', async () => {
  const before = canonical(PROJECT_SOURCE);
  for (const source of [ALPHA_NATIVE_SOURCE, JOBS_COMPILER_SOURCE, RECEIVER_SOURCE, PROJECT_SOURCE.alpha, PROJECT_SOURCE.compiler, PROJECT_SOURCE.receiver]) {
    assert.ok(Object.isFrozen(source));
    assert.ok(Object.isFrozen(source.files));
    assert.ok(Object.isFrozen(source.files[0]));
    assert.throws(() => { source.files.length = 0; }, TypeError);
    assert.throws(() => { source.files[0].sha256 = '0'.repeat(64); }, TypeError);
    assert.throws(() => { source.files[0].path = 'substituted.mjs'; }, TypeError);
    assert.throws(() => { source.files[0] = { path: 'substituted.mjs', sha256: '0'.repeat(64) }; }, TypeError);
  }
  assert.equal(canonical(PROJECT_SOURCE), before);
  const raw = await importAlphaProject(await setup(), options);
  assert.equal(canonical((await inspectProjectTransfer(raw)).transfer.source), before);
});
test('mutating returned source metadata cannot change trusted identity or authorize modified transfers', async () => {
  const original = await setup(), raw = await importAlphaProject(original, options);
  const before = canonical(PROJECT_SOURCE);
  const checked = await inspectProjectTransfer(raw);
  checked.transfer.source.alpha.files.length = 0;
  checked.transfer.source.compiler.files[0].sha256 = '0'.repeat(64);
  checked.transfer.source.receiver.files[0].path = 'substituted.mjs';
  checked.transfer.upstreamValidation.source.files.length = 0;
  assert.equal(canonical(PROJECT_SOURCE), before);
  await assert.rejects(inspectProjectTransfer(await reseal(checked.transfer)), /SOURCE_DRIFT/);
  const reinspected = await inspectProjectTransfer(raw);
  assert.equal(canonical(reinspected.transfer.source), before);
  assert.equal(reinspected.transfer.original.raw, original);
  assert.equal(canonical(reinspected.transfer.upstreamValidation.source), canonical(ALPHA_NATIVE_SOURCE));
  const executed = await inspectProjectTransfer(await runProjectTransfer(raw));
  assert.equal(canonical(executed.transfer.source), before);
  assert.equal(executed.transfer.history.length, 2);
  assert.equal(executed.lastRecord.result.pack.result.summary.total, 295);
});
test('real native project → Jobs draft → actual repeated computation preserves exact source and full history', async () => {
  const original = await setup('group,amount\nSame,3\nSame,3\nOther,-2\n');
  const imported = await importAlphaProject(original,options);
  const initial = await inspectProjectTransfer(imported);
  assert.equal(initial.transfer.original.raw,original);
  assert.equal(initial.transfer.history.length,1);
  assert.equal(initial.lastRecord.state,'draft');
  assert.equal(initial.transfer.route.asset,'AGIALPHA');
  const graph = JSON.parse(initial.transfer.work.compiledRaw);
  assert.equal(graph.constitution.budget.unit,'AGIALPHA');
  assert.equal(graph.budgetReservations.reservedBaseUnits,'7000000000000000000');
  assert.ok(graph.graph.nodes.every(j=>j.state==='DRAFT'&&j.signatureStatus==='UNSIGNED_COMMITMENT'));
  const executed = await runProjectTransfer(imported), again = await runProjectTransfer(executed);
  const checked = await inspectProjectTransfer(again);
  assert.equal(checked.lastRecord.result.pack.result.summary.total,4);
  assert.equal(checked.lastRecord.result.pack.result.summary.rows,3);
  assert.equal(checked.transfer.original.raw,original);
  assert.equal(canonical(checked.transfer.history.slice(0,2)),canonical(JSON.parse(executed).history));
  assert.equal(checked.transfer.history.length,3);
  assert.equal(checked.lastRecord.review,null);
  assert.equal(checked.transfer.planning.status,'unfunded-proposal');
  assert.equal(checked.transfer.qualification,'source-only');
  assert.deepEqual(checked.operationalAuthority,[]);
});
test('rejected native review and a genuinely different second dataset survive import', async () => {
  let p=JSON.parse(await setup()),r=JSON.parse(p.cycles[0].records[0].bytes);
  let started=await native.startRun(r,{expectedRevision:r.revision,runId:'first'});
  p=await alpha.appendRecord(p,started,{expectedRevision:p.revision,sourceHash,sources});
  r=await native.completeRun(started,await run(started.spec,{sourceHash}),{expectedRevision:started.revision,runId:'first'});
  p=await alpha.appendRecord(p,r,{expectedRevision:p.revision,sourceHash,sources});
  r=await native.reviewRecord(r,{expectedRevision:r.revision,decision:'rejected',note:'Keep incumbent; preserve this failure.'});
  p=await alpha.appendRecord(p,r,{expectedRevision:p.revision,sourceHash,sources});
  const spec=example('public-data');spec.inputs.csv='group,amount\nNew,5\nNew,7\n';
  p=await alpha.nextCycle(p,{cycleId:'cycle-2',record:await native.createRecord({missionId:'mission-2',sourceHash,spec}),choices,sourceHash,sources,expectedRevision:p.revision});
  const original=canonical(p),result=await inspectProjectTransfer(await runProjectTransfer(await importAlphaProject(original,options)));
  assert.equal(result.lastRecord.result.pack.result.summary.total,12);
  assert.equal(JSON.parse(result.project.cycles[0].records.at(-1).bytes).review.decision,'rejected');
  assert.equal(result.transfer.original.raw,original);
});
for(const [name,mutate] of Object.entries({
  'executor substitution': t=>{t.work.executor='alpha-native-v1';},
  'work namespace substitution': t=>{t.work.namespace='agialpha.bounded-work-spec.v1';},
  'USDC relabel': t=>{t.route.asset='USDC';},
  'MARK substitution': t=>{t.route.backend='mark-ascension';},
  'funded claim': t=>{t.planning.status='funded';},
  'authority inheritance': t=>{t.authority='approved';},
  'source substitution': t=>{t.source.alpha.commit='f'.repeat(40);},
  'project substitution': t=>{t.project.projectId='elsewhere';},
  'compiled amount rewrite': async t=>{const v=JSON.parse(t.work.compiledRaw);v.constitution.budget.limitBaseUnits='1';t.work.compiledRaw=canonical(v);t.work.compiledSha256=await alpha.exactDigest(t.work.compiledRaw);},
  'native CSV rewrite': async t=>{const v=JSON.parse(t.work.nativeSpecRaw);v.inputs.csv='group,amount\nChanged,999\n';t.work.nativeSpecRaw=canonical(v);t.work.nativeSpecSha256=await alpha.exactDigest(t.work.nativeSpecRaw);},
  'invented import result': t=>{t.history[0].kind='local-result';},
  'missing original history': t=>{t.history=[];},
})) test('rejects '+name+' despite recomputed outer checksum',async()=>{
  const t=JSON.parse(await importAlphaProject(await setup(),options));await mutate(t);
  await assert.rejects(inspectProjectTransfer(await reseal(t)));
});
test('semantic native result forgery is rejected after recomputing every envelope digest',async()=>{
  const t=JSON.parse(await runProjectTransfer(await importAlphaProject(await setup(),options)));
  const record=JSON.parse(t.history[1].raw),pack=record.result.pack;
  pack.result.summary.total=12345;
  const {integrityDigest,...body}=pack;pack.integrityDigest=await digest('workbench-pack',body);
  record.result.bindingDigest=await digest('mission-command-result',{missionId:record.missionId,sourceHash:record.sourceHash,specDigest:record.specDigest,runId:record.result.runId,startedRevision:record.result.startedRevision,packDigest:pack.integrityDigest});
  delete record.recordDigest;record.recordDigest=await digest('mission-command-record',record);
  t.history[1].raw=canonical(record);t.history[1].sha256=await alpha.exactDigest(t.history[1].raw);
  await assert.rejects(inspectProjectTransfer(await reseal(t)),/RESULT|SEMANTIC|PACK|BINDING/);
});
test('duplicate keys, unsafe price and unsupported mission family fail closed',async()=>{
  const original=await setup();
  await assert.rejects(importAlphaProject(original.replace('"schema":','"schema":"successor-project/v1","schema":'),options),/Duplicate/);
  for(const amountBaseUnits of ['0','1','6','01','1.5','-1',1,'1000000000000000000000001']) await assert.rejects(importAlphaProject(original,{...options,amountBaseUnits}));
  const t=JSON.parse(await importAlphaProject(original,options));t.work.specRaw += ' ';
  await assert.rejects(inspectProjectTransfer(await reseal(t)),/WORK_CHANGED/);
});
test('Manager wrapper requires an explicitly installed native validator and retains exact complete wrapper',async()=>{
  const original=await setup(),raw=canonical({schema:'agijobmanager/alpha-project-transfer/v1',original:{raw:original},history:[{failure:'retained'}]});
  await assert.rejects(importAlphaProject(raw,options),/MANAGER_VALIDATOR_REQUIRED/);
  let checked=0;
  const managerInspector={source:{repository:'MontrealAI/AGIJobManager',revision:'trusted-test-validator'},inspect:async bytes=>{checked++;assert.equal(bytes,raw);return {originalProject:await alpha.validateProject(original)};}};
  const result=await importAlphaProject(raw,{...options,managerInspector});
  assert.equal((await inspectProjectTransfer(result,{managerInspector})).transfer.original.raw,raw);
  assert.equal(checked,2);
  await assert.rejects(inspectProjectTransfer(result),/MANAGER_VALIDATOR_REQUIRED/);
});

test('integer allowance remainder stays fully allocated without zero budget jobs',async()=>{
  const {transfer}=await inspectProjectTransfer(await importAlphaProject(await setup(),{...options,amountBaseUnits:'8'}));
  const c=JSON.parse(transfer.work.compiledRaw),budgets=c.graph.nodes.map(j=>BigInt(j.budget.limitBaseUnits));
  assert.equal(budgets.reduce((a,b)=>a+b,0n),8n);assert.ok(budgets.every(n=>n>0n));
  assert.equal(transfer.work.namespace,'agijobsv0.successor-public-data-work.v1');assert.equal(transfer.work.executor,'fixed-js-public-data-v1');
});

test('CLI imports, computes and inspects real files while refusing overwrite and symlink input',async()=>{
  const os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-project-cli-'));
  try {
    const input=path.join(dir,'alpha.json'),draft=path.join(dir,'draft.json'),result=path.join(dir,'result.json'),link=path.join(dir,'link.json');
    fs.writeFileSync(input,await setup('group,amount\nActual,9\nActual,-1\n'));
    const cli=new URL('../../integrations/alpha-agent/project-cli.mjs',import.meta.url);
    const invoke=args=>spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8',timeout:20000});
    assert.equal(invoke(['import',input,'7000',options.compiledAt,draft]).status,0);
    assert.equal(invoke(['run',draft,result]).status,0);
    const inspected=invoke(['inspect',result]);assert.equal(inspected.status,0);assert.equal(JSON.parse(inspected.stdout).result.total,8);
    const before=fs.readFileSync(result,'utf8');assert.notEqual(invoke(['run',draft,result]).status,0);assert.equal(fs.readFileSync(result,'utf8'),before);
    fs.symlinkSync(result,link);assert.notEqual(invoke(['inspect',link]).status,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('CLI rejects BOM-prefixed raw files without stripping bytes, creating output or changing existing output',async()=>{
  const os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-project-cli-bom-'));
  try {
    const cli=new URL('../../integrations/alpha-agent/project-cli.mjs',import.meta.url);
    const invoke=args=>spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8',timeout:20000});
    const input=path.join(dir,'alpha.json'),bomInput=path.join(dir,'alpha-bom.json'),draft=path.join(dir,'draft.json'),bomDraft=path.join(dir,'draft-bom.json'),output=path.join(dir,'output.json'),existing=path.join(dir,'existing.json');
    const original=Buffer.from('\n'+await setup()+'\n','utf8'),bom=Buffer.from([0xef,0xbb,0xbf]);
    fs.writeFileSync(input,original);fs.writeFileSync(bomInput,Buffer.concat([bom,original]));
    const originalBom=fs.readFileSync(bomInput);
    const rejected=invoke(['import',bomInput,'7000',options.compiledAt,output]);
    assert.notEqual(rejected.status,0);assert.equal(rejected.stdout,'');assert.equal(fs.existsSync(output),false);assert.deepEqual(fs.readFileSync(bomInput),originalBom);
    const malformed=Buffer.concat([Buffer.from([0xff]),original]);fs.writeFileSync(bomInput,malformed);
    assert.notEqual(invoke(['import',bomInput,'7000',options.compiledAt,output]).status,0);assert.equal(fs.existsSync(output),false);assert.deepEqual(fs.readFileSync(bomInput),malformed);
    fs.writeFileSync(bomInput,originalBom);
    fs.writeFileSync(existing,'retained existing output');
    assert.notEqual(invoke(['import',bomInput,'7000',options.compiledAt,existing]).status,0);assert.equal(fs.readFileSync(existing,'utf8'),'retained existing output');
    assert.equal(invoke(['import',input,'7000',options.compiledAt,draft]).status,0);
    assert.deepEqual(Buffer.from(JSON.parse(fs.readFileSync(draft,'utf8')).original.raw,'utf8'),original);
    const draftBom=Buffer.concat([bom,fs.readFileSync(draft)]);fs.writeFileSync(bomDraft,draftBom);
    assert.notEqual(invoke(['run',bomDraft,output]).status,0);assert.equal(fs.existsSync(output),false);
    const inspected=invoke(['inspect',bomDraft]);assert.notEqual(inspected.status,0);assert.equal(inspected.stdout,'');assert.deepEqual(fs.readFileSync(bomDraft),draftBom);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
