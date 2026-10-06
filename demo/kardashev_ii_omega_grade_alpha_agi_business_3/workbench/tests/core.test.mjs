import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  makeTask,
  taskDigest,
  capacity,
  createExample,
  reviewEvidence,
  sha256,
  json,
} from '../core.mjs';
import { families, templates } from '../catalog.mjs';
const require = createRequire(import.meta.url);
const {
  parseComputerWorkTask,
  computerTaskDigest,
  executeComputerWork,
} = require('../../../../apps/orchestrator/computerWork.ts');
const { createServer } = require('../server.cjs');
const standard = {
  agents: 100,
  jobsPerAgentDay: 4,
  usefulPercent: 80,
  reviewHoursDay: 8,
  minutesPerJob: 10,
  priceUsdc: 1000,
};
test('all 50 workflow/family tasks match the production adapter schema and admission digest', async () => {
  assert.equal(families.length, 5);
  assert.equal(templates.length, 10);
  const hashes = new Set();
  for (const family of families)
    for (const template of templates) {
      const task = await makeTask(template.id, family.id);
      assert.deepEqual(parseComputerWorkTask(task), task);
      const hash = await taskDigest(task);
      hashes.add(hash);
      assert.equal(computerTaskDigest(task), hash);
      assert.equal(task.dataClass, 'synthetic');
    }
  assert.equal(hashes.size, 50);
  await assert.rejects(makeTask('unknown'));
});
test('review capacity constrains volume; worker and market ceilings remain effective', () => {
  const result = capacity(standard);
  assert.equal(result.jobsDay, 48);
  assert.equal(result.annualVolumeUsdc, 17520000);
  assert.equal(result.bottleneck, 'Independent review');
  assert.equal(capacity({ ...standard, reviewHoursDay: 10000 }).jobsDay, 320);
  assert.equal(capacity({ ...standard, agents: 0 }).jobsDay, 0);
  assert.equal(capacity({ ...standard, usefulPercent: 0 }).jobsDay, 0);
  assert.equal(capacity({ ...standard, reviewHoursDay: 0 }).jobsDay, 0);
  assert.equal(
    capacity({
      agents: 1e9,
      jobsPerAgentDay: 1e4,
      usefulPercent: 100,
      reviewHoursDay: 1e9,
      minutesPerJob: 0.1,
      priceUsdc: 1e9,
    }).annualVolumeUsdc,
    40e12
  );
  for (const key of Object.keys(standard))
    for (const value of [NaN, Infinity, -1, '', null])
      assert.throws(() => capacity({ ...standard, [key]: value }));
  assert.throws(() => capacity({ ...standard, usefulPercent: 101 }));
  assert.throws(() => capacity({ ...standard, minutesPerJob: 0 }));
});
test('real local artifacts pass all checks but never grant settlement or production approval', async () => {
  for (const family of families) {
    const result = await reviewEvidence(
      await createExample(family.id),
      await makeTask('energy', family.id)
    );
    assert.equal(result.accepted, true);
    assert.ok(result.checks.every((c) => c.passed));
    assert.equal(result.productionApproved, false);
    assert.equal(result.settlementApproved, false);
    assert.equal(result.independentReview, 'required');
  }
});
test('checker rejects tampering even when the artifact hash is recalculated', async () => {
  const expected = await makeTask();
  for (const mutate of [
    (r) => {
      r.summary.netKwh = '10000';
    },
    (r) => {
      r.rows[1].netKwh = '700';
    },
    (r) => {
      r.rows[2].id = r.rows[0].id;
    },
    (r) => {
      r.summary.deficits = [];
    },
    (r) => {
      r.sourceSha256 = '0'.repeat(64);
    },
    (r) => {
      r.settlementApproved = true;
    },
  ]) {
    const receipt = await createExample();
    const candidate = JSON.parse(receipt.artifacts[0].content);
    mutate(candidate);
    const content = json(candidate);
    Object.assign(receipt.artifacts[0], {
      content,
      sha256: await sha256(content),
      bytes: Buffer.byteLength(content),
    });
    assert.equal((await reviewEvidence(receipt, expected)).accepted, false);
  }
});
test('checker rejects wrong task, missing artifacts, claimed approval and malformed evidence', async () => {
  const task = await makeTask();
  for (const mutate of [
    (r) => {
      r.taskSha256 = '0'.repeat(64);
    },
    (r) => {
      r.artifacts = [];
    },
    (r) => {
      r.artifacts[0].bytes++;
    },
    (r) => {
      r.artifacts[0].sha256 = '0'.repeat(64);
    },
    (r) => {
      r.productionApproved = true;
    },
  ]) {
    const r = await createExample();
    mutate(r);
    assert.equal((await reviewEvidence(r, task)).accepted, false);
  }
  assert.equal(
    (await reviewEvidence(await createExample('omega'), task)).accepted,
    false
  );
  assert.equal(
    (await reviewEvidence(await createExample(), await makeTask('research')))
      .accepted,
    false
  );
  for (const value of [null, [], {}, { artifacts: 'x' }])
    assert.equal((await reviewEvidence(value, task)).accepted, false);
});
test('approved synthetic endpoint produces checkable evidence and blocks repeated dispatch', async () => {
  const fixture = await createExample(),
    task = fixture.task;
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    calls++;
    assert.equal(req.headers.authorization, 'Bearer test-only-token');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    assert.equal(body.model, 'openclaw/kardashev-business');
    const order = JSON.parse(body.input);
    assert.equal(order.taskSha256, await taskDigest(task));
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        id: 'local-fixture-1',
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
                  summary: 'Deterministic synthetic endpoint fixture',
                  artifacts: fixture.artifacts.map(
                    ({ name, mediaType, content }) => ({
                      name,
                      mediaType,
                      content,
                    })
                  ),
                }),
              },
            ],
          },
        ],
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'business-worker-'));
  const profile = {
    endpoint: `http://127.0.0.1:${server.address().port}/v1/responses`,
    agentId: 'kardashev-business',
    tokenEnv: 'COMPUTER_WORK_KARDASHEV_TEST_TOKEN',
    deploymentId: 'test-fixture-only',
    mode: 'fixture',
    timeoutMs: 5000,
    maxResponseBytes: 262144,
    maxOutputTokens: 8192,
    approvedJobs: [],
  };
  const old = process.env[profile.tokenEnv];
  process.env[profile.tokenEnv] = 'test-only-token';
  try {
    await assert.rejects(
      executeComputerWork('1', task, profile, { stateDirectory: directory }),
      /admission/
    );
    assert.equal(calls, 0);
    assert.deepEqual(fs.readdirSync(directory), []);
    profile.approvedJobs = [{ jobId: '1', taskSha256: await taskDigest(task) }];
    const receipt = await executeComputerWork('1', task, profile, {
      stateDirectory: directory,
    });
    assert.equal((await reviewEvidence(receipt, task)).accepted, true);
    assert.equal(receipt.simulated, true);
    await assert.rejects(
      executeComputerWork('1', task, profile, { stateDirectory: directory }),
      /already dispatched/
    );
    assert.equal(calls, 1);
  } finally {
    if (old === undefined) delete process.env[profile.tokenEnv];
    else process.env[profile.tokenEnv] = old;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('local viewer serves only fixed assets and rejects mutations and path traversal', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-security-policy'),
      /connect-src 'none'/
    );
    assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
    for (const target of [
      '/worker-profiles.example.json',
      '/server.cjs',
      '/%2e%2e/package.json',
      '/README.md',
      '/?path=../',
    ])
      assert.equal((await fetch(origin + target)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('exported task files are inspectable and unadmitted file dispatch fails closed', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'business-export-'));
  const file = path.join(directory, 'task.json');
  const worker = fileURLToPath(new URL('../worker.cjs', import.meta.url));
  const task = await makeTask('research', 'omega');
  fs.writeFileSync(file, json(task));
  const env = { ...process.env };
  delete env.COMPUTER_WORK_PROFILES_FILE;
  delete env.COMPUTER_WORK_STATE_DIR;
  try {
    const inspect = spawnSync(
      process.execPath,
      ['--import', 'tsx', worker, 'inspect-file', file],
      { encoding: 'utf8', env }
    );
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).taskSha256, await taskDigest(task));
    const blocked = spawnSync(
      process.execPath,
      ['--import', 'tsx', worker, 'run-file', file, '1'],
      { encoding: 'utf8', env }
    );
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Configure absolute/);
    const { readJson } = require('../io.cjs');
    assert.throws(() => readJson(directory), /regular JSON file/);
    fs.writeFileSync(file, ' '.repeat(262145));
    assert.throws(() => readJson(file), /256 KiB/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
