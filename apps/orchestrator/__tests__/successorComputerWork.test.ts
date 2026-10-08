import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { keccak256, toUtf8Bytes } from 'ethers';
import {
  computerTaskDigest,
  computerWorkHandler,
  executeComputerWork,
  requireComputerWorkAdmission,
  ComputerWorkOutcomeUnknown,
} from '../computerWork';
import {
  executeSuccessorComputerWork,
  inspectSuccessorComputerWorkAdmission,
} from '../successorComputerWork';
import {
  describeSuccessorSettlement,
  reconcileSuccessorSettlement,
} from '../successorSettlement';
import { buildPipeline } from '../pipeline';

const {
  loadSuccessorBridge,
  loadSuccessorIntegrity,
  loadSuccessorSignatures,
  loadSuccessorInstitution,
} = require('../successor-runtime.cjs');
const task = {
  schemaVersion: 1,
  workerProfile: 'fixture',
  goal: 'Inspect synthetic evidence',
  inputText: 'Use the local fixture only.',
  dataClass: 'synthetic',
  allowedOrigins: ['https://example.com'],
  acceptanceCriteria: ['Report the evidence source.'],
  deliverables: [{ name: 'report.json', mediaType: 'application/json' }],
};
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const completed = () => ({
  id: 'resp_fixture',
  status: 'completed',
  output: [
    {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: JSON.stringify({
            status: 'completed',
            summary: 'Synthetic candidate evidence',
            artifacts: [
              {
                name: 'report.json',
                mediaType: 'application/json',
                content: '{"source":"synthetic"}',
              },
            ],
          }),
        },
      ],
    },
  ],
});

async function fixture(t: any, response = completed()) {
  let calls = 0;
  let wire: any;
  const server = http.createServer((req, res) => {
    calls++;
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (part) => {
      body += part;
    });
    req.on('end', () => {
      wire = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${
    (server.address() as { port: number }).port
  }/v1/responses`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'successor-bridge-'));
  const stateDirectory = path.join(directory, 'dispatches');
  const configFile = path.join(directory, 'profiles.json');
  const policyFile = path.join(directory, 'policy.json');
  const env: Record<string, string | undefined> = {};
  for (const name of [
    'COMPUTER_WORK_PROFILES_FILE',
    'COMPUTER_WORK_STATE_DIR',
    'SUCCESSOR_COMPUTER_WORK_POLICY_FILE',
    'COMPUTER_WORK_SUCCESSOR_TOKEN',
  ])
    env[name] = process.env[name];
  process.env.COMPUTER_WORK_PROFILES_FILE = configFile;
  process.env.COMPUTER_WORK_STATE_DIR = stateDirectory;
  process.env.SUCCESSOR_COMPUTER_WORK_POLICY_FILE = policyFile;
  process.env.COMPUTER_WORK_SUCCESSOR_TOKEN = 'synthetic-secret';
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const core = await loadSuccessorBridge();
  const integrity = await loadSuccessorIntegrity();
  const signatures = await loadSuccessorSignatures();
  const identity = signatures.generateSigningIdentity({
    keyId: 'fixture-underwriter',
    organizationId: 'test-organization',
    custodyId: 'fixture-custodian',
  });
  const context = {
    institutionId: 'test-institution',
    missionId: 'invoice',
    environment: 'local-test',
    mode: 'fixture',
  };
  const notBefore = new Date(Date.now() - 60000).toISOString();
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  const institution = await loadSuccessorInstitution();
  const mission = {
    schemaVersion: '1.0.0',
    kind: 'MissionConstitution',
    missionId: context.missionId,
    institutionId: context.institutionId,
    version: '1',
    title: 'Computer-work fixture rehearsal',
    principal: 'fixture-operator',
    beneficiary: 'Local fixture operator',
    objective: task.goal,
    incumbent: {
      id: 'manual-fixture',
      version: '1',
      description: 'Manual synthetic comparison',
    },
    alternatives: [
      {
        id: 'script-fixture',
        version: '1',
        description: 'Conventional deterministic fixture',
      },
    ],
    rights: [
      {
        sourceId: 'fixture-evidence',
        license: 'Authored synthetic fixture',
        dataClass: 'synthetic',
        permittedUses: ['mission-evaluation', 'fixture-run'],
        expiresAt,
      },
    ],
    hardGates: [
      {
        id: 'no-external-effects',
        description: 'Loopback fixture only',
        maxViolations: 0,
      },
    ],
    criticalFunctions: ['tools-retrieval'],
    roles: {
      producer: 'fixture-worker',
      verifier: 'fixture-reviewer',
      acceptor: 'fixture-acceptor',
      admitter: 'fixture-operator',
    },
    budget: {
      unit: 'TEST',
      limitBaseUnits: '0',
      maxDurationMs: 5000,
      maxRetries: 0,
      maxJobs: 21,
    },
    expiresAt,
    authorityCeiling: {
      level: 'A2',
      permittedActions: ['fixture-run'],
      prohibitedActions: ['payment', 'credential-access'],
      externalEffects: false,
    },
    allowedTools: ['computer-work'],
    allowedActions: ['fixture-run'],
    rollback: {
      target: 'manual-fixture',
      available: true,
      reason: 'Discard fixture output',
    },
    proofProtocol: {
      id: 'fixture-protocol',
      version: '1',
      mode: 'SYNTHETIC_REHEARSAL',
      formationOwner: 'fixture-worker',
      custodian: 'fixture-reviewer',
      requiredIndependence: 'I0',
      minimumMargin: 0,
      criticalErrorCeiling: 0,
      scope: 'Authored development evidence only',
    },
  };
  const compilation = await institution.compileJobs(mission, {
    now: new Date().toISOString(),
  });
  const sealedWorkOrder = compilation.graph.nodes.find((job: any) =>
    job.jobId.endsWith(':tools-retrieval')
  );
  const policy: any = {
    schemaVersion: 1,
    trustStore: {
      schemaVersion: 1,
      keys: [
        signatures.trustKey(identity, {
          roles: ['underwriter'],
          context,
          notBefore,
          expiresAt,
        }),
      ],
    },
    state: { stopped: false, revocationEpochs: {}, actions: {} },
    assurance: {
      monitoring: true,
      cleanup: true,
      rollback: true,
      freshness: true,
      commissioned: false,
    },
  };
  await institution.registerCompilation(
    {
      read: () => policy.state,
      transact: (update: any) => update(policy.state),
    },
    compilation,
    {
      actor: 'fixture-operator',
      eventId: 'fixture-registration',
      now: new Date().toISOString(),
    }
  );
  const writePolicy = () =>
    fs.writeFileSync(policyFile, JSON.stringify(policy), { mode: 0o600 });
  policy.trustStore.keys[0].principals = ['fixture-operator'];
  const profile: any = {
    endpoint,
    agentId: 'worker',
    tokenEnv: 'COMPUTER_WORK_SUCCESSOR_TOKEN',
    deploymentId: '31337:local-registry',
    mode: 'fixture',
    timeoutMs: 1000,
    maxResponseBytes: 100000,
    maxOutputTokens: 2048,
    approvedJobs: [],
  };
  const writeProfile = () =>
    fs.writeFileSync(configFile, JSON.stringify({ fixture: profile }), {
      mode: 0o600,
    });
  async function makeManifest(jobId = '1', nonce = 'fixture-nonce-0001') {
    const action = {
      ...context,
      principal: 'fixture-operator',
      candidateDigest: digest('a'),
      workOrderDigest: sealedWorkOrder.digest,
      workOrderAction: 'fixture-run',
      evidenceDigest: digest('c'),
      taskDigest: computerTaskDigest(task),
      deploymentId: profile.deploymentId,
      jobId,
      level: 'A2',
      tool: 'computer-work',
      target: endpoint,
      dataClass: task.dataClass,
      effect: 'sandbox-execution',
      costMinor: '0',
      currency: 'TEST',
      nonce,
      deadline: new Date(Date.now() + 5000).toISOString(),
    };
    const payload = {
      schemaVersion: 1,
      principal: 'fixture-operator',
      id: `lease-${jobId}`,
      kind: 'rehearsal',
      candidateDigest: action.candidateDigest,
      workOrderDigest: action.workOrderDigest,
      taskDigest: action.taskDigest,
      evidenceDigest: action.evidenceDigest,
      deploymentId: action.deploymentId,
      actionDigest: await integrity.digestObject('successor-action-v1', action),
      level: 'A2',
      scope: {
        tools: ['computer-work'],
        targets: [endpoint],
        dataClasses: ['synthetic'],
        effects: ['sandbox-execution'],
      },
      budget: { id: 'fixture-budget', currency: 'TEST', maxMinor: '0' },
      maxActions: 1,
      notBefore,
      expiresAt,
      nonce,
      revocationEpoch: 0,
    };
    const lease = await signatures.signPayload(payload, {
      identity,
      purpose: 'successor.job-lease.v1',
      context,
    });
    return {
      schemaVersion: '1.0.0',
      ...context,
      candidateDigest: action.candidateDigest,
      workOrderDigest: action.workOrderDigest,
      taskSha256: action.taskDigest,
      evidenceDigest: action.evidenceDigest,
      deploymentId: action.deploymentId,
      jobId,
      action,
      lease,
    };
  }
  const manifest = await makeManifest();
  const manifestSha256 = await core.computerWorkBindingDigest(manifest);
  profile.approvedJobs = [
    {
      jobId: '1',
      taskSha256: computerTaskDigest(task),
      successorManifestSha256: manifestSha256,
    },
  ];
  writePolicy();
  writeProfile();
  return {
    core,
    manifest,
    manifestSha256,
    makeManifest,
    profile,
    policy,
    writePolicy,
    writeProfile,
    policyFile,
    configFile,
    stateDirectory,
    directory,
    calls: () => calls,
    wire: () => wire,
  };
}

test('legacy v1 normalization stays compatible and sealed metadata cannot leak into it', () => {
  const reordered = Object.fromEntries(Object.entries(task).reverse());
  assert.equal(computerTaskDigest(task), computerTaskDigest(reordered));
  assert.throws(
    () => computerTaskDigest({ ...task, missionId: 'invoice' }),
    /Unexpected computer-work field/
  );
});

test('stripping the outer manifest cannot downgrade a sealed admission to legacy execution', async (t) => {
  const f = await fixture(t);
  assert.throws(
    () => requireComputerWorkAdmission('1', task),
    /Exact successor manifest admission/
  );
  await assert.rejects(
    executeComputerWork('1', task, f.profile, {
      stateDirectory: f.stateDirectory,
    }),
    /Exact successor manifest admission/
  );
  await assert.rejects(
    computerWorkHandler({
      context: {
        jobId: '1',
        category: 'computer-work',
        metadata: { computerWork: task },
      },
    } as any),
    /Exact successor manifest admission/
  );
  assert.throws(
    () =>
      buildPipeline({
        jobId: '1',
        category: 'general',
        tags: [],
        metadata: { successorComputerWork: f.manifest },
      }),
    /computer-work category/
  );
  assert.equal(f.calls(), 0);
  assert.equal(fs.existsSync(f.stateDirectory), false);
});

test('unchanged task with changed mission envelope requires fresh exact admission', async (t) => {
  const f = await fixture(t);
  const changed = structuredClone(f.manifest);
  changed.candidateDigest = digest('d');
  changed.action.candidateDigest = digest('d');
  await assert.rejects(
    inspectSuccessorComputerWorkAdmission('1', task, changed),
    /Exact successor manifest admission/
  );
  f.profile.approvedJobs[0].successorManifestSha256 =
    await f.core.computerWorkBindingDigest(changed);
  f.writeProfile();
  await assert.rejects(
    inspectSuccessorComputerWorkAdmission('1', task, changed),
    /different exact action/
  );
  assert.equal(f.calls(), 0);
  assert.equal(fs.existsSync(f.stateDirectory), false);
});

test('signed fixture lease binds dispatch and evidence without granting acceptance or production', async (t) => {
  const f = await fixture(t);
  const preflight = await inspectSuccessorComputerWorkAdmission(
    '1',
    task,
    f.manifest
  );
  assert.equal(preflight.binding.manifestSha256, f.manifestSha256);
  assert.equal(fs.existsSync(f.stateDirectory), false);
  const receipt: any = await computerWorkHandler({
    context: {
      jobId: '1',
      category: 'computer-work',
      metadata: { computerWork: task, successorComputerWork: f.manifest },
    },
  } as any);
  assert.equal(receipt.successor.manifestSha256, f.manifestSha256);
  assert.equal(receipt.status, 'evidence-ready');
  assert.equal(receipt.simulated, true);
  assert.equal(receipt.productionApproved, false);
  assert.equal(receipt.settlementApproved, false);
  assert.equal(receipt.review.status, 'required');
  const input = JSON.parse(f.wire().input);
  assert.deepEqual(input.task, task);
  assert.equal(input.successor.manifestSha256, f.manifestSha256);
  assert.equal(input.successor.lease, undefined);
  assert.equal(f.calls(), 1);
  await assert.rejects(
    executeSuccessorComputerWork('1', task, f.manifest),
    /durable dispatch claim/
  );
  assert.equal(f.calls(), 1);
});

test('revocation after journal reservation prevents the actual network request', async (t) => {
  const f = await fixture(t);
  const original = fs.fsyncSync;
  let revoked = false;
  t.mock.method(fs, 'fsyncSync', (fd: number) => {
    original(fd);
    if (
      !revoked &&
      fs.existsSync(f.stateDirectory) &&
      fs
        .readdirSync(f.stateDirectory)
        .some((name) => /^[a-f0-9]{64}\.json$/.test(name))
    ) {
      revoked = true;
      f.policy.state.revocationEpochs['lease-1'] = 1;
      f.writePolicy();
    }
  });
  await assert.rejects(
    executeSuccessorComputerWork('1', task, f.manifest),
    /revocation epoch/
  );
  assert.equal(f.calls(), 0);
  const journal = fs
    .readdirSync(f.stateDirectory)
    .find((name) => /^[a-f0-9]{64}\.json$/.test(name))!;
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.stateDirectory, journal), 'utf8'))
      .status,
    'dispatch-denied'
  );
});

test('uncertain execution retains both journal and lease nonce across another attempt', async (t) => {
  const f = await fixture(t, { ...completed(), status: 'incomplete' });
  await assert.rejects(
    executeSuccessorComputerWork('1', task, f.manifest),
    ComputerWorkOutcomeUnknown
  );
  await assert.rejects(
    executeSuccessorComputerWork('1', task, f.manifest),
    /durable dispatch claim/
  );
  const second = await f.makeManifest('2');
  f.profile.approvedJobs.push({
    jobId: '2',
    taskSha256: computerTaskDigest(task),
    successorManifestSha256: await f.core.computerWorkBindingDigest(second),
  });
  f.writeProfile();
  await assert.rejects(
    executeSuccessorComputerWork('2', task, second),
    /durable dispatch claim/
  );
  assert.equal(f.calls(), 1);
  assert.equal(
    fs
      .readdirSync(f.stateDirectory)
      .filter((name) => name.startsWith('successor-lease-')).length,
    1
  );
});

test('concurrent different jobs cannot dispatch the same single-use lease nonce twice', async (t) => {
  const f = await fixture(t);
  const second = await f.makeManifest('2');
  f.profile.approvedJobs.push({
    jobId: '2',
    taskSha256: computerTaskDigest(task),
    successorManifestSha256: await f.core.computerWorkBindingDigest(second),
  });
  f.writeProfile();
  const results = await Promise.allSettled([
    executeSuccessorComputerWork('1', task, f.manifest),
    executeSuccessorComputerWork('2', task, second),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1
  );
  assert.equal(
    results.filter((result) => result.status === 'rejected').length,
    1
  );
  assert.equal(f.calls(), 1);
});

test('unsafe operator policy and expired or wrong-role credentials fail before dispatch', async (t) => {
  const f = await fixture(t);
  fs.chmodSync(f.policyFile, 0o666);
  await assert.rejects(
    inspectSuccessorComputerWorkAdmission('1', task, f.manifest),
    /protected operator-owned/
  );
  fs.chmodSync(f.policyFile, 0o600);
  f.policy.trustStore.keys[0].roles = ['producer'];
  f.writePolicy();
  await assert.rejects(
    inspectSuccessorComputerWorkAdmission('1', task, f.manifest),
    /not authorized as underwriter/
  );
  f.policy.trustStore.keys[0].roles = ['underwriter'];
  f.policy.trustStore.keys[0].expiresAt = new Date(
    Date.now() - 1000
  ).toISOString();
  f.writePolicy();
  await assert.rejects(
    inspectSuccessorComputerWorkAdmission('1', task, f.manifest),
    /validity window/
  );
  assert.equal(f.calls(), 0);
  assert.equal(fs.existsSync(f.stateDirectory), false);
});

test('assurance flags cannot enable live successor computer work', async (t) => {
  const f = await fixture(t);
  f.profile.mode = 'live';
  const live = structuredClone(f.manifest);
  live.mode = 'live';
  live.action.mode = 'live';
  f.profile.approvedJobs[0].successorManifestSha256 =
    await f.core.computerWorkBindingDigest(live);
  f.writeProfile();
  f.policy.assurance.commissioned = true;
  f.writePolicy();
  await assert.rejects(
    inspectSuccessorComputerWorkAdmission('1', task, live),
    (error: any) => error.code === 'UNCOMMISSIONED_RUNTIME'
  );
  assert.equal(f.calls(), 0);
});

test('unregistered work orders and withdrawn compiler action masks fail before dispatch', async (t) => {
  const f = await fixture(t);
  const workOrder = f.policy.state.workOrders[f.manifest.workOrderDigest];
  delete f.policy.state.workOrders[f.manifest.workOrderDigest];
  f.writePolicy();
  await assert.rejects(
    executeSuccessorComputerWork('1', task, f.manifest),
    (error: any) => error.code === 'WORK_ORDER_UNREGISTERED'
  );
  f.policy.state.workOrders[f.manifest.workOrderDigest] = {
    ...workOrder,
    prohibitedActions: ['fixture-run'],
  };
  f.writePolicy();
  await assert.rejects(
    executeSuccessorComputerWork('1', task, f.manifest),
    (error: any) => error.code === 'WORK_ORDER_SCOPE_DENIED'
  );
  f.policy.state.workOrders[f.manifest.workOrderDigest] = workOrder;
  f.writePolicy();
  f.profile.timeoutMs = 6000;
  f.writeProfile();
  await assert.rejects(
    executeSuccessorComputerWork('1', task, f.manifest),
    (error: any) => error.code === 'INSUFFICIENT_AUTHORIZED_TIME'
  );
  assert.equal(f.calls(), 0);
  assert.equal(fs.existsSync(f.stateDirectory), false);
});

test('economic linkage preserves AGIALPHA denomination and cannot confer a favorable verdict', async () => {
  const deployment = {
    mode: 'fixture',
    chainId: '31337',
    registryAddress: `0x${'1'.repeat(40)}`,
    tokenAddress: `0x${'2'.repeat(40)}`,
    tokenSymbol: 'AGIALPHA',
    decimals: 18,
    minConfirmations: 2,
  };
  const link = {
    schemaVersion: '1.0.0',
    ...deployment,
    missionId: 'invoice',
    workOrderDigest: digest('b'),
    jobId: '1',
    amountMinor: '1000000000000000000',
    status: 'confirmed',
    transactionHash: `0x${'3'.repeat(64)}`,
    blockHash: `0x${'4'.repeat(64)}`,
    blockNumber: 5,
    logIndex: 0,
    confirmations: 2,
    canonical: true,
  } as any;
  delete link.minConfirmations;
  const observation: any = await describeSuccessorSettlement(link, deployment);
  assert.equal(observation.economicOnly, true);
  assert.equal(observation.simulated, true);
  assert.equal(observation.proofApproved, false);
  assert.equal(observation.authorityGranted, false);
  assert.equal(observation.buyerAccepted, false);
  await assert.rejects(
    describeSuccessorSettlement(
      { ...link, tokenSymbol: 'USDC', decimals: 6 },
      deployment
    ),
    /AGIALPHA/
  );
  await assert.rejects(
    describeSuccessorSettlement({ ...link, chainId: '1' }, deployment),
    /trusted deployment/
  );
  await assert.rejects(
    describeSuccessorSettlement({ ...link, canonical: false }, deployment),
    /canonical event evidence/
  );
  await assert.rejects(
    describeSuccessorSettlement({ ...link, confirmations: 1 }, deployment),
    /finality threshold/
  );
});

test('reverted receipts and a substituted registry cannot be reconciled as settlements', async () => {
  const deployment = {
    mode: 'fixture' as const,
    chainId: '31337',
    registryAddress: `0x${'1'.repeat(40)}`,
    tokenAddress: `0x${'2'.repeat(40)}`,
    tokenSymbol: 'AGIALPHA' as const,
    decimals: 18 as const,
    minConfirmations: 1,
  };
  const workOrderDigest = digest('b');
  const committedSpec = JSON.stringify({
    metadata: {
      successorComputerWork: { missionId: 'invoice', workOrderDigest },
    },
  });
  const request = {
    missionId: 'invoice',
    workOrderDigest,
    committedSpec,
    jobId: '1',
    transactionHash: `0x${'3'.repeat(64)}`,
    completedDeliverable: 'accurate evaluation report',
  };
  const registry: any = {
    runner: {
      provider: {
        getNetwork: async () => ({ chainId: 31337n }),
        getTransactionReceipt: async () => ({
          status: 0,
          hash: request.transactionHash,
        }),
      },
    },
    getAddress: async () => deployment.registryAddress,
    jobs: async () => ({
      specHash: keccak256(toUtf8Bytes(committedSpec)),
      resultHash: keccak256(toUtf8Bytes(request.completedDeliverable)),
    }),
  };
  await assert.rejects(
    reconcileSuccessorSettlement(registry, request, deployment),
    /Successful canonical settlement receipt/
  );
  await assert.rejects(
    reconcileSuccessorSettlement(registry, request, {
      ...deployment,
      registryAddress: `0x${'9'.repeat(40)}`,
    }),
    /trusted deployment/
  );
});
