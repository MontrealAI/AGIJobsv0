// SPDX-License-Identifier: MIT
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const checks=require('../../scripts/security/check-dependency-preservation.cjs')._test;
const digest=raw=>createHash('sha256').update(raw).digest('hex');
const blob=raw=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex');
const dependencies=['hardhat','solc','ethers','@openzeppelin/contracts','@prb/math',
  '@ethereum-attestation-service/eas-contracts','@ethereum-attestation-service/eas-sdk'];
const identities=()=>Object.fromEntries(dependencies.map((name,index)=>['node_modules/'+name,
  {version:'1.0.'+index,resolved:'https://registry.example.invalid/'+index,integrity:'sha512-owned-'+index}]));
test('ordinary committed snapshot imports owned Git objects without permitting any transport',t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-owned-offline-capture-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const root=path.join(folder,'input'),snapshot=path.join(folder,'snapshot');
  fs.mkdirSync(root);const records=[];
  const run=(args,cwd=root,context=checks.GIT_SECURITY_CONTEXT.installed)=>{
    const invocation=checks.gitInvocation(args,cwd,context);
    assert.equal(context,checks.GIT_SECURITY_CONTEXT.installed);
    assert.ok(invocation.args.includes('protocol.allow=never'));
    assert.equal(invocation.options.env.GIT_ALLOW_PROTOCOL,'');
    assert.equal(invocation.options.env.GIT_NO_LAZY_FETCH,'1');
    assert.ok(!['clone','fetch','push','remote'].includes(args[0]),'No transport command is used');
    records.push({args:[...args],context});
    return execFileSync(invocation.command,invocation.args,invocation.options);
  };
  run(['init','--quiet','--template=','--object-format=sha1',root],folder);
  fs.writeFileSync(path.join(root,'readme.txt'),'owned baseline\r\n');
  fs.writeFileSync(path.join(root,'executable.txt'),'inert executable-mode fixture\n',{mode:0o755});
  run(['add','--','readme.txt','executable.txt']);
  const commit=message=>run(['-c','user.name=Owned fixture','-c','user.email=fixture@example.invalid',
    '-c','commit.gpgsign=false','commit','--quiet','-m',message]);
  commit('owned baseline');const base=run(['rev-parse','HEAD']).trim();
  fs.writeFileSync(path.join(root,'readme.txt'),'owned selected source\r\n');
  run(['add','--','readme.txt']);commit('owned selected source');
  const head=run(['rev-parse','HEAD']).trim();
  fs.writeFileSync(path.join(root,'readme.txt'),'ordinary later generated output\r\n');
  checks.captureCommittedSource(root,snapshot,head,base,run);
  assert.equal(run(['rev-parse','HEAD'],snapshot).trim(),head);
  assert.equal(run(['rev-parse','refs/remotes/origin/main'],snapshot).trim(),base);
  assert.equal(run(['merge-base',base,head],snapshot).trim(),base);
  assert.equal(run(['ls-tree','-rz',head],snapshot),run(['ls-tree','-rz',head],root));
  assert.equal(fs.readFileSync(path.join(snapshot,'readme.txt'),'utf8'),'owned selected source\r\n');
  assert.ok(fs.statSync(path.join(snapshot,'executable.txt')).mode&0o111);
  assert.equal(fs.readFileSync(path.join(root,'readme.txt'),'utf8'),'ordinary later generated output\r\n');
  assert.equal(run(['status','--porcelain'],snapshot),'');
  assert.equal(fs.existsSync(path.join(snapshot,'.git/objects/info/alternates')),false);
  assert.ok(!fs.readFileSync(path.join(snapshot,'.git/config'),'utf8').includes('[remote'));
  assert.ok(records.some(item=>item.args[0]==='bundle'&&item.args[1]==='unbundle'));
});
test('all seven dependencies preserve each exact version, resolved URL and integrity',()=>{
  const before=identities();
  assert.equal(Object.keys(checks.verifySelectedDependencyIdentities(before,structuredClone(before))).length,7);
  for(const name of dependencies)for(const field of ['version','resolved','integrity']) {
    const after=structuredClone(before);after['node_modules/'+name][field]+='-changed';
    assert.throws(()=>checks.verifySelectedDependencyIdentities(before,after),name+' '+field);
  }
});
test('missing dependency or missing identity never becomes a preserved dependency',()=>{
  const before=identities(),missing=identities();delete missing['node_modules/hardhat'];
  assert.throws(()=>checks.verifySelectedDependencyIdentities(before,missing));
  for(const field of ['version','resolved','integrity']) {
    const left=identities(),right=identities();
    delete left['node_modules/ethers'][field];delete right['node_modules/ethers'][field];
    assert.throws(()=>checks.verifySelectedDependencyIdentities(left,right));
  }
});
test('actual generator mutation set must match including missing and extra entries',()=>{
  const admitted=new Set(['config/installed.json','hardhat.config.js']);
  assert.doesNotThrow(()=>checks.verifyGeneratedMutationSets(['config/ens.json'],['config/ens.json'],admitted));
  assert.throws(()=>checks.verifyGeneratedMutationSets([],['config/ens.json'],admitted));
  assert.throws(()=>checks.verifyGeneratedMutationSets(['config/extra.json'],['config/ens.json'],admitted));
  assert.throws(()=>checks.verifyGeneratedMutationSets(['config/ens.json','config/ens.json'],['config/ens.json'],admitted));
});
test('no admitted source case can be hidden as a local or baseline generator mutation',()=>{
  const admitted=new Set(['config/installed.json']);
  assert.throws(()=>checks.verifyGeneratedMutationSets(['config/installed.json'],[],admitted));
  assert.throws(()=>checks.verifyGeneratedMutationSets([],['config/installed.json'],admitted));
});
test('independent generator bytes, modes and deletion state all compare exactly',()=>{
  const file={mode:'100644',raw:Buffer.from('generated\r\n')};
  assert.doesNotThrow(()=>checks.verifyGeneratedFileIdentity(file,{...file,raw:Buffer.from(file.raw)},'config/ens.json'));
  assert.throws(()=>checks.verifyGeneratedFileIdentity(file,{...file,raw:Buffer.from('generated\n')},'config/ens.json'));
  assert.throws(()=>checks.verifyGeneratedFileIdentity(file,{...file,mode:'100755'},'config/ens.json'));
  assert.throws(()=>checks.verifyGeneratedFileIdentity(file,null,'config/ens.json'));
  assert.throws(()=>checks.verifyGeneratedFileIdentity(null,file,'config/ens.json'));
  assert.doesNotThrow(()=>checks.verifyGeneratedFileIdentity(null,null,'config/deleted.json'));
});
function ownedAfterFixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-owned-generated-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(name,raw)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),raw,{mode:0o644});};
  const raw=Buffer.from('exact installed config\r\n');
  write('config/new.json',raw);
  const controls=[
    ['manifestSha256','config/discovery-installed-candidate-v1.json'],
    ['verifierSha256','scripts/release/discovery-installed-profile.py'],
    ['scopeVerifierSha256','tools/security/discovery-installed-protected-scope.mjs'],
  ];
  const proof={cases:[{path:'config/new.json',before:null,after:{mode:'100644',bytes:raw.length,sha256:digest(raw),blob:blob(raw)}}]};
  for(const[key,name]of controls){const bytes=Buffer.from('owned inert '+name+'\n');write(name,bytes);proof[key]=digest(bytes);}
  return {root,write,proof,raw,controls};
}
test('admitted source bytes remain exact after generation',t=>{
  const {root,write,proof}=ownedAfterFixture(t);
  assert.doesNotThrow(()=>checks.verifyInstalledAfterGeneration(root,proof));
  write('config/new.json',Buffer.from('changed'));
  assert.throws(()=>checks.verifyInstalledAfterGeneration(root,proof));
});
test('admitted source modes remain exact after generation',t=>{
  const {root,proof}=ownedAfterFixture(t);
  fs.chmodSync(path.join(root,'config/new.json'),0o755);
  assert.throws(()=>checks.verifyInstalledAfterGeneration(root,proof));
});
test('all three selected controls remain exact after generation',t=>{
  const {root,write,proof,controls}=ownedAfterFixture(t);
  for(const[key,name]of controls) {
    const original=fs.readFileSync(path.join(root,name));write(name,Buffer.from('changed control'));
    assert.throws(()=>checks.verifyInstalledAfterGeneration(root,proof),key);
    write(name,original);
  }
});

function withReadCounters(callback) {
  const originalRead=fs.readSync,originalFileRead=fs.readFileSync;
  const counts={payloadReads:0};
  fs.readSync=(...args)=>{counts.payloadReads++;return originalRead(...args);};
  fs.readFileSync=(...args)=>{counts.payloadReads++;return originalFileRead(...args);};
  try {callback(counts);}finally {fs.readSync=originalRead;fs.readFileSync=originalFileRead;}
}
test('special-file metadata refuses before any payload read and closes the owned descriptor',t=>{
  const {root}=ownedAfterFixture(t),originalStat=fs.fstatSync,originalClose=fs.closeSync;
  let closes=0;
  fs.fstatSync=(...args)=>{const info=originalStat(...args);const changed=Object.create(info);
    changed.isFile=()=>false;return changed;};
  fs.closeSync=(...args)=>{closes++;return originalClose(...args);};
  try {withReadCounters(counts=>{
    assert.throws(()=>checks.captureInstalledFile(root,'config/new.json'),/bounded regular/);
    assert.equal(counts.payloadReads,0);
  });} finally {fs.fstatSync=originalStat;fs.closeSync=originalClose;}
  assert.equal(closes,1);
});
test('oversize, unexpected size and executable mode refuse before payload read',t=>{
  const {root,raw}=ownedAfterFixture(t);
  for(const options of [{maximum:raw.length-1},{expectedSize:raw.length-1},{expectedMode:'100755'}]) {
    withReadCounters(counts=>{
      assert.throws(()=>checks.captureInstalledFile(root,'config/new.json',options));
      assert.equal(counts.payloadReads,0);
    });
  }
});
test('symlink input and ancestor refuse without reading the target payload',t=>{
  const {root}=ownedAfterFixture(t);
  fs.symlinkSync('new.json',path.join(root,'config/link.json'));
  fs.symlinkSync('config',path.join(root,'indirect'),'dir');
  for(const name of ['config/link.json','indirect/new.json'])withReadCounters(counts=>{
    assert.throws(()=>checks.captureInstalledFile(root,name),/direct/);
    assert.equal(counts.payloadReads,0);
  });
});
test('descriptor drift refuses captured bytes and still closes the descriptor',t=>{
  const {root}=ownedAfterFixture(t),originalStat=fs.fstatSync,originalClose=fs.closeSync;
  let reads=0,closes=0;
  fs.fstatSync=(...args)=>{
    const info=originalStat(...args);
    if(++reads===1)return info;
    const changed=Object.create(info);
    Object.defineProperty(changed,'ctimeNs',{value:info.ctimeNs+1n});return changed;
  };
  fs.closeSync=(...args)=>{closes++;return originalClose(...args);};
  try {assert.throws(()=>checks.captureInstalledFile(root,'config/new.json'),/snapshot changed/);}
  finally {fs.fstatSync=originalStat;fs.closeSync=originalClose;}
  assert.equal(closes,1);
});
test('path identity drift refuses even when captured descriptor bytes are stable',t=>{
  const {root}=ownedAfterFixture(t),originalLstat=fs.lstatSync;
  fs.lstatSync=(...args)=>{const info=originalLstat(...args);
    if(args[1]?.bigint){const changed=Object.create(info);Object.defineProperty(changed,'ino',{value:info.ino+1n});return changed;}
    return info;};
  try {assert.throws(()=>checks.captureInstalledFile(root,'config/new.json'),/path snapshot changed/);}
  finally {fs.lstatSync=originalLstat;}
});
test('rc17 baseline worktree always receives the explicit installed Git context',t=>{
  const fixture=ownedAllTrackedComparison(t);
  const value=checks.compareGeneratedSources(fixture.root,fixture.baseline,fixture.options);
  assert.equal(value.generatedTransitions.length,1);
  const baselineCalls=fixture.records.filter(item=>item.cwd===fixture.baseline);
  assert.equal(baselineCalls.length,4);
  for(const item of fixture.records) {
    assert.equal(item.context,checks.GIT_SECURITY_CONTEXT.installed);
    for(const flag of ['--no-replace-objects','--no-pager','protocol.allow=never','core.fsmonitor=false',
      'core.hooksPath=/dev/null','core.attributesFile=/dev/null'])assert.ok(item.invocation.args.includes(flag));
    assert.equal(item.invocation.options.timeout,30_000);
    for(const[key,expected]of Object.entries({GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',
      GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1',GIT_ALLOW_PROTOCOL:'',GIT_NO_LAZY_FETCH:'1',
      GIT_PROTOCOL_FROM_USER:'0',GIT_OPTIONAL_LOCKS:'0',GIT_ATTR_NOSYSTEM:'1'}))
      assert.equal(item.invocation.options.env[key],expected);
  }
  console.log('OWNED_BASELINE_GIT_FLAGS_JSON='+JSON.stringify(baselineCalls.map(item=>({
    args:item.invocation.args,timeout:item.invocation.options.timeout,context:item.context,actualGitExecuted:false}))));
});
test('matched deletion summary uses validated typed state without reading a deleted path',()=>{
  const transitions=[{path:'config/deleted.json',before:{mode:'100644',blob:'1'.repeat(40)},after:null}];
  withReadCounters(counts=>{
    const result=checks.summarizeGeneratedTransitions(transitions);
    assert.deepEqual(result.generatedFiles,[{path:'config/deleted.json',sha256:null,deleted:true}]);
    assert.deepEqual(result.generatedFileTransitions,[{...transitions[0],change:'deleted'}]);
    assert.equal(counts.payloadReads,0);
  });
});

function ownedIndependentCases(t) {
  const {root,proof,raw,controls}=ownedAfterFixture(t),head='1'.repeat(40),tree='2'.repeat(40);
  const base='83065adf18a6ee987f8fa479a496a052d35db682',generator='ba67d5d19ef7d9ac643f99f2b8f49c160714fdf6';
  const baselineEntries=new Map(controls.map(([,name])=>{
    const bytes=fs.readFileSync(path.join(root,name));
    return [name,{mode:'100644',blob:blob(bytes)}];
  }));
  const currentEntries=new Map([...baselineEntries,['config/new.json',{mode:'100644',blob:blob(raw)}]]);
  const candidate={schema:'agijobsv0/discovery-installed-protected-scope/v1',admitted:['config/new.json'],
    completeTrackedSourceVerified:true,generatedFilesOutOfScope:true,packageSourceProofRequiredSeparately:true,
    inputCount:currentEntries.size,sourceCommit:head,sourceTree:tree,
    manifestSha256:proof.manifestSha256,verifierSha256:proof.verifierSha256,scopeVerifierSha256:proof.scopeVerifierSha256,
    releaseQualified:false,publicationApproved:false,executionApproved:false,settlementApproved:false};
  const state={head,currentMode:'100644',indexMatches:true,moveAfterTree:false},records=[];
  const fakeGit=(args,cwd,context)=>{
    assert.equal(cwd,root);assert.equal(context,checks.GIT_SECURITY_CONTEXT.installed);
    const invocation=checks.gitInvocation(args,cwd,context);records.push({args:[...args],context,invocation});
    if(args[0]==='rev-parse') {
      if(args[1]==='HEAD')return state.head;
      if(args[1]===head+'^{tree}') {
        if(state.moveAfterTree)state.head='3'.repeat(40);
        return tree;
      }
      if(args[1]===base+'^{tree}')return '77ded62b991e8cca28bfd849593153f61ac72d86';
      if(args[1]===generator+'^{tree}')return '16c29d934e8bb4d36d286fae7fbf3f9b9d506a85';
      throw new Error('Mutable or unexpected owned source tree selection');
    }
    if(args[0]==='diff') {
      assert.deepEqual(args,['diff','--cached','--quiet',head]);
      if(!state.indexMatches)throw new Error('Owned staged index differs from selected source commit');
      return '';
    }
    assert.deepEqual(args.slice(0,2),['ls-tree','-rz']);
    assert.ok([head,base,generator].includes(args[2]),'Entry metadata must use immutable source references');
    const entries=args[2]===head?currentEntries:baselineEntries;
    return [...entries].map(([name,item])=>(name==='config/new.json'?state.currentMode:item.mode)+
      ' blob '+item.blob+'\t'+name+'\0').join('');
  };
  return {root,proof,raw,head,tree,candidate,state,records,fakeGit,currentEntries};
}
test('independent complete typed source set and metadata refuse before payload reads',t=>{
  const f=ownedIndependentCases(t);
  for(const change of [
    value=>value.admitted=[],
    value=>value.admitted.push('config/extra.json'),
    value=>value.admitted.push('config/new.json'),
    value=>value.manifestSha256='bad',
    value=>value.completeTrackedSourceVerified=false,
    value=>value.generatedFilesOutOfScope=false,
    value=>value.packageSourceProofRequiredSeparately=false,
    value=>value.inputCount=true,
    value=>value.inputCount=Number.MAX_SAFE_INTEGER+1,
    value=>value.inputCount=f.currentEntries.size-1,
    value=>f.state.currentMode='120000',
  ]) {
    const changed=structuredClone(f.candidate);f.state.currentMode='100644';change(changed);
    withReadCounters(counts=>{
      assert.throws(()=>checks.independentInstalledCases(f.root,changed,f.head,f.fakeGit));
      assert.equal(counts.payloadReads,0);
    });
  }
  f.state.currentMode='100644';
  const positive=checks.independentInstalledCases(f.root,f.candidate,f.head,f.fakeGit);
  assert.deepEqual(positive.cases[0].after,{mode:'100644',blob:blob(f.raw),bytes:f.raw.length,sha256:digest(f.raw)});
});
test('typed source metadata is pinned to captured commit and moving HEAD cannot produce a result',t=>{
  const f=ownedIndependentCases(t);f.state.moveAfterTree=true;
  assert.throws(()=>checks.independentInstalledCases(f.root,f.candidate,f.head,f.fakeGit),
    /Selected source HEAD changed/);
  assert.ok(f.records.some(item=>item.args[0]==='rev-parse'&&item.args[1]===f.head+'^{tree}'));
  assert.ok(f.records.some(item=>item.args[0]==='ls-tree'&&item.args[2]===f.head));
  assert.ok(!f.records.some(item=>item.args[0]==='ls-tree'&&item.args[2]==='HEAD'));
  assert.ok(!f.records.some(item=>item.args[0]==='rev-parse'&&item.args[1]==='HEAD^{tree}'));
});
test('standalone source closure refuses staged index divergence under a stable captured HEAD',t=>{
  const f=ownedIndependentCases(t);
  checks.assertSourceCommitAndIndex(f.root,f.head,f.fakeGit);
  f.state.indexMatches=false;
  withReadCounters(counts=>{
    assert.throws(()=>checks.assertSourceCommitAndIndex(f.root,f.head,f.fakeGit),
      /Owned staged index differs/);
    assert.equal(counts.payloadReads,0);
  });
  for(const item of f.records) {
    assert.equal(item.context,checks.GIT_SECURITY_CONTEXT.installed);
    assert.equal(item.invocation.options.timeout,30_000);
    assert.ok(item.invocation.args.includes('protocol.allow=never'));
  }
});
test('generator source selection refuses later installed results or a moving working HEAD',t=>{
  const f=ownedIndependentCases(t);
  checks.assertSelectedSourceResult(f.root,f.head,{head:f.head},f.fakeGit);
  assert.throws(()=>checks.assertSelectedSourceResult(f.root,f.head,{head:'3'.repeat(40)},f.fakeGit),
    /Source result differs from selected generator commit/);
  f.state.head='3'.repeat(40);
  assert.throws(()=>checks.assertSelectedSourceResult(f.root,f.head,{head:f.head},f.fakeGit),
    /Source HEAD moved before generator selection/);
});
function ownedAllTrackedComparison(t,{kind='modified',brokenAncestor=false}={}) {
  const {root,write,proof}=ownedAfterFixture(t);
  const snapshot=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-owned-snapshot-'));
  const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-owned-original-baseline-'));
  t.after(()=>{fs.rmSync(snapshot,{recursive:true,force:true});fs.rmSync(baseline,{recursive:true,force:true});});
  const historical=kind==='deleted'?'config/generated-subtree/historical.json':'config/historical.json';
  const before=Buffer.from('original historical input\r\n'),generated=Buffer.from('actual reproduced generated content\r\n');
  write(historical,before);write('README.md',Buffer.from('exact current HEAD docs\r\n'));
  const controls=['config/discovery-installed-candidate-v1.json','scripts/release/discovery-installed-profile.py',
    'tools/security/discovery-installed-protected-scope.mjs'];
  const sourceNames=['config/new.json',historical,'README.md',...controls].sort();
  const writeAt=(directory,name,raw)=>{
    fs.mkdirSync(path.dirname(path.join(directory,name)),{recursive:true});
    fs.writeFileSync(path.join(directory,name),raw,{mode:0o644});
  };
  const snapshotEntries=new Map(sourceNames.map(name=>{
    const raw=fs.readFileSync(path.join(root,name));writeAt(snapshot,name,raw);
    return [name,{mode:'100644',blob:blob(raw)}];
  }));
  const baselineEntries=new Map([[historical,{mode:'100644',blob:blob(before)}],
    ['README.md',{mode:'100644',blob:blob(Buffer.from('older original-main docs\r\n'))}]]);
  writeAt(baseline,historical,before);writeAt(baseline,'README.md',Buffer.from('older original-main docs\r\n'));
  const manifestRaw=fs.readFileSync(path.join(root,controls[0]));
  proof.cases.push({path:controls[0],before:null,
    after:{mode:'100644',blob:blob(manifestRaw),bytes:manifestRaw.length,sha256:digest(manifestRaw)}});
  const mutation=kind==='added'?'config/new-generated.json':historical;
  const rootDirty=kind==='added'?[]:[historical],baselineDirty=[...rootDirty];
  const rootAdded=kind==='added'?[mutation]:[],baselineAdded=[...rootAdded];
  if(kind==='deleted') {
    fs.rmSync(path.dirname(path.join(root,historical)),{recursive:true,force:true});
    fs.rmSync(path.dirname(path.join(baseline,historical)),{recursive:true,force:true});
    if(brokenAncestor)for(const directory of [root,baseline])
      fs.symlinkSync('missing-dir',path.join(directory,'config/generated-subtree'),'dir');
  } else {
    writeAt(root,mutation,generated);writeAt(baseline,mutation,generated);
  }
  const records=[];
  const fakeGit=(args,cwd,context)=>{
    const invocation=checks.gitInvocation(args,cwd,context);records.push({args,cwd,context,invocation});
    assert.equal(context,checks.GIT_SECURITY_CONTEXT.installed);
    const ordinaryBaseline=cwd===baseline,entries=ordinaryBaseline?baselineEntries:snapshotEntries;
    if(args[0]==='ls-files'&&args.includes('--others'))return (ordinaryBaseline?baselineAdded:rootAdded).join('\0')+'\0';
    if(args[0]==='ls-files')return [...entries.keys()].join('\0')+'\0';
    if(args[0]==='diff')return (ordinaryBaseline?baselineDirty:rootDirty).join('\0')+'\0';
    if(args[0]==='ls-tree') {
      assert.equal(args[2],ordinaryBaseline?'ba67d5d19ef7d9ac643f99f2b8f49c160714fdf6':proof.sourceCommit,
        'Comparator metadata must use immutable source references');
      return [...entries].map(([name,item])=>item.mode+' blob '+item.blob+'\t'+name+'\0').join('');
    }
    throw new Error('Unexpected owned comparator metadata request');
  };
  proof.sourceCommit='1'.repeat(40);
  const options={allTracked:true,sourceSnapshotRoot:snapshot,installedSource:proof,readGit:fakeGit};
  return {root,snapshot,baseline,proof,historical,mutation,generated,records,options,
    writeRoot:(name,raw)=>{writeAt(root,name,raw);if(!rootDirty.includes(name))rootDirty.push(name);},
    writeSnapshot:(name,raw)=>writeAt(snapshot,name,raw)};
}
test('comparator refuses matching ENOENT beneath dangling symlink ancestors',t=>{
  const f=ownedAllTrackedComparison(t,{kind:'deleted',brokenAncestor:true});
  assert.throws(()=>checks.compareGeneratedSources(f.root,f.baseline,f.options),/ancestors must be direct ordinary directories/);
});
test('matching deletion under genuinely absent ordinary ancestors retains typed null state',t=>{
  const f=ownedAllTrackedComparison(t,{kind:'deleted'});
  const compared=checks.compareGeneratedSources(f.root,f.baseline,f.options);
  assert.deepEqual(compared.generatedTransitions,[{path:f.historical,
    before:{mode:'100644',blob:blob(Buffer.from('original historical input\r\n'))},after:null}]);
  withReadCounters(counts=>{
    assert.deepEqual(checks.summarizeGeneratedTransitions(compared.generatedTransitions).generatedFiles,
      [{path:f.historical,sha256:null,deleted:true}]);
    assert.equal(counts.payloadReads,0);
  });
});
test('immutable package selects edition and every initial metadata request is strict',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-owned-edition-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const committed='{"name":"owned","version":"2.1.0-rc.18"}\n';
  const requests=[];let present=true,selectedRef='HEAD';
  const fakeGit=(args,cwd,context)=>{
    assert.equal(cwd,root);assert.equal(context,checks.GIT_SECURITY_CONTEXT.installed);
    const invocation=checks.gitInvocation(args,cwd,context);
    assert.equal(invocation.options.timeout,30_000);assert.ok(invocation.args.includes('protocol.allow=never'));
    requests.push({context,args,timeout:invocation.options.timeout,actualGitExecuted:false});
    if(args[0]==='ls-tree'){assert.deepEqual(args,['ls-tree','--name-only',selectedRef,'--','package.json']);return present?'package.json\n':'';}
    assert.deepEqual(args,['show',selectedRef+':package.json']);return committed;
  };
  for(const version of ['2.1.0-rc.17','2.1.0-rc.18-tampered']) {
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'owned',version})+'\n');
    assert.throws(()=>checks.installedEdition(root,fakeGit),/Tracked installed source bytes or mode differ: package.json/);
  }
  fs.writeFileSync(path.join(root,'package.json'),committed);
  assert.equal(checks.installedEdition(root,fakeGit),true);
  selectedRef='4'.repeat(40);
  assert.equal(checks.installedEdition(root,fakeGit,selectedRef),true);
  selectedRef='HEAD';
  fs.unlinkSync(path.join(root,'package.json'));present=false;
  withReadCounters(counts=>{assert.equal(checks.installedEdition(root,fakeGit),false);assert.equal(counts.payloadReads,0);});
  const defaults=checks.gitInvocation(['rev-parse','HEAD'],root);
  assert.equal(defaults.options.timeout,30_000);
  for(const flag of ['protocol.allow=never','core.fsmonitor=false','core.hooksPath=/dev/null'])assert.ok(defaults.args.includes(flag));
  assert.equal(defaults.options.env.GIT_NO_LAZY_FETCH,'1');
  assert.equal(requests.length,9);
  console.log('OWNED_INITIAL_GIT_CONTEXT_JSON='+JSON.stringify(requests));
});
test('alltracked comparison uses authenticated current source and independent original generated outputs',t=>{
  const f=ownedAllTrackedComparison(t);
  const value=checks.compareGeneratedSources(f.root,f.baseline,f.options);
  assert.equal(value.files.length,6);assert.deepEqual(value.generated,[f.historical]);
  f.writeRoot('README.md',Buffer.from('older original-main docs\r\n'));
  assert.throws(()=>checks.compareGeneratedSources(f.root,f.baseline,f.options),/nonhistorical, control or admitted/);
});
test('authenticated ordinary HEAD snapshot drift refuses before it can replace expected source',t=>{
  const f=ownedAllTrackedComparison(t);
  f.writeSnapshot('README.md',Buffer.from('changed snapshot bytes'));
  assert.throws(()=>checks.compareGeneratedSources(f.root,f.baseline,f.options),/Authenticated source snapshot changed/);
});
test('matching independently reproduced protected additions retain actual captured before and after state',t=>{
  const f=ownedAllTrackedComparison(t,{kind:'added'});
  const compared=checks.compareGeneratedSources(f.root,f.baseline,f.options);
  assert.deepEqual(compared.generated,[f.mutation]);
  assert.deepEqual(compared.generatedTransitions,[{path:f.mutation,before:null,
    after:{mode:'100644',blob:blob(f.generated),bytes:f.generated.length,sha256:digest(f.generated)}}]);
  withReadCounters(counts=>{
    const summary=checks.summarizeGeneratedTransitions(compared.generatedTransitions);
    assert.equal(summary.generatedFileTransitions[0].change,'added');
    assert.equal(counts.payloadReads,0);
  });
  fs.unlinkSync(path.join(f.baseline,f.mutation));
  assert.throws(()=>checks.compareGeneratedSources(f.root,f.baseline,f.options),/deletion differs/);
});

function ownedGeneratorLinkFixture(t) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-owned-generator-link-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const root=path.join(folder,'root'),worktree=path.join(folder,'baseline');
  fs.mkdirSync(root);fs.mkdirSync(worktree);fs.mkdirSync(path.join(root,'node_modules'));
  const run=(args,cwd=worktree,context=checks.GIT_SECURITY_CONTEXT.installed)=>{
    const invocation=checks.gitInvocation(args,cwd,context);
    return execFileSync(invocation.command,invocation.args,invocation.options);
  };
  run(['init','--quiet','--template=','--object-format=sha1',worktree],folder);
  fs.writeFileSync(path.join(worktree,'.gitignore'),'node_modules/\n');
  fs.writeFileSync(path.join(worktree,'README.md'),'owned original generator input\n');
  run(['add','--','.gitignore','README.md']);
  run(['-c','user.name=Owned fixture','-c','user.email=owned@example.invalid','commit','--quiet','--no-gpg-sign','-m','owned generator baseline']);
  const head=run(['rev-parse','HEAD']).trim(),link=path.join(worktree,'node_modules'),target=path.join(root,'node_modules');
  return {folder,root,worktree,head,link,target,run,provision:()=>checks.provisionGeneratorDependencies(root,worktree,head,run)};
}
test('owned generator tooling symlink is accounted for without filtering generated source',t=>{
  const f=ownedGeneratorLinkFixture(t),remove=f.provision();
  // Git's directory-only ignore rule does not hide this owned symlink.
  assert.equal(f.run(['ls-files','--others','--exclude-standard','-z']),'node_modules\0');
  fs.writeFileSync(path.join(f.worktree,'README.md'),'owned actual generated output\r\n');
  remove();assert.equal(fs.existsSync(f.link),false);assert.ok(fs.lstatSync(f.target).isDirectory());
  assert.equal(f.run(['ls-files','--others','--exclude-standard','-z']),'');
  assert.equal(f.run(['diff','--name-only']).trim(),'README.md');
  assert.equal(fs.readFileSync(path.join(f.worktree,'README.md'),'utf8'),'owned actual generated output\r\n');
  assert.throws(remove,/already removed/);
});
test('owned generator setup refuses replacement target movement or staged-source drift without deleting them',t=>{
  for(const change of ['link','file','target','index']) {
    const f=ownedGeneratorLinkFixture(t),remove=f.provision();
    if(change==='link'){fs.unlinkSync(f.link);fs.mkdirSync(path.join(f.root,'other'));fs.symlinkSync(path.join(f.root,'other'),f.link,'dir');}
    if(change==='file'){fs.unlinkSync(f.link);fs.writeFileSync(f.link,'owned replacement fixture');}
    if(change==='target'){fs.renameSync(f.target,f.target+'.before');fs.mkdirSync(f.target);}
    if(change==='index'){fs.writeFileSync(path.join(f.worktree,'README.md'),'owned staged drift');f.run(['add','--','README.md']);}
    assert.throws(remove);assert.ok(fs.lstatSync(f.link));
    if(change==='file')assert.equal(fs.readFileSync(f.link,'utf8'),'owned replacement fixture');
    if(change==='link')assert.equal(fs.readlinkSync(f.link),path.join(f.root,'other'));
  }
});
test('arbitrary node_modules source changes remain inside the complete generated-source refusal',t=>{
  const f=ownedAllTrackedComparison(t);f.writeRoot('node_modules',Buffer.from('owned unexpected source path'));
  assert.throws(()=>checks.compareGeneratedSources(f.root,f.baseline,f.options),/nonhistorical, control or admitted/);
});
