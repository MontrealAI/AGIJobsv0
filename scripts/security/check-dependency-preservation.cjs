'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const protectedPath = (name) =>
  name.endsWith('.sol') ||
  /(^|\/)hardhat\.config\.[cm]?[jt]s$/.test(name) ||
  /^(config|deployment-config|scripts\/v2|scripts\/config|scripts\/deploy)\//.test(
    name
  ) ||
  /^scripts\/(generate-constants(?:-impl)?\.ts|constants\.ts|release\/audit-dependencies\.)/.test(
    name
  ) ||
  ['foundry.toml', 'remappings.txt'].includes(name);
const INSTALLED_BASE = '83065adf18a6ee987f8fa479a496a052d35db682';
const INSTALLED_BASE_TREE = '77ded62b991e8cca28bfd849593153f61ac72d86';
const INSTALLED_GENERATOR_BASE = 'ba67d5d19ef7d9ac643f99f2b8f49c160714fdf6';
const INSTALLED_GENERATOR_TREE = '16c29d934e8bb4d36d286fae7fbf3f9b9d506a85';
function installedEditionForCommit(root,readGit=git,ref='HEAD') {
  assert.ok(ref==='HEAD'||/^[a-f0-9]{40}$/.test(ref),'An immutable edition reference is required');
  const present=readGit(['ls-tree','--name-only',ref,'--','package.json'],root,GIT_SECURITY_CONTEXT.installed).trim();
  if(present==='')return false; // Ordinary legacy fixtures need not contain a package manifest.
  assert.equal(present,'package.json','A direct committed package manifest is required');
  const committed=readGit(['show',ref+':package.json'],root,GIT_SECURITY_CONTEXT.installed);
  assert.ok(typeof committed==='string'&&Buffer.byteLength(committed)<=2_000_000,
    'Bounded immutable package metadata is required');
  const installed=JSON.parse(committed).version==='2.1.0-rc.18';
  if(installed)assert.deepEqual(boundedInstalledInput(root,'package.json'),Buffer.from(committed,'utf8'),
    'Tracked installed source bytes or mode differ: package.json');
  return installed;
}
const cleanEnv = () => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')&&!['NODE_OPTIONS','NODE_PATH'].includes(key))),
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_GLOBAL:'/dev/null',
  GIT_ALLOW_PROTOCOL:'',GIT_PROTOCOL_FROM_USER:'0',GIT_NO_REPLACE_OBJECTS:'1',
  GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_ATTR_NOSYSTEM:'1',
});
const GIT_SECURITY_CONTEXT=Object.freeze({ordinary:'ordinary-reviewed-source',installed:'installed-source'});
function gitInvocation(args,cwd=ROOT,context=GIT_SECURITY_CONTEXT.installed) {
  assert.ok(Object.values(GIT_SECURITY_CONTEXT).includes(context),'Explicit known Git security context is required');
  const hardened=context===GIT_SECURITY_CONTEXT.installed;
  return {
    command:'git',
    args:hardened?['--no-replace-objects','--no-pager','-c','protocol.allow=never',
      '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null',...args]:args,
    options:{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20*1024*1024,
      ...(hardened?{env:cleanEnv(),timeout:30_000}:{})},
  };
}
const git=(args,cwd=ROOT,context=GIT_SECURITY_CONTEXT.installed)=>{
  const invocation=gitInvocation(args,cwd,context);
  return execFileSync(invocation.command,invocation.args,invocation.options);
};
function sourceLocation(root,name) {
  assert.ok(typeof name==='string'&&name&&!name.startsWith('/')&&!name.includes('\\')&&!name.includes('\0')
    &&name.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Direct source path is required');
  const directory=path.resolve(root),file=path.join(directory,name),ancestors=[];
  assert.equal(fs.realpathSync(directory),directory,'Source root must be direct');
  const parts=name.split('/');let current=directory;
  for(let index=0;index<parts.length;index++) {
    if(index)current=path.join(current,parts[index-1]);
    let info;
    try {info=fs.lstatSync(current,{bigint:true});}
    catch(error) {
      if(error.code==='ENOENT'&&index>0) {
        verifySourceDirectories(ancestors);
        return {file,ancestors,missingAncestor:true};
      }
      throw error;
    }
    assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Source ancestors must be direct ordinary directories');
    ancestors.push({path:current,info});
  }
  return {file,ancestors,missingAncestor:false};
}
function verifySourceDirectories(ancestors) {
  for(const previous of ancestors) {
    const current=fs.lstatSync(previous.path,{bigint:true});
    assert.ok(current.isDirectory()&&!current.isSymbolicLink(),'Source ancestor changed type');
    for(const key of ['dev','ino','mode','mtimeNs','ctimeNs'])
      assert.equal(current[key],previous.info[key],'Source directory snapshot changed: '+key);
    assert.equal(fs.realpathSync(previous.path),previous.path,'Source ancestor became indirect');
  }
}
function captureInstalledFile(root,name,{maximum=32_000_000,expectedSize,expectedMode}={}) {
  assert.ok(Number.isSafeInteger(maximum)&&maximum>=0&&maximum<=32_000_000,'Bounded source capture is required');
  if(expectedSize!==undefined)assert.ok(Number.isSafeInteger(expectedSize)&&expectedSize>=0&&expectedSize<=maximum);
  if(expectedMode!==undefined)assert.ok(['100644','100755'].includes(expectedMode));
  const location=sourceLocation(root,name),file=location.file;
  assert.equal(location.missingAncestor,false,'Source input has a missing ordinary ancestor');
  assert.equal(fs.realpathSync(file),file,'Source input and ancestors must be direct');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    const before=fs.fstatSync(fd,{bigint:true});
    assert.ok(before.isFile()&&before.size>=0n&&before.size<=BigInt(maximum),
      'Source payload must be bounded regular bytes before reading');
    const size=Number(before.size),mode=before.mode&0o111n?'100755':'100644';
    if(expectedSize!==undefined)assert.equal(size,expectedSize,'Source byte length differs before reading');
    if(expectedMode!==undefined)assert.equal(mode,expectedMode,'Source mode differs before reading');
    const buffer=Buffer.alloc(size+1);let count=0;
    while(count<buffer.length){const n=fs.readSync(fd,buffer,count,buffer.length-count,null);if(!n)break;count+=n;}
    assert.equal(count,size,'Source byte length changed during capture');
    const after=fs.fstatSync(fd,{bigint:true}),current=fs.lstatSync(file,{bigint:true});
    for(const key of ['dev','ino','mode','size','mtimeNs','ctimeNs']) {
      assert.equal(before[key],after[key],'Source descriptor snapshot changed: '+key);
      assert.equal(before[key],current[key],'Source path snapshot changed: '+key);
    }
    assert.equal(fs.realpathSync(file),file,'Source path changed during capture');
    verifySourceDirectories(location.ancestors);
    const raw=buffer.subarray(0,count);
    return {raw,mode,bytes:count,sha256:sha256(raw),
      blob:createHash('sha1').update(Buffer.concat([Buffer.from('blob '+count+'\0'),raw])).digest('hex')};
  } finally {fs.closeSync(fd);}
}
function captureOptionalInstalledFile(root,name) {
  const location=sourceLocation(root,name);
  if(location.missingAncestor)return null;
  try {fs.lstatSync(location.file);}
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    verifySourceDirectories(location.ancestors);
    return null;
  }
  const captured=captureInstalledFile(root,name);
  verifySourceDirectories(location.ancestors);
  return captured;
}
function boundedInstalledInput(root,name) {
  return captureInstalledFile(root,name,{maximum:2_000_000}).raw;
}
function installedSourceProof(root,changes,metadataOnly=false) {
  const name='tools/security/discovery-installed-protected-scope.mjs';
  const captured=captureInstalledFile(root,name,{maximum:2_000_000,expectedMode:'100644'});
  assert.equal(captured.blob,git(['rev-parse','HEAD:'+name],root).trim(),
    'Installed scope control differs from immutable HEAD');
  const script=[
    "import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';",
    "const raw=fs.readFileSync(0);assert.ok(raw.length<=2000000);",
    "const control=await import('data:text/javascript;base64,'+raw.toString('base64'));",
    "const root=process.argv[1];control.auditInstalledGitRoot(root);",
    metadataOnly?"const result={gitMetadataVerified:true};":
      "const result=control.validateInstalledProtectedScope(root,control.INSTALLED_PROTECTED_BASELINE,JSON.parse(process.argv[2]));",
    metadataOnly?'':"assert.equal(result.scopeVerifierSha256,createHash('sha256').update(raw).digest('hex'));",
    "console.log(JSON.stringify(result));",
  ].join('\n');
  return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script,root,JSON.stringify(changes)],
    {input:captured.raw,env:cleanEnv(),encoding:'utf8',timeout:90_000,maxBuffer:2_000_000}));
}
function captureCommittedSource(root,snapshot,head,baseTip,readGit=git) {
  assert.match(head,/^[a-f0-9]{40}$/);assert.match(baseTip,/^[a-f0-9]{40}$/);
  assert.ok(path.isAbsolute(snapshot)&&!fs.existsSync(snapshot),'An absent private committed snapshot is required');
  const parent=path.dirname(snapshot);assert.equal(fs.realpathSync(parent),parent,'Snapshot parent must be direct');
  const bundle=path.join(parent,'committed-source.bundle');assert.ok(!fs.existsSync(bundle));
  assertSourceCommitAndIndex(root,head,readGit);
  assert.equal(readGit(['for-each-ref','--format=%(refname)','refs/replace'],root,GIT_SECURITY_CONTEXT.installed).trim(),
    '','Replaced source history is unsupported');
  const graft=readGit(['rev-parse','--git-path','info/grafts'],root,GIT_SECURITY_CONTEXT.installed).trim();
  assert.ok(!fs.existsSync(path.resolve(root,graft)),'Grafted source history is unsupported');
  assert.equal(readGit(['rev-parse','--verify',baseTip+'^{commit}'],root,GIT_SECURITY_CONTEXT.installed).trim(),baseTip);
  // A bundle is a private object archive, not a clone/fetch transport. Both
  // export and direct import retain the installed context's protocol refusal.
  readGit(['bundle','create','--quiet',bundle,'HEAD','--all'],root,GIT_SECURITY_CONTEXT.installed);
  assertSourceCommitAndIndex(root,head,readGit);
  const heads=readGit(['bundle','list-heads',bundle,'HEAD'],root,GIT_SECURITY_CONTEXT.installed).trim();
  assert.equal(heads,head+' HEAD','Committed bundle differs from selected HEAD');
  readGit(['init','--quiet','--template=','--object-format=sha1',snapshot],parent,GIT_SECURITY_CONTEXT.installed);
  readGit(['bundle','verify',bundle],snapshot,GIT_SECURITY_CONTEXT.installed);
  readGit(['bundle','unbundle',bundle],snapshot,GIT_SECURITY_CONTEXT.installed);
  assert.equal(readGit(['cat-file','-t',head],snapshot,GIT_SECURITY_CONTEXT.installed).trim(),'commit');
  assert.equal(readGit(['cat-file','-t',baseTip],snapshot,GIT_SECURITY_CONTEXT.installed).trim(),'commit');
  readGit(['update-ref','refs/remotes/origin/main',baseTip,'0'.repeat(40)],snapshot,GIT_SECURITY_CONTEXT.installed);
  readGit(['checkout','--quiet','--detach',head],snapshot,GIT_SECURITY_CONTEXT.installed);
  assertSourceCommitAndIndex(snapshot,head,readGit);
  assertSourceCommitAndIndex(root,head,readGit);
}
function assertSourceCommitAndIndex(root,head,readGit=git) {
  assert.match(head,/^[a-f0-9]{40}$/,'An immutable selected source commit is required');
  const selected=()=>readGit(['rev-parse','HEAD'],root,GIT_SECURITY_CONTEXT.installed).trim();
  assert.equal(selected(),head,'Selected source HEAD changed during verification');
  readGit(['diff','--cached','--quiet',head],root,GIT_SECURITY_CONTEXT.installed);
  assert.equal(selected(),head,'Selected source HEAD changed during index verification');
}
function independentInstalledCases(root,scope,head,readGit=git) {
  assertSourceCommitAndIndex(root,head,readGit);
  assert.equal(scope.schema,'agijobsv0/discovery-installed-protected-scope/v1');
  assert.ok(Array.isArray(scope.admitted)&&scope.admitted.every(name=>typeof name==='string'));
  assert.match(scope.sourceCommit,/^[a-f0-9]{40}$/);assert.match(scope.sourceTree,/^[a-f0-9]{40}$/);
  for(const key of ['manifestSha256','verifierSha256','scopeVerifierSha256'])assert.match(scope[key],/^[a-f0-9]{64}$/);
  assert.equal(scope.completeTrackedSourceVerified,true);
  assert.equal(scope.generatedFilesOutOfScope,true);
  assert.equal(scope.packageSourceProofRequiredSeparately,true);
  assert.ok(Number.isSafeInteger(scope.inputCount)&&scope.inputCount>=0,'Typed complete source input count is required');
  assert.equal(scope.sourceCommit,head);
  assert.equal(scope.sourceTree,readGit(['rev-parse',head+'^{tree}'],root,GIT_SECURITY_CONTEXT.installed).trim());
  for(const key of ['releaseQualified','publicationApproved','executionApproved','settlementApproved'])
    assert.equal(scope[key],false);
  assert.equal(readGit(['rev-parse',INSTALLED_BASE+'^{tree}'],root,GIT_SECURITY_CONTEXT.installed).trim(),INSTALLED_BASE_TREE);
  assert.equal(readGit(['rev-parse',INSTALLED_GENERATOR_BASE+'^{tree}'],root,GIT_SECURITY_CONTEXT.installed).trim(),INSTALLED_GENERATOR_TREE);
  const before=sourceEntries(root,INSTALLED_BASE,GIT_SECURITY_CONTEXT.installed,readGit);
  const generator=sourceEntries(root,INSTALLED_GENERATOR_BASE,GIT_SECURITY_CONTEXT.installed,readGit);
  const current=sourceEntries(root,head,GIT_SECURITY_CONTEXT.installed,readGit);
  assert.equal(scope.inputCount,current.size,'Typed complete source input count differs from selected HEAD');
  for(const name of new Set([...before.keys(),...generator.keys()]))if(protectedPath(name))
    assert.deepEqual(generator.get(name),before.get(name),'Original generator protected baseline differs: '+name);
  const typed=[];
  for(const name of [...new Set([...before.keys(),...current.keys()])].sort()) {
    if(!protectedPath(name))continue;
    const left=before.get(name)??null,right=current.get(name)??null;
    if(JSON.stringify(left)===JSON.stringify(right))continue;
    assert.ok(right&&right.mode!=='120000','Installed protected deletion or symlink is unsupported');
    typed.push({path:name,before:left,after:right});
  }
  assert.deepEqual([...scope.admitted].sort(),typed.map(item=>item.path),
    'Installed dependency cases differ from independently derived complete source set');
  const cases=typed.map(item=>{
    const captured=captureInstalledFile(root,item.path,{expectedMode:item.after.mode});
    assert.equal(captured.blob,item.after.blob,'Installed transition differs from immutable HEAD: '+item.path);
    return {...item,after:{mode:captured.mode,blob:captured.blob,bytes:captured.bytes,sha256:captured.sha256}};
  });
  const controls={manifestSha256:'config/discovery-installed-candidate-v1.json',
    verifierSha256:'scripts/release/discovery-installed-profile.py',
    scopeVerifierSha256:'tools/security/discovery-installed-protected-scope.mjs'};
  for(const[key,name]of Object.entries(controls))
    assert.equal(sha256(boundedInstalledInput(root,name)),scope[key],'Installed selected control changed: '+name);
  assertSourceCommitAndIndex(root,head,readGit);
  return {cases,sourceCommit:scope.sourceCommit,sourceTree:scope.sourceTree,
    ...Object.fromEntries(Object.keys(controls).map(key=>[key,scope[key]])),
    sourceReviewed:false,nativeQualified:false,publicationApproved:false};
}
function sourceEntries(root,ref,context=GIT_SECURITY_CONTEXT.installed,readGit=git) {
  const entries=new Map();
  for(const row of readGit(['ls-tree','-rz',ref],root,context).split('\0').filter(Boolean)) {
    const match=/^(100644|100755|120000) blob ([a-f0-9]{40})\t([^\0]+)$/.exec(row);
    assert.ok(match,'Unsupported installed source entry');
    assert.ok(!entries.has(match[3]),'Duplicate installed source entry');
    entries.set(match[3],{mode:match[1],blob:match[2]});
  }
  return entries;
}
function verifyInstalledAfterGeneration(root,proof) {
  for(const item of proof.cases) {
    const captured=captureInstalledFile(root,item.path,{expectedSize:item.after.bytes,expectedMode:item.after.mode});
    assert.equal(captured.sha256,item.after.sha256,'Generation changed admitted installed source: '+item.path);
    assert.equal(captured.blob,item.after.blob,item.path);
  }
  for(const [key,name] of [
    ['manifestSha256','config/discovery-installed-candidate-v1.json'],
    ['verifierSha256','scripts/release/discovery-installed-profile.py'],
    ['scopeVerifierSha256','tools/security/discovery-installed-protected-scope.mjs'],
  ])assert.equal(sha256(boundedInstalledInput(root,name)),proof[key],'Generation changed selected installed control');
}
function verifySelectedDependencyIdentities(before,after) {
  const preserved = {};
  for (const name of [
    'hardhat','solc','ethers','@openzeppelin/contracts','@prb/math',
    '@ethereum-attestation-service/eas-contracts','@ethereum-attestation-service/eas-sdk',
  ]) {
    const key='node_modules/'+name;
    assert.ok(before[key]&&after[key],name+' must remain installed');
    const fields=['version','resolved','integrity'];
    for(const field of fields)for(const item of [before[key],after[key]])
      assert.ok(typeof item[field]==='string'&&item[field].length>0,name+' '+field+' identity is required');
    assert.deepEqual(fields.map(field=>after[key][field]),fields.map(field=>before[key][field]),name);
    preserved[name]=after[key].version;
  }
  return preserved;
}
function verifyGeneratedMutationSets(local,generated,admitted,allTracked=false) {
  assert.ok(Array.isArray(local) && Array.isArray(generated) && (admitted instanceof Set));
  for(const list of [local,generated])assert.equal(new Set(list).size,list.length,'Duplicate generated mutation');
  assert.ok(generated.every(name=>!admitted.has(name)),'Baseline generator overlaps an intentional installed source transition');
  assert.ok(local.every(name=>!admitted.has(name)),'Generation changed an admitted installed source input');
  assert.deepEqual([...local].sort(),[...generated].sort(),allTracked?'Generated tracked-file changes differ from baseline':'Generated protected-file changes differ from baseline');
}
function verifyGeneratedFileIdentity(left,right,name) {
  assert.equal(left===null,right===null,'Generated protected deletion differs: '+name);
  if(left===null)return;
  assert.equal(left.mode,right.mode,'Generated protected file mode differs: '+name);
  assert.deepEqual(left.raw,right.raw,'Generated protected bytes differ: '+name);
}

const names = (value) => value.split('\0').filter(Boolean);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// This digest pins the reviewed record itself, not just paths supplied by it.
// Changing this trust anchor requires a new independent source review.
const REVIEWED_RECORD_SHA256 =
  'e73f43a6e703f672f4e11bb58b9400a89992fce5a8022ad171107a283690524a';
const reviewedRecord = () => ({
  bytes: fs.readFileSync(
    path.join(__dirname, 'reviewed-source-jobs-handover-20261016.json')
  ),
  digest: REVIEWED_RECORD_SHA256,
});

function verifyReviewedSource({ root, baseline, head, bytes, digest }) {
  assert.equal(sha256(bytes), digest, 'Reviewed-source record digest mismatch');
  const record = JSON.parse(bytes);
  assert(
    [1, 2].includes(record.schemaVersion),
    'Unsupported reviewed-source record'
  );
  const sourceBaseline = record.dependencyBaseline;
  if (record.schemaVersion === 1) {
    assert.equal(
      baseline,
      sourceBaseline,
      'Reviewed-source dependency baseline mismatch'
    );
  } else {
    assert.match(sourceBaseline, /^[0-9a-f]{40}$/);
    git(['merge-base', '--is-ancestor', sourceBaseline, baseline], root);
    git(
      [
        'merge-base',
        '--is-ancestor',
        baseline,
        record.reviewedSourceCheckpoint,
      ],
      root
    );
  }
  const checkpoint = record.reviewedSourceCheckpoint;
  for (const sha of [baseline, checkpoint]) assert.match(sha, /^[0-9a-f]{40}$/);
  git(['merge-base', '--is-ancestor', baseline, checkpoint], root);
  git(['merge-base', '--is-ancestor', checkpoint, head], root);
  const transitions = record.transitions;
  if (record.schemaVersion === 1) {
    assert.equal(
      transitions.length,
      4,
      'Exactly four reviewed transitions required'
    );
  } else {
    assert(
      Number.isSafeInteger(record.transitionCount) &&
        record.transitionCount > 0,
      'Explicit reviewed transition count is required'
    );
    assert.equal(
      transitions.length,
      record.transitionCount,
      'Reviewed transition count mismatch'
    );
  }
  const paths = transitions.map((entry) => entry.path).sort();
  assert.equal(
    new Set(paths).size,
    paths.length,
    'Duplicate reviewed transition'
  );
  assert(paths.every(protectedPath), 'Reviewed transition must be protected');
  const changed = names(
    git(['diff', '--name-only', '-z', sourceBaseline, checkpoint], root)
  )
    .filter(protectedPath)
    .sort();
  assert.deepEqual(
    changed,
    paths,
    'Reviewed checkpoint transition set mismatch'
  );
  for (const entry of transitions) {
    assert.notEqual(entry.before, entry.after, 'Missing reviewed transition');
    for (const [ref, identity] of [
      [sourceBaseline, entry.before],
      [checkpoint, entry.after],
    ]) {
      if (record.schemaVersion === 2 && identity === null) {
        assert.equal(
          git(['ls-tree', '-z', ref, '--', entry.path], root),
          '',
          'Reviewed absent blob mismatch: ' + entry.path
        );
      } else {
        assert.match(identity, /^[0-9a-f]{40}$/);
        assert.equal(
          git(['rev-parse', '--verify', ref + ':' + entry.path], root).trim(),
          identity,
          'Reviewed blob mismatch: ' + entry.path
        );
        assert.equal(git(['cat-file', '-t', identity], root).trim(), 'blob');
      }
    }
  }
  assert.deepEqual(
    names(git(['diff', '--name-only', '-z', checkpoint, head], root)).filter(
      protectedPath
    ),
    [],
    'Protected source differs from reviewed checkpoint'
  );
  return checkpoint;
}

function checkSource(options = {}) {
  return checkSourceImpl(options, reviewedRecord());
}

function checkSourceImpl(
  { root = ROOT, env = process.env } = {},
  trustedRecord
) {
  // CI supplies the event's immutable base SHA. Local checks use the fetched
  // main ref. Compare from the merge base so unrelated base-branch changes do
  // not become changes attributed to this PR, and never fall back to rc.3.
  const requestedBase = env.DEPENDENCY_PRESERVATION_BASE_SHA;
  if (env.GITHUB_ACTIONS === 'true')
    assert(requestedBase, 'PR base SHA is required in Actions');
  if (requestedBase !== undefined)
    assert.match(requestedBase, /^[0-9a-f]{40}$/i, 'Invalid PR base SHA');
  const baseRef = requestedBase ?? 'refs/remotes/origin/main';
  const baseTip = git(
    ['rev-parse', '--verify', baseRef + '^{commit}'],
    root
  ).trim();
  const baseline = git(['merge-base', baseTip, 'HEAD'], root).trim();
  assert.match(baseline, /^[0-9a-f]{40}$/i, 'A merge base is required');
  const changed = names(
    git(['diff', '--name-only', '-z', baseline, 'HEAD'], root)
  );
  const head = git(['rev-parse', 'HEAD'], root).trim();
  assert.equal(
    sha256(trustedRecord.bytes),
    trustedRecord.digest,
    'Reviewed-source record digest mismatch'
  );
  const record = JSON.parse(trustedRecord.bytes);
  let reviewedReachable = false;
  try {
    git(
      ['merge-base', '--is-ancestor', record.reviewedSourceCheckpoint, head],
      root
    );
    reviewedReachable = true;
  } catch {
    /* Ordinary branches retain the strict dependency-only guard. */
  }
  let generatedSourceBaseline = baseline;
  let baselineWithinFreeze = false;
  if (reviewedReachable && record.schemaVersion === 2) {
    try {
      git(
        ['merge-base', '--is-ancestor', record.dependencyBaseline, baseline],
        root
      );
      git(
        [
          'merge-base',
          '--is-ancestor',
          baseline,
          record.reviewedSourceCheckpoint,
        ],
        root
      );
      baselineWithinFreeze = true;
    } catch {
      /* Newer ordinary branches retain strict dependency-only protection. */
    }
  }
  const reconcileReviewedSource =
    reviewedReachable &&
    (baseline === record.dependencyBaseline || baselineWithinFreeze);
  const installedEdition = installedEditionForCommit(root,git,head);
  let installedSourceScope = null, installedProtectedSource = null;
  if (installedEdition) {
    const installedChanges=names(git(['diff','--name-only','-z',INSTALLED_BASE,head],root)).filter(protectedPath);
    installedSourceScope=installedSourceProof(root,installedChanges);
    assert.equal(installedSourceScope.completeTrackedSourceVerified, true);
    assert.equal(installedSourceScope.sourceCommit, head);
    assert.equal(installedSourceScope.releaseQualified, false);
    installedProtectedSource=independentInstalledCases(root,installedSourceScope,head);
    generatedSourceBaseline = head;
  } else if (reconcileReviewedSource) {
    generatedSourceBaseline = verifyReviewedSource({
      root,
      baseline,
      head,
      ...trustedRecord,
    });
  } else {
    assert.deepEqual(
      changed.filter(protectedPath),
      [],
      'Protected source changed in the PR'
    );
  }
  const before = JSON.parse(
    git(['show', baseline + ':package-lock.json'], root)
  ).packages;
  const after = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
  ).packages;
  const preserved=verifySelectedDependencyIdentities(before,after);
  if(installedEdition)assertSourceCommitAndIndex(root,head);
  return {
    baseline,
    baseTip,
    head,
    generatedSourceBaseline,
    protectedSourceChanged: changed.some(protectedPath),
    reviewedSourceReconciled: reconcileReviewedSource,
    installedSourceScope,
    installedProtectedSource,
    sourceReviewed:false,
    selectedDependencyIdentitiesPreserved: preserved,
  };
}

function compareGeneratedSources(root,worktree,{
  allTracked=false,sourceSnapshotRoot=null,installedSource=null,readGit=git,
}={}) {
  const context=GIT_SECURITY_CONTEXT.installed;
  const read=(args,cwd)=>readGit(args,cwd,context);
  const installed=installedSource!==null;
  assert.ok(!installed||(allTracked&&sourceSnapshotRoot),'Installed generation needs its authenticated ordinary HEAD snapshot');
  if(installed)verifyInstalledAfterGeneration(root,installedSource);
  const admitted=new Set(installedSource?.cases.map(item=>item.path)??[]);
  const selected=allTracked?()=>true:protectedPath;
  const rootTracked=names(read(['ls-files','-z'],root));
  const baselineTracked=names(read(['ls-files','-z'],worktree));
  const baselineEntries=sourceEntries(worktree,installed?INSTALLED_GENERATOR_BASE:'HEAD',context,readGit);
  const historical=name=>protectedPath(name)&&!admitted.has(name);
  let snapshotEntries=null;
  if(installed) {
    snapshotEntries=sourceEntries(sourceSnapshotRoot,installedSource.sourceCommit,context,readGit);
    assert.deepEqual([...rootTracked].sort(),[...snapshotEntries.keys()].sort(),
      'Actual complete tracked source differs from authenticated snapshot');
    const currentEntries=sourceEntries(root,installedSource.sourceCommit,context,readGit);
    assert.deepEqual([...currentEntries].sort(),[...snapshotEntries].sort(),
      'Committed source differs from authenticated snapshot');
    assert.deepEqual(rootTracked.filter(historical).sort(),baselineTracked.filter(historical).sort(),
      'Complete original protected tracked set differs from independent generator baseline');
  }
  const generatedTracked=names(read(['diff','--name-only','-z'],worktree)).filter(selected);
  const localTracked=names(read(['diff','--name-only','-z'],root)).filter(selected);
  const generatedAdded=names(read(['ls-files','--others','--exclude-standard','-z'],worktree)).filter(selected);
  const localAdded=names(read(['ls-files','--others','--exclude-standard','-z'],root)).filter(selected);
  const generated=[...generatedTracked,...generatedAdded],local=[...localTracked,...localAdded];
  if(installed)for(const name of [...generated,...local])
    assert.ok(historical(name),'Generation changed a nonhistorical, control or admitted source path: '+name);
  verifyGeneratedMutationSets(local,generated,admitted,allTracked);
  const files=[...new Set([...rootTracked.filter(selected),...localAdded,...generatedAdded])].sort();
  const records=new Map();
  for(const name of files) {
    const actual=captureOptionalInstalledFile(root,name);
    let expected;
    if(installed) {
      const committed=snapshotEntries.get(name)??null;
      if(committed) {
        assert.ok(committed.mode!=='120000','Committed installed source must remain regular');
        const snapshot=captureInstalledFile(sourceSnapshotRoot,name,{expectedMode:committed.mode});
        assert.equal(snapshot.blob,committed.blob,'Authenticated source snapshot changed: '+name);
      } else assert.ok(generatedAdded.includes(name),'Unexpected path outside complete committed source: '+name);
      expected=historical(name)?captureOptionalInstalledFile(worktree,name)
        :captureInstalledFile(sourceSnapshotRoot,name,{expectedMode:committed.mode});
    } else expected=captureOptionalInstalledFile(worktree,name);
    verifyGeneratedFileIdentity(actual,expected,name);
    const before=baselineEntries.get(name)??null;
    if(generated.includes(name))assert.ok(before!==null||generatedAdded.includes(name),
      'Generated path lacks authenticated before-state or reproduced addition');
    records.set(name,{path:name,before,
      after:actual?{mode:actual.mode,blob:actual.blob,bytes:actual.bytes,sha256:actual.sha256}:null});
  }
  const generatedTransitions=generated.map(name=>{
    assert.ok(records.has(name),'Generated path lacks a complete validated source comparison');
    return records.get(name);
  });
  return {files,generated,generatedTransitions};
}
function summarizeGeneratedTransitions(transitions) {
  assert.ok(Array.isArray(transitions));
  assert.equal(new Set(transitions.map(item=>item.path)).size,transitions.length,'Duplicate generated summary path');
  for(const item of transitions) {
    assert.ok(typeof item.path==='string'&&item.path&&(item.before!==null||item.after!==null));
    if(item.before!==null) {
      assert.deepEqual(Object.keys(item.before).sort(),['blob','mode']);
      assert.ok(['100644','100755','120000'].includes(item.before.mode)&&/^[a-f0-9]{40}$/.test(item.before.blob));
    }
    if(item.after!==null) {
      assert.deepEqual(Object.keys(item.after).sort(),['blob','bytes','mode','sha256']);
      assert.ok(['100644','100755'].includes(item.after.mode));
      assert.ok(Number.isSafeInteger(item.after.bytes)&&item.after.bytes>=0&&item.after.bytes<=32_000_000);
      assert.match(item.after.blob,/^[a-f0-9]{40}$/);assert.match(item.after.sha256,/^[a-f0-9]{64}$/);
    }
  }
  return {
    generatedFiles:transitions.map(item=>item.after===null
      ?{path:item.path,sha256:null,deleted:true}:{path:item.path,sha256:item.after.sha256}),
    generatedFileTransitions:transitions.map(item=>({...item,
      change:item.after===null?'deleted':item.before===null?'added':'modified'})),
  };
}

function assertSelectedSourceResult(root,head,result,readGit=git) {
  assert.equal(result.head,head,'Source result differs from selected generator commit');
  assert.equal(readGit(['rev-parse','HEAD'],root,GIT_SECURITY_CONTEXT.installed).trim(),head,
    'Source HEAD moved before generator selection');
}
function provisionGeneratorDependencies(root,worktree,head,readGit=git) {
  for(const directory of [root,worktree])assert.equal(fs.realpathSync(directory),path.resolve(directory),
    'Generator dependency directories must be direct');
  assertSourceCommitAndIndex(worktree,head,readGit);
  assert.equal(readGit(['ls-files','-z','--','node_modules'],worktree,GIT_SECURITY_CONTEXT.installed),'',
    'Generator dependency setup must not overlap tracked source');
  const target=path.join(root,'node_modules'),link=path.join(worktree,'node_modules');
  const keys=['dev','ino','mode','size','mtimeNs','ctimeNs'];
  const targetBefore=fs.lstatSync(target,{bigint:true});
  assert.ok(targetBefore.isDirectory()&&!targetBefore.isSymbolicLink(),'Generator dependency target must be an ordinary directory');
  assert.equal(fs.realpathSync(target),target,'Generator dependency target must be direct');
  fs.symlinkSync(target,link,'dir'); // Exclusive creation: no existing path is removed.
  const linkBefore=fs.lstatSync(link,{bigint:true});assert.ok(linkBefore.isSymbolicLink());
  assert.equal(fs.readlinkSync(link),target);
  let removed=false;
  return ()=>{
    assert.equal(removed,false,'Generator dependency link was already removed');
    assert.equal(fs.realpathSync(worktree),worktree,'Generator worktree changed');
    assertSourceCommitAndIndex(worktree,head,readGit);
    const linkAfter=fs.lstatSync(link,{bigint:true}),targetAfter=fs.lstatSync(target,{bigint:true});
    assert.ok(linkAfter.isSymbolicLink(),'Owned generator dependency link was replaced');
    assert.ok(targetAfter.isDirectory()&&!targetAfter.isSymbolicLink(),'Generator dependency target was replaced');
    for(const key of keys) {
      assert.equal(linkAfter[key],linkBefore[key],'Owned generator dependency link changed: '+key);
      assert.equal(targetAfter[key],targetBefore[key],'Generator dependency target changed: '+key);
    }
    assert.equal(fs.readlinkSync(link),target,'Owned generator dependency link target changed');
    assert.equal(fs.realpathSync(target),target,'Generator dependency target redirected');
    assert.equal(readGit(['ls-files','-z','--','node_modules'],worktree,GIT_SECURITY_CONTEXT.installed),'',
      'Generator dependency setup became tracked source');
    fs.unlinkSync(link);removed=true;
    assertSourceCommitAndIndex(worktree,head,readGit);
  };
}
function checkGenerated() {
  const head=git(['rev-parse','HEAD']).trim();
  const installedEdition=installedEditionForCommit(ROOT,git,head);
  let result=installedEdition?null:checkSource();
  if(!installedEdition)assertSelectedSourceResult(ROOT,head,result);
  assert(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'Unexpected Node preload settings');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'agi-baseline-generator-'));
  const snapshot=path.join(temp,'committed-source'),worktree=path.join(temp,'source');
  let ordinaryAdded=false,installedBaselineAdded=false;
  try {
    if(installedEdition) {
      assertSourceCommitAndIndex(ROOT,head);
      assert.equal(installedSourceProof(ROOT,[],true).gitMetadataVerified,true);
      const requestedBase=process.env.DEPENDENCY_PRESERVATION_BASE_SHA;
      if(process.env.GITHUB_ACTIONS==='true')assert.ok(requestedBase,'PR base SHA is required in Actions');
      if(requestedBase!==undefined)assert.match(requestedBase,/^[a-f0-9]{40}$/i,'Invalid PR base SHA');
      const baseTip=git(['rev-parse','--verify',(requestedBase??'refs/remotes/origin/main')+'^{commit}']).trim();
      captureCommittedSource(ROOT,snapshot,head,baseTip);
      result=checkSource({root:snapshot});
      assertSelectedSourceResult(ROOT,head,result);
      assert.equal(git(['rev-parse',INSTALLED_GENERATOR_BASE+'^{tree}'],snapshot).trim(),INSTALLED_GENERATOR_TREE);
      git(['worktree','add','--quiet','--detach',worktree,INSTALLED_GENERATOR_BASE],snapshot);
      installedBaselineAdded=true;
    } else {
      assertSelectedSourceResult(ROOT,head,result);
      git(['worktree','add','--quiet','--detach',worktree,result.generatedSourceBaseline]);
      ordinaryAdded=true;
    }
    const generatorHead=installedEdition?INSTALLED_GENERATOR_BASE:result.generatedSourceBaseline;
    const dependencyPackagesBefore=JSON.parse(captureInstalledFile(ROOT,'package-lock.json').raw.toString('utf8')).packages;
    const removeDependencyLink=provisionGeneratorDependencies(ROOT,worktree,generatorHead);
    const cli = path.join(ROOT, 'node_modules/ts-node/dist/bin.js');
    execFileSync(
      process.execPath,
      [
        cli,
        '--compiler-options',
        '{"module":"commonjs"}',
        'scripts/generate-constants.ts',
      ],
      {
        cwd: worktree,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' },
      }
    );
    // deploy:local also calls the unchanged ENS loader, which persists computed
    // alias namehash/label metadata. Reproduce that exact baseline operation;
    // comparing only the constants generator misses this legitimate output.
    execFileSync(
      process.execPath,
      [
        '-e',
        "require('./scripts/config').loadEnsConfig({ network: 'hardhat' })",
      ],
      {
        cwd: worktree,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' },
      }
    );
    // Tool provisioning is not generated source: remove only the exact unchanged
    // link this invocation created, leaving the complete comparator unfiltered.
    removeDependencyLink();
    const dependenciesAfter=verifySelectedDependencyIdentities(dependencyPackagesBefore,
      JSON.parse(captureInstalledFile(ROOT,'package-lock.json').raw.toString('utf8')).packages);
    assert.deepEqual(dependenciesAfter,result.selectedDependencyIdentitiesPreserved,'Selected dependency identities changed during generation');
    const compared=compareGeneratedSources(ROOT,worktree,{
      allTracked:installedEdition,
      sourceSnapshotRoot:installedEdition?snapshot:null,
      installedSource:installedEdition?result.installedProtectedSource:null,
    });
    if(installedEdition) {
      assert.equal(git(['rev-parse','HEAD']).trim(),result.head,'Source HEAD moved during generation');
      git(['diff','--cached','--quiet',result.head]);
      assert.equal(git(['rev-parse','HEAD'],snapshot).trim(),result.head,'Committed snapshot HEAD moved');
      git(['diff','--cached','--quiet',result.head],snapshot);
      assert.equal(git(['rev-parse','HEAD'],worktree).trim(),INSTALLED_GENERATOR_BASE,
        'Independent generator checkout moved from original baseline');
      verifyInstalledAfterGeneration(ROOT,result.installedProtectedSource);
    }
    return {
      ...result,
      installedSourceScope:installedEdition?{...result.installedSourceScope,
        proofContext:'authenticated-committed-HEAD-snapshot-before-generation'}:result.installedSourceScope,
      generatedSourceBaseline:installedEdition?INSTALLED_GENERATOR_BASE:result.generatedSourceBaseline,
      ...(installedEdition?{generatedSourceBaselineTree:INSTALLED_GENERATOR_TREE}:{}),
      mode:'generated',comparedFiles:compared.files.length,
      baselineGeneratorReproduced:true,baselineEnsNormalizationReproduced:true,
      ownedGeneratorDependencySetupRemoved:true,selectedDependencyIdentitiesRechecked:true,
      committedSourceSnapshotVerified:installedEdition,completeTrackedGeneratedComparison:installedEdition,
      workingTreeSourceVerified:false,generatedBaselineVerified:true,
      ...summarizeGeneratedTransitions(compared.generatedTransitions),
      sourceReviewed:false,nativeQualified:false,releaseQualified:false,publicationApproved:false,
      scope:'Authenticated committed source remains separate from exact original-baseline generated outputs; no generated deployment settings are committed.',
    };
  } finally {
    try {
      if(installedBaselineAdded)git(['worktree','remove','--force',worktree],snapshot);
      if(ordinaryAdded)git(['worktree','remove','--force',worktree]);
    } finally {fs.rmSync(temp,{recursive:true,force:true});}
  }
}

module.exports = {
  protectedPath,
  checkSource,
  checkGenerated,
  // Explicit fixture-only injection. The CLI and public checks never consume
  // record paths, digests or checkpoint overrides from arguments/environment.
  _test: {
    verifyReviewedSource,
    checkSourceWithRecord: checkSourceImpl,
    compareGeneratedSources,
    GIT_SECURITY_CONTEXT,gitInvocation,
    installedEdition:installedEditionForCommit,
    captureInstalledFile,independentInstalledCases,assertSourceCommitAndIndex,assertSelectedSourceResult,summarizeGeneratedTransitions,
    verifySelectedDependencyIdentities,verifyGeneratedMutationSets,verifyGeneratedFileIdentity,
    verifyInstalledAfterGeneration,captureCommittedSource,provisionGeneratorDependencies,
  },
};
if (require.main === module) {
  try {
    assert(
      process.argv.length === 3 &&
        ['source', 'generated'].includes(process.argv[2]),
      'Use source or generated'
    );
    console.log(
      JSON.stringify(
        process.argv[2] === 'generated' ? checkGenerated() : checkSource(),
        null,
        2
      )
    );
  } catch (error) {
    console.error('PRESERVATION_FAILED:', error.message);
    process.exitCode = 1;
  }
}
