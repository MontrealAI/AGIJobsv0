import test from 'node:test';
import assert from 'node:assert/strict';
import {selectLedgerSource,verifyInstalledLedgerPrefix,verifyLedgerSourceClosure} from './discovery-installed-ledger-prefix.mjs';

// Synthetic inert metadata only. These cases never import the top-level ledger
// validator, read archives/current checkout bytes, or invoke a Git process.
const protectedPath = file => /^(contracts\/|config\/|deployment-config\/|deployment\/|deployments\/)/.test(file) || /(?:compiler-evidence|compiler-provenance|mainnet-deployment|deployment-addresses|configuration-readback|solidity-compiler|ethereum-mainnet)/.test(file) || (/receipts/i.test(file) && /\.json$/.test(file));
const historical='6a18192e915230440f288923b25814e4a87ed7c5',historicalTree='899508ecc40c33086a8d8a6198198ee7f441fa42';
const baseline='83065adf18a6ee987f8fa479a496a052d35db682',baselineTree='77ded62b991e8cca28bfd849593153f61ac72d86';
const commit='1'.repeat(40),tree='2'.repeat(40),packageBlob='3'.repeat(40);
const identity=index=>({mode:'100644',blob:index.toString(16).padStart(40,'0')});
const rows=map=>[...map].map(([name,item])=>item.mode+' blob '+item.blob+'\t'+name+'\0').join('');
function selectionFixture() {
  const state={head:commit,tree,mode:'100644',present:true,payload:'{"version":"2.1.0-rc.18"}\n',size:null,entry:null,blobReads:0};
  const requests=[];
  const readGit=(...args)=>{
    requests.push(args);
    if(args[0]==='rev-parse') {
      if(args[1]==='HEAD')return state.head;
      assert.equal(args[1],commit+'^{tree}');return state.tree;
    }
    if(args[0]==='ls-tree') {
      assert.deepEqual(args,['ls-tree','-z',commit,'--','package.json']);
      return state.entry??(state.present?state.mode+' blob '+packageBlob+'\tpackage.json\0':'');
    }
    if(args[0]==='cat-file'&&args[1]==='-s') {
      assert.equal(args[2],packageBlob);return state.size??String(Buffer.byteLength(state.payload));
    }
    assert.deepEqual(args,['cat-file','blob',packageBlob]);state.blobReads++;return state.payload.trim();
  };
  return {state,requests,readGit};
}
function prefixFixture() {
  const original=new Map(Array.from({length:288},(_,index)=>['contracts/owned-'+index.toString().padStart(3,'0')+'.sol',identity(index+1)]));
  original.set('README.md',identity(1000));original.set('hardhat.config.js',identity(1001));
  const before=new Map([...original].map(([name,item])=>[name,{...item}]));
  const current=new Map([...original].map(([name,item])=>[name,{...item}]));
  current.set('README.md',identity(1002));current.set('hardhat.config.js',identity(1003));
  current.set('config/new-owned.json',identity(1004));
  const maps=new Map([[historical,original],[baseline,before],[commit,current]]);
  const trees=new Map([[historical,historicalTree],[baseline,baselineTree],[commit,tree]]);
  const state={head:commit,indexMatches:true,headMovesDuringClosure:false,headReads:0,rawOverrides:new Map()};
  const requests=[];
  const scope={schema:'agijobsv0/discovery-installed-protected-scope/v1',sourceCommit:commit,sourceTree:tree,
    inputCount:current.size,admitted:['config/new-owned.json'],
    manifestSha256:'4'.repeat(64),verifierSha256:'5'.repeat(64),scopeVerifierSha256:'6'.repeat(64),
    completeTrackedSourceVerified:true,generatedFilesOutOfScope:true,packageSourceProofRequiredSeparately:true,
    releaseQualified:false,publicationApproved:false,executionApproved:false,settlementApproved:false};
  const readGit=(...args)=>{
    requests.push(args);
    if(args[0]==='rev-parse'&&args[1]==='HEAD') {
      const answer=state.head;
      if(state.headMovesDuringClosure&&++state.headReads===1)state.head='7'.repeat(40);
      return answer;
    }
    if(args[0]==='rev-parse') {
      const ref=args[1].replace(/\^\{tree\}$/,'');
      assert.ok(trees.has(ref),'Object queries must use fixed or captured immutable refs');
      assert.equal(args[1],ref+'^{tree}');return trees.get(ref);
    }
    if(args[0]==='diff') {
      assert.deepEqual(args,['diff','--cached','--quiet',commit]);
      if(!state.indexMatches)throw new Error('Owned index differs');
      return '';
    }
    assert.deepEqual(args.slice(0,2),['ls-tree','-rz']);
    assert.ok(maps.has(args[2]),'Entries must use fixed or captured immutable refs');
    return state.rawOverrides.get(args[2])??rows(maps.get(args[2]));
  };
  const input={ledgerBaseline:{commit:historical,tree:historicalTree},commit,tree,scope,readGit,protectedPath};
  return {original,before,current,maps,trees,state,requests,scope,readGit,input};
}
test('immutable committed package selects installed edition with no working metadata input',()=>{
  const f=selectionFixture(),result=selectLedgerSource(f.readGit);
  assert.deepEqual(result,{commit,tree,installed:true,packageIdentity:{mode:'100644',blob:packageBlob,declaredBytes:Buffer.byteLength(f.state.payload)}});
  assert.equal(f.state.blobReads,1);assert.deepEqual(f.requests[0],['rev-parse','HEAD']);
});
test('absent committed package remains ordinary without reading a payload',()=>{
  const f=selectionFixture();f.state.present=false;
  assert.deepEqual(selectLedgerSource(f.readGit),{commit,tree,installed:false,packageIdentity:null});
  assert.equal(f.state.blobReads,0);
});
test('ordinary committed version remains ordinary under the same strict injected reader',()=>{
  const f=selectionFixture();f.state.payload='{"version":"2.1.0-rc.17"}\n';
  assert.equal(selectLedgerSource(f.readGit).installed,false);
});
test('oversize and malformed size metadata refuse before any package payload read',()=>{
  for(const size of ['2000001','9007199254740992','-1','1.5','01','true']) {
    const f=selectionFixture();f.state.size=size;
    assert.throws(()=>selectLedgerSource(f.readGit));assert.equal(f.state.blobReads,0,size);
  }
});
test('nonregular or malformed committed package entry refuses before payload reads',()=>{
  for(const entry of ['120000 blob '+packageBlob+'\tpackage.json\0','040000 tree '+packageBlob+'\tpackage.json\0',
    '100644 blob '+packageBlob+'\tpackage.json','100644 blob '+packageBlob+'\tpackage.json\0\0',
    '100644 blob '+packageBlob.toUpperCase()+'\twrong.json\0']) {
    const f=selectionFixture();f.state.entry=entry;
    assert.throws(()=>selectLedgerSource(f.readGit));assert.equal(f.state.blobReads,0);
  }
});
test('package tree and blob queries use the initially captured immutable commit',()=>{
  const f=selectionFixture();selectLedgerSource(f.readGit);
  assert.deepEqual(f.requests.map(args=>args[0]),['rev-parse','rev-parse','ls-tree','cat-file','cat-file']);
  assert.deepEqual(f.requests[1],['rev-parse',commit+'^{tree}']);
  assert.ok(!f.requests.some(args=>args.includes('HEAD^{tree}')||args.includes('HEAD:package.json')));
});
test('complete historical prefix and exact regular additions pass while nonprotected differences remain separate',()=>{
  const f=prefixFixture(),result=verifyInstalledLedgerPrefix(f.input);
  assert.equal(result.protectedFiles,288);assert.deepEqual(result.added,['config/new-owned.json']);
  assert.equal(protectedPath('hardhat.config.js'),false);
  assert.equal(result.sourceReviewed,false);assert.equal(result.publicationApproved,false);
});
test('incomplete original historical inventory is fatal',()=>{
  const f=prefixFixture();f.original.delete('contracts/owned-000.sol');
  assert.throws(()=>verifyInstalledLedgerPrefix(f.input),/Historical protected inventory differs/);
});
test('installed baseline cannot omit add replace or change a historical protected identity',()=>{
  for(const change of [
    f=>f.before.delete('contracts/owned-000.sol'),
    f=>f.before.set('config/unexpected.json',identity(2000)),
    f=>{f.before.delete('contracts/owned-000.sol');f.before.set('contracts/replacement.sol',identity(1));},
    f=>f.before.set('contracts/owned-000.sol',{...identity(1),mode:'100755'}),
    f=>f.before.set('contracts/owned-000.sol',identity(2001)),
  ]) {
    const f=prefixFixture();change(f);
    assert.throws(()=>verifyInstalledLedgerPrefix(f.input),/Historical-to-installed protected set\/mode\/blob differs/);
  }
});
test('original HEAD identities cannot be waived by claimed admission',()=>{
  for(const change of [
    f=>f.current.delete('contracts/owned-000.sol'),
    f=>f.current.set('contracts/owned-000.sol',{...identity(1),mode:'100755'}),
    f=>f.current.set('contracts/owned-000.sol',identity(2001)),
  ]) {
    const f=prefixFixture();change(f);f.scope.admitted.push('contracts/owned-000.sol');f.scope.inputCount=f.current.size;
    assert.throws(()=>verifyInstalledLedgerPrefix(f.input),/Original ledger protected identity changed/);
  }
});
test('admission must equal independently derived additions without duplicate or malformed names',()=>{
  for(const change of [
    s=>s.admitted=[],s=>s.admitted.push('config/extra.json'),s=>s.admitted.push('config/new-owned.json'),
    s=>s.admitted=[null],s=>s.admitted='config/new-owned.json',
  ]) {
    const f=prefixFixture();change(f.scope);assert.throws(()=>verifyInstalledLedgerPrefix(f.input));
  }
});
test('fixed baseline metadata and captured source commit tree cannot be substituted',()=>{
  for(const change of [
    f=>f.input.ledgerBaseline.commit='8'.repeat(40),f=>f.input.ledgerBaseline.tree='9'.repeat(40),
    f=>f.scope.sourceCommit='8'.repeat(40),f=>f.scope.sourceTree='9'.repeat(40),
    f=>f.scope.schema='other',f=>f.trees.set(commit,'9'.repeat(40)),
  ]) {
    const f=prefixFixture();change(f);assert.throws(()=>verifyInstalledLedgerPrefix(f.input));
  }
});
test('actual v1 true flags input count and digest fields are type strict',()=>{
  const fields=['completeTrackedSourceVerified','generatedFilesOutOfScope','packageSourceProofRequiredSeparately'];
  for(const field of fields)for(const value of [undefined,false,1,'true']) {
    const f=prefixFixture();f.scope[field]=value;assert.throws(()=>verifyInstalledLedgerPrefix(f.input),field);
  }
  for(const value of [true,-1,Number.MAX_SAFE_INTEGER+1,290]) {
    const f=prefixFixture();f.scope.inputCount=value;assert.throws(()=>verifyInstalledLedgerPrefix(f.input));
  }
  for(const field of ['manifestSha256','verifierSha256','scopeVerifierSha256'])for(const value of [undefined,'bad',true]) {
    const f=prefixFixture();f.scope[field]=value;assert.throws(()=>verifyInstalledLedgerPrefix(f.input));
  }
});
test('all current false denials remain exact false',()=>{
  for(const field of ['releaseQualified','publicationApproved','executionApproved','settlementApproved'])
    for(const value of [undefined,true,0,null]) {
      const f=prefixFixture();f.scope[field]=value;assert.throws(()=>verifyInstalledLedgerPrefix(f.input));
    }
});
test('new protected entries must be regular with exact admitted paths',()=>{
  const f=prefixFixture();f.current.get('config/new-owned.json').mode='100755';
  assert.doesNotThrow(()=>verifyInstalledLedgerPrefix(f.input));
  f.current.get('config/new-owned.json').mode='120000';
  assert.throws(()=>verifyInstalledLedgerPrefix(f.input),/addition is not regular/);
});
test('complete entry parser refuses duplicates framing type digest and unsafe paths',()=>{
  const malformed=[
    raw=>raw.slice(0,-1),raw=>raw+'\0',raw=>raw+raw.split('\0')[0]+'\0',
    raw=>raw+'100644 blob '+'a'.repeat(40)+'\t../escape\0',
    raw=>raw+'100644 blob '+'a'.repeat(40)+'\tconfig/.git/escape\0',
    raw=>raw+'100644 blob '+'a'.repeat(40)+'\tconfig\\escape\0',
    raw=>raw.replace(/^100644/,'100664'),raw=>raw.replace(' blob ',' tree '),
    raw=>raw.replace(/blob [a-f0-9]{40}/,'blob '+'Z'.repeat(40)),
  ];
  for(const change of malformed) {
    const f=prefixFixture();f.state.rawOverrides.set(historical,change(rows(f.original)));
    assert.throws(()=>verifyInstalledLedgerPrefix(f.input));
  }
});
test('all prefix object metadata queries use fixed historical installed or captured refs',()=>{
  const f=prefixFixture();verifyInstalledLedgerPrefix(f.input);
  assert.equal(f.requests.length,6);
  for(const args of f.requests) {
    const ref=args[0]==='rev-parse'?args[1].replace(/\^\{tree\}$/,''):args[2];
    assert.ok([historical,baseline,commit].includes(ref));assert.ok(!args.includes('HEAD'));
  }
});
test('installed closure checks HEAD index and HEAD in order',()=>{
  const f=prefixFixture();verifyLedgerSourceClosure({commit,installed:true,readGit:f.readGit});
  assert.deepEqual(f.requests,[['rev-parse','HEAD'],['diff','--cached','--quiet',commit],['rev-parse','HEAD']]);
});
test('installed closure rejects moving HEAD and staged divergence',()=>{
  const f=prefixFixture();f.state.headMovesDuringClosure=true;
  assert.throws(()=>verifyLedgerSourceClosure({commit,installed:true,readGit:f.readGit}),/HEAD changed during closure/);
  const g=prefixFixture();g.state.indexMatches=false;
  assert.throws(()=>verifyLedgerSourceClosure({commit,installed:true,readGit:g.readGit}),/Owned index differs/);
});
test('ordinary closure retains legacy index semantics while refusing source movement',()=>{
  const f=prefixFixture();f.state.indexMatches=false;
  verifyLedgerSourceClosure({commit,installed:false,readGit:f.readGit});
  assert.ok(f.requests.every(args=>args[0]==='rev-parse'));
  f.state.head='7'.repeat(40);
  assert.throws(()=>verifyLedgerSourceClosure({commit,installed:false,readGit:f.readGit}),/HEAD changed/);
});

test('explicit rc19 committed version retains installed ledger controls without accepting unknown editions',()=>{
  for(const [version,installed] of [['2.1.0-rc.18',true],['2.1.0-rc.19',true],['2.1.0-rc.20',true],['2.1.0-rc.21',false],['2.1.0-rc.19-tampered',false],['2.1.0-rc.20-tampered',false]]) {
    const f=selectionFixture();f.state.payload=JSON.stringify({version})+'\n';
    assert.equal(selectLedgerSource(f.readGit).installed,installed);
    assert.equal(f.state.blobReads,1);
  }
});
