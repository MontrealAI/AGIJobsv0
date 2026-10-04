import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ethers } from 'ethers';
import {
  computerTaskDigest,
  executeComputerWork,
  parseComputerWorkTask,
} from '../computerWork';
import { approveAgentEndpoint, invokeApprovedAgent } from '../agentPolicy';
import { buildPipeline } from '../pipeline';
import { submitJobResult } from '../submission';
import { evaluateSubmission } from '../validation';
import { fetchArtifactBytes } from '../artifactSource';
import { MetaOrchestrator } from '../service';
import * as execution from '../execution';

const task = {
  schemaVersion: 1,
  workerProfile: 'isolated',
  goal: 'Create a report',
  inputText: 'Use the synthetic fixture only.',
  dataClass: 'synthetic',
  allowedOrigins: ['https://example.com'],
  acceptanceCriteria: ['Report cites its source.'],
  deliverables: [{ name: 'report.json', mediaType: 'application/json' }],
};
const completed = () => ({
  id: 'resp_test',
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
            summary: 'Candidate report',
            artifacts: [
              {
                name: 'report.json',
                mediaType: 'application/json',
                content: '{"source":"fixture"}',
              },
            ],
          }),
        },
      ],
    },
  ],
});

async function fixture(
  t: any,
  responder: (req: http.IncomingMessage, res: http.ServerResponse) => void
) {
  const server = http.createServer(responder);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'computer-work-test-'));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.COMPUTER_WORK_TEST_TOKEN = 'synthetic-token';
  t.after(() => {
    delete process.env.COMPUTER_WORK_TEST_TOKEN;
  });
  const endpoint = `http://127.0.0.1:${address.port}/v1/responses`;
  const profile = {
    endpoint,
    agentId: 'worker',
    tokenEnv: 'COMPUTER_WORK_TEST_TOKEN',
    deploymentId: 'fixture',
    mode: 'fixture',
    timeoutMs: 1000,
    maxResponseBytes: 100_000,
    maxOutputTokens: 2048,
    approvedJobs: [{ jobId: '1', taskSha256: computerTaskDigest(task) }],
  };
  return { endpoint, profile, options: { stateDirectory: dir } };
}

test('admitted task uses authenticated isolated OpenResponses and returns hashed evidence, never approval', async (t) => {
  let calls = 0;
  let body: any;
  let headers: http.IncomingHttpHeaders = {};
  const f = await fixture(t, (req, res) => {
    calls++;
    headers = req.headers;
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      body = JSON.parse(data);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(completed()));
    });
  });
  const receipt: any = await executeComputerWork(
    '1',
    task,
    f.profile,
    f.options
  );
  assert.equal(headers.authorization, 'Bearer synthetic-token');
  assert.match(String(headers['x-openclaw-session-key']), /^agijobs:/);
  assert.equal(body.model, 'openclaw/worker');
  assert.equal(body.stream, false);
  assert.equal(body.user, undefined);
  assert.equal(body.previous_response_id, undefined);
  assert.equal(JSON.parse(body.input).taskSha256, computerTaskDigest(task));
  assert.equal(receipt.status, 'evidence-ready');
  assert.equal(receipt.simulated, true);
  assert.equal(receipt.settlementApproved, false);
  assert.equal(receipt.review.status, 'required');
  assert.match(receipt.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.readdirSync(f.options.stateDirectory).length, 1);
  await assert.rejects(
    executeComputerWork('1', task, f.profile, f.options),
    /EEXIST|already dispatched/
  );
  assert.equal(calls, 1);
});

test('admission rejects task tampering and missing secrets before any request', async (t) => {
  let calls = 0;
  const f = await fixture(t, (_req, res) => {
    calls++;
    res.end('{}');
  });
  await assert.rejects(
    executeComputerWork(
      '1',
      { ...task, goal: 'Different work' },
      f.profile,
      f.options
    ),
    /admission/
  );
  await assert.rejects(
    executeComputerWork('2', task, f.profile, f.options),
    /admission/
  );
  delete process.env.COMPUTER_WORK_TEST_TOKEN;
  await assert.rejects(
    executeComputerWork('1', task, f.profile, f.options),
    /token/
  );
  assert.equal(calls, 0);
  assert.equal(fs.readdirSync(f.options.stateDirectory).length, 0);
});

test('invalid and incomplete provider outcomes remain blocked across a second dispatch', async (t) => {
  const cases: [string, () => unknown][] = [
    ['bare acknowledgement', () => ({ ok: true })],
    ['truncation', () => ({ ...completed(), status: 'incomplete' })],
    [
      'pending tool',
      () => ({ ...completed(), output: [{ type: 'function_call' }] }),
    ],
    [
      'refusal',
      () => ({
        ...completed(),
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal' }],
          },
        ],
      }),
    ],
    [
      'missing artifact',
      () => {
        const r = completed();
        r.output[0].content[0].text =
          '{"status":"completed","artifacts":[],"summary":"done"}';
        return r;
      },
    ],
    [
      'duplicate artifact',
      () => {
        const r = completed();
        const result = JSON.parse(r.output[0].content[0].text);
        result.artifacts.push(result.artifacts[0]);
        r.output[0].content[0].text = JSON.stringify(result);
        return r;
      },
    ],
  ];
  for (const [name, make] of cases)
    await t.test(name, async (t) => {
      let calls = 0;
      const f = await fixture(t, (_req, res) => {
        calls++;
        res.end(JSON.stringify(make()));
      });
      await assert.rejects(
        executeComputerWork('1', task, f.profile, f.options),
        { code: 'COMPUTER_WORK_OUTCOME_UNKNOWN' }
      );
      await assert.rejects(
        executeComputerWork('1', task, f.profile, f.options)
      );
      assert.equal(calls, 1);
      const journal = JSON.parse(
        fs.readFileSync(
          path.join(
            f.options.stateDirectory,
            fs.readdirSync(f.options.stateDirectory)[0]
          ),
          'utf8'
        )
      );
      assert.equal(journal.status, 'dispatched');
      assert.ok(!JSON.stringify(journal).includes('synthetic-token'));
    });
});

test('timeouts, redirects and response limits do not retry or follow another destination', async (t) => {
  for (const mode of ['timeout', 'redirect', 'oversized'])
    await t.test(mode, async (t) => {
      let calls = 0;
      const f = await fixture(t, (_req, res) => {
        calls++;
        if (mode === 'timeout') return;
        if (mode === 'redirect') {
          res.writeHead(302, { location: '/private' });
          res.end();
          return;
        }
        res.end('x'.repeat(2000));
      });
      await assert.rejects(
        executeComputerWork(
          '1',
          task,
          {
            ...f.profile,
            timeoutMs: mode === 'timeout' ? 50 : 1000,
            maxResponseBytes: 1024,
          },
          f.options
        ),
        { code: 'COMPUTER_WORK_OUTCOME_UNKNOWN' }
      );
      assert.equal(calls, 1);
    });
});

test('pre-dispatch cancellation creates no journal or request', async (t) => {
  let calls = 0;
  const f = await fixture(t, (_req, res) => {
    calls++;
    res.end('{}');
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    executeComputerWork('1', task, f.profile, {
      ...f.options,
      signal: controller.signal,
    }),
    /cancelled/
  );
  assert.equal(calls, 0);
  assert.equal(fs.readdirSync(f.options.stateDirectory).length, 0);
});

test('cancellation after dispatch is an unknown outcome and cannot replay', async (t) => {
  const controller = new AbortController();
  let calls = 0;
  const f = await fixture(t, () => {
    calls++;
    controller.abort();
  });
  await assert.rejects(
    executeComputerWork('1', task, f.profile, {
      ...f.options,
      signal: controller.signal,
    }),
    { code: 'COMPUTER_WORK_OUTCOME_UNKNOWN' }
  );
  await assert.rejects(
    executeComputerWork('1', task, f.profile, f.options),
    /already dispatched/
  );
  assert.equal(calls, 1);
});

test('schema rejects hidden fields, path traversal, duplicate outputs and unsafe origins', () => {
  for (const changed of [
    { ...task, endpoint: 'https://attacker.example' },
    { ...task, deliverables: [{ name: '../secret', mediaType: 'text/plain' }] },
    { ...task, deliverables: [task.deliverables[0], task.deliverables[0]] },
    { ...task, allowedOrigins: ['http://169.254.169.254'] },
    { ...task, allowedOrigins: ['https://example.com/path'] },
    { ...task, dataClass: 'private' },
  ])
    assert.throws(() => parseComputerWorkTask(changed));
  assert.equal(
    computerTaskDigest(task),
    computerTaskDigest(Object.fromEntries(Object.entries(task).reverse()))
  );
});

test('generic endpoints require exact operator admission and reject redirects', async (t) => {
  const old = process.env.ORCHESTRATOR_AGENT_ENDPOINTS;
  t.after(() => {
    if (old === undefined) delete process.env.ORCHESTRATOR_AGENT_ENDPOINTS;
    else process.env.ORCHESTRATOR_AGENT_ENDPOINTS = old;
  });
  delete process.env.ORCHESTRATOR_AGENT_ENDPOINTS;
  assert.throws(
    () => approveAgentEndpoint('https://example.com'),
    /not approved/
  );
  let calls = 0;
  const f = await fixture(t, (_req, res) => {
    calls++;
    res.writeHead(302, { location: '/private' });
    res.end();
  });
  process.env.ORCHESTRATOR_AGENT_ENDPOINTS = JSON.stringify([f.endpoint]);
  assert.equal(approveAgentEndpoint(f.endpoint), f.endpoint);
  assert.throws(
    () => approveAgentEndpoint(f.endpoint + '/other'),
    /not approved/
  );
  await assert.rejects(invokeApprovedAgent(f.endpoint, {}));
  assert.equal(calls, 1);
  for (const endpoint of [
    'http://169.254.169.254',
    'https://user:pass@example.com',
    'https://example.com?secret=x',
    'file:///tmp/data',
  ]) {
    process.env.ORCHESTRATOR_AGENT_ENDPOINTS = JSON.stringify([endpoint]);
    assert.throws(() => approveAgentEndpoint(endpoint));
  }
});

test('computer pipeline cannot be relabelled or replaced by a job-supplied stage', () => {
  const context = {
    jobId: '1',
    category: 'computer-work',
    tags: [],
    metadata: { computerWork: task },
  };
  assert.equal(buildPipeline(context).length, 1);
  assert.throws(() =>
    buildPipeline(context, [{ name: 'override', handler: 'report.generate' }])
  );
  assert.throws(() =>
    buildPipeline({ ...context, category: 'default' }, [
      { name: 'hidden', handler: 'computer.execute' },
    ])
  );
});

test('worker completion submits the exact manifest hash for review without finalizing', async () => {
  const manifest = {
    context: { category: 'computer-work' },
    artifacts: [{ digest: 'test' }],
  };
  let args: unknown[] = [];
  const registry: any = {
    submit: async (...values: unknown[]) => {
      args = values;
      return { hash: 'tx', wait: async () => ({ status: 1 }) };
    },
    finalize: () => assert.fail('must not finalize'),
  };
  const result = await submitJobResult(
    registry,
    '12',
    manifest,
    'ipfs://fixture',
    'worker'
  );
  assert.deepEqual(args, [
    '12',
    ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(manifest))),
    'ipfs://fixture',
    'worker',
    [],
  ]);
  assert.equal(result.txHash, 'tx');
  await assert.rejects(
    submitJobResult(
      { submit: async () => ({ wait: async () => null }) } as any,
      '12',
      manifest,
      'ipfs://fixture',
      'worker'
    ),
    /not confirmed/
  );
});

test('valid computer manifest with matching on-chain hash still requires independent review', async (t) => {
  const body = JSON.stringify({
    jobId: '1',
    context: { category: 'computer-work' },
    artifacts: [],
  });
  const f = await fixture(t, (_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(body);
  });
  const registry: any = {
    filters: { ResultSubmitted: () => ({}) },
    queryFilter: async () => [
      {
        args: [
          '1',
          ethers.ZeroAddress,
          ethers.keccak256(ethers.toUtf8Bytes(body)),
          f.endpoint,
          'worker',
        ],
        blockNumber: 10,
      },
    ],
  };
  const result = await evaluateSubmission({
    registry,
    provider: { getBlockNumber: async () => 10 } as any,
    jobId: 1n,
    ipfsGateway: f.endpoint,
  });
  assert.equal(result.approve, false);
  assert.equal(result.requiresIndependentReview, true);
  const validator: any = {
    registry,
    provider: { getBlockNumber: async () => 10 },
    config: { ipfsGateway: f.endpoint },
    validationModule: {
      jobNonce: () =>
        assert.fail('Independent review must abstain before any vote'),
    },
    commits: new Map(),
    appliedJobs: new Map(),
  };
  await (MetaOrchestrator.prototype as any).commitValidation.call(
    validator,
    1n,
    { address: ethers.ZeroAddress, wallet: { connect: () => ({}) } }
  );
});

test('assigned-job orchestration confirms submission before starting review', async () => {
  const order: string[] = [];
  const manifest = {
    jobId: '1',
    context: { category: 'computer-work' },
    artifacts: [],
  };
  const run = mock.method(
    execution,
    'runJob',
    async () =>
      ({
        stageCids: ['stage'],
        manifestCid: 'manifest',
        manifestUrl: 'ipfs://manifest',
        finalCid: 'stage',
        manifest,
        snapshot: { stageCount: 1, keywords: [] },
      } as any)
  );
  const registry: any = {
    connect() {
      return this;
    },
    submit: async (_id: string, hash: string) => {
      assert.equal(
        hash,
        ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(manifest)))
      );
      order.push('submit');
      return {
        hash: 'tx',
        wait: async () => {
          order.push('confirmed');
          return { status: 1 };
        },
      };
    },
    finalize: () => assert.fail('Worker must submit before review'),
  };
  const orchestrator: any = {
    registry,
    beginReviewPhase: (_id: string, reason: string) => {
      assert.equal(reason, 'evidence-submitted');
      order.push('review');
    },
    recordCompletedJob: () => order.push('evidence'),
    learning: {
      recordJobOutcome: async () => {
        assert.fail('Submission is not an accepted outcome');
      },
    },
    spawnSubtasks: async () => {
      assert.fail('Dependent work must wait for settlement');
    },
    watchdog: { recordFailure: () => {} },
  };
  try {
    await (MetaOrchestrator.prototype as any).executeAssignedJob.call(
      orchestrator,
      '1',
      {
        identity: { address: ethers.ZeroAddress, label: 'worker' },
        wallet: {},
        classification: { category: 'computer-work', tags: [] },
        spec: { metadata: { computerWork: task } },
        summary: {},
      },
      { employer: ethers.ZeroAddress, reward: 1n, stake: 1n }
    );
    assert.deepEqual(order, ['submit', 'confirmed', 'review', 'evidence']);
  } finally {
    run.mock.restore();
  }
});

test('settlement learning records the actual outcome once and spawns only after success', async () => {
  for (const success of [true, false]) {
    const outcomes: boolean[] = [];
    let spawned = 0;
    const state = {
      identity: {},
      classification: {},
      summary: {},
      spec: {},
      execution: { runResult: {}, resultRef: 'ipfs://fixture', chainJob: {} },
    };
    const orchestrator = {
      appliedJobs: new Map([['1', state]]),
      learning: {
        recordJobOutcome: async (context: any) => {
          outcomes.push(context.success);
        },
      },
      spawnSubtasks: async () => {
        spawned++;
      },
    };
    await (MetaOrchestrator.prototype as any).recordSettledOutcome.call(
      orchestrator,
      '1',
      success
    );
    await (MetaOrchestrator.prototype as any).recordSettledOutcome.call(
      orchestrator,
      '1',
      success
    );
    assert.deepEqual(outcomes, [success]);
    assert.equal(spawned, success ? 1 : 0);
  }
});

test('job and result downloads reject unapproved origins and redirects', async (t) => {
  let calls = 0;
  const f = await fixture(t, (_req, res) => {
    calls++;
    res.writeHead(302, { location: 'http://169.254.169.254' });
    res.end();
  });
  await assert.rejects(fetchArtifactBytes(f.endpoint), /not approved/);
  assert.equal(calls, 0);
  await assert.rejects(fetchArtifactBytes(f.endpoint, f.endpoint));
  assert.equal(calls, 1);
});
