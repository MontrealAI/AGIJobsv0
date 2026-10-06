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
import { createServer, assetNames, readRecordArgs } from '../server.cjs';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readJson(path.join(root, 'scenario.json'));
const fresh = () => structuredClone(source);
const artifact = (bundle, index) =>
  JSON.parse(bundle.results[index].artifact.content);

test('worker CLI inspects the exact contract and shipped profiles refuse dispatch', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-alpha-admission-'));
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
  } = require('../../../../apps/orchestrator/computerWork.ts');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-alpha-worker-'));
  const tokenName = 'COMPUTER_WORK_META_ALPHA_TEST_TOKEN',
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
    assert.equal(request.model, 'openclaw/meta-agentic-alpha');
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
        agentId: 'meta-agentic-alpha',
        tokenEnv: tokenName,
        deploymentId: 'synthetic-meta-alpha-deployment',
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

test('generated-record viewer arguments are versioned, bounded and explicit', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-alpha-record-'));
  try {
    const record = path.join(temp, 'record with spaces.json');
    fs.writeFileSync(record, JSON.stringify({ runId: 'fresh-local-record' }));
    assert.equal(readRecordArgs([]), null);
    for (let version = 5; version <= 11; version++)
      assert.deepEqual(readRecordArgs(['--record', 'v' + version, record]), {
        version,
        payload: { runId: 'fresh-local-record' },
      });
    for (const args of [
      ['--record', 'v4', record],
      ['--record', 'v12', record],
      ['--record', 'v5'],
      ['unexpected'],
      ['--record', 'v5', record, 'extra'],
    ])
      assert.throws(() => readRecordArgs(args), /Usage/);
    fs.writeFileSync(record, '[]');
    assert.throws(() => readRecordArgs(['--record', 'v5', record]), /object/);
    fs.writeFileSync(record, ' '.repeat(1048577));
    assert.throws(() => readRecordArgs(['--record', 'v5', record]));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
