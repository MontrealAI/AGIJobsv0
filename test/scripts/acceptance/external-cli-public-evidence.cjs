#!/usr/bin/env node
'use strict';
// A fixed schema projection, never a directory uploader or caller-selected copier.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  HOSTED_ROOT,
  PUBLIC_FILE,
  readPrivateJson,
  getSourceIdentity,
  assertCleanSource,
} = require('./external-cli-hosted-state.cjs');
const OPERATION_KEYS = Object.freeze([
  'create:Deployer',
  'commit',
  'create:StakeManagerConfiguration',
  'handover:StakeManagerConfiguration',
  'create:StakeManagerStaking',
  'handover:StakeManagerStaking',
  'create:StakeManagerEscrow',
  'handover:StakeManagerEscrow',
  'create:StakeManagerSlashing',
  'handover:StakeManagerSlashing',
  'component:StakeManager',
  'create:JobRegistryConfiguration',
  'handover:JobRegistryConfiguration',
  'create:JobRegistryLifecycle',
  'handover:JobRegistryLifecycle',
  'create:JobRegistrySettlement',
  'handover:JobRegistrySettlement',
  'component:JobRegistry',
  'create:ValidationModuleConfiguration',
  'handover:ValidationModuleConfiguration',
  'create:ValidationModuleVoting',
  'handover:ValidationModuleVoting',
  'create:ValidationModuleSelection',
  'handover:ValidationModuleSelection',
  'component:ValidationModule',
  'component:ReputationEngine',
  'component:ArbitratorCommittee',
  'component:DisputeModule',
  'component:CertificateNFT',
  'component:TaxPolicy',
  'component:FeePool',
  'component:IdentityRegistry',
  'component:PlatformRegistry',
  'component:JobRouter',
  'component:PlatformIncentives',
  'component:SystemPause',
  'register',
  'finalize',
  'handover:Deployer',
]);
const OWNER_NAMES = Object.freeze([
  'Deployer',
  'JobRegistryConfiguration',
  'JobRegistryLifecycle',
  'JobRegistrySettlement',
  'StakeManagerConfiguration',
  'StakeManagerStaking',
  'StakeManagerEscrow',
  'StakeManagerSlashing',
  'ValidationModuleConfiguration',
  'ValidationModuleVoting',
  'ValidationModuleSelection',
]);
const PAUSED_NAMES = Object.freeze([
  'StakeManager',
  'JobRegistry',
  'ValidationModule',
  'ReputationEngine',
  'DisputeModule',
  'PlatformRegistry',
  'FeePool',
  'ArbitratorCommittee',
]);
const stages = [
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
const memoryKeys = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
const resourceKeys = [
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
const integer = (v, max = Number.MAX_SAFE_INTEGER) => {
  assert(Number.isSafeInteger(v) && v >= 0 && v <= max);
  return v;
};
const finite = (v) => {
  assert(Number.isFinite(v) && v >= 0);
  return v;
};
const bool = (v) => {
  assert.equal(typeof v, 'boolean');
  return v;
};
const pattern = (v, regex) => {
  assert.equal(typeof v, 'string');
  assert(regex.test(v));
  return v;
};
const hex = (v, length) => pattern(v, new RegExp(`^[a-f0-9]{${length}}$`));
const hash = (v) => pattern(v, /^0x[a-fA-F0-9]{64}$/);
const address = (v) => pattern(v, /^0x[a-fA-F0-9]{40}$/);
const label = (v) =>
  pattern(
    v,
    /^(harness|compiler-reader|owned-node-private|writer-(?:[0-3][0-9])|(?:[0-3][0-9])-(?:inspect|handoff|import-signed|authorize-relay|observe))$/
  );
const signal = (v) =>
  v === null
    ? null
    : pattern(v, /^SIG(?:TERM|KILL|INT|ABRT|SEGV|BUS|ILL|PIPE|QUIT|HUP)$/);
const exitCode = (v) => (v === null ? null : integer(v, 255));
const numbers = (v, keys) =>
  Object.fromEntries(keys.map((key) => [key, finite(v[key])]));
function projectEvidence(input) {
  const d = input.driver;
  assert.equal(d.schema, 'jobs-hosted-driver-v1');
  const out = {
    schema: 'jobs-external-manual-hosted-public-v1',
    passed: false,
    source: {
      sourceCommit: hex(d.source.sourceCommit, 40),
      sourceTree: hex(d.source.sourceTree, 40),
    },
    nodeVersion: pattern(input.nodeVersion, /^v\d+\.\d+\.\d+$/),
    heapLimitMiB: 256,
    sourceGate: null,
    canonicalCompiler: null,
    compilerReader: null,
    stages: [],
    operations: [],
    subprocesses: [],
    metrics: [],
    cleanup: null,
    ensNormalization: null,
    cliEnsNormalization: null,
    ownerChecks: null,
    productionApproved: false,
    activationReady: false,
    globalAuthorityComplete: false,
    independentSourceApproval: false,
    bootstrapQualified: false,
    deviceQualified: false,
    limitations: [
      'Disposable unforked loopback chain 31337; public development account only.',
      'Actual Git HEAD/tree binding and fixture source hashes are not independent approval.',
      'Exact repository-pinned hosted Node differs from prior local Node 24.19.0 attempts.',
      'Optional node-only source tracing is omitted; actual Jobs CLI config/artifact checks are unchanged.',
      'No production, complete authority, explorer acceptance, hardware-wallet or two-machine qualification.',
      'Only bounded metadata is exported; private logs, signatures, plans, acknowledgements and sessions are excluded.',
    ],
  };
  assert(Array.isArray(d.stages) && d.stages.length <= stages.length);
  out.stages = d.stages.map((s, index) => {
    assert.equal(s.label, stages[index]);
    const value = {
      label: s.label,
      passed: bool(s.passed),
      processGroupEmpty: bool(s.processGroupEmpty),
      unexpectedRemainingGroupMembers: bool(s.unexpectedRemainingGroupMembers),
      code: exitCode(s.code),
      signal: signal(s.signal),
    };
    if (s.counts)
      value.counts = Object.fromEntries(
        ['tests', 'passed', 'failed', 'skipped'].map((key) => [
          key,
          integer(s.counts[key], 1000),
        ])
      );
    return value;
  });
  if (d.sourceGate)
    out.sourceGate = {
      baseline: hex(d.sourceGate.baseline, 40),
      baseTip: hex(d.sourceGate.baseTip, 40),
      head: hex(d.sourceGate.head, 40),
      generatedSourceBaseline: hex(d.sourceGate.generatedSourceBaseline, 40),
      compilerSourceBaseline: hex(d.sourceGate.compilerSourceBaseline, 40),
      preservedHistoricalEvidence: bool(
        d.sourceGate.preservedHistoricalEvidence
      ),
      reviewedSourceReconciled: bool(d.sourceGate.reviewedSourceReconciled),
      transitionCount: integer(d.sourceGate.transitionCount, 67),
    };
  if (d.canonicalCompiler)
    out.canonicalCompiler = {
      compiler: pattern(
        d.canonicalCompiler.compiler,
        /^0\.8\.37\+commit\.f401782d$/
      ),
      projectSourceWarnings: integer(
        d.canonicalCompiler.projectSourceWarnings,
        0
      ),
      reviewedUpstreamWarningCount: integer(
        d.canonicalCompiler.reviewedUpstreamWarningCount,
        1000
      ),
      sizeGatePassed: bool(d.canonicalCompiler.sizeGatePassed),
      evidenceSha256: hex(d.canonicalCompiler.evidenceSha256, 64),
    };
  for (const key of ['ensNormalization', 'cliEnsNormalization']) {
    if (d[key])
      out[key] = {
        path: 'config/ens.json',
        originalSha256: hex(d[key].originalSha256, 64),
        normalizedSha256: hex(d[key].normalizedSha256, 64),
        restored: bool(d[key].restored),
      };
  }
  const operations = input.operations || [];
  assert(Array.isArray(operations) && operations.length <= 39);
  out.operations = operations.map((op, index) => {
    assert.equal(op.index, index);
    assert.equal(op.nonce, index);
    assert.equal(op.key, OPERATION_KEYS[index]);
    assert.equal(op.status, 1);
    return {
      index,
      key: pattern(
        op.key,
        /^(?:create|handover|component):[A-Za-z]{1,64}$|^(?:commit|register|finalize)$/
      ),
      unsignedHash: hash(op.unsignedHash),
      policyHash: hash(op.policyHash),
      transactionHash: hash(op.transactionHash),
      status: 1,
      nonce: integer(op.nonce, 38),
      blockNumber: integer(op.blockNumber),
      blockHash: hash(op.blockHash),
      gasUsed: pattern(op.gasUsed, /^\d{1,20}$/),
    };
  });
  assert(Array.isArray(input.subprocesses) && input.subprocesses.length <= 238);
  out.subprocesses = input.subprocesses.map((s) => {
    const item = {
      label: label(s.label),
      pid: integer(s.pid),
      parentPid: integer(s.parentPid),
      code: exitCode(s.code),
      signal: signal(s.signal),
    };
    if (s.hardhatChildCompletion) {
      const c = s.hardhatChildCompletion;
      assert(Array.isArray(c.childCloses) && c.childCloses.length <= 2);
      item.hardhatChildCompletion = {
        accepted: bool(c.accepted),
        parentFinal: bool(c.parentFinal),
        childCloseCount:
          c.childCloseCount === null ? null : integer(c.childCloseCount, 100),
        childCloses: c.childCloses.map((close) => ({
          parentPid: integer(close.parentPid),
          childPid: integer(close.childPid),
          code: exitCode(close.code),
          signal: signal(close.signal),
        })),
      };
    }
    return item;
  });
  assert(Array.isArray(input.metrics) && input.metrics.length <= 475);
  out.metrics = input.metrics.map((m) => ({
    label: label(m.label),
    pid: integer(m.pid),
    parentPid: integer(m.parentPid),
    final: bool(m.final),
    samples: integer(m.samples),
    heapLimitMiB: integer(m.heapLimitMiB, 256),
    node: pattern(m.node, /^v\d+\.\d+\.\d+$/),
    uptimeSeconds: finite(m.uptimeSeconds),
    memoryUsageBytes: numbers(m.memoryUsageBytes, memoryKeys),
    peakSampledMemoryBytes: numbers(m.peakSampledMemoryBytes, memoryKeys),
    resourceUsage: numbers(m.resourceUsage, resourceKeys),
    forkObservations: numbers(m.forkObservations, [
      'spawned',
      'closed',
      'writeErrors',
    ]),
  }));
  if (input.cleanup)
    out.cleanup = {
      ownedNodeStopped: bool(input.cleanup.ownedNodeStopped),
      allOwnedFixtureChildrenStopped: bool(
        input.cleanup.allOwnedFixtureChildrenStopped
      ),
      ensOriginalRestored: bool(input.cleanup.ensOriginalRestored),
      unexpectedRemainingChildren: bool(
        input.cleanup.unexpectedRemainingChildren
      ),
      sourceIdentityUnchanged: bool(input.cleanup.sourceIdentityUnchanged),
      trackedSourceClean: bool(input.cleanup.trackedSourceClean),
      completedOperations: integer(input.cleanup.completedOperations, 39),
      finalFreeBytes: integer(input.cleanup.finalFreeBytes),
    };
  if (input.compilerReader)
    out.compilerReader = {
      compiler: pattern(
        input.compilerReader.compiler,
        /^0\.8\.37\+commit\.f401782d$/
      ),
      compilerInputSha256: hex(input.compilerReader.compilerInputSha256, 64),
      coordinatorBytecodeHash: hash(
        input.compilerReader.coordinatorBytecodeHash
      ),
      coordinatorRuntimeHash: hash(input.compilerReader.coordinatorRuntimeHash),
    };
  if (input.result) {
    const r = input.result;
    assert.equal(r.schema, 'jobs-external-cli-acceptance-v1');
    assert.equal(r.passed, true);
    assert.equal(r.productionApproved, false);
    assert.equal(r.activationReady, false);
    assert.equal(r.chainId, 31337);
    assert.equal(r.completedOperations, 39);
    assert.equal(r.signatures, 39);
    assert.equal(r.manualRelayInvocations, 39);
    assert.equal(r.creations, 25);
    assert.deepEqual(
      r.canonicalKeys,
      out.operations.map((op) => op.key)
    );
    assert.deepEqual(
      r.governorOwners.map((o) => o.name).sort(),
      [...OWNER_NAMES].sort()
    );
    assert.deepEqual(
      r.pausedModules.map((o) => o.name).sort(),
      [...PAUSED_NAMES].sort()
    );
    out.fixture = {
      chainId: 31337,
      signatures: 39,
      manualRelayInvocations: 39,
      completedOperations: 39,
      creations: 25,
      planHash: hash(r.planHash),
      sourceManifestSha256: hex(r.sourceManifestSha256, 64),
    };
    out.ownerChecks = {
      governor: address(r.governor),
      systemPause: {
        address: address(r.systemPause.address),
        owner: address(r.systemPause.owner),
      },
      governorOwners: r.governorOwners.map((o) => ({
        name: pattern(o.name, /^[A-Za-z]{1,64}$/),
        address: address(o.address),
        owner: address(o.owner),
      })),
      pausedModules: r.pausedModules.map((o) => ({
        name: pattern(o.name, /^[A-Za-z]{1,64}$/),
        address: address(o.address),
        owner: address(o.owner),
        paused: bool(o.paused),
      })),
    };
    assert(
      out.ownerChecks.governorOwners.every(
        (o) => o.owner === out.ownerChecks.governor
      )
    );
    assert.equal(out.ownerChecks.systemPause.owner, out.ownerChecks.governor);
    assert(
      out.ownerChecks.pausedModules.every(
        (o) => o.paused && o.owner === out.ownerChecks.systemPause.address
      )
    );
  }
  if (d.passed) {
    assert(
      input.result &&
        out.cleanup &&
        out.sourceGate &&
        out.canonicalCompiler &&
        out.compilerReader
    );
    assert.equal(out.stages.length, stages.length);
    assert(
      out.stages.every(
        (s) =>
          s.passed &&
          s.code === 0 &&
          s.signal === null &&
          s.processGroupEmpty &&
          !s.unexpectedRemainingGroupMembers
      )
    );
    for (const [name, count] of [
      ['focused-node-70', 70],
      ['child-completion-43', 43],
      ['public-export-tests', 33],
      ['direct-v1-22', 22],
    ]) {
      const s = out.stages.find((s) => s.label === name);
      assert.deepEqual(s.counts, {
        tests: count,
        passed: count,
        failed: 0,
        skipped: 0,
      });
    }
    assert.equal(out.sourceGate.head, out.source.sourceCommit);
    assert.equal(out.sourceGate.reviewedSourceReconciled, true);
    assert.equal(out.sourceGate.transitionCount, 67);
    assert.equal(out.sourceGate.preservedHistoricalEvidence, true);
    assert.equal(out.canonicalCompiler.sizeGatePassed, true);
    assert.equal(out.ensNormalization?.restored, true);
    assert.equal(out.cliEnsNormalization?.restored, true);
    assert.equal(
      out.cliEnsNormalization.originalSha256,
      out.ensNormalization.originalSha256
    );
    assert.equal(d.cleanBefore?.trackedSourceClean, true);
    assert.equal(d.cleanAfter?.trackedSourceClean, true);
    assert.equal(out.cleanup.ownedNodeStopped, true);
    assert.equal(out.cleanup.allOwnedFixtureChildrenStopped, true);
    assert.equal(out.cleanup.unexpectedRemainingChildren, false);
    assert.equal(out.cleanup.ensOriginalRestored, true);
    assert.equal(out.cleanup.sourceIdentityUnchanged, true);
    assert.equal(out.cleanup.trackedSourceClean, true);
    assert.equal(out.cleanup.completedOperations, 39);
    assert.equal(out.operations.length, 39);
    const expectedLabels = [
      'compiler-reader',
      'owned-node-private',
      'writer-00',
    ];
    for (let index = 0; index < 39; index++) {
      for (const command of [
        'inspect',
        'handoff',
        'import-signed',
        'authorize-relay',
        'observe',
      ])
        expectedLabels.push(`${String(index).padStart(2, '0')}-${command}`);
      expectedLabels.push(`writer-${String(index + 1).padStart(2, '0')}`);
    }
    expectedLabels.push('39-inspect');
    assert.deepEqual(
      out.subprocesses.map((s) => s.label),
      expectedLabels
    );
    assert.equal(out.metrics.length, 475);
    const cli = out.subprocesses.filter((s) => s.hardhatChildCompletion);
    assert.equal(cli.length, 236);
    for (const s of cli) {
      assert.equal(s.code, 0);
      assert.equal(s.signal, null);
      const c = s.hardhatChildCompletion;
      assert.equal(c.accepted, true);
      assert.equal(c.parentFinal, true);
      assert.equal(c.childCloseCount, 1);
      assert.equal(c.childCloses[0].parentPid, s.pid);
      assert.equal(c.childCloses[0].code, 0);
      assert.equal(c.childCloses[0].signal, null);
      for (const pid of [s.pid, c.childCloses[0].childPid]) {
        const matches = out.metrics.filter(
          (m) => m.pid === pid && m.label === s.label
        );
        assert.equal(matches.length, 1);
        assert.equal(matches[0].final, true);
        assert.equal(matches[0].forkObservations.writeErrors, 0);
      }
    }
    const harness = out.metrics.filter((m) => m.label === 'harness');
    assert.equal(harness.length, 1);
    assert.equal(harness[0].final, true);
    assert(
      out.metrics.every(
        (m) => m.heapLimitMiB === 256 && m.node === input.nodeVersion
      )
    );
    out.passed = true;
  }
  return out;
}
function main() {
  assert.equal(process.argv.length, 2, 'No path or copy arguments accepted');
  const root = path.resolve(__dirname, '../../..');
  const privateStat = fs.lstatSync(HOSTED_ROOT);
  assert(
    privateStat.isDirectory() &&
      !privateStat.isSymbolicLink() &&
      privateStat.uid === process.getuid() &&
      !(privateStat.mode & 0o077)
  );
  assert.equal(fs.realpathSync(HOSTED_ROOT), HOSTED_ROOT);
  const source = getSourceIdentity(root);
  const driver = readPrivateJson(path.join(HOSTED_ROOT, 'driver.json'));
  assert.deepEqual(driver.source, source);
  if (driver.passed) assertCleanSource(root);
  const cliRoot = path.join(HOSTED_ROOT, 'cli');
  const optional = (name) =>
    fs.existsSync(path.join(cliRoot, name))
      ? readPrivateJson(path.join(cliRoot, name))
      : null;
  // Read only exact metadata names and fixed PID metrics; never commands/logs/session.
  const metricsRoot = path.join(cliRoot, 'metrics');
  let metrics = [];
  if (fs.existsSync(metricsRoot)) {
    const names = fs
      .readdirSync(metricsRoot)
      .filter((name) => name.endsWith('.json'));
    assert(names.length <= 475);
    metrics = names.map((name) => {
      assert.match(name, /^[a-z0-9-]+-\d+\.json$/);
      return readPrivateJson(path.join(metricsRoot, name), 65536);
    });
  }
  const output = projectEvidence({
    driver,
    nodeVersion: process.version,
    result: optional('acceptance-result.json'),
    subprocesses: optional('subprocesses.json') || [],
    cleanup: optional('cleanup.json'),
    operations: optional('completed-operations.json'),
    compilerReader: optional('compiler-reader.json'),
    metrics,
  });
  const bytes = JSON.stringify(output, null, 2) + '\n';
  assert(Buffer.byteLength(bytes) <= 2 * 1024 * 1024);
  fs.mkdirSync(path.dirname(PUBLIC_FILE), { mode: 0o700 });
  fs.writeFileSync(PUBLIC_FILE, bytes, { flag: 'wx', mode: 0o600 });
  console.log(`Safe qualification metadata exported; passed=${output.passed}.`);
  if (!output.passed) process.exitCode = 1;
}
module.exports = { projectEvidence, OPERATION_KEYS, OWNER_NAMES, PAUSED_NAMES };
if (require.main === module) {
  try {
    main();
  } catch {
    console.error(
      'STOP: bounded public evidence export refused; no private files copied.'
    );
    process.exitCode = 1;
  }
}
