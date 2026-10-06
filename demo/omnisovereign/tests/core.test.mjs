import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import {
  stages,
  amount,
  decimal,
  capacity,
  makeTask,
  taskDigest,
  json,
  sha256,
  validateScenario,
} from '../model.mjs';
import { execute } from '../execute.mjs';
import { reviewBundle, reviewReceipt, reviewCandidate } from '../review.mjs';
import { readJson } from '../io.cjs';
import { createServer, assetNames } from '../server.cjs';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readJson(path.join(root, 'scenario.json'));
const fresh = () => structuredClone(source);
const artifact = (bundle, index) =>
  JSON.parse(bundle.results[index].artifact.content);

test('all six real computations preserve the original dependency graph and expose concrete constraints', async () => {
  const legacy = readJson(path.join(root, 'project-plan.omnisovereign.json'));
  assert.deepEqual(
    stages.map((s) => [s.id, s.dependencies]),
    legacy.jobs.map((s) => [s.id, s.dependencies])
  );
  const bundle = await execute(source);
  assert.equal((await reviewBundle(bundle, source)).accepted, true);
  assert.equal(
    (
      await reviewCandidate(
        bundle.results[3].artifact.content,
        source,
        stages[3].id
      )
    ).accepted,
    true
  );
  assert.equal(
    (await reviewCandidate('{}', source, stages[3].id)).accepted,
    false
  );
  assert.equal(artifact(bundle, 0).plannedRewardsUsdc, '23500.000000');
  assert.equal(artifact(bundle, 0).estimatedProviderCostUsdc, '3330.000000');
  assert.equal(artifact(bundle, 2).unallocatedUsdc, '16500.000000');
  assert.equal(artifact(bundle, 3).netMwh, -60);
  assert.deepEqual(artifact(bundle, 4).admittedWorkIds, [
    'OMNI-001',
    'OMNI-002',
    'OMNI-003',
  ]);
  assert.deepEqual(artifact(bundle, 4).deferredWorkIds, [
    'OMNI-004',
    'OMNI-005',
    'OMNI-006',
  ]);
  assert.equal(artifact(bundle, 4).unmetMinutes, 43);
  assert.equal(artifact(bundle, 5).reviewDeferredCount, 3);
  assert.deepEqual(await execute(source), bundle, 'replay is deterministic');
});

test('independent checks reject wrong content even after byte counts and hashes are repaired', async () => {
  const edits = [
    (x) => {
      x.plannedRewardsUsdc = '23501.000000';
    },
    (x) => {
      x.regions[0].workIds = [];
    },
    (x) => {
      x.unallocatedUsdc = '999999.000000';
    },
    (x) => {
      x.netMwh = 60;
    },
    (x) => {
      x.admittedWorkIds.push('OMNI-004');
    },
    (x) => {
      x.chainTransactions = 1;
    },
  ];
  for (const [i, edit] of edits.entries()) {
    const bundle = await execute(source),
      a = bundle.results[i].artifact;
    const value = JSON.parse(a.content);
    edit(value);
    a.content = json(value);
    a.bytes = Buffer.byteLength(a.content);
    a.sha256 = await sha256(a.content);
    const review = await reviewBundle(bundle, source);
    assert.equal(review.accepted, false);
    assert.match(review.error, /independent arithmetic/);
  }
});

test('source, stage coverage, ordering, task digests and approval claims cannot be substituted', async () => {
  const edits = [
    (b) => {
      b.sourceSha256 = '0'.repeat(64);
    },
    (b) => {
      b.results.pop();
    },
    (b) => {
      b.results[1] = b.results[0];
    },
    (b) => {
      b.results[1].dependencies = [];
    },
    (b) => {
      b.results[1].taskSha256 = '0'.repeat(64);
    },
    (b) => {
      b.productionApproved = true;
    },
    (b) => {
      b.settlementApproved = true;
    },
    (b) => {
      b.providerCalls = 1;
    },
    (b) => {
      b.extraApproval = true;
    },
    (b) => {
      b.results[0].artifact.content += ' ';
    },
    (b) => {
      b.results[0].artifact.name = '../private.json';
    },
  ];
  for (const edit of edits) {
    const bundle = await execute(source);
    edit(bundle);
    assert.equal((await reviewBundle(bundle, source)).accepted, false);
  }
  for (const b of [null, [], {}, 'bad', { content: 'x'.repeat(1048577) }])
    assert.equal((await reviewBundle(b, source)).accepted, false);
});

test('exact money, budget deficits, constrained regional review and malformed scenarios', async () => {
  assert.equal(decimal(amount('9999999999999.999999')), '9999999999999.999999');
  for (const bad of ['-1', '1e9', '0.0000001', '01', 'NaN', Infinity, 5])
    assert.throws(() => amount(bad));
  const s = fresh();
  s.budgetUsdc = '100.000001';
  s.work[0].rewardUsdc = '1500.000001';
  const bundle = await execute(s);
  assert.equal(artifact(bundle, 2).unallocatedUsdc, '-23400.000000');
  assert.equal(artifact(bundle, 2).reserveAdequate, false);
  assert.equal(
    (await reviewBundle(bundle, s)).accepted,
    true,
    'a disclosed planning deficit is not a computation error'
  );
  for (const r of s.regions) r.reviewMinutes = 0;
  assert.equal(artifact(await execute(s), 4).deferredWorkIds.length, 6);
  for (const mutate of [
    (x) => {
      x.work[1].id = x.work[0].id;
    },
    (x) => {
      x.work[0].region = 'unknown';
    },
    (x) => {
      x.regions[0].demandMwh = NaN;
    },
    (x) => {
      x.work[0].reviewMinutes = -1;
    },
  ]) {
    const x = fresh();
    mutate(x);
    assert.throws(() => validateScenario(x));
  }
});

test('capacity is limited by useful execution, independent review and the stated market ceiling', () => {
  const input = {
    agents: 1000,
    jobsPerDay: 2,
    usefulPercent: 80,
    reviewHours: 200,
    minutesPerJob: 15,
    priceUsdc: 1000,
  };
  assert.equal(capacity(input).annualVolumeUsdc, 292000000);
  assert.equal(capacity({ ...input, reviewHours: 0 }).annualVolumeUsdc, 0);
  assert.equal(
    capacity({ ...input, agents: 1 }).bottleneck,
    'Useful worker output'
  );
  assert.equal(
    capacity({
      ...input,
      agents: 1e9,
      jobsPerDay: 1e4,
      reviewHours: 1e9,
      minutesPerJob: 0.1,
    }).annualVolumeUsdc,
    40e12
  );
  for (const key of Object.keys(input))
    for (const bad of [NaN, Infinity, -1, '1'])
      assert.throws(() => capacity({ ...input, [key]: bad }));
  assert.throws(() => capacity({ ...input, minutesPerJob: 0 }));
});

test('bounded CLI evidence runs preserve existing output and fail visibly on invalid files', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-cli-'));
  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(root, 'cli.mjs'), ...args], {
      encoding: 'utf8',
      timeout: 20000,
    });
  try {
    const output = path.join(temp, 'run');
    const first = cli('run', output);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(fs.readdirSync(output).length, 16);
    assert.equal(cli('run', output).status, 1, 'no overwrite');
    assert.equal(cli('review', path.join(output, 'evidence.json')).status, 0);
    assert.equal(cli('task', 'invalid').status, 1);
    assert.equal(cli('review', output).status, 1);
    const bad = path.join(temp, 'huge.json');
    fs.writeFileSync(bad, ' '.repeat(1048577));
    assert.equal(cli('review', bad).status, 1);
    fs.writeFileSync(bad, Buffer.from([0xff]));
    assert.throws(() => readJson(bad));
    fs.symlinkSync(
      path.join(output, 'evidence.json'),
      path.join(temp, 'link.json')
    );
    assert.throws(() => readJson(path.join(temp, 'link.json')));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('worker CLI inspects the exact contract and shipped profiles refuse dispatch', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-admission-'));
  const worker = (...args) =>
    spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(root, 'worker.cjs'), ...args],
      {
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          COMPUTER_WORK_PROFILES_FILE: path.join(
            root,
            'worker-profiles.example.json'
          ),
          COMPUTER_WORK_STATE_DIR: path.join(temp, 'journal'),
        },
      }
    );
  try {
    const inspected = worker('inspect', stages[0].id);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(
      JSON.parse(inspected.stdout).taskSha256,
      await taskDigest(await makeTask(source, stages[0].id))
    );
    const denied = worker('run', stages[0].id, '73');
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /operator admission/);
    assert.equal(fs.existsSync(path.join(temp, 'journal')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('local server serves only public assets and rejects mutations and foreign browser access', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const name of assetNames) {
      const response = await fetch(base + '/' + name);
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    assert.equal((await fetch(base + '/', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
    assert.equal(
      (await fetch(base + '/worker-profiles.example.json')).status,
      404
    );
    assert.equal(
      (await fetch(base + '/', { headers: { Origin: 'https://example.org' } }))
        .status,
      403
    );
    const foreignHostStatus = await new Promise((resolve, reject) => {
      http
        .get(base, { headers: { Host: 'example.org' } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(foreignHostStatus, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('six task digests agree with the real adapter; admitted fixture dispatches remain independently reviewable', async () => {
  const {
    parseComputerWorkTask,
    computerTaskDigest,
    executeComputerWork,
  } = require('../../../apps/orchestrator/computerWork.ts');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-worker-'));
  const tokenName = 'COMPUTER_WORK_OMNI_TEST_TOKEN',
    oldToken = process.env[tokenName],
    token = randomUUID();
  process.env[tokenName] = token;
  const bundle = await execute(source);
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body),
      input = JSON.parse(request.input);
    assert.equal(req.headers.authorization, 'Bearer ' + token);
    assert.equal(request.model, 'openclaw/omnisovereign');
    assert.ok(req.headers['x-openclaw-session-key']);
    const a = bundle.results.find(
      (r) => r.taskSha256 === input.taskSha256
    ).artifact;
    calls++;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        id: 'fixture_' + calls,
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
                  summary: 'Synthetic adapter fixture; no live provider.',
                  artifacts: [
                    {
                      name: a.name,
                      mediaType: a.mediaType,
                      content: a.content,
                    },
                  ],
                }),
              },
            ],
          },
        ],
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [i, stage] of stages.entries()) {
      const task = await makeTask(source, stage.id),
        jobId = String(i + 1);
      assert.deepEqual(parseComputerWorkTask(task), task);
      assert.equal(computerTaskDigest(task), await taskDigest(task));
      const profile = {
        endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/responses',
        agentId: 'omnisovereign',
        tokenEnv: tokenName,
        deploymentId: 'synthetic-omni-deployment',
        mode: 'fixture',
        timeoutMs: 10000,
        maxResponseBytes: 262144,
        maxOutputTokens: 8192,
        approvedJobs: [{ jobId, taskSha256: computerTaskDigest(task) }],
      };
      const receipt = await executeComputerWork(jobId, task, profile, {
        stateDirectory: temp,
      });
      assert.equal(
        (
          await reviewReceipt(
            receipt,
            source,
            stage.id,
            jobId,
            profile.deploymentId
          )
        ).accepted,
        true
      );
      assert.equal(
        (
          await reviewReceipt(
            receipt,
            source,
            stage.id,
            '999',
            profile.deploymentId
          )
        ).accepted,
        false
      );
      assert.equal(
        (
          await reviewReceipt(
            receipt,
            source,
            stage.id,
            jobId,
            'other-deployment'
          )
        ).accepted,
        false
      );
      await assert.rejects(
        executeComputerWork(jobId, task, profile, { stateDirectory: temp }),
        /already dispatched/
      );
      await assert.rejects(
        executeComputerWork(
          jobId,
          { ...task, goal: task.goal + ' changed' },
          profile,
          { stateDirectory: temp }
        ),
        /operator admission/
      );
      const wrong = structuredClone(receipt);
      wrong.artifacts[0].content = '{}';
      wrong.artifacts[0].bytes = 2;
      wrong.artifacts[0].sha256 = await sha256('{}');
      assert.equal(
        (
          await reviewReceipt(
            wrong,
            source,
            stage.id,
            jobId,
            profile.deploymentId
          )
        ).accepted,
        false
      );
    }
    assert.equal(calls, 6);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
    if (oldToken === undefined) delete process.env[tokenName];
    else process.env[tokenName] = oldToken;
  }
});
