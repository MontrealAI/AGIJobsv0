'use strict';
// Builtin-only projection tests. No provider, EVM, key, signing or workflow call.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  projectEvidence,
  OPERATION_KEYS,
  OWNER_NAMES,
  PAUSED_NAMES,
} = require('./acceptance/external-cli-public-evidence.cjs');
const hash = '0x' + 'a'.repeat(64),
  hex = 'b'.repeat(64),
  commit = 'c'.repeat(40),
  address = '0x' + 'd'.repeat(40);
const stageNames = [
  'source-preservation',
  'focused-node-70',
  'child-completion-43',
  'public-export-tests',
  'canonical-compile',
  'canonical-compiler-validation',
  'normalize-ens-fixture',
  'direct-v1-22',
  'external-cli-39',
];
const resources = [
  'userCPUTime',
  'systemCPUTime',
  'maxRSS',
  'sharedMemorySize',
  'unsharedDataSize',
  'unsharedStackSize',
  'minorPageFault',
  'majorPageFault',
  'swappedOut',
  'fsRead',
  'fsWrite',
  'ipcSent',
  'ipcReceived',
  'signalsCount',
  'voluntaryContextSwitches',
  'involuntaryContextSwitches',
];
const metric = (label, pid, parentPid) => ({
  label,
  pid,
  parentPid,
  final: true,
  samples: 1,
  heapLimitMiB: 256,
  node: 'v22.23.3',
  uptimeSeconds: 1,
  memoryUsageBytes: Object.fromEntries(
    ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'].map((k) => [
      k,
      1,
    ])
  ),
  peakSampledMemoryBytes: Object.fromEntries(
    ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'].map((k) => [
      k,
      1,
    ])
  ),
  resourceUsage: Object.fromEntries(resources.map((k) => [k, 1])),
  forkObservations: { spawned: 0, closed: 0, writeErrors: 0 },
});
function fixture() {
  const stages = stageNames.map((label) => ({
    label,
    code: 0,
    signal: null,
    passed: true,
    processGroupEmpty: true,
    unexpectedRemainingGroupMembers: false,
  }));
  for (const [name, count] of [
    ['focused-node-70', 70],
    ['child-completion-43', 43],
    ['public-export-tests', 33],
    ['direct-v1-22', 22],
  ])
    stages.find((s) => s.label === name).counts = {
      tests: count,
      passed: count,
      failed: 0,
      skipped: 0,
    };
  const operations = Array.from({ length: 39 }, (_, index) => ({
    index,
    key: OPERATION_KEYS[index],
    status: 1,
    nonce: index,
    unsignedHash: hash,
    policyHash: hash,
    transactionHash: hash,
    blockHash: hash,
    blockNumber: index + 1,
    gasUsed: '123',
  }));
  const subprocesses = [],
    metrics = [metric('harness', 1, 1000)];
  let pid = 2;
  for (const label of ['compiler-reader', 'owned-node-private']) {
    subprocesses.push({ label, pid, parentPid: 1, code: 0, signal: null });
    metrics.push(metric(label, pid++, 1));
  }
  const labels = ['writer-00'];
  for (let i = 0; i < 39; i++) {
    for (const command of [
      'inspect',
      'handoff',
      'import-signed',
      'authorize-relay',
      'observe',
    ])
      labels.push(`${String(i).padStart(2, '0')}-${command}`);
    labels.push(`writer-${String(i + 1).padStart(2, '0')}`);
  }
  labels.push('39-inspect');
  for (const label of labels) {
    const parent = pid++,
      child = pid++;
    subprocesses.push({
      label,
      pid: parent,
      parentPid: 1,
      code: 0,
      signal: null,
      hardhatChildCompletion: {
        accepted: true,
        parentFinal: true,
        childCloseCount: 1,
        childCloses: [
          { parentPid: parent, childPid: child, code: 0, signal: null },
        ],
      },
    });
    metrics.push(metric(label, parent, 1), metric(label, child, parent));
  }
  return {
    nodeVersion: 'v22.23.3',
    driver: {
      schema: 'jobs-hosted-driver-v1',
      passed: true,
      source: { sourceCommit: commit, sourceTree: commit },
      stages,
      sourceGate: {
        baseline: commit,
        baseTip: commit,
        head: commit,
        generatedSourceBaseline: commit,
        compilerSourceBaseline: commit,
        preservedHistoricalEvidence: true,
        reviewedSourceReconciled: true,
        transitionCount: 67,
      },
      canonicalCompiler: {
        compiler: '0.8.37+commit.f401782d',
        projectSourceWarnings: 0,
        reviewedUpstreamWarningCount: 2,
        sizeGatePassed: true,
        evidenceSha256: hex,
      },
      cliEnsNormalization: {
        path: 'config/ens.json',
        originalSha256: hex,
        normalizedSha256: hex,
        restored: true,
      },
      ensNormalization: {
        originalSha256: hex,
        normalizedSha256: hex,
        restored: true,
      },
      cleanBefore: { trackedSourceClean: true },
      cleanAfter: { trackedSourceClean: true },
    },
    result: {
      schema: 'jobs-external-cli-acceptance-v1',
      passed: true,
      productionApproved: false,
      activationReady: false,
      chainId: 31337,
      completedOperations: 39,
      signatures: 39,
      manualRelayInvocations: 39,
      creations: 25,
      canonicalKeys: operations.map((o) => o.key),
      governorOwners: OWNER_NAMES.map((name) => ({
        name,
        address,
        owner: address,
      })),
      pausedModules: PAUSED_NAMES.map((name) => ({
        name,
        address,
        owner: address,
        paused: true,
      })),
      systemPause: { address, owner: address },
      governor: address,
      planHash: hash,
      sourceManifestSha256: hex,
    },
    compilerReader: {
      compiler: '0.8.37+commit.f401782d',
      compilerInputSha256: hex,
      coordinatorBytecodeHash: hash,
      coordinatorRuntimeHash: hash,
    },
    operations,
    subprocesses,
    metrics,
    cleanup: {
      ownedNodeStopped: true,
      allOwnedFixtureChildrenStopped: true,
      unexpectedRemainingChildren: false,
      ensOriginalRestored: true,
      sourceIdentityUnchanged: true,
      trackedSourceClean: true,
      completedOperations: 39,
      finalFreeBytes: 1000000,
    },
  };
}
test('exports a bounded complete success with all approval flags false', () => {
  const out = projectEvidence(fixture());
  assert.equal(out.passed, true);
  assert.equal(out.operations.length, 39);
  assert.equal(out.metrics.length, 475);
  for (const mutate of [
    (f) => {
      delete f.driver.stages[3].counts;
    },
    (f) => {
      f.driver.stages[3].counts.skipped = 1;
    },
    (f) => {
      f.driver.stages[0].processGroupEmpty = false;
    },
    (f) => {
      f.cleanup.allOwnedFixtureChildrenStopped = false;
    },
    (f) => {
      f.cleanup.unexpectedRemainingChildren = true;
    },
    (f) => {
      f.driver.cliEnsNormalization.restored = false;
    },
    (f) => {
      f.driver.stages[0].unexpectedRemainingGroupMembers = true;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => projectEvidence(f));
  }
  for (const key of [
    'productionApproved',
    'activationReady',
    'globalAuthorityComplete',
    'independentSourceApproval',
    'bootstrapQualified',
    'deviceQualified',
  ])
    assert.equal(out[key], false);
});
test('unknown raw signatures, plans, acknowledgements and log fields cannot escape', () => {
  const input = fixture();
  function inject(value) {
    if (!value || typeof value !== 'object') return;
    for (const child of Object.values(value)) inject(child);
    if (!Array.isArray(value)) {
      value.raw = 'DO_NOT_EXPORT_RAW_CAPABILITY';
      value.log = 'DO_NOT_EXPORT_RAW_CAPABILITY';
      value.privatePath = 'DO_NOT_EXPORT_RAW_CAPABILITY';
    }
  }
  inject(input);
  assert(
    !JSON.stringify(projectEvidence(input)).includes(
      'DO_NOT_EXPORT_RAW_CAPABILITY'
    )
  );
});
test('a partial failed driver cannot be promoted by an acceptance-shaped file', () => {
  const f = fixture();
  f.driver.passed = false;
  assert.equal(projectEvidence(f).passed, false);
});
test('a failed pre-CLI run exports only bounded partial evidence', () => {
  const f = fixture();
  f.driver.passed = false;
  f.driver.stages = f.driver.stages.slice(0, 2);
  f.result = null;
  f.operations = [];
  f.subprocesses = [];
  f.metrics = [];
  f.cleanup = null;
  assert.equal(projectEvidence(f).passed, false);
});
for (const [name, mutate] of Object.entries({
  'missing required direct/v1 result': (f) => delete f.driver.stages[7].counts,
  'skipped negative regression': (f) => (f.driver.stages[7].counts.skipped = 1),
  'wrapper zero with child SIGKILL': (f) => {
    f.subprocesses[2].hardhatChildCompletion.childCloses[0].code = null;
    f.subprocesses[2].hardhatChildCompletion.childCloses[0].signal = 'SIGKILL';
  },
  'missing child metrics': (f) => f.metrics.pop(),
  'nonfinal harness metrics': (f) => (f.metrics[0].final = false),
  'unrestored ENS source': (f) => (f.cleanup.ensOriginalRestored = false),
  'changed source': (f) => (f.driver.cleanAfter.trackedSourceClean = false),
  'missing canonical validation': (f) => (f.driver.canonicalCompiler = null),
  'unreconciled source gate': (f) =>
    (f.driver.sourceGate.reviewedSourceReconciled = false),
  'incomplete transition record': (f) =>
    (f.driver.sourceGate.transitionCount = 61),
  'less than 39 operations': (f) => f.operations.pop(),
  'unexpected source strings': (f) =>
    (f.driver.source.sourceCommit = 'secret-data'),
  'unexpected receipt strings': (f) =>
    (f.operations[0].transactionHash = 'secret-data'),
  'duplicate operation key': (f) => (f.operations[1].key = f.operations[0].key),
  'duplicate CLI label': (f) =>
    (f.subprocesses[3].label = f.subprocesses[2].label),
  'noncanonical receipt status': (f) => (f.operations[0].status = 0),
  'wrong SystemPause owner': (f) =>
    (f.result.systemPause.owner = '0x' + 'e'.repeat(40)),
  'missing compiler input identity': (f) => (f.compilerReader = null),
  'production flag set': (f) => (f.result.productionApproved = true),
  'activation flag set': (f) => (f.result.activationReady = true),
  'unexpected child label': (f) => (f.metrics[0].label = 'secret-data'),
}))
  test(`refuses ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => projectEvidence(f));
  });

// Linux builtin-only process/fixture recovery regressions. No Hardhat or provider.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {
  processIdentity,
  processGroupIdentity,
  ownedGroupMembers,
  signalOwnedGroup,
  waitOwnedGroupEmpty,
  assertExpectedNormalization,
  fixtureFileIdentity,
  restoreFixtureFile,
} = require('./acceptance/external-cli-hosted-state.cjs');
const stateHelper = require.resolve(
  './acceptance/external-cli-hosted-state.cjs'
);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function spawnSynthetic(program) {
  const child = cp.spawn(
    process.execPath,
    ['--max-old-space-size=256', '-e', program],
    {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const closed = new Promise((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal }))
  );
  let output = '',
    errors = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  const identity = processGroupIdentity(child.pid);
  return {
    child,
    closed,
    identity,
    output: () => output,
    errors: () => errors,
  };
}
async function ready(handle) {
  const end = Date.now() + 5000;
  while (!handle.output().includes('\n')) {
    assert.equal(handle.child.exitCode, null, handle.errors());
    assert(Date.now() < end, 'Synthetic process readiness timeout');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return JSON.parse(handle.output().split('\n')[0]);
}
async function cleanupSynthetic(handle) {
  if (ownedGroupMembers(handle.identity).length)
    signalOwnedGroup(handle.identity, 'SIGKILL');
  await handle.closed;
  assert.equal(
    await waitOwnedGroupEmpty(handle.identity),
    true,
    'Synthetic group was not reaped'
  );
}
function fixtureFile() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-hosted-synthetic-')
  );
  const file = path.join(directory, 'ens.json');
  const original = Buffer.from('{"original":true}\n');
  const expected = Buffer.from('{"normalized":true}\n');
  fs.writeFileSync(file, original);
  return {
    directory,
    file,
    original,
    expected,
    identity: fixtureFileIdentity(file),
  };
}

test('abrupt harness death contains descendants and actual driver restores only after group termination', async () => {
  const fixture = fixtureFile();
  const unrelated = spawnSynthetic(
    'console.log(JSON.stringify({pid:process.pid})); setTimeout(()=>process.exit(99),15000);setInterval(()=>{},1000)'
  );
  const driverSource = fs.readFileSync(
    require.resolve('./acceptance/run-hosted-qualification.cjs'),
    'utf8'
  );
  const runFunction = driverSource.slice(
    driverSource.indexOf('async function run('),
    driverSource.indexOf('function boundedText')
  );
  const driver = {
    fs,
    path,
    cp,
    assert,
    process,
    setTimeout,
    clearTimeout,
    root: fixture.directory,
    HOSTED_ROOT: fixture.directory,
    interrupted: false,
    child: null,
    state: { stages: [] },
    save() {},
    processGroupIdentity,
    ownedGroupMembers,
    signalOwnedGroup,
    waitOwnedGroupEmpty,
  };
  vm.createContext(driver);
  vm.runInContext(runFunction, driver);
  const readiness = path.join(fixture.directory, 'ready.json');
  let operation;
  try {
    await ready(unrelated);
    operation = driver
      .run(
        'synthetic-killed-harness',
        process.execPath,
        [
          '--max-old-space-size=256',
          '-e',
          `
      const cp=require('node:child_process'), fs=require('node:fs');
      const child=cp.spawn(process.execPath,['--max-old-space-size=256','-e','setTimeout(()=>process.exit(99),15000);setInterval(()=>{},1000)'],{detached:false,stdio:'ignore'});
      fs.writeFileSync(${JSON.stringify(fixture.file)}, ${JSON.stringify(
            fixture.expected.toString()
          )});
      fs.writeFileSync(${JSON.stringify(
        readiness
      )},JSON.stringify({child:child.pid})); setTimeout(()=>process.exit(99),15000);setInterval(()=>{},1000);
    `,
        ],
        { PATH: process.env.PATH },
        1
      )
      .then(
        () => null,
        (error) => error
      );
    const end = Date.now() + 5000;
    while (!fs.existsSync(readiness)) {
      assert(Date.now() < end, 'Synthetic driver readiness timeout');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const observed = JSON.parse(fs.readFileSync(readiness));
    const identity = driver.child.identity,
      descendant = processIdentity(observed.child);
    assert.equal(descendant.group, identity.group);
    assert.equal(descendant.session, identity.session);
    assert.throws(() =>
      restoreFixtureFile(
        fixture.file,
        fixture.identity,
        fixture.original,
        sha(fixture.expected),
        false
      )
    );
    process.kill(identity.pid, 'SIGKILL');
    assert.match(String(await operation), /Qualification stage failed/);
    const stage = driver.state.stages[0];
    assert.equal(stage.code, null);
    assert.equal(stage.signal, 'SIGKILL');
    assert.equal(stage.passed, false);
    assert.equal(stage.unexpectedRemainingGroupMembers, true);
    assert.equal(stage.processGroupEmpty, true);
    assert.deepEqual(ownedGroupMembers(identity), []);
    assert.equal(
      restoreFixtureFile(
        fixture.file,
        fixture.identity,
        fixture.original,
        sha(fixture.expected),
        stage.processGroupEmpty
      ),
      true
    );
    assert(fs.readFileSync(fixture.file).equals(fixture.original));
    assert(ownedGroupMembers(unrelated.identity).includes(unrelated.child.pid));
    assert.equal(
      processIdentity(unrelated.child.pid).start,
      unrelated.identity.start
    );
  } finally {
    if (driver.child) signalOwnedGroup(driver.child.identity, 'SIGKILL');
    if (operation) await operation;
    await cleanupSynthetic(unrelated);
    fs.rmSync(fixture.directory, { recursive: true });
  }
});

test('actual harness cleanup stops descendants of an exited wrapper and preserves failure', async () => {
  const wrapper = `const cp=require('node:child_process'); const child=cp.spawn(process.execPath,['--max-old-space-size=256','-e','setTimeout(()=>process.exit(99),15000);setInterval(()=>{},1000)'],{detached:false,stdio:'ignore'}); console.log(JSON.stringify({child:child.pid})); child.unref();`;
  const harnessSource = require.resolve('./acceptance/run-external-cli.cjs');
  const harness = spawnSynthetic(`
    const cp=require('node:child_process'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
    const h=require(${JSON.stringify(stateHelper)});
    const source=fs.readFileSync(${JSON.stringify(harnessSource)},'utf8');
    const cleanup=source.slice(source.indexOf('let unexpectedChildren ='),source.indexOf('function collectMetrics'));
    const finish=source.slice(source.indexOf('let finishPromise;'),source.indexOf('let signalReceived'));
    const wrapper=cp.spawn(process.execPath,['--max-old-space-size=256','-e',${JSON.stringify(
      wrapper
    )}],{detached:false,stdio:['ignore','pipe','ignore']});
    let output='';wrapper.stdout.on('data',chunk=>output+=chunk);
    wrapper.once('close',async(code,signal)=>{try {
      assert.equal(code,0);assert.equal(signal,null);
      const child=JSON.parse(output).child, identity=h.processGroupIdentity(process.pid);
      assert(h.ownedGroupMembers(identity).includes(child));
      const context={assert,process,setTimeout,clearTimeout,stopped:false,supervisorIdentity:identity,
        ownedNode:null,provider:null,ensBackup:null,privateRoot:null,
        started:[{child:wrapper,promise:Promise.resolve()}],
        ownedGroupMembers:h.ownedGroupMembers,stopOwnedGroupChildren:h.stopOwnedGroupChildren};
      vm.createContext(context);vm.runInContext(cleanup+'\\n'+finish,context);
      await assert.rejects(context.finish(),/Unexpected fixture descendants survived work/);
      assert.deepEqual(h.ownedGroupMembers(identity),[process.pid]);
      console.log(JSON.stringify({wrapperCode:code,childrenStopped:true,qualificationPassed:false}));
    }catch(error){console.error(error);process.exitCode=1;}});
  `);
  try {
    assert.deepEqual(
      await harness.closed,
      { code: 0, signal: null },
      harness.errors()
    );
    assert.deepEqual(JSON.parse(harness.output()), {
      wrapperCode: 0,
      childrenStopped: true,
      qualificationPassed: false,
    });
    assert.equal(await waitOwnedGroupEmpty(harness.identity), true);
  } finally {
    await cleanupSynthetic(harness);
  }
});

test('group signaling refuses a reused leader identity without touching its live process', async () => {
  const handle = spawnSynthetic(
    "console.log('{}');setTimeout(()=>process.exit(99),15000);setInterval(()=>{},1000)"
  );
  try {
    await ready(handle);
    assert.throws(() =>
      signalOwnedGroup({ ...handle.identity, start: 'different' }, 'SIGTERM')
    );
    assert.equal(
      processIdentity(handle.child.pid).start,
      handle.identity.start
    );
  } finally {
    await cleanupSynthetic(handle);
  }
});

test('stopping flag rejects the actual launch function before spawning or other work', () => {
  const source = fs.readFileSync(
    require.resolve('./acceptance/run-external-cli.cjs'),
    'utf8'
  );
  const guard = source.slice(
    source.indexOf('function assertRunning()'),
    source.indexOf('function verifyOwnedListener')
  );
  const launch = source.slice(
    source.indexOf('function launch('),
    source.indexOf('async function run(')
  );
  let spawned = false;
  assert.throws(
    () =>
      vm.runInNewContext(`${guard}\n${launch}\nlaunch('forbidden', []);`, {
        assert,
        stopped: true,
        cp: {
          spawn() {
            spawned = true;
          },
        },
      }),
    /Fixture is stopping/
  );
  assert.equal(spawned, false);
});

test('normalization accepts only original or predicted bytes and restores exact original', () => {
  const fixture = fixtureFile();
  try {
    assertExpectedNormalization(
      sha(fixture.original),
      sha(fixture.expected),
      sha(fixture.original)
    );
    assertExpectedNormalization(
      sha(fixture.original),
      sha(fixture.expected),
      sha(fixture.expected)
    );
    fs.writeFileSync(fixture.file, fixture.expected);
    assert.equal(
      restoreFixtureFile(
        fixture.file,
        fixture.identity,
        fixture.original,
        sha(fixture.expected),
        true
      ),
      true
    );
    assert(fs.readFileSync(fixture.file).equals(fixture.original));
  } finally {
    fs.rmSync(fixture.directory, { recursive: true });
  }
});

test('actual normalization block rejects an unpredicted idempotent loader without replacing preview hash', () => {
  const source = fs.readFileSync(
    require.resolve('./acceptance/run-external-cli.cjs'),
    'utf8'
  );
  const block = source.slice(
    source.indexOf('  const previewEns ='),
    source.indexOf("  currentLabel = 'build-fixture-manifest'")
  );
  const preview = { expected: true },
    unexpected = Buffer.from('{"unexpected":true}\n');
  let calls = 0;
  const context = {
    assert,
    Buffer,
    sha,
    assertExpectedNormalization,
    ensBackup: Buffer.from('{}\n'),
    ensFile: '/synthetic/ens.json',
    normalizedEnsHash: '',
    fs: { readFileSync: () => unexpected },
    loadEnsConfig() {
      calls++;
      return {
        path: '/synthetic/ens.json',
        config: preview,
        updated: calls === 2,
      };
    },
  };
  assert.throws(
    () => vm.runInNewContext(block, context),
    /Unexpected ENS bytes/
  );
  assert.equal(calls, 2);
  assert.equal(
    context.normalizedEnsHash,
    sha(Buffer.from(JSON.stringify(preview, null, 2) + '\n'))
  );
});

test('unpredicted ENS bytes remain untouched even after all descendants have stopped', () => {
  const fixture = fixtureFile(),
    unexpected = Buffer.from('{"unexpected":true}\n');
  try {
    fs.writeFileSync(fixture.file, unexpected);
    assert.throws(
      () =>
        restoreFixtureFile(
          fixture.file,
          fixture.identity,
          fixture.original,
          sha(fixture.expected),
          true
        ),
      /Unexpected ENS bytes/
    );
    assert(fs.readFileSync(fixture.file).equals(unexpected));
  } finally {
    fs.rmSync(fixture.directory, { recursive: true });
  }
});

test('ENS restore refuses replacement inode and incomplete descendant cleanup', () => {
  const fixture = fixtureFile();
  try {
    fs.writeFileSync(fixture.file, fixture.expected);
    assert.throws(
      () =>
        restoreFixtureFile(
          fixture.file,
          fixture.identity,
          fixture.original,
          sha(fixture.expected),
          false
        ),
      /not verified stopped/
    );
    assert(fs.readFileSync(fixture.file).equals(fixture.expected));
    fs.renameSync(fixture.file, fixture.file + '.old');
    fs.writeFileSync(fixture.file, fixture.expected);
    assert.throws(
      () =>
        restoreFixtureFile(
          fixture.file,
          fixture.identity,
          fixture.original,
          sha(fixture.expected),
          true
        ),
      /identity changed/
    );
    assert(fs.readFileSync(fixture.file).equals(fixture.expected));
  } finally {
    fs.rmSync(fixture.directory, { recursive: true });
  }
});
