// SPDX-License-Identifier: MIT
// Execute only captured, Git-authenticated installed Alpha code. No request selects code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {canonical, parseBounded, BINDING_KEYS, STAGES, RESOURCE_KEYS} from './discovery-lab-contract.mjs';
import {receiveDiscoveryLabWorkRequest, DISCOVERY_LAB_ADMISSION_CHECKS} from './discovery-lab-work-request.mjs';
const ROUTE = 'AGIALPHA';
const CATALOG = 'docs/successor/capabilities/sources.json';
const INSPECTOR = 'examples/successor-capability/discovery-lab-inspector.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function boundedSource(file) {
  assert.equal(fs.realpathSync(file), file, 'Source path or ancestor is a symlink');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    assert.ok(before.isFile() && before.size <= 2_000_000, 'Source must be a bounded regular file');
    const bytes = Buffer.alloc(before.size + 1); let used = 0;
    while (used < bytes.length) {const n = fs.readSync(fd, bytes, used, bytes.length-used, null); if (!n) break; used += n;}
    const after = fs.fstatSync(fd);
    assert.equal(used, before.size, 'Source grew or was truncated during capture');
    for (const key of ['dev','ino','mode','size','mtimeMs','ctimeMs']) assert.equal(after[key], before[key], 'Source changed during capture');
    return bytes.subarray(0,used);
  } finally {fs.closeSync(fd);}
}

export function capturePinnedAlpha(root) {
  const started = performance.now();
  assert.ok(path.isAbsolute(root || ''), 'Explicit absolute Alpha checkout is required');
  root = fs.realpathSync(root);
  const pin = parseBounded(boundedSource(fileURLToPath(new URL('../../config/discovery-lab-alpha-source.json',import.meta.url))).toString('utf8'));
  assert.ok(exact(pin,['schema','repository','commit','tree','sourceHash','catalogPath','catalogSha256','files','qualification']));
  assert.equal(pin.schema,'successor/discovery-lab-alpha-source/v1');
  assert.equal(pin.repository,'MontrealAI/AGI-Alpha-Agent-v0'); assert.equal(pin.catalogPath,CATALOG);
  assert.equal(pin.qualification,'PENDING_FINAL_SOURCE_NATIVE_COMPATIBILITY');
  assert.match(pin.commit,/^[a-f0-9]{40}$/);assert.match(pin.tree,/^[a-f0-9]{40}$/);
  assert.ok(hash(pin.sourceHash) && hash(pin.catalogSha256));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1',GIT_OPTIONAL_LOCKS:'0'});
  const git = (...args)=>execFileSync('git',['--no-replace-objects','--no-pager','-C',root,'--work-tree='+root,
    '-c','core.fsmonitor=false',...args],{env,stdio:['ignore','pipe','pipe'],maxBuffer:8_000_000,timeout:30_000});
  assert.equal(fs.realpathSync(git('rev-parse','--show-toplevel').toString().trim()),root);
  assert.equal(git('rev-parse','HEAD').toString().trim(),pin.commit,'Installed Alpha is not the exact reviewed source');
  assert.equal(git('rev-parse',pin.commit+'^{tree}').toString().trim(),pin.tree);
  assert.equal(git('for-each-ref','--format=%(refname)','refs/replace').toString().trim(),'','Replaced source history is prohibited');
  const graft = git('rev-parse','--git-path','info/grafts').toString().trim();
  assert.equal(fs.existsSync(path.isAbsolute(graft)?graft:path.join(root,graft)),false,'Grafted source history is prohibited');
  const captured = new Map();let sourceBytes = 0;
  const capture = (name,expected) => {
    assert.ok(/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(name) && name.split('/').every(part=>part && part!=='.' && part!=='..'));
    assert.ok(hash(expected));
    const committed = git('show',pin.commit+':'+name), current = boundedSource(path.join(root,name));
    assert.ok(committed.equals(current),'Installed source bytes differ: '+name);
    assert.equal(sha(committed),expected,'Source hash differs: '+name);
    sourceBytes += committed.length;assert.ok(sourceBytes<=8_000_000,'Captured source budget exceeded');
    captured.set(name,committed);return committed;
  };
  const catalog = parseBounded(capture(CATALOG,pin.catalogSha256).toString('utf8'));
  assert.ok(exact(catalog,['schema','sourceHash','sources']));assert.equal(catalog.schema,'successor-capability-source/v1');
  assert.equal(sha(canonical(catalog.sources)),pin.sourceHash);assert.equal(catalog.sourceHash,pin.sourceHash);
  assert.ok(exact(pin.files,[...Object.keys(catalog.sources),INSPECTOR]));
  for (const [name,digest] of Object.entries(pin.files)) {
    if(name!==INSPECTOR) assert.equal(digest,catalog.sources[name]);
    capture(name,digest);
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'discovery-native-source-'));let copied = 0;
  try {
    for (const [name,bytes] of captured) if(name.endsWith('.mjs')) {
      const target=path.join(directory,name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
      fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});copied+=bytes.length;
    }
  } catch(error) {fs.rmSync(directory,{recursive:true,force:true});throw error;}
  return {pin,directory,sources:{modelDigest:pin.files['examples/successor-capability/discovery-lab.mjs'],
    evaluatorDigest:pin.files['examples/successor-capability/discovery-lab-checker.mjs'],sourceDigest:pin.sourceHash},
    custody:{sourceFiles:captured.size,sourceBytes,copiedModuleBytes:copied,elapsedMs:Math.ceil(performance.now()-started),
      scope:'Current source capture and Git/SHA checks; encoded bytes, not VM heap. Charged once as cold start.'},
    dispose:()=>fs.rmSync(directory,{recursive:true,force:true})};
}

export async function qualifyDiscoveryLabReceiver(alphaRoot,{retainedWorkspace=null}={}) {
  const installed = capturePinnedAlpha(alphaRoot);
  try {
    const load = name=>import(pathToFileURL(path.join(installed.directory,'examples/successor-capability/'+name+'.mjs')).href);
    const [runtime,history,workspace,contract,{createInspector}] = await Promise.all([
      load('discovery-lab'),load('discovery-lab-history'),load('workspace'),load('discovery-lab-contract'),load('discovery-lab-inspector')]);
    const inspectCampaign=createInspector(installed.sources);
    let saved=retainedWorkspace ? await workspace.parseWorkspace(canonical(retainedWorkspace)) : await workspace.createWorkspace();
    const retained=retainedWorkspace ? (await workspace.inspectWorkspace(saved)).discovery.campaigns : null;
    async function campaign(charter,parent=null) {
      const attempt=await history.startPayload(saved,charter,installed.sources,parent?.resultDigest||null);
      saved=await workspace.recordDiscoveryEvent(saved,'lab-started',attempt);
      const started=performance.now(),result=runtime.runCampaign(charter,{parent:parent?.result||null});
      const verified=history.verifyForRecording(charter,result,parent?.result||null);
      saved=await workspace.recordDiscoveryEvent(saved,'lab-completed',await history.completedPayload(attempt.attempt,result,
        Math.ceil(performance.now()-started),verified.verificationResources));
      return (await workspace.inspectWorkspace(saved)).discovery.campaigns.at(-1);
    }
    const initial=retained ? retained.find(record=>record.state==='accepted') : await campaign(runtime.DEFAULT_CHARTER);
    assert.equal(initial?.state,'accepted','A retained accepted predecessor is required');
    const outcomes=[];
    function limitsFor(record) {
      const out=Object.fromEntries(RESOURCE_KEYS.map(key=>[key,0]));
      for(let item=record;item;item=item.parent) for(const key of ['acquisitions','search','checking','installations'])out[key]+=item.charter.budget[key];
      out.checking+=DISCOVERY_LAB_ADMISSION_CHECKS;
      return {...out,memoryBytes:8_000_000,storageBytes:8_000_000,workerCapacity:4,elapsedMs:120_000};
    }
    async function receive(record,stage='evolve',change=null) {
      const request=await history.workRequest(record,ROUTE,limitsFor(record));request.stage=stage;
      request.inputArtifacts=record.artifacts.slice(0,STAGES.indexOf(stage)).map(artifact=>artifact.digest);
      if(change) {change(request);request.payloadDigest=await contract.payloadDigest(request.payload);}
      const expectedBindings=Object.fromEntries(BINDING_KEYS.map(key=>[key,record.bindings[key]]));
      return receiveDiscoveryLabWorkRequest(canonical(request),{expectedBindings,
        expectedCommission:Object.fromEntries(['id','branch','route'].map(key=>[key,request.commission[key]])),inspectCampaign});
    }
    for(const stage of STAGES) {
      const receipt=await receive(initial,stage);assert.equal(receipt.state,'local-checked');
      assert.equal(receipt.lifecycle.commission,'DRAFT_NOT_SUBMITTED');assert.equal(receipt.authority,'none');
      assert.equal(receipt.commission.capBaseUnits,'0');assert.equal(receipt.checker.nativeWithinResourceEnvelope,true);
      outcomes.push({case:'accepted-'+stage,receipt});
    }
    const tampered=await receive(initial,'learn',request=>{request.payload.result.stages[0].program.errorBound+=1;});
    assert.notEqual(tampered.state,'local-checked');outcomes.push({case:'rehashed-invalid-measurement',receipt:tampered});
    const negative=retained ? retained.find(record=>record.state==='rejected') : await campaign({...structuredClone(runtime.DEFAULT_CHARTER),noise:1,accuracy:0},initial);
    assert.equal(negative.state,'rejected');await assert.rejects(history.workRequest(negative,ROUTE,limitsFor(negative)));
    const exhausted=retained ? retained.find(record=>record.state==='inconclusive') : await campaign({...structuredClone(runtime.DEFAULT_CHARTER),budget:{...runtime.DEFAULT_CHARTER.budget,search:0}},initial);
    assert.equal(exhausted.state,'inconclusive');await assert.rejects(history.workRequest(exhausted,ROUTE,limitsFor(exhausted)));
    const stronger=retained ? retained.filter(record=>record.state==='accepted').at(-1) : await campaign({...structuredClone(runtime.DEFAULT_CHARTER),controls:4,memory:16,operations:['flip-z','flip-w']},initial);
    assert.notEqual(stronger.resultDigest,initial.resultDigest,'A distinct retained accepted successor is required');
    assert.equal(stronger.state,'accepted');const successorReceipt=await receive(stronger);
    assert.equal(successorReceipt.state,'local-checked');outcomes.push({case:'stronger-successor',receipt:successorReceipt});
    const reloaded=await workspace.parseWorkspace(canonical(saved)),view=await workspace.inspectWorkspace(reloaded);
    if(!retained) assert.deepEqual(view.discovery.campaigns.map(record=>record.state),['accepted','rejected','inconclusive','accepted']);
    assert.ok(view.discovery.campaigns.some(record=>record.state==='accepted' && record.resultDigest===initial.resultDigest));
    return {schema:'successor/discovery-lab-native-evidence/v1',scope:'Pinned actual local synthetic construction/checking and receiver admission; no release qualification or external execution.',
      route:ROUTE,node:process.version,alphaCommit:installed.pin.commit,alphaTree:installed.pin.tree,sourceHash:installed.pin.sourceHash,
      sourceCustody:installed.custody,retainedWorkspace:reloaded,workspaceDigest:sha(canonical(reloaded)),
      inputWorkspace:retainedWorkspace?'shared-frozen-workspace':'constructed-for-this-route',
      historyStates:view.discovery.campaigns.map(record=>record.state),
      barriers:{rejectedNotExported:true,inconclusiveNotExported:true,acceptedPredecessorPreserved:true},
      historyInspectionCosts:history.auditSnapshot(),outcomes,externalExecution:'unprovisioned',currencyCapBaseUnits:'0',authority:'none'};
  } finally {installed.dispose();}
}

if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fs.realpathSync(new URL(import.meta.url))) {
  assert.ok(process.argv.length===3 || process.argv.length===4,'Usage: node discovery-lab-native-test.mjs /absolute/pinned/alpha-checkout [/absolute/shared-workspace.json]');
  const retainedWorkspace=process.argv[3]?parseBounded(boundedSource(path.resolve(process.argv[3])).toString('utf8')):null;
  console.log(JSON.stringify(await qualifyDiscoveryLabReceiver(process.argv[2],{retainedWorkspace}),null,2));
}
