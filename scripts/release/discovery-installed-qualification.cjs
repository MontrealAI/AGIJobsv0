// SPDX-License-Identifier: MIT
'use strict';
// This separate profile preserves the old publishers and consumes original hosted evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
const REPOSITORY = 'MontrealAI/AGIJobsv0';
const ALPHA_REPOSITORY = 'MontrealAI/AGI-Alpha-Agent-v0';
const WORKFLOW = '.github/workflows/discovery-installed-release.yml';
const VERSION = '2.1.0-rc.20';
const TAG = 'discovery-v' + VERSION;
const PYTHON_WORKFLOW = '.github/workflows/discovery-installed-python-analysis.yml';
const NODES = Object.freeze(['22.23.3', '24.21.0']);
const PRODUCER = 'Build source-bound Discovery installed archive';
const CONSUMER = version => 'Extracted Discovery native ' + version;
const INSTALLER_PATH = 'scripts/release/install-discovery-installed.py';
const INSTALLER_ASSET = 'install-discovery-installed.py';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const canonical = value => value && typeof value === 'object' ? Array.isArray(value)
  ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
function fields(value, names, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), label);
}
function json(bytes) {
  const text = Buffer.from(bytes).toString('utf8');
  assert.ok(Buffer.from(text).equals(Buffer.from(bytes)), 'Exact UTF8 JSON is required');
  const value = JSON.parse(text);
  assert.equal(text.replace(/"(?:\\.|[^"\\])*"|\s+/g, item => item[0] === '"' ? item : ''),
    JSON.stringify(value), 'Duplicate or noncanonical JSON field spellings are refused');
  return value;
}
function bounded(file, limit = 64_000_000) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd); assert.ok(before.isFile() && before.size <= limit);
    const bytes = Buffer.alloc(before.size + 1); let size = 0;
    while (size < bytes.length) {const count = fs.readSync(fd, bytes, size, bytes.length-size, null); if (!count) break; size += count;}
    const after = fs.fstatSync(fd); assert.equal(size, before.size);
    for (const key of ['dev','ino','mode','size','mtimeMs','ctimeMs']) assert.equal(before[key], after[key]);
    return bytes.subarray(0, size);
  } finally {fs.closeSync(fd);}
}
function sourceProof({root, manifestSha256, verifierSha256, scopeVerifierSha256}) {
  assert.ok(path.isAbsolute(root || '')); assert.ok(digest(manifestSha256) && digest(verifierSha256) && digest(scopeVerifierSha256));
  assert.equal(fs.realpathSync(root),path.resolve(root),'Selected source root must be direct');
  const captured=new Map();
  for(const [name,expected]of [['config/discovery-installed-candidate-v1.json',manifestSha256],
    ['scripts/release/discovery-installed-profile.py',verifierSha256],['tools/security/discovery-installed-protected-scope.mjs',scopeVerifierSha256]]) {
    const file=path.join(root,name);assert.equal(fs.realpathSync(file),path.resolve(file),'Selected source policy path must be direct');
    const bytes=bounded(file,2_000_000);assert.equal(hash(bytes),expected,'Selected source policy bytes differ before verifier execution: '+name);
    captured.set(name,bytes);
  }
  const bootstrap="import sys; raw=sys.stdin.buffer.read(2000001); assert len(raw)<=2000000; sys.argv=sys.argv[1:]; exec(compile(raw,sys.argv[0],'exec'),{'__name__':'__main__','__file__':sys.argv[0]})";
  const raw = execFileSync('python3', ['-I','-c',bootstrap,path.join(root,'scripts/release/discovery-installed-profile.py'),
    '--root',root,'--manifest-sha256',manifestSha256,'--verifier-sha256',verifierSha256,'--scope-verifier-sha256',scopeVerifierSha256,'--require-git'],
  {input:captured.get('scripts/release/discovery-installed-profile.py'),env:{...process.env,PYTHONPATH:'',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'},
    timeout:60_000,maxBuffer:1_000_000});
  const value = json(raw);
  assert.ok(identity(value.sourceCommit) && identity(value.sourceTree) && value.gitAndIndexVerified === true);
  return value;
}
function inheritedPolicy(root) {
  return createRequire(path.join(root,'package.json'))('./scripts/release/qualify-source-release-rc16.cjs');
}
function plan(options) {
  const source = sourceProof(options), inherited = inheritedPolicy(options.root);
  return {schema:'agijobsv0/discovery-installed-qualification-plan/v1',state:'NOT_RUN',source,
    inheritedWorkflowPaths:[...inherited.requiredPaths],inheritedRequiredChecks:[...inherited.requiredChecks],
    additionalWorkflow:WORKFLOW,additionalPythonWorkflow:PYTHON_WORKFLOW,additionalJobs:[PRODUCER,...NODES.map(CONSUMER)],
    publicationRecord:'Separately selected immutable exact-source review record; never a caller boolean',
    authority:'none',releaseQualified:false,publicationApproved:false,executionApproved:false};
}
function validateRun(run, source, {release = true} = {}) {
  assert.ok(positive(run?.id) && positive(run?.run_attempt));
  assert.equal(run.repository?.full_name, REPOSITORY); assert.equal(run.head_sha, source.sourceCommit);
  assert.equal(run.path, WORKFLOW); assert.equal(run.status,'completed'); assert.equal(run.conclusion,'success');
  if (release) {assert.equal(run.head_branch,'main'); assert.equal(run.event,'push');}
  else assert.ok(['push','pull_request','workflow_dispatch'].includes(run.event));
}
function validateJob(job, run, name, requiredSteps) {
  assert.ok(positive(job?.id)); assert.equal(job.run_id,run.id); assert.equal(job.run_attempt,run.run_attempt);
  assert.equal(job.head_sha,run.head_sha); assert.equal(job.name,name);
  assert.equal(job.status,'completed'); assert.equal(job.conclusion,'success');
  for (const name of requiredSteps) {
    const steps = job.steps.filter(item => item.name === name); assert.equal(steps.length,1,'Required executed step is absent or ambiguous: '+name);
    assert.equal(steps[0].status,'completed'); assert.equal(steps[0].conclusion,'success');
  }
}
function validateArtifact(artifact, run, name, bytes) {
  assert.ok(positive(artifact?.id)); assert.equal(artifact.name,name); assert.equal(artifact.expired,false);
  assert.equal(artifact.workflow_run?.id,run.id); assert.equal(artifact.workflow_run?.head_sha,run.head_sha);
  assert.equal(artifact.workflow_run?.head_branch,run.head_branch);
  assert.equal(artifact.digest,'sha256:'+hash(bytes)); assert.equal(artifact.size_in_bytes,bytes.length);
}
// Read original API-downloaded archives without extracting or executing a member.
function zipMembers(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 64_000_000);
  const script = `import sys,io,zipfile,json,base64,stat\nb=sys.stdin.buffer.read(64000001)\nassert len(b)<=64000000\nz=zipfile.ZipFile(io.BytesIO(b)); a=z.infolist(); assert len(a)<=512\nnames=set(); total=0; out={}\nfor i in a:\n n=i.filename\n assert n and not n.startswith('/') and '\\\\' not in n and all(p not in ('','..','.') for p in n.rstrip('/').split('/')) and n not in names\n names.add(n)\n if i.is_dir(): continue\n assert not stat.S_ISLNK(i.external_attr>>16) and i.file_size<=32000000 and not i.flag_bits&1\n total+=i.file_size; assert total<=64000000\n out[n]=base64.b64encode(z.read(i)).decode()\nprint(json.dumps(out,separators=(',',':')))\n`;
  const out = json(execFileSync('python3',['-I','-c',script],{input:bytes,timeout:15_000,maxBuffer:90_000_000,stdio:['pipe','pipe','pipe']}));
  return new Map(Object.entries(out).map(([name,raw])=>[name,Buffer.from(raw,'base64')]));
}
function one(map, name) {assert.ok(map.has(name),'Required original artifact member is absent: '+name);return map.get(name);}
function installedArchive(raw,custody,source,alpha) {
  const script=`import sys,io,gzip,tarfile,json,base64,hashlib\nb=sys.stdin.buffer.read(64000001);assert len(b)<=64000000\ng=gzip.GzipFile(fileobj=io.BytesIO(b));u=g.read(20000001);assert len(u)<=20000000\nz=tarfile.open(fileobj=io.BytesIO(u),mode="r:");a=z.getmembers();assert len(a)<=256\nseen=set();total=0;out={};selected={}\nfor i in a:\n n=i.name;assert n and not n.startswith('/') and '\\\\' not in n and all(p not in ('','..','.') for p in n.split('/')) and n not in seen\n seen.add(n);assert i.isfile() and i.size<=2000000 and i.mode in (0o644,0o755)\n total+=i.size;assert total<=16000000\n v=z.extractfile(i).read(i.size+1);assert len(v)==i.size\n out[n]={"bytes":len(v),"sha256":hashlib.sha256(v).hexdigest(),"mode":"100755" if i.mode==0o755 else "100644"}\n if n in ('INSTALLED_SOURCE.json','alpha/docs/successor/capabilities/sources.json'):selected[n]=base64.b64encode(v).decode()\nprint(json.dumps({"files":out,"selected":selected},separators=(',',':')))\n`;
  const result=json(execFileSync('python3',['-I','-c',script],{input:raw,timeout:15_000,maxBuffer:4_000_000,stdio:['pipe','pipe','pipe']}));
  const manifestRaw=Buffer.from(result.selected['INSTALLED_SOURCE.json'],'base64');assert.equal(hash(manifestRaw),custody.installedManifestSha256);
  const manifest=json(manifestRaw);assert.equal(manifest.schema,'agijobsv0/discovery-installed/v1');
  assert.equal(manifest.profile,'jobs-discovery-installed-v1');assert.equal(manifest.version,VERSION);
  assert.equal(manifest.authority,'none');assert.equal(manifest.currencyCapBaseUnits,'0');assert.equal(manifest.externalExecution,'unprovisioned');assert.equal(manifest.productionQualified,false);
  assert.equal(manifest.jobs.commit,source.sourceCommit);assert.equal(manifest.jobs.tree,source.sourceTree);
  assert.equal(manifest.alpha.commit,alpha.commit);assert.equal(manifest.alpha.tree,alpha.tree);assert.equal(manifest.alpha.sourceHash,alpha.sourceHash);
  assert.equal(manifest.alpha.status,'REVIEWED_FINAL_SOURCE');
  delete result.files['INSTALLED_SOURCE.json'];assert.deepEqual(manifest.files,result.files,'Saved archive member bytes/modes differ from the selected installed manifest');
  const catalog=json(Buffer.from(result.selected['alpha/docs/successor/capabilities/sources.json'],'base64'));
  assert.equal(catalog.schema,'successor-capability-source/v1');assert.equal(catalog.sourceHash,alpha.sourceHash);
  assert.equal(hash(canonical(catalog.sources)),alpha.sourceHash);assert.equal(Object.keys(catalog.sources).length,41);
  for(const [name,digest] of Object.entries(catalog.sources))assert.equal(result.files['alpha/'+name]?.sha256,digest,'Complete saved Alpha catalog input differs');
  assert.equal(result.files['alpha/examples/successor-capability/discovery-lab-inspector.mjs']?.sha256,manifest.alpha.inspectorSha256);
  assert.equal(result.files['integrations/alpha-agent/discovery-lab-contract.mjs']?.sha256,
    result.files['alpha/examples/successor-capability/discovery-lab-contract.mjs']?.sha256,'Saved receiver and Alpha contracts differ');
  return manifest;
}
function validateInstaller(raw,custody,{source,finite,git,manifest}) {
  const expected={path:INSTALLER_ASSET,sourcePath:INSTALLER_PATH,bytes:raw.length,sha256:hash(raw)};
  assert.deepEqual(custody.installer,expected,'Saved standalone installer custody differs from actual member bytes');
  assert.deepEqual(finite.changes?.[INSTALLER_PATH]?.after,{mode:'100644',sha256:expected.sha256},
    'Standalone installer is absent from the selected finite source profile');
  const blob=crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
  assert.equal(String(git('ls-tree','-z',source.sourceCommit,'--',INSTALLER_PATH)),
    '100644 blob '+blob+'\t'+INSTALLER_PATH+'\0','Standalone installer differs from immutable source Git blob');
  assert.ok(Buffer.from(git('show',source.sourceCommit+':'+INSTALLER_PATH)).equals(raw),
    'Saved standalone installer differs from exact source bytes');
  assert.deepEqual(manifest.files[INSTALLER_PATH],{mode:'100644',bytes:raw.length,sha256:expected.sha256},
    'Installed archive must include the same source-bound standalone installer');
  return {...expected,sourceGitBlob:blob};
}
function assertProducerInventory(members) {
  assert.deepEqual([...members.keys()].sort(),['jobs-discovery-installed.tar.gz','jobs-discovery-installed.tar.gz.custody.json',INSTALLER_ASSET,
    ...['workspace.json','request.txt'].map(name=>'browser-inputs/'+name),
    ...require('./capture-discovery-browser-input.cjs').PACKET.map(name=>'browser-inputs/packet/'+name)].sort(),
    'Saved producer must retain exactly the common 17-file packet, two primary aliases, archive, installer and custody');
}
function custodyFromProducer(members, source, alpha,installerOptions) {
  assertProducerInventory(members);
  const raw = one(members,'jobs-discovery-installed.tar.gz');
  const custody = json(one(members,'jobs-discovery-installed.tar.gz.custody.json'));
  assert.equal(custody.schema,'agijobsv0/discovery-installed-capsule-custody/v1');
  assert.equal(custody.authority,'none');assert.equal(custody.productionQualified,false);
  assert.equal(custody.archiveSha256,hash(raw)); assert.equal(custody.archiveBytes,raw.length);
  assert.ok(digest(custody.installedManifestSha256));
  assert.equal(custody.jobsCommit,source.sourceCommit); assert.equal(custody.jobsTree,source.sourceTree);
  assert.equal(custody.alphaCommit,alpha.commit); assert.equal(custody.alphaTree,alpha.tree);
  assert.equal(custody.sourceHash,alpha.sourceHash);
  const manifest=installedArchive(raw,custody,source,alpha);
  const installerRaw=one(members,INSTALLER_ASSET),installer=validateInstaller(installerRaw,custody,{source,...installerOptions,manifest});
  const browser={workspace:one(members,'browser-inputs/workspace.json'),request:one(members,'browser-inputs/request.txt'),
    packet:new Map(require('./capture-discovery-browser-input.cjs').PACKET.map(name=>[name,one(members,'browser-inputs/packet/'+name)]))};
  return {raw,custody,manifest,browser,installerRaw,installer};
}
function validateBootstrap(members,{source,selection,custody,installerRaw,version}) {
  assert.ok(one(members,'bootstrap/'+INSTALLER_ASSET).equals(installerRaw),'Consumer used different saved standalone installer bytes');
  const observed=json(one(members,'bootstrap/installer-custody.json'));
  assert.deepEqual(observed,{schema:'agijobsv0/discovery-installed-bootstrap/v1',node:'v'+version,
    installer:custody.installer,jobsCommit:source.sourceCommit,sourceSelection:selection,
    archiveSha256:custody.archiveSha256,installedManifestSha256:custody.installedManifestSha256,authority:'none'});
  const installed=json(one(members,'bootstrap/installation-custody.json'));
  assert.equal(installed.schema,'agijobsv0/discovery-installed-extraction/v1');
  assert.equal(installed.archiveSha256,custody.archiveSha256);assert.equal(installed.archiveBytes,custody.archiveBytes);
  assert.equal(installed.installedManifestSha256,custody.installedManifestSha256);
  assert.equal(installed.authority,'none');assert.equal(installed.state,'EXTRACTED_INACTIVE_LOCAL_REVIEW_ONLY');
  return {installer:custody.installer,installationCustodySha256:hash(one(members,'bootstrap/installation-custody.json'))};
}
function validateNative(members, {source,alpha,custody,version,browser,bootstrap}) {
  const raw = one(members,'native-evidence.json'), report = json(raw);
  assert.equal(report.schema,'agijobsv0/discovery-installed-native-evidence/v1');
  assert.equal(report.acceptanceProtocol,'primary-browser-return-plus-separated-constructed-regression/v2');
  assert.equal(report.inputWorkspace,'retained-exported-workspace');assert.equal(report.inputRequest,'original-exported-typed-bytes');
  assert.equal(report.receiptImports?.count,1,'Primary browser mission must receive exactly one returned receipt');
  assert.equal(report.receiptImports.records?.[0]?.case,'original-exported-request');
  assert.deepEqual(report.missionSeparation,{distinctMissionIds:true,receiptCountsCombined:false,costLedgersCombined:false,
    primaryConstructionEventsAdded:0,primaryReceiptEventsAdded:1});
  assert.equal(report.node,'v'+version); assert.equal(report.authority,'none');
  assert.equal(report.currencyCapBaseUnits,'0');
  if(browser) {assert.equal(report.inputWorkspace,'retained-exported-workspace');assert.equal(report.inputRequest,'original-exported-typed-bytes');
    assert.ok(one(members,'workspace.input.json').equals(browser.workspace),
      'Installed consumers must preserve the original source-bound browser mission');
    const first=report.receiptImports?.records?.[0];assert.equal(first?.case,'original-exported-request');
    assert.ok(one(members,first.requestFile).equals(browser.request),'Original typed browser request bytes were rebuilt or replaced');}
  assert.deepEqual(report.jobs,{commit:source.sourceCommit,tree:source.sourceTree});
  assert.deepEqual(report.alpha,{commit:alpha.commit,tree:alpha.tree,sourceHash:alpha.sourceHash});
  assert.equal(report.capsule.sha256,custody.archiveSha256);
  assert.equal(report.capsule.manifestSha256,custody.installedManifestSha256);
  assert.equal(report.capsule.bytes,custody.archiveBytes);
  assert.ok(report.files && Object.keys(report.files).length>=4,'Raw same-history evidence is required');
  const bootstrapPaths=bootstrap?['bootstrap/'+INSTALLER_ASSET,'bootstrap/installer-custody.json','bootstrap/installation-custody.json']:[];
  const bootstrapObservation=bootstrap?validateBootstrap(members,{source,custody,version,...bootstrap}):null;
  assert.deepEqual(Object.keys(report.files).sort(),[...members.keys()].filter(name=>name!=='native-evidence.json'&&!bootstrapPaths.includes(name)).sort(),
    'Every retained native sidecar must be hashed in the report');
  for (const [name,expected] of Object.entries(report.files)) {
    fields(expected,['bytes','sha256'],'Native sidecar identity fields differ');
    assert.ok(digest(expected.sha256));assert.equal(one(members,name).length,expected.bytes);
    assert.equal(hash(one(members,name)),expected.sha256,'Original native member changed: '+name);
  }
  const primary=validateRetainedHistory(members,report,{source,custody,primary:true});
  const regression=report.constructedRegression;
  assert.equal(regression?.schema,'agijobsv0/discovery-installed-constructed-regression/v1');
  assert.equal(regression.scope,'constructed-regression');
  assert.equal(regression.node,report.node);assert.equal(regression.authority,'none');assert.equal(regression.currencyCapBaseUnits,'0');
  for(const key of ['jobs','alpha','capsule'])assert.deepEqual(regression[key],report[key],'Both missions must use the same saved source and candidate');
  assert.equal(regression.inputWorkspace,'constructed-native-through-installed-alpha');
  assert.equal(regression.inputRequest,'native-exported-exact-typed-bytes');
  assert.notEqual(regression.missionId,report.missionId,'Constructed regression must have its own mission');
  assert.deepEqual(regression.historyStates,['accepted','rejected','inconclusive','accepted']);
  assert.equal(regression.receiptImports?.count,8,'All eight constructed regression imports are required');
  assert.deepEqual(regression.receiptImports.records.map(record=>record.case),
    ['learn','think','design','strategise','execute','evolve'].map(stage=>'accepted-'+stage)
      .concat(['missing-inspection-reserve','stronger-successor']));
  const constructed=validateRetainedHistory(members,regression,{source,custody,prefix:'regression/'});
  const primaryIds=new Set(report.receiptImports.records.map(record=>record.receiptId));
  assert.ok(regression.receiptImports.records.every(record=>!primaryIds.has(record.receiptId)),
    'Receipts cannot be imported across the primary and regression missions');
  assert.equal(regression.refusedAttempts?.length,1,'Actual failed constructed work must remain retained');
  for(const attempt of regression.refusedAttempts) {
    assert.equal(attempt.admitted,false);assert.ok(attempt.requestFile.startsWith('regression/refused/'));
    assert.ok(attempt.receiptFile.startsWith('regression/refused/'));
    const request=one(members,attempt.requestFile).toString('utf8'),receipt=json(one(members,attempt.receiptFile));
    assert.equal(receipt.original,request);assert.equal(json(Buffer.from(request)).missionId,regression.missionId);
    assert.equal(receipt.bindings.missionId,regression.missionId);assert.equal(receipt.authority,'none');
    assert.equal(receipt.requestSha256,hash(request));assert.notEqual(receipt.state,'local-checked');
    assert.deepEqual(attempt.resources,receipt.resources.totalUsed);
  }
  assert.equal(regression.attemptCostsFile,'regression/attempt-costs.json');
  const attemptLedger=json(one(members,regression.attemptCostsFile));
  assert.deepEqual(attemptLedger,{schema:'agijobsv0/discovery-installed-attempt-costs/v1',scope:'constructed-regression',
    missionId:regression.missionId,costsComplete:false,attempts:[
      ...regression.receiptImports.records.map(record=>({case:record.case,admitted:true,receiptFile:record.receiptFile,resources:record.resources})),
      ...regression.refusedAttempts.map(record=>({case:record.case,admitted:false,receiptFile:record.receiptFile,resources:record.resources}))]});
  assert.deepEqual(regression.files,Object.fromEntries(Object.entries(report.files).filter(([name])=>name.startsWith('regression/'))),
    'Constructed regression must retain only its own complete raw evidence');
  return {report,primary,constructed,bootstrap:bootstrapObservation,rawSha256:hash(raw),members:[...members].map(([name,bytes])=>({name,bytes:bytes.length,sha256:hash(bytes)}))};
}
function validateRetainedHistory(members,report,{source,custody,prefix='',primary=false}) {
  const local=name=>one(members,prefix+name);
  for(const name of ['eventPrefixPreserved','rawReceiptsPreserved','costsRetained','deduplicated'])
    assert.equal(report.receiptImports[name],true,'Returned mission receipts must preserve '+name);
  assert.equal(report.docket?.byteIdentical,true);
  for(const [file,key,reopened] of [['docket.json','sha256','reopenedSha256'],['workspace.json','workspaceSha256','reopenedWorkspaceSha256']]) {
    assert.ok(digest(report.docket[key]));assert.equal(report.docket[key],report.docket[reopened]);
    assert.equal(hash(local(file)),report.docket[key]);
    const reopenedFile=file.replace('.json','.reopened.json');assert.ok(local(file).equals(local(reopenedFile)),'Mission reopen bytes changed');
    assert.equal(hash(local(reopenedFile)),report.docket[reopened]);
  }
  const workspace=json(local('workspace.json')),input=json(local('workspace.input.json'));
  assert.equal(workspace.schema,'successor-capability-workspace/v2');
  assert.ok(['successor-capability-workspace/v1','successor-capability-workspace/v2'].includes(input.schema));
  assert.equal(workspace.missionId,report.missionId);
  assert.equal(workspace.missionId,input.missionId);assert.ok(Array.isArray(workspace.events)&&workspace.events.length<=24);
  assert.equal(canonical(workspace.events.slice(0,input.events.length)),canonical(input.events),'Original mission prefix changed');
  if(primary)assert.equal(workspace.events.length,input.events.length+1,'Primary mission must retain exactly one append');
  let previous=null;
  for(const [sequence,event] of workspace.events.entries()) {
    fields(event,['sequence','kind','previous','payload','digest'],'Mission event fields differ');
    assert.equal(event.sequence,sequence);assert.equal(event.previous,previous);
    assert.equal(event.digest,hash('successor-omega/v1:capability-event\0'+canonical({missionId:workspace.missionId,
      sequence,kind:event.kind,previous:event.previous,payload:event.payload})),'Mission event chain changed');previous=event.digest;
  }
  const docket=json(local('docket.json'));
  assert.equal(docket.schema,'successor-discovery-evidence-docket/v1');assert.equal(docket.format,'bounded-canonical-file-map');
  const paths=['00_manifest.md','01_claims_matrix.md','02_environment.md','03_benchmark_tasks/spec.json',
    '04_baselines/comparison.json','05_agialpha_runs/run.json','06_proof_bundles/capability.json','07_replay_logs/replay.json',
    '08_cost_ledgers/costs.json','09_safety_ledgers/safety.json','10_validator_reports/review.json',
    '11_alpha_wu_calibration/status.json','12_summary_tables/outcome.json'];
  assert.deepEqual(Object.keys(docket.files).sort(),[...paths].sort());assert.deepEqual(Object.keys(docket.checksums).sort(),[...paths].sort());
  for(const name of paths)assert.equal(hash(docket.files[name]),docket.checksums[name],'Docket section changed: '+name);
  const run=json(Buffer.from(docket.files['05_agialpha_runs/run.json']));assert.equal(canonical(run.workspace),canonical(workspace));
  assert.equal(run.attachments.workspaceHead,previous);assert.equal(run.attachments.missionId,workspace.missionId);
  const records=report.receiptImports.records;assert.ok(Array.isArray(records));assert.equal(records.length,report.receiptImports.count);
  const ids=new Set(),positions=new Set(),resources=['acquisitions','search','checking','memoryBytes','storageBytes','workerCapacity','installations','elapsedMs'];
  const vector=Object.fromEntries(resources.map(name=>[name,0]));
  for(const record of records) {
    assert.ok(Number.isSafeInteger(record.beforeEvents)&&record.beforeEvents>=input.events.length&&!positions.has(record.beforeEvents));
    positions.add(record.beforeEvents);
    if(primary)assert.equal(record.beforeEvents,input.events.length,'Primary receipt must be the new original-mission append');
    for(const name of ['requestFile','receiptFile','envelopeFile'])assert.ok(typeof record[name]==='string'&&record[name].startsWith(prefix+'imports/'),'Receipt sidecar belongs to another mission');
    assert.ok(digest(record.receiptId)&&!ids.has(record.receiptId));ids.add(record.receiptId);
    const rawReceipt=one(members,record.receiptFile).toString('utf8'),receipt=json(Buffer.from(rawReceipt));
    const request=one(members,record.requestFile).toString('utf8'),envelope=json(one(members,record.envelopeFile));
    assert.equal(receipt.original,request);assert.equal(receipt.requestSha256,hash(request));
    assert.equal(json(Buffer.from(request)).missionId,workspace.missionId,'Request belongs to another mission');
    assert.equal(receipt.bindings.missionId,workspace.missionId,'Receipt belongs to another mission');
    assert.equal(receipt.authority,'none');assert.equal(receipt.commission.capBaseUnits,'0');
    assert.equal(receipt.commission.route,'jobs-agialpha');assert.equal(receipt.commission.currency,'AGIALPHA18');
    assert.equal(receipt.lifecycle.commission,'DRAFT_NOT_SUBMITTED');
    assert.equal(envelope.raw,rawReceipt);assert.equal(envelope.source.repository,REPOSITORY);
    assert.equal(envelope.source.commit,source.sourceCommit);assert.equal(envelope.source.tree,source.sourceTree);
    if(custody.jobs) {assert.equal(envelope.source.adapterSha256,custody.jobs.adapterSha256);assert.equal(envelope.source.contractSha256,custody.jobs.contractSha256);}
    assert.equal(record.afterEvents,record.beforeEvents+1);const event=workspace.events[record.beforeEvents];
    assert.equal(event.digest,record.afterHead);assert.equal(event.previous,record.beforeHead);assert.equal(event.kind,'lab-evidence-attached');
    assert.equal(event.payload.kind,'receiver-receipt');assert.equal(event.payload.campaignDigest,record.campaignDigest);
    assert.equal(canonical(event.payload.record),canonical(envelope));assert.equal(canonical(record.resources),canonical(receipt.resources.totalUsed));
  }
  for(const event of workspace.events) {
    if(event.kind!=='lab-evidence-attached'||event.payload.kind!=='receiver-receipt')continue;
    const receipt=json(Buffer.from(event.payload.record.raw));
    if(receipt.schema!=='agijobsv0/discovery-lab-admission/v1'||receipt.commission.route!=='jobs-agialpha')continue;
    fields(receipt.resources.totalUsed,resources,'Exact retained receiver cost vector is required');
    for(const key of resources) {const value=receipt.resources.totalUsed[key];assert.ok(Number.isSafeInteger(value)&&value>=0);
      vector[key]=['memoryBytes','workerCapacity'].includes(key)?Math.max(vector[key],value):vector[key]+value;assert.ok(Number.isSafeInteger(vector[key]));}
  }
  const costs=json(Buffer.from(docket.files['08_cost_ledgers/costs.json']));
  assert.deepEqual(costs.receiverInspectionByRoute['jobs-agialpha'],vector,'Admitted raw receiver costs differ from the same docket');
  assert.equal(costs.currenciesCombined,false);assert.equal(costs.totalComplete,false);
  const controls=primary?['duplicateRejectedWithoutChangingHistory']:['rejectedNotExported','inconclusiveNotExported','acceptedPredecessorPreserved','strongerSuccessorPreserved','duplicateRejectedWithoutChangingHistory'];
  for(const key of controls)assert.equal(report.negativeControls[key],true);
  return {workspaceHead:previous,receiptCount:records.length,costs:vector};
}
function publicationRecord(record, {source,selection,alpha,selectorSha256,raw}) {
  assert.ok(digest(selectorSha256) && hash(raw)===selectorSha256,'Externally selected publication record bytes differ');
  assert.equal(record.schema,'agijobsv0/discovery-installed-publication-review/v1');
  assert.equal(record.profile,'jobs-discovery-installed-v1'); assert.equal(record.releaseVersion,VERSION); assert.equal(record.tag,TAG);
  assert.equal(record.versionReservation,'OWNER_DESIGNATED'); assert.equal(record.publicationApproved,true);
  assert.deepEqual(record.source,{commit:source.sourceCommit,tree:source.sourceTree});
  assert.deepEqual(record.selection,selection); assert.deepEqual(record.alpha,alpha);
  assert.ok(identity(record.prerequisite?.commit) && identity(record.prerequisite?.tree));
  assert.equal(record.prerequisite?.releaseTag,'source-v2.1.0-rc.17');
  assert.ok(Array.isArray(record.reviewReferences) && record.reviewReferences.length>0 && record.reviewReferences.every(item=>
    /^https:\/\/github\.com\/MontrealAI\/AGIJobsv0\/pull\/[1-9][0-9]*#(?:issuecomment-|discussion_r|pullrequestreview-)[1-9][0-9]*$/.test(item)));
  for (const language of ['javascript','python','installedPython']) assert.ok(record.scannerReviews?.[language], 'Fresh case-specific '+language+' review is pending');
  assert.ok(record.alphaQualification,'Actual qualified public Alpha release evidence is required before publication');
  assert.equal(record.qualityDisposition?.status,'CASE_SPECIFIC_REVIEW_COMPLETE');
  assert.ok(Array.isArray(record.qualityDisposition.cases));
  // Fresh raw archive comparison below determines result count; no old accepted slot is replaced.
  return record;
}
function scannerReview(members, review, {source,language,git,producerRun}) {
  assert.equal(review.sourceCommit,source.sourceCommit); assert.equal(review.tree,source.sourceTree);
  const name = language==='javascript'?'javascript.sarif':'python.sarif';
  const document=json(one(members,name));assert.equal(document.version,'2.1.0');assert.equal(document.runs?.length,1);
  const run=document.runs[0];assert.equal(run.tool?.driver?.name,'CodeQL');
  const metadata=require('./source-scanner-review-bindings-rc16.cjs');
  metadata.assertNoScannerErrorDiagnostics(run.invocations);
  assert.ok(run.invocations?.length>0 && run.invocations.every(item=>item.executionSuccessful===true));
  assert.ok(run.invocations.some(item=>item.toolExecutionNotifications?.some(note=>note.descriptor?.id==='codeql-action/overlay-disabled')));
  assert.deepEqual(review.toolComponents,[run.tool.driver,...(run.tool.extensions||[])]);
  assert.deepEqual(review.codeqlConfigSummary,run.properties?.codeqlConfigSummary);
  assert.deepEqual(Object.keys(review.rawRecords).sort(),[...members.keys()].sort(),'Complete original scanner archive inventory is required');
  for(const [name,digestValue] of Object.entries(review.rawRecords)) assert.equal(hash(one(members,name)),digestValue);
  assert.ok(Object.hasOwn(review.rawRecords,name),'Original SARIF raw hash is mandatory');
  const sourceBefore=json(one(members,'source-scope-before.json')),sourceAfter=json(one(members,'source-scope-after.json'));
  assert.deepEqual(sourceBefore,sourceAfter);assert.equal(sourceBefore.source,source.sourceCommit);assert.equal(sourceBefore.tree,source.sourceTree);
  assert.equal(sourceBefore.run,producerRun.id);assert.equal(sourceBefore.attempt,producerRun.run_attempt);
  assert.equal(sourceBefore.event,'push');assert.equal(sourceBefore.ref,'refs/heads/main');
  assert.ok((language==='javascript'?['agijobsv0/codeql-scope/2']:['agijobsv0/codeql-python-scope/1','agijobsv0/codeql-installed-python-scope/1']).includes(sourceBefore.schema));
  const extracted=[...new Set(run.invocations.flatMap(item=>(item.toolExecutionNotifications||[])
    .filter(note=>note.descriptor?.id===(language==='javascript'?'js':'py')+'/diagnostics/successfully-extracted-files')
    .flatMap(note=>(note.locations||[]).map(location=>location.physicalLocation?.artifactLocation?.uri))))].sort();
  const additional=language==='javascript'?['scripts/release/discovery-installed-qualification.cjs',
    'scripts/release/publish-discovery-installed.cjs','scripts/release/discovery-installed-release-dispatch.cjs',
    'scripts/release/capture-discovery-browser-input.cjs','tools/security/discovery-installed-protected-scope.mjs',
    'tools/security/validate-codeql-remediation.mjs']:[];
  const required=[...new Set([...sourceBefore.requiredExtractedFiles,...additional])].sort();
  assert.deepEqual(review.requiredExtractedFiles,required,'Complete inherited and additional installed extraction inventory differs');
  assert.equal(review.configSha256,sourceBefore.configSha256);
  const configPath=language==='javascript'?'.github/codeql/config-integrations.yml':sourceBefore.configPath;
  const workflowPath=producerRun.path;
  assert.ok(['.github/codeql/config-integrations.yml','.github/codeql/config-python-integrations.yml',
    '.github/codeql/config-discovery-installed-python.yml'].includes(configPath));
  assert.equal(hash(git('show',source.sourceCommit+':'+configPath)),review.configSha256);
  assert.equal(hash(git('show',source.sourceCommit+':'+workflowPath)),review.workflowSha256);
  if(Object.hasOwn(sourceBefore,'workflowSha256'))assert.equal(review.workflowSha256,sourceBefore.workflowSha256);
  assert.deepEqual(review.extractedFiles,extracted); assert.ok(extracted.length>0 && required.length>0);
  assert.ok(required.every(name=>extracted.includes(name)),'Actual scanner omitted required installed or inherited source');
  const results=run.results||[];assert.equal(review.results.length,results.length);
  const extraction=json(one(members,'source-extraction.json'));
  assert.equal(extraction.source,source.sourceCommit);assert.equal(extraction.tree,source.sourceTree);
  assert.equal(extraction.run,producerRun.id);assert.equal(extraction.attempt,producerRun.run_attempt);
  assert.equal(extraction.sarifSha256,hash(one(members,name)));assert.equal(extraction.rawResultCount,results.length);
  assert.deepEqual(extraction.successfulExtractionFiles,extracted);assert.deepEqual(extraction.requiredExtractedFiles,sourceBefore.requiredExtractedFiles);
  assert.deepEqual(extraction.missingRequiredExtractedFiles,[]);
  const seen=new Set();
  for(const item of review.results) {
    assert.ok(Number.isSafeInteger(item.rawResultIndex)&&item.rawResultIndex>=0&&item.rawResultIndex<results.length);
    assert.ok(!seen.has(item.rawResultIndex));seen.add(item.rawResultIndex);
    const raw=results[item.rawResultIndex];assert.equal(hash(canonical(raw)),item.resultSha256);
    const location=raw.locations?.[0]?.physicalLocation;
    assert.equal(item.ruleId,raw.ruleId);assert.equal(item.path,location?.artifactLocation?.uri);assert.deepEqual(item.region,location?.region);
    assert.ok(typeof item.justification==='string' && item.justification.trim().length>=20);
    assert.ok(Array.isArray(item.regressionEvidence) && item.regressionEvidence.length>0);
    if(item.disposition==='Acknowledged nonsecurity quality') {
      assert.equal(language,'javascript');const quality=metadata.validateJavascriptQualityMetadata(item,source.sourceCommit,git);
      assert.ok(!Object.hasOwn(raw,'ruleIndex'));fields(raw.rule,['id','index','toolComponent'],'Actual quality rule reference differs');assert.equal(raw.rule.id,item.ruleId);
      fields(raw.rule.toolComponent,['index'],'Actual quality query reference differs');
      assert.ok(Number.isSafeInteger(raw.rule.index)&&raw.rule.index>=0&&Number.isSafeInteger(raw.rule.toolComponent.index)&&raw.rule.toolComponent.index>=0);
      const component=run.tool.extensions?.[raw.rule.toolComponent.index],rule=component?.rules?.[raw.rule.index];
      assert.equal(component?.name,'codeql/javascript-queries');assert.ok(component.semanticVersion);
      assert.equal(rule?.id,item.ruleId);assert.equal(rule.name,item.ruleId);assert.equal(rule.properties?.id,item.ruleId);
      assert.equal(rule.properties.kind,'problem');
      assert.ok(['quality','maintainability','useless-code'].every(tag=>rule.properties.tags?.includes(tag)));
      assert.ok(!rule.properties.tags.some(tag=>/^security(?:\/|$)/i.test(tag))&&!Object.hasOwn(rule.properties,'security-severity'));
      assert.equal(hash(canonical(rule)),quality.ruleMetadataSha256);assert.equal(hash(canonical(component)),quality.queryComponentSha256);
      assert.equal(hash(canonical(run.properties.codeqlConfigSummary)),quality.codeqlConfigSummarySha256);
    } else assert.equal(item.disposition,'Demonstrably false positive');
  }
  return {language,results:results.length,extracted:extracted.length,archiveRawRecords:review.rawRecords};
}
async function pages(api, route, key) {
  const items=[],seen=new Set();let total;
  for(let page=1;page<=20;page++) {
    const value=await api(route+(route.includes('?')?'&':'?')+'per_page=100&page='+page);
    assert.ok(Array.isArray(value[key]) && Number.isSafeInteger(value.total_count) && value.total_count>=0 && value.total_count<=2000);
    if(total===undefined)total=value.total_count;assert.equal(total,value.total_count);
    for(const item of value[key]) {assert.ok(positive(item.id)&&!seen.has(item.id),'Duplicate or malformed hosted identity');seen.add(item.id);items.push(item);}
    if(value[key].length<100) {assert.equal(items.length,value.total_count,'Incomplete original API inventory');return items;}
  }
  throw Error('Hosted inventory exceeds its bounded pagination');
}
function liveApi(token,repository=REPOSITORY) {
  assert.ok([REPOSITORY,ALPHA_REPOSITORY].includes(repository));
  if(repository===REPOSITORY)assert.ok(token,'Existing workflow token is required');
  return async route=>{
    assert.ok(/^[A-Za-z0-9_./?=&-]+$/.test(route) && !route.startsWith('/'));
    const response=await fetch('https://api.github.com/repos/'+repository+'/'+route,
      {headers:{Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{}),'X-GitHub-Api-Version':'2022-11-28'},
        redirect:'error',signal:AbortSignal.timeout(30_000)});
    assert.ok(response.ok,'Hosted metadata read failed: GET repos/'+repository+'/'+route+' HTTP '+response.status+
      ' (authentication='+(token?'existing-workflow-token':'anonymous')+')');
    const chunks=[];let size=0;const reader=response.body.getReader();
    try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;assert.ok(size<=32_000_000);chunks.push(Buffer.from(item.value));}}
    finally{await reader.cancel();}return json(Buffer.concat(chunks));
  };
}
function alphaMetadataApi(token) {
  assert.ok(typeof token==='string'&&token,'Existing workflow token is required for Alpha metadata');
  const read=liveApi(token,ALPHA_REPOSITORY);
  return route=>{
    assert.ok(typeof route==='string'&&/^[A-Za-z0-9_./?=&-]+$/.test(route)&&!route.startsWith('/')&&
      !route.includes('..')&&!route.includes('/zip')&&
      !route.startsWith('git/blobs/')&&!route.startsWith('contents/'),
    'Alpha metadata cannot select body-byte or archive transport');
    return read(route);
  };
}
async function download(route,options={}) {return downloadBytes(route,options,false);}
async function downloadReleaseAsset(assetId,options={}) {
  assert.ok(positive(assetId),'An exact positive release asset ID is required');
  return downloadBytes('releases/assets/'+assetId,options,true);
}
async function downloadBytes(route,{fetcher=fetch,token=process.env.GH_TOKEN}={},releaseAsset=false) {
  assert.ok((releaseAsset?/^releases\/assets\/[1-9][0-9]*$/:/^actions\/(?:artifacts\/[1-9][0-9]*\/zip|jobs\/[1-9][0-9]*\/logs)$/).test(route));
  assert.equal(typeof fetcher,'function');assert.ok(typeof token==='string'&&token,'Existing workflow token is required');
  const phase=label=>releaseAsset?'Release asset GET repos/'+REPOSITORY+'/'+route+' '+label:'Actions byte download '+label;
  const cancel=async body=>{if(body)try{await body.cancel();}catch{throw Error(phase('cleanup failed'));}};
  const signal=AbortSignal.timeout(60_000);let url='https://api.github.com/repos/'+REPOSITORY+'/'+route,response;
  for(let redirects=0;redirects<=4;redirects++) {
    // Preserve original bytes as data in memory; never send log/ZIP bodies to a terminal or pager.
    assert.ok(!/[\\\x00-\x20\x7f#]/.test(url),'Actions download URL syntax is invalid');
    const authority=/^https:\/\/([^/?#]+)/.exec(url)?.[1];
    assert.ok(authority&&!/[%@]/.test(authority),'Actions download authority is invalid');
    const parsed=new URL(url);assert.equal(parsed.protocol,'https:');
    assert.equal(parsed.username,'');assert.equal(parsed.password,'');assert.equal(parsed.port,'');
    assert.ok(redirects===0?parsed.hostname==='api.github.com':releaseAsset?
      ['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname):
      parsed.hostname==='results-receiver.actions.githubusercontent.com'||/^[a-z0-9][a-z0-9-]*\.blob\.core\.windows\.net$/.test(parsed.hostname),
      'Actions download redirect left approved storage');
    const headers={Accept:redirects===0&&!releaseAsset?'application/vnd.github+json':'application/octet-stream','Accept-Encoding':'identity',
      ...(redirects===0?{Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}:{})};
    try {response=await fetcher(url,{method:'GET',redirect:'manual',signal,headers});}
    catch {throw Error(phase('request failed'));}
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');await cancel(response.body);
      assert.ok(location&&redirects<4,'Actions download redirect is absent or excessive');
      assert.ok(/^https:\/\//.test(location),'Actions download redirect must be absolute HTTPS');url=location;continue;
    }
    if(response.status!==200) {await cancel(response.body);throw Error(releaseAsset?
      'Release asset GET repos/'+REPOSITORY+'/'+route+' HTTP '+response.status:'Actions byte download did not return HTTP200');}break;
  }
  let reader,size=0;const chunks=[];
  try {
    const length=response.headers.get('content-length');
    if(length!==null) {assert.match(length,/^(0|[1-9][0-9]*)$/);assert.ok(Number(length)<=64_000_000,'Actions byte download exceeds existing bound');}
    const encoding=response.headers.get('content-encoding');assert.ok(encoding===null||encoding==='identity','Actions byte download was content-encoded');
    assert.ok(response.body,'Actions byte download body is absent');reader=response.body.getReader();
    while(true) {let item;try{item=await reader.read();}catch{throw Error(phase('stream failed'));}if(item.done)break;size+=item.value.byteLength;
      assert.ok(size<=64_000_000,'Actions byte download exceeds existing bound');chunks.push(Buffer.from(item.value));}
    if(length!==null)assert.equal(size,Number(length),'Actions byte download is truncated');
    return Buffer.concat(chunks);
  } finally {await cancel(reader||response.body);}
}
async function verifyBrowserInput(api,browser,alpha,pin,binding,rawBody) {
  const capture=require('./capture-discovery-browser-input.cjs');
  const selected=pin;assert.ok(selected&&binding,'Source-selected reviewed Alpha and common packet binding are required');
  assert.equal(selected.commit,alpha.commit);assert.equal(selected.tree,alpha.tree);assert.equal(selected.sourceHash,alpha.sourceHash);
  const authenticated=await capture.authenticate(binding,selected,api,rawBody);
  assert.ok(browser.packet instanceof Map);assert.deepEqual([...browser.packet.keys()].sort(),capture.PACKET);
  for(const name of capture.PACKET)assert.ok(one(browser.packet,name).equals(one(authenticated.packet,name)),
    'Retained common browser packet member differs from authenticated public Git bytes: '+name);
  assert.ok(browser.workspace.equals(authenticated.workspace),'Primary Jobs workspace alias differs from original common UI export');
  assert.ok(browser.request.equals(authenticated.request),'Primary Jobs request alias differs from original common UI export');
  return authenticated.observation;
}
const ALPHA_ASSET_MAX_BYTES=2**31-1; // Existing upstream GitHub release-host boundary; large assets are streamed.
const ALPHA_METADATA_MAX_BYTES=64*1024*1024; // Existing upstream release-pack manifest bound.
function publicAlphaJson(raw) {
  assert.ok(Buffer.isBuffer(raw)&&raw.length<=ALPHA_METADATA_MAX_BYTES);
  // Upstream Python JSON may use escaped Unicode. Reject duplicate decoded keys
  // without requiring another language's spelling or changing original hashes.
  const script=`import sys,json
raw=sys.stdin.buffer.read(67108865);assert len(raw)<=67108864
def unique(pairs):
 out={}
 for k,v in pairs:
  if k in out:raise ValueError('Duplicate public Alpha JSON field')
  out[k]=v
 return out
def invalid(value):raise ValueError('Invalid public Alpha JSON constant')
value=json.loads(raw.decode('utf-8'),object_pairs_hook=unique,parse_constant=invalid)
print(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False))
`;
  return JSON.parse(execFileSync('python3',['-I','-c',script],{input:raw,stdio:['pipe','pipe','pipe'],timeout:15_000,
    maxBuffer:ALPHA_METADATA_MAX_BYTES+1_000_000}).toString('utf8'));
}
function alphaPublicAssetIdentity(asset,tag) {
  assert.ok(positive(asset?.id));assert.ok(/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(asset.name));
  assert.ok(Number.isSafeInteger(asset.size)&&asset.size>=0&&asset.size<=ALPHA_ASSET_MAX_BYTES);
  assert.equal(asset.state,'uploaded');assert.match(asset.digest||'',/^sha256:[a-f0-9]{64}$/);
  const expected='https://github.com/'+ALPHA_REPOSITORY+'/releases/download/'+encodeURIComponent(tag)+'/'+encodeURIComponent(asset.name);
  assert.equal(asset.browser_download_url,expected,'Public Alpha asset URL differs from selected release');
  return {id:asset.id,name:asset.name,size:asset.size,digest:asset.digest,url:expected};
}
async function alphaPublicAssetInventory(api,id,tag) {
  const assets=[];
  for(let page=1;page<=20;page++) {
    const rows=await api('releases/'+id+'/assets?per_page=100&page='+page);
    assert.ok(Array.isArray(rows)&&rows.length<=100,'Complete public Alpha asset page required');
    assets.push(...rows.map(asset=>alphaPublicAssetIdentity(asset,tag)));
    if(rows.length<100) {
      assert.ok(assets.length>0);
      assert.equal(new Set(assets.map(asset=>asset.id)).size,assets.length,'Duplicate public Alpha asset identity');
      assert.equal(new Set(assets.map(asset=>asset.name)).size,assets.length,'Duplicate public Alpha asset name');
      return assets.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    }
  }
  throw Error('Public Alpha asset inventory exceeds bounded pagination');
}
async function readPublicAlphaAsset(asset,{keep=false,fileDescriptor,fetcher=fetch}={}) {
  assert.equal(typeof fetcher,'function');
  if(fileDescriptor!==undefined)assert.ok(Number.isSafeInteger(fileDescriptor)&&fileDescriptor>=0&&!keep);
  if(keep)assert.ok(asset.size<=ALPHA_METADATA_MAX_BYTES,'Public Alpha metadata exceeds supported manifest bound');
  let url=asset.url,response;
  for(let redirects=0;redirects<=4;redirects++) {
    const parsed=new URL(url);
    assert.equal(parsed.protocol,'https:');assert.equal(parsed.username,'');assert.equal(parsed.password,'');assert.equal(parsed.port,'');
    assert.ok(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname),
      'Public Alpha asset redirect left GitHub release hosting');
    response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(180_000),
      headers:{Accept:'application/octet-stream','Accept-Encoding':'identity'}});
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');if(response.body)await response.body.cancel();
      assert.ok(location&&redirects<4,'Public Alpha asset redirect is absent or excessive');
      url=new URL(location,url).href;continue;
    }
    if(response.status!==200) {if(response.body)await response.body.cancel();
      assert.fail('Public Alpha asset download did not return HTTP200');}break;
  }
  let reader;const hasher=crypto.createHash('sha256'),chunks=[];let bytes=0;
  try {
    const length=response.headers.get('content-length');
    if(length!==null) {assert.match(length,/^(0|[1-9][0-9]*)$/);assert.equal(Number(length),asset.size,'Public Alpha Content-Length differs');}
    const encoding=response.headers.get('content-encoding');assert.ok(encoding===null||encoding==='identity','Public Alpha asset was content-encoded');
    assert.ok(response.body,'Public Alpha asset body is absent');reader=response.body.getReader();
    while(true) {
      const item=await reader.read();if(item.done)break;
      bytes+=item.value.byteLength;assert.ok(bytes<=asset.size,'Public Alpha asset exceeded exact declared size');
      hasher.update(item.value);if(keep)chunks.push(Buffer.from(item.value));
      if(fileDescriptor!==undefined)for(let offset=0;offset<item.value.byteLength;) {
        const written=fs.writeSync(fileDescriptor,item.value,offset,item.value.byteLength-offset);
        assert.ok(written>0,'Private public-asset file write made no progress');offset+=written;
      }
    }
  } finally {if(reader)await reader.cancel();else if(response.body)await response.body.cancel();}
  assert.equal(bytes,asset.size,'Public Alpha asset is truncated');
  const sha256=hasher.digest('hex');assert.equal('sha256:'+sha256,asset.digest,'Public Alpha asset digest differs');
  return {id:asset.id,name:asset.name,bytes,sha256,publicUrl:asset.url,httpStatus:200,
    authorizationHeaderSent:false,...(keep?{raw:Buffer.concat(chunks)}:{})};
}
function alphaOperatorMembers(descriptor,asset,sourcePaths) {
  // This owned parser treats a held private ZIP as data. It reads only the selected
  // catalog/source-map/41 raw inputs, with their existing installed-source bounds.
  const selected=['capability/source-map.json','capability/docs/successor/capabilities/sources.json',
    ...sourcePaths.map(name=>'capability/'+name)];
  const script=`import sys,os,stat,hashlib,zipfile,json,base64
f=os.fdopen(os.dup(0),'rb');before=os.fstat(f.fileno());assert stat.S_ISREG(before.st_mode)
assert before.st_size==int(sys.argv[1]);f.seek(0);h=hashlib.sha256()
while True:
 b=f.read(1048576)
 if not b:break
 h.update(b)
assert h.hexdigest()==sys.argv[2];f.seek(0);z=zipfile.ZipFile(f);items=z.infolist();assert len(items)<=200000
seen=set();members={};total=0
for i in items:
 n=i.filename;assert n and not n.startswith('/') and '\\\\' not in n and ':' not in n
 assert all(p not in ('','.','..') for p in n.rstrip('/').split('/')) and not any(ord(c)<32 or ord(c)==127 for c in n)
 assert n not in seen;seen.add(n);assert not i.flag_bits&1
 assert stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG,stat.S_IFDIR) and not stat.S_ISLNK(i.external_attr>>16)
 if i.is_dir():continue
 total+=i.file_size;assert total<=20000000000;members[n]=i
out={};selected=json.loads(sys.argv[3]);assert len(selected)==len(set(selected))
for n in selected:
 i=members[n];assert i.file_size<=2000000
 b=z.read(i);assert len(b)==i.file_size;out[n]=base64.b64encode(b).decode()
assert sum(members[n].file_size for n in selected)<=16000000
after=os.fstat(f.fileno())
assert all(getattr(before,k)==getattr(after,k) for k in ('st_dev','st_ino','st_mode','st_size','st_mtime_ns','st_ctime_ns'))
print(json.dumps(out,separators=(',',':')))
`;
  const output=json(execFileSync('python3',['-I','-c',script,String(asset.size),asset.digest.slice(7),JSON.stringify(selected)],
    {stdio:[descriptor,'pipe','pipe'],timeout:90_000,maxBuffer:24_000_000}));
  assert.deepEqual(Object.keys(output).sort(),selected.sort());
  return new Map(Object.entries(output).map(([name,raw])=>[name,Buffer.from(raw,'base64')]));
}
// Reviewed release output profile for the selected source. Unknown source remains unaccepted.
const ALPHA_REVIEWED_RELEASE_SOURCE={commit:'61532fb82621a065e668fd11e57289dcfb65c67b',
  tree:'7814d1bd9dcd3845b349590e0bcac57ba93b3167',version:'1.38.0'};
function alphaProfileFields(value,names,label) {
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),label);
  assert.deepEqual(Object.keys(value).sort(),[...names].sort(),label);
}
function alphaProfileSha(value) {return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
function reviewedAlphaReleaseProfile(alpha,version) {
  assert.equal(alpha.commit,ALPHA_REVIEWED_RELEASE_SOURCE.commit,'Alpha source requires a reviewed public release profile');
  assert.equal(alpha.tree,ALPHA_REVIEWED_RELEASE_SOURCE.tree,'Alpha tree requires a reviewed public release profile');
  assert.equal(version,ALPHA_REVIEWED_RELEASE_SOURCE.version,'Public Alpha version differs from reviewed source profile');
  const prefix='alpha-agent-v'+version;
  return {...ALPHA_REVIEWED_RELEASE_SOURCE,requiredNames:[
    'AGI_ALPHA_Unified_Publication_Final.md',
    'AGI_ALPHA_Unified_Publication_Final.pdf',
    'ASCENSION_CYCLE.md',
    'ASCENSION_CYCLE_ENGINEERING.md',
    'ASCENSION_CYCLE_HANDOFF.md',
    'ASCENSION_PROTOCOL.md',
    'ASCENSION_STACK_RELEASE.md',
    'BUSINESS3.md',
    'CAPABILITIES.md',
    'CAPABILITY_WORKSPACE.md',
    'COMPOUNDING_LAB.md',
    'CURRENT_MAINNET_DEPLOYMENT.md',
    'CURRICULUM_LAB.md',
    'DECISION_STUDIO.md',
    'DEMOS.md',
    'DEMO_AUDIT_2026-10-01.md',
    'DEMO_VALIDATION.md',
    'DISCOVERY.md',
    'DISCOVERY_LAB_CONTINUATION_2026-10-21.md',
    'DISCOVERY_LAB_DEPLOYMENT_COMPATIBILITY.json',
    'DISCOVERY_LAB_DEPLOYMENT_COMPATIBILITY.md',
    'DISCOVERY_LAB_EVIDENCE_DOCKET.md',
    'DISCOVERY_LAB_FOUNDATION_REPRODUCTION.json',
    'DISCOVERY_LAB_FUTURE_PROTOCOL.md',
    'DISCOVERY_LAB_MODEL_REVIEW.json',
    'DISCOVERY_LAB_PAPER_TO_CODE.md',
    'DISCOVERY_LAB_README.md',
    'DISCOVERY_LAB_REAL_TASK_ADAPTER.md',
    'DISCOVERY_LAB_RELEASE_NOTES.md',
    'DISCOVERY_LAB_SOURCES.json',
    'DISCOVERY_LAB_SPECIFICATION.md',
    'ECOSYSTEM_ADAPTERS.md',
    'EXPERIENCE.md',
    'FACTORY_GUIDE.md',
    'GOVERNANCE.md',
    'INSIGHT_ATLAS.md',
    'MAINNET_DEPLOYMENT.md',
    'MAINNET_READINESS.md',
    'MANUSCRIPT_ALIGNMENT.md',
    'MARK_WALLET.md',
    'MATS.md',
    'MUZERO.md',
    'NATIVE_BUDGET_RESERVATIONS.md',
    'NOVA_SEED_STUDIO.md',
    'NOVA_SEED_STUDIO_ENGINEERING.md',
    'ONBOARDING.md',
    'OPERATIONS.md',
    'OUT_EXECUTE.md',
    'PAGES_GUIDE.md',
    'PAPER_UPLOADS.md',
    'PROOF_BLOOM.md',
    'RELEASE_NOTES_1.38.0.md',
    'RELEASE_READINESS.md',
    'REPOSITORY_GUIDE.md',
    'SHA256SUMS',
    'START_HERE.md',
    'SUCCESSOR.md',
    'SUCCESSOR_ACCEPTANCE.md',
    'SUCCESSOR_ALPHA.md',
    'SUCCESSOR_ALPHA_CONTINUITY.md',
    'SUCCESSOR_ALPHA_DEPLOYMENT.md',
    'SUCCESSOR_ARCHITECTURE.md',
    'SUCCESSOR_ASCENSION.md',
    'SUCCESSOR_COMPUTER_USE.md',
    'SUCCESSOR_OPERATIONS.md',
    'SUCCESSOR_PACKAGING.md',
    'SUCCESSOR_SOURCES.json',
    'SUPPLIER_BROWSER_ADAPTER.md',
    'TRANSFORMATIONAL_DISCOVERY.md',
    'TRANSFORMATIONAL_IMPLEMENTATION.md',
    'TRANSFORMATIONAL_LOCAL_MODEL.md',
    'TRANSFORMATIONAL_MATH.md',
    'TRANSFORMATIONAL_POLICY_STUDY.md',
    'TRANSFORMATIONAL_PUBLIC_PILOT.md',
    'TRANSFORMATIONAL_SOURCE_AUDIT.md',
    'VALIDATION.md',
    'WHITEPAPER_IMPLEMENTATION.md',
    'alpha-agent-v1.38.0-mainnet-record.zip',
    'alpha-agent-v1.38.0-manuscript.zip',
    'alpha-agent-v1.38.0-operator-guide.zip',
    'alpha-agent-v1.38.0-public-validation-packs.json',
    'alpha-agent-v1.38.0-source.zip',
    'alpha-agent-v1.38.0-validation.zip',
    'alpha_factory_v1-1.38.0-py3-none-any.whl',
    'alpha_factory_v1-1.38.0.tar.gz',
    'browser-packs.json',
    'computer-use-study-report-pack.zip',
    'ethereum-mainnet-2026-10-18.json',
    'install_agent.py',
    'release-manifest.json',
    'release_packs.py',
    'requirements-agent.lock',
    'site-packs.json',
    'source-manifest.json',
    'successor-alpha-workspace.html',
    'successor-preservation.json',
    'transformational-intelligence-workspace.html'],
    packManifests:[{name:'browser-packs.json',prefix:'browser',distribution:'browser'},
      {name:'site-packs.json',prefix:'site',distribution:'site'},
      {name:prefix+'-public-validation-packs.json',prefix:prefix+'-public-validation',distribution:null}]};
}
function verifyAlphaProfileInventory(profile,assets) {
  assert.ok(Array.isArray(assets));const names=new Set();
  for(const asset of assets) {
    assert.ok(asset&&typeof asset.name==='string'&&!names.has(asset.name),'Duplicate profile asset');
    names.add(asset.name);
  }
  assert.equal(assets.filter(asset=>asset.name.startsWith('alpha_factory_v1-'+profile.version+'-')&&asset.name.endsWith('.whl')).length,1,
    'One version-bound reviewed public Alpha wheel is required');
  for(const name of profile.requiredNames)assert.ok(names.has(name),'Required reviewed public Alpha profile asset is absent: '+name);
  return true;
}
function verifyAlphaProfilePacks(profile,manifest,receipts,packManifests) {
  assert.ok(Array.isArray(receipts));const actual=new Map();
  for(const row of receipts) {
    assert.ok(row&&typeof row.name==='string'&&!actual.has(row.name)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&alphaProfileSha(row.sha256),
      'Malformed or duplicate observed public Alpha asset');
    actual.set(row.name,row);
  }
  verifyAlphaProfileInventory(profile,receipts);
  const controls=[];
  for(const selected of profile.packManifests) {
    const value=packManifests[selected.name];
    alphaProfileFields(value,['schema','commit','version','max_asset_bytes','total_bytes','packs','files'],'Public Alpha pack manifest fields differ');
    assert.equal(value.schema,'agialpha.release-packs.v1');assert.equal(value.commit,profile.commit);assert.equal(value.version,profile.version);
    assert.ok(Number.isSafeInteger(value.max_asset_bytes)&&value.max_asset_bytes>0&&value.max_asset_bytes<=2**31-1);
    assert.ok(Number.isSafeInteger(value.total_bytes)&&value.total_bytes>0,'Public Alpha logical byte total is invalid');
    assert.ok(Array.isArray(value.files)&&value.files.length>0&&Array.isArray(value.packs)&&value.packs.length>0,
      'Required public Alpha distribution has no files or packs');
    const names=new Set();
    for(const[index,row]of value.packs.entries()) {
      alphaProfileFields(row,['name','group','bytes','sha256'],'Public Alpha pack row fields differ');
      assert.ok(['core','models','media','research'].includes(row.group));
      assert.equal(row.name,selected.prefix+'-'+row.group+'-'+String(index+1).padStart(3,'0')+'.zip','Public Alpha pack left its reviewed profile');
      assert.ok(!names.has(row.name),'Duplicate public Alpha pack');names.add(row.name);
      assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=value.max_asset_bytes&&alphaProfileSha(row.sha256));
      const observed=actual.get(row.name);assert.ok(observed,'Declared reviewed public Alpha pack is absent: '+row.name);
      assert.equal(observed.bytes,row.bytes,'Public Alpha pack byte count differs');assert.equal(observed.sha256,row.sha256,'Public Alpha pack digest differs');
    }
    if(selected.distribution) {
      const declaration=manifest.distributions?.[selected.distribution];
      alphaProfileFields(declaration,['manifest','files','packs'],'Public Alpha distribution declaration differs');
      assert.equal(declaration.manifest,selected.name);assert.equal(declaration.files,value.files.length);assert.equal(declaration.packs,value.packs.length);
    }
    const observed=actual.get(selected.name);assert.ok(observed);
    controls.push({name:selected.name,bytes:observed.bytes,sha256:observed.sha256,files:value.files.length,packs:value.packs.length,
      logicalBytes:value.total_bytes});
  }
  const evidence=manifest.validation_evidence;
  alphaProfileFields(evidence,['schema','commit','version','local','public'],'Public Alpha validation evidence fields differ');
  assert.equal(evidence.schema,'agialpha.validation-evidence.v1');assert.equal(evidence.commit,profile.commit);assert.equal(evidence.version,profile.version);
  alphaProfileFields(evidence.local,['name','bytes','sha256'],'Public Alpha local validation declaration differs');
  const localName='alpha-agent-v'+profile.version+'-validation.zip',local=actual.get(localName);assert.ok(local);
  assert.equal(evidence.local.name,localName);assert.equal(evidence.local.bytes,local.bytes);assert.equal(evidence.local.sha256,local.sha256);
  alphaProfileFields(evidence.public,['manifest','bytes','sha256','files','packs'],'Public Alpha packed validation declaration differs');
  const validation=controls.find(row=>row.name==='alpha-agent-v'+profile.version+'-public-validation-packs.json');assert.ok(validation);
  assert.equal(evidence.public.manifest,validation.name);assert.equal(evidence.public.bytes,validation.bytes);assert.equal(evidence.public.sha256,validation.sha256);
  assert.equal(evidence.public.files,validation.files);assert.equal(evidence.public.packs,validation.packs);
  return {sourceCommit:profile.commit,sourceTree:profile.tree,version:profile.version,requiredAssetsVerified:true,
    packManifests:controls,validationEvidence:{local:{name:localName,bytes:local.bytes,sha256:local.sha256},
      public:{manifest:validation.name,bytes:validation.bytes,sha256:validation.sha256,files:validation.files,packs:validation.packs}}};
}
async function alphaReleaseAttemptJobs(api,qualification,alpha) {
  for(const key of ['runId','runAttempt'])assert.ok(Number.isSafeInteger(qualification[key])&&qualification[key]>0);
  assert.match(alpha.commit,/^[a-f0-9]{40}$/);
  const inventory=[],jobs=[],seen=new Set();let total,metadataBytes=0;
  for(let page=1;;page++) {
    assert.ok(Number.isSafeInteger(page));
    const value=await api('actions/runs/'+qualification.runId+'/attempts/'+qualification.runAttempt+'/jobs?per_page=100&page='+page);
    assert.ok(value&&Array.isArray(value.jobs)&&value.jobs.length<=100&&Number.isSafeInteger(value.total_count)&&value.total_count>=0,
      'Complete selected Alpha attempt job page required');
    if(total===undefined)total=value.total_count;else assert.equal(value.total_count,total,'Selected Alpha attempt job total changed');
    metadataBytes+=Buffer.byteLength(JSON.stringify(value));assert.ok(metadataBytes<=64*1024*1024,'Selected Alpha job metadata exceeds bound');
    inventory.push(structuredClone(value));
    for(const job of value.jobs) {
      assert.ok(Number.isSafeInteger(job?.id)&&job.id>0&&!seen.has(job.id),'Duplicate or invalid selected Alpha job id');
      seen.add(job.id);jobs.push(job);assert.ok(jobs.length<=total,'Selected Alpha attempt job inventory exceeds declared total');
    }
    if(value.jobs.length===0){assert.equal(jobs.length,total,'Selected Alpha attempt job inventory is incomplete');break;}
  }
  const requiredJobs=[];
  for(const name of ['package','pages','publish']) {
    const selected=jobs.filter(job=>job.name===name);assert.equal(selected.length,1,'Actual full Alpha release job missing or ambiguous: '+name);
    const job=selected[0];assert.equal(job.run_id,qualification.runId);assert.equal(job.run_attempt,qualification.runAttempt);
    assert.equal(job.head_sha,alpha.commit);assert.equal(job.head_branch,'main','Required Alpha release job branch differs');
    assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
    requiredJobs.push({id:job.id,name,runId:job.run_id,runAttempt:job.run_attempt,headSha:job.head_sha,headBranch:job.head_branch,status:job.status,conclusion:job.conclusion});
  }
  return {schema:'agijobsv0/discovery-alpha-full-release-attempt/v1',runId:qualification.runId,runAttempt:qualification.runAttempt,
    sourceCommit:alpha.commit,completeInventory:true,inventory,requiredJobs};
}
function alphaReleaseJobsLease(before,after) {
  for(const value of [before,after]) {
    assert.equal(value.schema,'agijobsv0/discovery-alpha-full-release-attempt/v1');
    assert.equal(value.completeInventory,true);assert.ok(Array.isArray(value.requiredJobs)&&value.requiredJobs.length===3);
  }
  for(const key of ['runId','runAttempt','sourceCommit'])assert.equal(after[key],before[key],'Actual full Alpha release lease changed: '+key);
  assert.deepEqual(after.requiredJobs,before.requiredJobs,'Actual full Alpha release jobs changed during download');
  return {before,after};
}
async function verifyAlphaPublicAssets(api,release,qualification,alpha,{readAsset=readPublicAlphaAsset,catalogInput}={}) {
  const assets=await alphaPublicAssetInventory(api,release.id,qualification.releaseTag),byName=new Map(assets.map(asset=>[asset.name,asset]));
  for(const asset of release.assets||[])assert.deepEqual(alphaPublicAssetIdentity(asset,qualification.releaseTag),byName.get(asset.name),
    'Release response and complete public Alpha inventory differ');
  const observed=new Map(),metadata=new Map();
  const read=async(name,keep=false,fileDescriptor)=>{
    assert.ok(byName.has(name),'Required public Alpha release asset is absent: '+name);
    const asset=byName.get(name),result=await readAsset(asset,{keep,...(fileDescriptor!==undefined?{fileDescriptor}:{})});
    assert.equal(result.id,asset.id);assert.equal(result.name,asset.name);assert.equal(result.bytes,asset.size);
    assert.equal('sha256:'+result.sha256,asset.digest);assert.equal(result.publicUrl,asset.url);
    assert.equal(result.httpStatus,200);assert.equal(result.authorizationHeaderSent,false);
    if(keep){assert.ok(Buffer.isBuffer(result.raw)&&result.raw.length===asset.size&&result.raw.length<=ALPHA_METADATA_MAX_BYTES);
      assert.equal(hash(result.raw),result.sha256);metadata.set(name,result.raw);}
    const {raw,...receipt}=result;observed.set(name,receipt);return keep?raw:receipt;
  };
  const sumsRaw=await read('SHA256SUMS',true),manifestRaw=await read('release-manifest.json',true);
  const sumsText=sumsRaw.toString('utf8');assert.ok(Buffer.from(sumsText).equals(sumsRaw));
  assert.ok(sumsText.endsWith('\n'),'Complete public Alpha checksum file required');
  const checksums=new Map();
  for(const line of sumsText.slice(0,-1).split('\n')) {
    const match=/^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]{0,255})$/.exec(line);
    assert.ok(match&&!checksums.has(match[2])&&match[2]!=='SHA256SUMS','Malformed or duplicate public Alpha checksum');
    checksums.set(match[2],match[1]);
  }
  assert.deepEqual([...checksums.keys()].sort(),assets.map(asset=>asset.name).filter(name=>name!=='SHA256SUMS').sort(),
    'Public Alpha checksum coverage differs from complete release inventory');
  for(const[name,sha]of checksums)assert.equal(byName.get(name).digest,'sha256:'+sha);
  const manifest=publicAlphaJson(manifestRaw);
  assert.equal(manifest.repository,ALPHA_REPOSITORY);assert.equal(manifest.commit,alpha.commit);
  assert.match(manifest.version||'',/^\d+\.\d+\.\d+$/);assert.equal(qualification.releaseTag,'v'+manifest.version);
  assert.equal(manifest.workflow_run,'https://github.com/'+ALPHA_REPOSITORY+'/actions/runs/'+qualification.runId);
  assert.equal(manifest.maximum_asset_bytes,ALPHA_ASSET_MAX_BYTES);
  for(const[key,expected]of Object.entries({commit:alpha.commit,repository:ALPHA_REPOSITORY,ref:'refs/heads/main',required:true}))
    assert.equal(manifest.historical_ci?.[key],expected,'Public Alpha historical qualification differs: '+key);
  assert.ok(Array.isArray(manifest.assets)&&new Set(manifest.assets.map(asset=>asset.name)).size===manifest.assets.length);
  assert.deepEqual(manifest.assets.map(asset=>asset.name).sort(),assets.map(asset=>asset.name)
    .filter(name=>!['SHA256SUMS','release-manifest.json'].includes(name)).sort(),'Public Alpha manifest inventory is incomplete');
  for(const asset of manifest.assets) {
    assert.equal(asset.bytes,byName.get(asset.name).size);assert.equal('sha256:'+asset.sha256,byName.get(asset.name).digest);
  }
  for(const name of ['requirements-agent.lock','alpha-agent-v'+manifest.version+'-source.zip',
    'alpha_factory_v1-'+manifest.version+'.tar.gz'])assert.ok(byName.has(name),'Required public Alpha software asset is absent: '+name);
  const wheels=assets.filter(asset=>asset.name.startsWith('alpha_factory_v1-'+manifest.version+'-')&&asset.name.endsWith('.whl'));
  assert.equal(wheels.length,1,'One version-bound public Alpha wheel is required');
  assert.deepEqual(Object.keys(manifest.distributions||{}).sort(),['browser','site'],'Complete public Alpha distributions are required');
  const reviewedProfile=reviewedAlphaReleaseProfile(alpha,manifest.version);verifyAlphaProfileInventory(reviewedProfile,assets);
  const operatorName='alpha-agent-v'+manifest.version+'-operator-guide.zip';
  assert.ok(byName.has(operatorName),'Required public Alpha operator guide is absent');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'jobs-public-alpha-'));fs.chmodSync(temporary,0o700);
  let descriptor,operator;
  try {
    descriptor=fs.openSync(path.join(temporary,'operator-guide.zip'),fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    await read(operatorName,false,descriptor);
    const expectedCatalog=publicAlphaJson(catalogInput.raw);
    operator=alphaOperatorMembers(descriptor,byName.get(operatorName),Object.keys(expectedCatalog.sources));
  } finally {if(descriptor!==undefined)fs.closeSync(descriptor);fs.rmSync(temporary,{recursive:true,force:true});}
  const publicCatalogRaw=one(operator,'capability/docs/successor/capabilities/sources.json');
  assert.ok(Buffer.isBuffer(catalogInput?.raw)&&publicCatalogRaw.equals(catalogInput.raw),
    'Public Alpha operator catalog differs from selected authenticated source catalog');
  assert.equal(hash(publicCatalogRaw),catalogInput.sha256);
  const publicCatalog=publicAlphaJson(publicCatalogRaw),sourceMap=publicAlphaJson(one(operator,'capability/source-map.json'));
  assert.equal(sourceMap.schema,'agialpha.capability-operator-guide.v1');
  assert.equal(sourceMap.commit,alpha.commit);assert.equal(sourceMap.version,manifest.version);assert.equal(sourceMap.sourceHash,alpha.sourceHash);
  assert.equal(publicCatalog.sourceHash,alpha.sourceHash);assert.equal(hash(canonical(publicCatalog.sources)),alpha.sourceHash);
  for(const[name,expected]of Object.entries(publicCatalog.sources)) {
    const entry=sourceMap.files?.[name];assert.equal(entry?.archivePath,'capability/'+name);
    assert.equal(entry.sourceSha256,expected);assert.equal(entry.packagedSha256,expected);
    assert.equal(hash(one(operator,entry.archivePath)),expected,'Public Alpha operator source input differs: '+name);
  }
  const distributionNames=reviewedProfile.packManifests.map(item=>item.name);
  for(const name of distributionNames)await read(name,true);
  for(const asset of assets)if(!observed.has(asset.name))await read(asset.name);
  const distributions=[];
  for(const[kind,entry]of Object.entries(manifest.distributions||{})) {
    const distribution=publicAlphaJson(metadata.get(entry.manifest));
    assert.equal(distribution.commit,alpha.commit);assert.equal(distribution.version,manifest.version);
    assert.equal(distribution.schema,'agialpha.release-packs.v1');
    assert.ok(Array.isArray(distribution.packs)&&Array.isArray(distribution.files));
    assert.equal(distribution.packs.length,entry.packs);assert.equal(distribution.files.length,entry.files);
    assert.equal(new Set(distribution.packs.map(pack=>pack.name)).size,distribution.packs.length);
    for(const pack of distribution.packs) {
      assert.equal(observed.get(pack.name)?.bytes,pack.bytes);assert.equal(observed.get(pack.name)?.sha256,pack.sha256);
    }
    distributions.push({kind,manifest:entry.manifest,manifestSha256:hash(metadata.get(entry.manifest)),packs:entry.packs,files:entry.files});
  }
  const reviewedProfileEvidence=verifyAlphaProfilePacks(reviewedProfile,manifest,[...observed.values()],
    Object.fromEntries(reviewedProfile.packManifests.map(item=>[item.name,publicAlphaJson(metadata.get(item.name))])));
  const finalRelease=await api('releases/tags/'+qualification.releaseTag);
  for(const key of ['id','tag_name','draft','prerelease','published_at'])assert.equal(finalRelease[key],release[key],'Public Alpha release identity changed during download');
  assert.deepEqual(await alphaPublicAssetInventory(api,release.id,qualification.releaseTag),assets,'Public Alpha assets changed during download');
  return {schema:'agijobsv0/discovery-public-alpha-asset-acceptance/v1',releaseId:release.id,tag:qualification.releaseTag,
    commit:alpha.commit,tree:alpha.tree,runId:qualification.runId,runAttempt:qualification.runAttempt,
    sourceManifestSha256:hash(manifestRaw),checksumsSha256:hash(sumsRaw),allPublicAssetsDownloaded:true,
    operatorGuide:{name:operatorName,sha256:observed.get(operatorName).sha256,sourceMapSha256:hash(one(operator,'capability/source-map.json')),
      catalogSha256:hash(publicCatalogRaw),sourceHash:alpha.sourceHash,sourceInputs:Object.keys(publicCatalog.sources).length},
    completeChecksumCoverage:true,completeManifestCoverage:true,assetCount:observed.size,
    totalBytes:[...observed.values()].reduce((sum,item)=>sum+item.bytes,0),assets:[...observed.values()].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),distributions,reviewedProfile:reviewedProfileEvidence};
}
async function verifyAlphaPublication(api,qualification,alpha,catalogInput,assetOptions={}) {
  fields(qualification,['releaseTag','releaseId','runId','runAttempt'],'Exact public Alpha publication prerequisite fields differ');
  assert.ok(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(qualification.releaseTag));
  for(const name of ['releaseId','runId','runAttempt'])assert.ok(positive(qualification[name]));
  const [commit,main,release,run]=await Promise.all([
    api('git/commits/'+alpha.commit),api('git/ref/heads/main'),
    api('releases/tags/'+qualification.releaseTag),api('actions/runs/'+qualification.runId)]);
  assert.equal(commit.sha,alpha.commit);assert.equal(commit.tree?.sha,alpha.tree);
  assert.ok(identity(main.object?.sha));const relationship=await api('compare/'+alpha.commit+'...'+main.object.sha);
  assert.ok(['ahead','identical'].includes(relationship.status));
  assert.equal(relationship.behind_by,0);assert.equal(relationship.base_commit?.sha,alpha.commit);
  assert.equal(release.id,qualification.releaseId);assert.equal(release.tag_name,qualification.releaseTag);
  assert.equal(release.draft,false);assert.equal(release.prerelease,false);assert.ok(typeof release.published_at==='string'&&release.published_at);
  let tag=(await api('git/ref/tags/'+qualification.releaseTag)).object;
  for(let depth=0;tag?.type==='tag'&&depth<4;depth++)tag=(await api('git/tags/'+tag.sha)).object;
  assert.equal(tag?.type,'commit');assert.equal(tag.sha,alpha.commit,'Published Alpha tag differs from installed source');
  assert.equal(run.repository?.full_name,ALPHA_REPOSITORY);assert.equal(run.id,qualification.runId);
  assert.equal(run.run_attempt,qualification.runAttempt);assert.equal(run.path,'.github/workflows/agent-release.yml');
  assert.equal(run.head_sha,alpha.commit);assert.equal(run.head_branch,'main');assert.equal(run.event,'push');
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
  const fullProducerBefore=await alphaReleaseAttemptJobs(api,qualification,alpha);
  assert.ok(Buffer.isBuffer(catalogInput?.raw)&&catalogInput.raw.length>0&&catalogInput.raw.length<=2_000_000);
  assert.ok(digest(catalogInput.sha256));const catalogRaw=catalogInput.raw;
  assert.equal(hash(catalogRaw),catalogInput.sha256,'Reused authenticated source catalog differs from reviewed pin');
  const catalog=json(catalogRaw);
  assert.equal(catalog.schema,'successor-capability-source/v1');assert.equal(catalog.sourceHash,alpha.sourceHash);
  assert.equal(hash(canonical(catalog.sources)),alpha.sourceHash);assert.equal(Object.keys(catalog.sources).length,41);
  const publicAssets=await verifyAlphaPublicAssets(api,release,qualification,alpha,{...assetOptions,catalogInput});
  const fullProducerAfter=await alphaReleaseAttemptJobs(api,qualification,alpha);
  publicAssets.fullProducerJobs=alphaReleaseJobsLease(fullProducerBefore,fullProducerAfter);
  const finalRun=await api('actions/runs/'+qualification.runId);
  for(const key of ['id','run_attempt','head_sha','head_branch','event','path','status','conclusion'])
    assert.equal(finalRun[key],run[key],'Public Alpha producer changed during download');
  let finalTag=(await api('git/ref/tags/'+qualification.releaseTag)).object;
  for(let depth=0;finalTag?.type==='tag'&&depth<4;depth++)finalTag=(await api('git/tags/'+finalTag.sha)).object;
  assert.equal(finalTag?.type,'commit');assert.equal(finalTag.sha,alpha.commit,'Public Alpha tag changed during download');
  const finalAlphaMain=await api('git/ref/heads/main');assert.ok(identity(finalAlphaMain.object?.sha));
  const finalRelationship=await api('compare/'+alpha.commit+'...'+finalAlphaMain.object.sha);
  assert.ok(['ahead','identical'].includes(finalRelationship.status),'Public Alpha source left official main ancestry during download');
  assert.equal(finalRelationship.behind_by,0);assert.equal(finalRelationship.base_commit?.sha,alpha.commit);
  return {repository:ALPHA_REPOSITORY,...qualification,source:alpha,officialMain:finalAlphaMain.object.sha,
    sourceIsOfficialMainAncestor:true,sourceCatalogSha256:hash(catalogRaw),releaseUrl:release.html_url,
    publishedAt:release.published_at,workflowPath:run.path,event:run.event,headBranch:run.head_branch,conclusion:run.conclusion,publicAssets};
}
async function reviewReferences(api,record,source) {
  const references=new Set(record.reviewReferences);
  for(const review of Object.values(record.scannerReviews)) for(const item of review.results)
    for(const reference of [...(item.reviewReferences||[]),...(item.qualityReview?.independentReviewEvidence||[])]) references.add(reference);
  const observations=new Map();
  for(const reference of references) {
    const match=/^https:\/\/github\.com\/MontrealAI\/AGIJobsv0\/pull\/([1-9][0-9]*)#(issuecomment-|discussion_r|pullrequestreview-)([1-9][0-9]*)$/.exec(reference);
    assert.ok(match,'Case-specific public review reference is invalid');
    const route=match[2]==='issuecomment-'?'issues/comments/'+match[3]:match[2]==='discussion_r'?'pulls/comments/'+match[3]:'pulls/'+match[1]+'/reviews/'+match[3];
    const value=await api(route);assert.equal(value.html_url,reference);assert.ok(typeof value.body==='string' && value.body.includes(source.sourceCommit),
      'Review must actually discuss the exact current source');
    observations.set(reference,{id:value.id,body:value.body,bodySha256:hash(value.body),author:value.user?.login});
  }
  for(const review of Object.values(record.scannerReviews)) for(const item of review.results) {
    const refs=[...(item.reviewReferences||[]),...(item.qualityReview?.independentReviewEvidence||[])];
    assert.ok(refs.length>0 && refs.some(reference=>{const body=observations.get(reference)?.body;
      return body && body.includes(item.resultSha256) && body.includes(item.disposition);}),
      'Every raw result requires actual case-specific public review, beyond a generic bot comment');
  }
  for(const item of record.qualityDisposition?.cases||[]) {
    assert.equal(item.decision,'Acknowledged nonsecurity quality');
    assert.ok(record.reviewReferences.includes(item.reviewReference));
    const body=observations.get(item.reviewReference)?.body;
    assert.ok(body && body.includes(item.resultSha256) && body.includes(item.decision),
      'The selected quality decision must actually discuss that raw result and disposition');
  }
  return [...observations].map(([reference,value])=>({reference,id:value.id,bodySha256:value.bodySha256,author:value.author,
    coveredResults:Object.values(record.scannerReviews).flatMap(review=>review.results)
      .filter(item=>value.body.includes(item.resultSha256)&&value.body.includes(item.disposition))
      .map(item=>({resultSha256:item.resultSha256,disposition:item.disposition}))}));
}
async function qualify(options) {
  const {root,manifestSha256,verifierSha256,scopeVerifierSha256,runId,recordFile,recordSha256,output}=options;
  assert.ok(positive(runId) && path.isAbsolute(output||'') && !fs.existsSync(output));
  assert.ok(!path.resolve(output).startsWith(path.resolve(root)+path.sep),'Qualification output must be outside source');
  const source=sourceProof(options);assert.equal(json(bounded(path.join(root,'package.json'),1_000_000)).version,VERSION);
  const selection={profile:'jobs-discovery-installed-v1',manifestSha256,verifierSha256,scopeVerifierSha256};
  const pin=json(bounded(path.join(root,'config/discovery-installed-alpha-v1.json'),1_000_000));
  assert.equal(pin.status,'REVIEWED_FINAL_SOURCE');const alpha={commit:pin.commit,tree:pin.tree,sourceHash:pin.sourceHash};
  assert.ok(identity(alpha.commit)&&identity(alpha.tree)&&digest(alpha.sourceHash));
  const recordRaw=bounded(recordFile,8_000_000),record=publicationRecord(json(recordRaw),{source,selection,alpha,selectorSha256:recordSha256,raw:recordRaw});
  const api=options.api||liveApi(process.env.GH_TOKEN),get=options.download||download;
  const git=options.git||((...args)=>execFileSync('git',['--no-replace-objects','--no-pager','-C',root,
    '-c','protocol.allow=never','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',
    '-c','core.attributesFile=/dev/null',...args],{encoding:'utf8',timeout:30_000,maxBuffer:32_000_000,
    env:{...Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('GIT_'))),
      GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:'',GIT_TERMINAL_PROMPT:'0'}}));
  assert.equal(String(git('merge-base',record.prerequisite.commit,source.sourceCommit)).trim(),record.prerequisite.commit,
    'Qualified prerequisite main source must be retained in actual ancestry');
  const capture=require('./capture-discovery-browser-input.cjs'),alphaRead=options.alphaApi||alphaMetadataApi(process.env.GH_TOKEN),alphaCache=new Map();
  const alphaApi=async route=>{if(!alphaCache.has(route))alphaCache.set(route,Promise.resolve(alphaRead(route)));
    return structuredClone(await alphaCache.get(route));};
  const observedReviews=await reviewReferences(api,record,source);
  const main=await api('git/ref/heads/main');assert.equal(main.object?.sha,source.sourceCommit,'Actual main moved');
  const run=await api('actions/runs/'+runId);validateRun(run,source);
  const jobs=await pages(api,'actions/runs/'+runId+'/attempts/'+run.run_attempt+'/jobs','jobs');
  const artifacts=await pages(api,'actions/runs/'+runId+'/artifacts','artifacts');
  const custody=[];let producer;
  for(const [name,artifactName,steps,version] of [
    [PRODUCER,'discovery-installed-capsule-'+runId+'-'+run.run_attempt,['Validate complete selected source','Build one source-bound installed archive','Capture actual source-bound browser export','Retain original installed producer archive'],null],
    ...NODES.map(version=>[CONSUMER(version),'discovery-installed-native-'+version+'-'+runId+'-'+run.run_attempt,
      ['Download saved producer archive','Verify saved standalone installer','Verify and extract original installed archive','Run extracted operator and same-history native acceptance','Retain original installed native evidence'],version])]) {
    const matches=jobs.filter(job=>job.name===name);assert.equal(matches.length,1);const job=matches[0];validateJob(job,run,name,steps);
    const rawLog=await get('actions/jobs/'+job.id+'/logs');assert.ok(rawLog.length>0 && rawLog.length<=64_000_000);
    const selected=artifacts.filter(item=>item.name===artifactName);assert.equal(selected.length,1);const artifact=selected[0];
    const bytes=await get('actions/artifacts/'+artifact.id+'/zip');validateArtifact(artifact,run,artifactName,bytes);const members=zipMembers(bytes);
    if(!version) {producer=custodyFromProducer(members,source,alpha,{finite:json(bounded(path.join(root,'config/discovery-installed-candidate-v1.json'))),git});assert.deepEqual(producer.manifest.sourceSelection,selection);
      producer.browserObservation=await verifyBrowserInput(alphaApi,producer.browser,alpha,pin,json(bounded(path.join(root,'config/discovery-installed-browser-input-v1.json'))),options.alphaRawBody);}
    else {assert.ok(producer);validateNative(members,{source,alpha,custody:producer.custody,version,browser:producer.browser,
      bootstrap:{selection,installerRaw:producer.installerRaw}});}
    custody.push({jobId:job.id,name,logSha256:hash(rawLog),logBytes:rawLog.length,artifactId:artifact.id,
      artifactName,archiveSha256:hash(bytes),archiveBytes:bytes.length,members:[...members].map(([name,raw])=>({name,bytes:raw.length,sha256:hash(raw)})),bytes,rawLog});
  }
  // Public-release leases must be fresh; only immutable common-packet reads use alphaApi's cache.
  // Reuse the existing workflow token for fixed-host API metadata; public asset
  // transport remains anonymous. No new credential or cross-repository write.
  const alphaReleaseApi=options.alphaApi||liveApi(process.env.GH_TOKEN,ALPHA_REPOSITORY);
  const alphaQualification=await verifyAlphaPublication(alphaReleaseApi,record.alphaQualification,alpha,
    {raw:one(producer.browser.packet,capture.PREFIX+'served/sources.json'),sha256:pin.catalogSha256},
    options.alphaAssetReader?{readAsset:options.alphaAssetReader}:{});
  const inherited=inheritedPolicy(root);
  const policy=json(bounded(path.join(root,'config/solidity-compiler.json'),100000));
  assert.equal(policy.version,'0.8.37');assert.equal(policy.longVersion,'0.8.37+commit.f401782d');
  assert.equal(policy.evmVersion,'cancun');assert.equal(policy.optimizerRuns,200);assert.equal(policy.viaIR,true);
  for(const ancestor of [inherited.deployedSourceBaseline,inherited.evidenceBaseline,inherited.compilerSourceBaseline])
    git('merge-base','--is-ancestor',ancestor,source.sourceCommit);
  git('diff','--exit-code',record.prerequisite.commit,source.sourceCommit,'--','contracts/','scripts/deploy/','scripts/v2/',
    'config/solidity-compiler.json','config/implementation-modules.json','config/foundry-toolchain.json',...inherited.preservedEvidencePaths);
  const deploymentSnapshots=[inherited.verifyDeploymentSnapshot(bounded(path.join(root,inherited.deploymentSnapshot.localPath))),
    inherited.verifyDeploymentSnapshot(bounded(path.join(root,inherited.deploymentSnapshot.recordPath)))];
  const historicalCodeql=inherited.verifyHistoricalReviewedCodeql(await api('check-runs/'+inherited.historicalReviewedCodeql.checkId));
  const runs=await pages(api,'actions/runs?head_sha='+source.sourceCommit,'workflow_runs');
  const checks=await pages(api,'commits/'+source.sourceCommit+'/check-runs','check_runs');
  const codeql=require('./source-codeql-service-rc16.cjs');
  const services=await codeql.observeFinalServices({sha:source.sourceCommit,tree:source.sourceTree,git,runs,
    api:async(method,route)=>{assert.equal(method,'GET');return api(route);},download:async id=>get('actions/artifacts/'+id+'/zip')});
  const inheritedState=inherited.evaluate(runs.filter(value=>value.path!==WORKFLOW),checks.filter(value=>
    ![PRODUCER,...NODES.map(CONSUMER),'Select reviewed Discovery source','Publish qualified Discovery installed prerelease'].includes(value.name)),source.sourceCommit,services);
  assert.equal(inheritedState.ready,true,'Every inherited current-source gate must qualify: '+[...inheritedState.failures,...inheritedState.pending].join('; '));
  const scanners=[];
  for(const language of ['javascript','python','installedPython']) {
    const review=record.scannerReviews[language],scannerRun=await api('actions/runs/'+review.producerRunId);
    assert.equal(scannerRun.head_sha,source.sourceCommit);assert.equal(scannerRun.head_branch,'main');assert.equal(scannerRun.event,'push');
    assert.equal(scannerRun.status,'completed');assert.equal(scannerRun.conclusion,'success');
    assert.equal(scannerRun.path,(language==='installedPython'?PYTHON_WORKFLOW:'.github/workflows/'+(language==='javascript'?'static-analysis.yml':'static-analysis-python-integrations.yml')));
    assert.equal(scannerRun.run_attempt,review.producerRunAttempt);
    const scanJobs=await pages(api,'actions/runs/'+scannerRun.id+'/attempts/'+scannerRun.run_attempt+'/jobs','jobs');
    const jobName=language==='javascript'?'CodeQL analysis':language==='installedPython'?'Installed Python CodeQL analysis':'Python integration CodeQL analysis';
    const jobMatches=scanJobs.filter(job=>job.name===jobName);assert.equal(jobMatches.length,1);
    const steps=language==='javascript'?['Perform CodeQL analysis']:['Validate complete Python source scope and exact scan identity',
      'Initialize Python CodeQL','Perform Python CodeQL analysis','Recheck exact source after Python CodeQL analysis',
      'Retain and enforce actual complete Python extraction','Upload Python CodeQL artefacts'];
    validateJob(jobMatches[0],scannerRun,jobName,steps);
    const scannerLog=await get('actions/jobs/'+jobMatches[0].id+'/logs');assert.ok(scannerLog.length>0);
    const artifact=await api('actions/artifacts/'+review.artifactId),bytes=await get('actions/artifacts/'+review.artifactId+'/zip');
    validateArtifact(artifact,scannerRun,review.artifactName,bytes);assert.equal(hash(bytes),review.archiveSha256);
    scanners.push({...scannerReview(zipMembers(bytes),review,{source,language:language==='installedPython'?'python':language,git,producerRun:scannerRun}),
      role:language,producerRunId:scannerRun.id,producerRunAttempt:scannerRun.run_attempt,artifactId:artifact.id,archiveSha256:hash(bytes),archiveBytes:bytes.length,
      jobId:jobMatches[0].id,logSha256:hash(scannerLog),logBytes:scannerLog.length,bytes,scannerLog});
  }
  const latestPush=runs.filter(item=>item.path===WORKFLOW && item.event==='push' && item.head_branch==='main')
    .sort((a,b)=>b.run_number-a.run_number || b.run_attempt-a.run_attempt)[0];
  assert.equal(latestPush?.id,run.id,'A newer source-bound installed producer must be qualified');
  assert.equal(latestPush?.run_attempt,run.run_attempt);
  const finalMain=await api('git/ref/heads/main'),finalRun=await api('actions/runs/'+run.id);
  assert.equal(finalMain.object?.sha,source.sourceCommit,'Actual main moved during qualification');
  validateRun(finalRun,source);assert.equal(finalRun.run_attempt,run.run_attempt);
  const qualities=record.scannerReviews.javascript.results.filter(item=>item.disposition==='Acknowledged nonsecurity quality');
  assert.deepEqual(record.qualityDisposition.cases.map(item=>item.resultSha256).sort(),qualities.map(item=>item.resultSha256).sort(),
    'Every actual true quality result requires its own decision; no historical case may be silently cleared');
  for(const item of record.qualityDisposition.cases) {
    assert.equal(item.decision,'Acknowledged nonsecurity quality');
    assert.ok(record.reviewReferences.includes(item.reviewReference));
  }
  assert.ok(producer);
  fs.mkdirSync(output,{mode:0o700});
  for(const item of custody) {fs.writeFileSync(path.join(output,item.artifactId+'.zip'),item.bytes,{flag:'wx'});fs.writeFileSync(path.join(output,item.jobId+'.log'),item.rawLog,{flag:'wx'});delete item.bytes;delete item.rawLog;}
  for(const item of scanners) {fs.writeFileSync(path.join(output,'scanner-'+item.role+'.zip'),item.bytes,{flag:'wx'});
    fs.writeFileSync(path.join(output,'scanner-'+item.role+'.log'),item.scannerLog,{flag:'wx'});delete item.bytes;delete item.scannerLog;}
  fs.writeFileSync(path.join(output,'jobs-discovery-installed.tar.gz'),producer.raw,{flag:'wx'});
  fs.writeFileSync(path.join(output,INSTALLER_ASSET),producer.installerRaw,{flag:'wx'});
  fs.writeFileSync(path.join(output,'publication-review.json'),recordRaw,{flag:'wx'});
  const proof={schema:'agijobsv0/discovery-installed-hosted-qualification/v1',repository:REPOSITORY,profile:selection.profile,
    releaseVersion:VERSION,tag:TAG,source,selection,alpha,producerRun:{id:run.id,attempt:run.run_attempt,path:run.path,event:run.event,headBranch:run.head_branch},
    capsule:producer.custody,installer:producer.installer,browserInput:producer.browserObservation,originalArchives:custody,alphaQualification,observedReviews,scanners,processedCodeql:services,requiredWorkflows:inherited.requiredPaths,
    requiredChecks:inherited.requiredChecks,compilerPolicy:policy,deploymentSnapshots,historicalCodeql,publicationRecordSha256:hash(recordRaw),softwareReleaseQualified:true,
    productionApproved:false,authority:'none',currencyCapBaseUnits:'0'};
  fs.writeFileSync(path.join(output,'qualification.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});return proof;
}
module.exports={REPOSITORY,WORKFLOW,VERSION,TAG,NODES,PRODUCER,CONSUMER,INSTALLER_PATH,INSTALLER_ASSET,hash,json,canonical,fields,bounded,sourceProof,plan,alphaMetadataApi,
  validateRun,validateJob,validateArtifact,validateRetainedHistory,verifyBrowserInput,verifyAlphaPublication,verifyAlphaPublicAssets,reviewedAlphaReleaseProfile,verifyAlphaProfileInventory,verifyAlphaProfilePacks,alphaReleaseAttemptJobs,alphaReleaseJobsLease,alphaPublicAssetIdentity,alphaPublicAssetInventory,readPublicAlphaAsset,ALPHA_ASSET_MAX_BYTES,reviewReferences,zipMembers,installedArchive,validateInstaller,assertProducerInventory,custodyFromProducer,validateBootstrap,validateNative,publicationRecord,scannerReview,download,downloadReleaseAsset,qualify};
if(require.main===module) {
  const [command,root,manifestSha256,verifierSha256,scopeVerifierSha256,runId,recordFile,recordSha256,output]=process.argv.slice(2);
  (async()=>{
    if(command==='plan') return plan({root,manifestSha256,verifierSha256,scopeVerifierSha256});
    assert.equal(command,'qualify','Use plan ROOT MANIFEST VERIFIER SCOPE or qualify ROOT MANIFEST VERIFIER SCOPE RUN RECORD RECORD_SHA ABSENT_OUTPUT');
    return qualify({root,manifestSha256,verifierSha256,scopeVerifierSha256,runId:Number(runId),recordFile,recordSha256,output});
  })().then(value=>console.log(JSON.stringify(value,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
