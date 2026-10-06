'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  http = require('node:http'),
  { createHash, randomUUID } = require('node:crypto');
const { review, reviewReceipt } = require('../computer-work/review.cjs');
const { createServer } = require('../computer-work/server.cjs');
const {
  executeComputerWork,
  computerTaskDigest,
} = require('../../../apps/orchestrator/computerWork.ts');
const task = require('../computer-work/task.json');
const sha = (s) => createHash('sha256').update(s).digest('hex');
async function baseline() {
  const { plan, brief } = await import('../computer-work/model.mjs');
  const source = await fs.readFile(
    path.join(__dirname, '../computer-work/board.json')
  );
  const board = JSON.parse(source),
    digest = sha(source),
    allocation = plan(board, digest);
  return { plan, brief, board, digest, allocation };
}
async function listen(server, t) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      })
  );
  return `http://127.0.0.1:${server.address().port}`;
}
test('all ten jobs produce the hand-reviewed baseline and exact USDC totals', async () => {
  const { allocation, brief } = await baseline();
  assert.equal(review(allocation, brief(allocation)).status, 'passed');
  assert.equal(allocation.jobs.length, 10);
  assert.equal(allocation.totals.reservedUsdc, '10600.000000');
  assert.equal(allocation.totals.reviewMinutes, 50);
});
test('tiny budget, zero review and worker outage change admission without dispatch', async () => {
  const { plan, board, digest } = await baseline();
  for (const options of [{ budgetUsdc: '0.000001' }, { reviewMinutes: 0 }])
    assert.equal(plan(board, digest, options).totals.planned, 0);
  const p = plan(board, digest, { offline: ['earth-code'] });
  assert.ok(!p.jobs.some((j) => j.worker === 'earth-code'));
  assert.equal(p.dispatched, false);
  assert.equal(p.settlementApproved, false);
});
test('invalid monetary formats, unknown workers and duplicate IDs reject', async () => {
  const { plan, board, digest } = await baseline();
  for (const budgetUsdc of [
    '1e6',
    '-1.000000',
    'NaN',
    '1.2345678',
    '100',
    '00.000001',
  ])
    assert.throws(() => plan(board, digest, { budgetUsdc }));
  assert.throws(() => plan(board, digest, { offline: ['intruder'] }));
  board.jobs.push(board.jobs[0]);
  assert.throws(() => plan(board, digest), /duplicate/);
});
test('same-operator reviewer cannot make a worker eligible', async () => {
  const { plan, board, digest } = await baseline();
  board.reviewers = board.workers.map((w) => ({
    id: w.id,
    operator: w.operator,
    skills: w.skills,
    minutes: 1000,
  }));
  const result = plan(board, digest);
  assert.equal(result.jobs.find((j) => j.jobId === 'work-06').status, 'held');
});
test('rightless, private and unprofitable work is held before resource use', async () => {
  const { plan, board, digest } = await baseline();
  board.jobs[0].dataClass = 'private';
  board.jobs[1].rightsConfirmed = false;
  board.jobs[2].providerCostUsdc = '1000.000000';
  const result = plan(board, digest);
  assert.deepEqual(
    result.jobs.slice(0, 3).map((j) => j.reason),
    ['data-rights', 'data-rights', 'margin']
  );
});
test('independent checker rejects altered amounts, missing jobs and misleading brief', async () => {
  const { allocation, brief } = await baseline();
  for (const mutate of [
    (a) => a.jobs.pop(),
    (a) => (a.totals.reservedUsdc = '0.000000'),
    (a) => (a.jobs[0].reviewer = 'earth-code'),
    (a) => (a.settlementApproved = true),
  ]) {
    const changed = structuredClone(allocation);
    mutate(changed);
    assert.equal(review(changed, brief(changed)).status, 'rejected');
  }
  assert.equal(
    review(allocation, brief(allocation) + '\nSettlement approved.').status,
    'rejected'
  );
});
test('server serves only declared files on loopback with no write methods', async (t) => {
  const origin = await listen(createServer(), t);
  let response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.ok(
    response.headers
      .get('content-security-policy')
      .includes("default-src 'none'")
  );
  for (const url of [
    '/../worker.cjs',
    '/worker.cjs',
    '/%2e%2e/task.json',
    '/board.json?x=1',
  ])
    assert.equal(
      await new Promise((resolve, reject) => {
        http
          .get(origin, { path: url }, (res) => {
            res.resume();
            resolve(res.statusCode);
          })
          .on('error', reject);
      }),
      404
    );
  assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
  assert.equal(
    await new Promise((resolve, reject) => {
      http
        .get(origin, { headers: { host: 'evil.example' } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    }),
    403
  );
});
test('actual admitted Responses adapter produces reviewable fixture evidence and blocks duplicate dispatch', async (t) => {
  const { allocation, brief } = await baseline();
  let calls = 0;
  const token = randomUUID();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'planetary-adapter-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  process.env.COMPUTER_WORK_PLANETARY_TEST_TOKEN = token;
  t.after(() => delete process.env.COMPUTER_WORK_PLANETARY_TEST_TOKEN);
  const artifacts = [
    {
      name: 'allocation.json',
      mediaType: 'application/json',
      content: JSON.stringify(allocation, null, 2) + '\n',
    },
    {
      name: 'brief.md',
      mediaType: 'text/markdown',
      content: brief(allocation),
    },
  ];
  const origin = await listen(
    http.createServer(async (req, res) => {
      calls++;
      try {
        assert.equal(req.url, '/v1/responses');
        assert.equal(req.headers.authorization, `Bearer ${token}`);
        assert.match(req.headers['x-openclaw-session-key'], /^agijobs:/);
        let body = '';
        for await (const chunk of req) body += chunk;
        const request = JSON.parse(body);
        assert.equal(request.model, 'openclaw/planetary');
        assert.equal(
          JSON.parse(request.input).taskSha256,
          computerTaskDigest(task)
        );
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'fixture-planetary',
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
                      summary: 'Synthetic planning fixture; no actual provider',
                      artifacts,
                    }),
                  },
                ],
              },
            ],
          })
        );
      } catch (error) {
        res.writeHead(500);
        res.end(error.message);
      }
    }),
    t
  );
  const profile = {
    endpoint: origin + '/v1/responses',
    agentId: 'planetary',
    tokenEnv: 'COMPUTER_WORK_PLANETARY_TEST_TOKEN',
    deploymentId: 'planetary-test',
    mode: 'fixture',
    timeoutMs: 10000,
    maxResponseBytes: 262144,
    maxOutputTokens: 8192,
    approvedJobs: [],
  };
  await assert.rejects(
    executeComputerWork('1', task, profile, { stateDirectory: dir })
  );
  assert.equal(calls, 0);
  profile.approvedJobs = [{ jobId: '1', taskSha256: computerTaskDigest(task) }];
  const receipt = await executeComputerWork('1', task, profile, {
    stateDirectory: dir,
  });
  const context = { jobId: '1', deploymentId: 'planetary-test' };
  assert.equal(reviewReceipt(receipt, context).status, 'passed');
  assert.equal(reviewReceipt(receipt, context).providerAuthenticated, false);
  await assert.rejects(
    executeComputerWork('1', task, profile, { stateDirectory: dir }),
    /already dispatched/
  );
  assert.equal(calls, 1);
  for (const mutate of [
    (r) => (r.jobId = '2'),
    (r) => (r.deploymentId = 'other'),
    (r) => (r.task.goal = 'Changed'),
    (r) => (r.taskSha256 = '0'.repeat(64)),
    (r) => r.artifacts[0].bytes++,
    (r) => (r.status = 'dispatched'),
    (r) => r.artifacts.pop(),
    (r) => (r.artifacts[0].content += 'x'),
  ]) {
    const changed = structuredClone(receipt);
    mutate(changed);
    assert.equal(reviewReceipt(changed, context).status, 'rejected');
  }
  const changed = structuredClone(receipt);
  const value = JSON.parse(changed.artifacts[0].content);
  value.totals.reservedUsdc = '1.000000';
  changed.artifacts[0].content = JSON.stringify(value);
  changed.artifacts[0].sha256 = sha(changed.artifacts[0].content);
  changed.artifacts[0].bytes = Buffer.byteLength(changed.artifacts[0].content);
  assert.equal(reviewReceipt(changed, context).status, 'rejected');
});
