'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const p = require('../source-preservation-lib.cjs');
const { checkSource, checkGenerated, compareGenerated, verifyBundleCopies } = require('../check-dependency-preservation.cjs');
const { prepare } = require('../create-unreleased-source-policy.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-unreleased-policy-test-')); t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const git = (...args) => execFileSync('git', args, { cwd:root, encoding:'utf8', stdio:['ignore','pipe','pipe'], env:{ ...process.env, GIT_CONFIG_GLOBAL:'/dev/null' } }).trim();
  const write = (name, value) => { fs.mkdirSync(path.dirname(path.join(root,name)), {recursive:true}); fs.writeFileSync(path.join(root,name), value); };
  const commit = (message) => { git('add','.'); git('commit','-qm',message); return git('rev-parse','HEAD'); };
  git('init','-q','-b','main'); git('config','user.name','Functional fixture'); git('config','user.email','fixture@example.invalid'); git('config','commit.gpgsign','false');
  write('package.json','{"private":true}\n');
  write('package-lock.json', JSON.stringify({packages:Object.fromEntries(p.DEPENDENCIES.map((name) => ['node_modules/'+name,{version:'1.0.0',resolved:'https://example.invalid/'+name,integrity:'sha512-fixture'}]))}));
  write('contracts/Keep.sol','unchanged source\n'); write('contracts/Changed.sol','before\n'); write('contracts/Removed.sol','to be explicitly absent\n');
  write('contracts/v2/Constants.sol','constants\n'); write('config/ens.json','{"normalised":false}\n'); write('config/network.json','{"network":1}\n');
  write('deployment-config/generated/protocol-defaults.json','{}\n'); write('scripts/generated/protocol-defaults.ts','defaults\n');
  write('scripts/generate-constants.ts','reviewed generator\n'); write('scripts/utils/helper.js','module.exports=1;\n');
  const base=commit('baseline'); git('update-ref','refs/remotes/origin/main',base); git('switch','-qc','candidate');
  write('contracts/Changed.sol','after\n'); write('contracts/New.sol','new reviewed file\n'); fs.unlinkSync(path.join(root,'contracts/Removed.sol'));
  const source=commit('source checkpoint');
  const record=p.makeRecord({root,baseline:base,source,repository:'Example/Jobs',pullRequest:3976});
  const policyFor=(r=record)=>{const bytes=p.canonical(r);return {bytes,sha256:p.sha256(bytes)};};
  const context=()=>({repository:'Example/Jobs',pullRequest:3976,head:git('rev-parse','HEAD'),base,merge:null});
  const check=(overrides={})=>checkSource({root,env:{DEPENDENCY_PRESERVATION_BASE_SHA:base},context:context(),policy:policyFor(),enforceBundle:false,...overrides});
  return {root,git,write,commit,base,source,record,policyFor,context,check};
}
function cloned(value){return JSON.parse(JSON.stringify(value));}
test('exact UNRELEASED transition pins complete source, dependencies, additions and deletions',(t)=>{
 const f=fixture(t); const r=f.check(); assert.equal(r.mode,'unreleased-source-transition'); assert.equal(r.generatedSourceBaseline,f.source); assert.equal(r.dependencyBaseline,f.base); assert.equal(r.exactTransitionCount,3);
 assert.deepEqual(f.record.explicitAbsence,{before:['contracts/New.sol'],after:['contracts/Removed.sol']}); assert.equal(f.record.releaseIdentity,null);
});
test('policy-only descendant preserves the checkpoint and exact source closure',(t)=>{const f=fixture(t);f.write('scripts/security/new-helper.cjs','policy helper\n');f.commit('policy only');assert.equal(f.check().mode,'unreleased-source-transition');});
test('unrelated PR cannot use an injected transition',(t)=>{const f=fixture(t);assert.throws(()=>f.check({context:{...f.context(),pullRequest:3977}}),/scope/);});
test('wrong repository cannot use the transition',(t)=>{const f=fixture(t);assert.throws(()=>f.check({context:{...f.context(),repository:'Other/Jobs'}}),/scope/);});
test('same source without a matching policy remains forbidden',(t)=>{const f=fixture(t);assert.throws(()=>f.check({policy:null}),/Protected source changed/);});
test('record exact-byte digest is mandatory',(t)=>{const f=fixture(t);const pol=f.policyFor();pol.bytes=Buffer.concat([pol.bytes,Buffer.from(' ')]);assert.throws(()=>f.check({policy:pol}),/digest/);});
test('canonical parser rejects duplicate JSON keys even with a matching new digest',(t)=>{const f=fixture(t);const bytes=Buffer.from(f.policyFor().bytes.toString().replace('{','{"state":"UNRELEASED",'));assert.throws(()=>f.check({policy:{bytes,sha256:p.sha256(bytes)}}),/canonical/);});
const recordMutations=[
 ['unknown schema',r=>{r.schemaVersion=2;}],
 ['release identity',r=>{r.releaseIdentity='source-v9';}],
 ['release state',r=>{r.state='RELEASED';}],
 ['new top-level bypass field',r=>{r.allowAnySource=true;}],
 ['wrong source tree',r=>{r.sourceTree='a'.repeat(40);}],
 ['wrong baseline tree',r=>{r.dependencyBaselineTree='a'.repeat(40);}],
 ['wrong source parents',r=>{r.sourceParents=[];}],
 ['added merge-base allowance',r=>{r.allowedEffectiveMergeBases.push(r.sourceCheckpoint);}],
 ['omitted transition',r=>{r.transitions.pop();r.transitionCount--;}],
 ['duplicate transition',r=>{r.transitions.push(r.transitions[0]);r.transitionCount++;}],
 ['wrong before blob',r=>{r.transitions.find(e=>e.before.state==='present').before.blob='a'.repeat(40);}],
 ['wrong after blob',r=>{r.transitions.find(e=>e.after.state==='present').after.blob='a'.repeat(40);}],
 ['missing explicit absence',r=>{r.explicitAbsence.before=[];}],
 ['null absence instead of explicit state',r=>{r.transitions.find(e=>e.before.state==='absent').before=null;}],
 ['omitted unchanged protected file',r=>{r.sourceInventory=r.sourceInventory.filter(e=>e.path!=='contracts/Keep.sol');}],
 ['duplicate protected file',r=>{r.sourceInventory.push(r.sourceInventory[0]);}],
 ['symlink protected mode',r=>{r.sourceInventory[0].mode='120000';}],
 ['path traversal',r=>{r.sourceInventory[0].path='../escape.sol';}],
 ['changed original dependency record',r=>{r.dependencyIdentities[0].integrity='sha512-changed';}],
 ['missing extra generated output',r=>{r.additionalGeneratedOutputs=[];}],
 ['omitted generator helper',r=>{r.generatorClosure=r.generatorClosure.filter(e=>e.path!=='scripts/utils/helper.js');}],
];
for(const [name,mutate] of recordMutations)test('rejects '+name+' even if a changed record is rehashed',(t)=>{const f=fixture(t);const r=cloned(f.record);mutate(r);assert.throws(()=>f.check({policy:f.policyFor(r)}));});
const sourceMutations=[
 ['later changed-path drift',f=>f.write('contracts/Changed.sol','unreviewed\n')],
 ['later unchanged-path drift',f=>f.write('contracts/Keep.sol','unreviewed\n')],
 ['new protected path',f=>f.write('contracts/Another.sol','new\n')],
 ['deleted protected path',f=>fs.unlinkSync(path.join(f.root,'contracts/Keep.sol'))],
 ['reversion of reviewed source',f=>f.write('contracts/Changed.sol','before\n')],
 ['generator helper drift',f=>f.write('scripts/utils/helper.js','module.exports=2;\n')],
 ['new import-resolution shadow',f=>f.write('scripts/utils/helper.ts','export default 2;\n')],
 ['executable mode change',f=>fs.chmodSync(path.join(f.root,'contracts/Keep.sol'),0o755)],
];
for(const [name,mutate] of sourceMutations)test('rejects '+name,(t)=>{const f=fixture(t);mutate(f);f.commit(name);assert.throws(()=>f.check(),/differs from reviewed checkpoint/);});
test('missing source object fails closed',(t)=>{const f=fixture(t);const r=cloned(f.record);r.sourceCheckpoint='f'.repeat(40);assert.throws(()=>f.check({policy:f.policyFor(r)}));});
test('identical source tree cannot replace required checkpoint ancestry',(t)=>{const f=fixture(t);const twin=f.git('commit-tree',f.record.sourceTree,'-p',f.base,'-m','different source checkpoint');const r=cloned(f.record);r.sourceCheckpoint=twin;assert.throws(()=>f.check({policy:f.policyFor(r)}));});
test('missing baseline ancestry path fails closed',(t)=>{const f=fixture(t);fs.writeFileSync(path.join(f.root,'.git','shallow'),f.source+'\n');assert.throws(()=>f.check());});
test('history before exact anchor may be shallow without weakening anchored ancestry',(t)=>{const f=fixture(t);fs.writeFileSync(path.join(f.root,'.git','shallow'),f.base+'\n');assert.equal(f.check().dependencyBaseline,f.base);});
test('advanced base with shallow history is rejected rather than guessing',(t)=>{const f=fixture(t);f.git('switch','-q','main');f.write('README.md','base advanced\n');const tip=f.commit('base advanced');f.git('switch','-q','candidate');fs.writeFileSync(path.join(f.root,'.git','shallow'),f.base+'\n');assert.throws(()=>f.check({env:{DEPENDENCY_PRESERVATION_BASE_SHA:tip},context:{...f.context(),base:tip}}),/Complete base-divergence history/);});
test('advanced base with complete history preserves exact effective anchor',(t)=>{const f=fixture(t);f.git('switch','-q','main');f.write('README.md','base advanced\n');const tip=f.commit('base advanced');f.git('switch','-q','candidate');assert.equal(f.check({env:{DEPENDENCY_PRESERVATION_BASE_SHA:tip},context:{...f.context(),base:tip}}).baseline,f.base);});
test('moving effective baseline inside transition fails closed',(t)=>{const f=fixture(t);assert.throws(()=>f.check({env:{DEPENDENCY_PRESERVATION_BASE_SHA:f.source},context:{...f.context(),base:f.source}}),/original effective merge base/);});
test('Git replacement refs are rejected',(t)=>{const f=fixture(t);f.git('update-ref','refs/replace/'+f.base,f.source);assert.throws(()=>f.check(),/replace refs/);});
test('Git grafts are rejected',(t)=>{const f=fixture(t);fs.mkdirSync(path.join(f.root,'.git','info'),{recursive:true});fs.writeFileSync(path.join(f.root,'.git','info','grafts'),f.source+'\n');assert.throws(()=>f.check(),/grafts/);});
test('dirty protected bytes fail source mode',(t)=>{const f=fixture(t);f.write('contracts/Keep.sol','dirty\n');assert.throws(()=>f.check(),/Working source/);});
test('staged protected bytes cannot masquerade as generated output',(t)=>{const f=fixture(t);f.write('contracts/Keep.sol','staged\n');f.git('add','.');assert.throws(()=>f.check({allowGenerated:true}),/Staged/);});
test('ignored protected additions fail source mode',(t)=>{const f=fixture(t);f.write('.gitignore','contracts/Ignored.sol\n');f.write('contracts/Ignored.sol','ignored\n');assert.throws(()=>f.check(),/Unexpected or missing/);});
test('missing sparse protected file is not interpreted as reviewed absence',(t)=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,'contracts/Keep.sol'));assert.throws(()=>f.check(),/Unexpected or missing/);});
test('symlink source cannot replace a regular reviewed file',(t)=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,'contracts/Keep.sol'));fs.symlinkSync('Changed.sol',path.join(f.root,'contracts/Keep.sol'));assert.throws(()=>f.check(),/regular/);});
for(const field of ['version','resolved','integrity'])test('immutable baseline dependency '+field+' still cannot drift',(t)=>{const f=fixture(t);const lock=JSON.parse(fs.readFileSync(path.join(f.root,'package-lock.json')));lock.packages['node_modules/hardhat'][field]='changed';f.write('package-lock.json',JSON.stringify(lock));assert.throws(()=>f.check());});
test('equal-tree declared synthetic merge is bound to event head and base',(t)=>{const f=fixture(t);const merge=f.git('commit-tree',f.record.sourceTree,'-p',f.base,'-p',f.source,'-m','synthetic merge');f.git('update-ref','HEAD',merge);const result=f.check({context:{...f.context(),head:f.source,merge},env:{DEPENDENCY_PRESERVATION_BASE_SHA:f.base,GITHUB_SHA:merge}});assert.equal(result.head,f.source);assert.equal(result.checkoutHead,merge);});
test('undeclared synthetic merge fails even when its tree matches',(t)=>{const f=fixture(t);const merge=f.git('commit-tree',f.record.sourceTree,'-p',f.base,'-p',f.source,'-m','synthetic merge');f.git('update-ref','HEAD',merge);assert.throws(()=>f.check({context:{...f.context(),head:f.source,merge:null}}),/declared synthetic merge/);});
test('synthetic merge with a different tree fails',(t)=>{const f=fixture(t);f.write('README.md','different merge tree\n');f.commit('changed tree');const tree=f.git('rev-parse','HEAD^{tree}');const merge=f.git('commit-tree',tree,'-p',f.base,'-p',f.source,'-m','synthetic merge');f.git('update-ref','HEAD',merge);assert.throws(()=>f.check({context:{...f.context(),head:f.source,merge}}),/Synthetic merge tree/);});
test('event base mismatch fails',(t)=>{const f=fixture(t);assert.throws(()=>f.check({context:{...f.context(),base:f.source}}),/event base/);});
test('ordinary future branches cannot reuse prior transition authorization',(t)=>{const f=fixture(t);f.write('README.md','future ordinary\n');const base=f.commit('later reviewed baseline');f.write('contracts/Keep.sol','unreviewed future\n');f.commit('future source drift');assert.throws(()=>f.check({policy:null,context:null,env:{DEPENDENCY_PRESERVATION_BASE_SHA:base}}),/Protected source changed/);});
test('preload environment is rejected before generated execution',(t)=>{const f=fixture(t);for(const key of ['NODE_OPTIONS','NODE_PATH'])assert.throws(()=>checkGenerated({root:f.root,env:{[key]:'unexpected'}}),/preload/);});
function generatedFixture(t){const f=fixture(t);const reference=fs.mkdtempSync(path.join(os.tmpdir(),'agi-generated-reference-test-'));t.after(()=>fs.rmSync(reference,{recursive:true,force:true}));fs.cpSync(f.root,reference,{recursive:true,filter:src=>!src.includes(path.sep+'.git')});return {...f,reference,entries:p.inventory(f.root,f.source,p.relevant)};}
test('exact independently reproduced constants, ENS and extra product are accepted',(t)=>{const f=generatedFixture(t);for(const name of ['contracts/v2/Constants.sol','config/ens.json','scripts/generated/protocol-defaults.ts','deployment-config/generated/protocol-defaults.json']){fs.writeFileSync(path.join(f.root,name),'generated\n');fs.writeFileSync(path.join(f.reference,name),'generated\n');}const products=compareGenerated(f);assert.equal(products.length,4);});
test('unprotected generated protocol-defaults.ts is explicitly compared',(t)=>{const f=generatedFixture(t);f.write('scripts/generated/protocol-defaults.ts','unreviewed generated defaults\n');assert.throws(()=>compareGenerated(f),/Generated source differs/);});
test('ENS normalization mismatch fails generated comparison',(t)=>{const f=generatedFixture(t);f.write('config/ens.json','wrong ENS normalization\n');assert.throws(()=>compareGenerated(f),/Generated source differs/);});
test('unexpected ignored generated source is rejected',(t)=>{const f=generatedFixture(t);f.write('contracts/Extra.sol','unexpected\n');assert.throws(()=>compareGenerated(f),/created\/deleted/);});
test('generation cannot rewrite its own reviewed script',(t)=>{const f=generatedFixture(t);f.write('scripts/generate-constants.ts','modified\n');fs.writeFileSync(path.join(f.reference,'scripts/generate-constants.ts'),'modified\n');assert.throws(()=>compareGenerated(f),/undeclared generated product/);});
test('ordinary generated comparison does not freeze unrelated script helpers',(t)=>{const f=generatedFixture(t);f.write('scripts/utils/unrelated-new.js','ordinary repair helper\n');assert.deepEqual(compareGenerated({...f,predicate:n=>p.protectedPath(n)||p.EXTRA_OUTPUTS.includes(n)}),[]);});
test('policy preparation emits canonical, digest-pinned proposals and refuses overwrite',(t)=>{const f=fixture(t);const out=path.join(f.root,'proposal');const options={root:f.root,baseline:f.base,source:f.source,repository:'Example/Jobs',pullRequest:3976,output:out};const receipt=prepare(options);assert.equal(receipt.sourceCheckpoint,f.source);const policy=p.defaultPolicy(f.context(),out);assert.equal(policy.sha256,receipt.recordSha256);assert.throws(()=>prepare(options),/overwrite/);});
test('production policy bundle files are bound to loaded bytes and staged identities',(t)=>{const f=fixture(t);for(const name of ['check-dependency-preservation.cjs','source-preservation-lib.cjs','unreleased-source-policy.index.json','unreleased-source-policy.json'])f.write('scripts/security/'+name,fs.readFileSync(path.join(__dirname,'..',name)));const head=f.commit('policy copies');verifyBundleCopies(f.root,head);f.write('scripts/security/source-preservation-lib.cjs','changed helper\n');assert.throws(()=>verifyBundleCopies(f.root,head),/identity mismatch/);});
test('ambiguous criss-cross event merge bases fail closed',(t)=>{const f=fixture(t);const left=f.git('commit-tree',f.record.sourceTree,'-p',f.base,'-m','left');const right=f.git('commit-tree',f.record.sourceTree,'-p',f.base,'-m','right');const head=f.git('commit-tree',f.record.sourceTree,'-p',left,'-p',right,'-m','cross one');const base=f.git('commit-tree',f.record.sourceTree,'-p',right,'-p',left,'-m','cross two');f.git('update-ref','HEAD',head);assert.throws(()=>f.check({env:{DEPENDENCY_PRESERVATION_BASE_SHA:base},context:{...f.context(),base}}),/Exactly one merge base/);});
test('explicit event-head checkout accepts declared synthetic GITHUB_SHA metadata',(t)=>{const f=fixture(t);const merge=f.git('commit-tree',f.record.sourceTree,'-p',f.base,'-p',f.source,'-m','declared synthetic merge');const result=f.check({context:{...f.context(),merge},env:{DEPENDENCY_PRESERVATION_BASE_SHA:f.base,GITHUB_SHA:merge}});assert.equal(result.checkoutHead,f.source);assert.equal(result.head,f.source);});
test('explicit event-head checkout rejects undeclared GITHUB_SHA',(t)=>{const f=fixture(t);assert.throws(()=>f.check({env:{DEPENDENCY_PRESERVATION_BASE_SHA:f.base,GITHUB_SHA:'a'.repeat(40)}}),/SHA mismatch/);});
test('new root type-resolution inputs require a new exact closure',(t)=>{const f=fixture(t);f.write('types/new-global.d.ts','declare const unchecked: string;\n');f.commit('new root types');assert.throws(()=>f.check(),/Generator input closure differs/);});

for (const eventName of ['push', 'workflow_dispatch']) {
  test(`${eventName} context cannot activate the PR-only transition`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-non-pr-context-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const eventPath = path.join(root, 'event.json');
    fs.writeFileSync(eventPath, JSON.stringify({ repository: { full_name: 'MontrealAI/AGIJobsv0' }, ref: 'refs/heads/main' }));
    assert.throws(() => p.readContext({ GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: eventName }), /PR event context is required/);
  });
}
