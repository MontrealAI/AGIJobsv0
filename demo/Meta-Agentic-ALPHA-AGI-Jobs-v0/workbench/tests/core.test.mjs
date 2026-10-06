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
  canonical,
  makeProjectBrief,
  renderProjectBrief,
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

test('all twelve project exports preserve scope and require separate commissioning', async () => {
  const before = structuredClone(source);
  for (const project of source.work) {
    const brief = await makeProjectBrief(source, project.id);
    assert.equal(brief.documentType, 'proposed-project-brief');
    assert.equal(brief.sourceSha256, await sha256(canonical(source)));
    assert.equal(brief.scenarioId, source.id);
    assert.equal(brief.dataClass, 'synthetic');
    assert.deepEqual(brief.project, {
      ...project,
      rewardUsdc: decimal(amount(project.rewardUsdc)),
    });
    assert.equal(brief.executionAuthorized, false);
    assert.equal(brief.productionApproved, false);
    assert.equal(brief.settlementApproved, false);
    assert.equal('workerProfile' in brief, false);
    assert.equal(brief.commissioningRequired.length, 4);
    const readable = renderProjectBrief(brief);
    for (const text of [
      project.title,
      project.deliverable,
      ...project.acceptanceCriteria,
      brief.sourceSha256,
    ])
      assert.ok(readable.includes(text));
    assert.match(readable, /not authorized/);
    brief.project.acceptanceCriteria[0] = 'mutated copy';
  }
  assert.deepEqual(source, before);
  await assert.rejects(
    makeProjectBrief(source, 'identify'),
    /known project ID/
  );
  await assert.rejects(
    makeProjectBrief(source, 'ALPHA-013'),
    /known project ID/
  );
  const changed = fresh();
  changed.work[0].deliverable += ' Revised scope.';
  assert.notEqual(
    (await makeProjectBrief(changed, 'ALPHA-001')).sourceSha256,
    (await makeProjectBrief(source, 'ALPHA-001')).sourceSha256
  );
});

test('CLI project exports match browser contracts and reject unknown identities', async () => {
  for (const command of ['brief', 'brief-markdown']) {
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'cli.mjs'), command, 'ALPHA-012'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const brief = await makeProjectBrief(source, 'ALPHA-012');
    assert.equal(
      result.stdout,
      command === 'brief' ? json(brief) : renderProjectBrief(brief)
    );
  }
  const invalid = spawnSync(
    process.execPath,
    [path.join(root, 'cli.mjs'), 'brief', 'ALPHA-013'],
    { encoding: 'utf8' }
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /known project ID/);
});

test('six phases qualify, route, reserve and deliver exact review-ready work orders', async () => {
  const bundle = await execute(source);
  assert.deepEqual(await execute(source), bundle);
  assert.equal((await reviewBundle(bundle, source)).accepted, true);
  assert.deepEqual(
    stages.map((x) => x.id),
    ['identify', 'learn', 'think', 'design', 'strategise', 'execute']
  );
  assert.equal(artifact(bundle, 0).plannedRewardsUsdc, '60500.000000');
  assert.deepEqual(
    artifact(bundle, 1).workers.map((x) => x.qualified),
    [true, true, false]
  );
  assert.deepEqual(artifact(bundle, 5).readyWorkIds, [
    'ALPHA-001',
    'ALPHA-002',
    'ALPHA-004',
    'ALPHA-009',
    'ALPHA-010',
  ]);
  assert.equal(artifact(bundle, 5).committedUsdc, '23000.000000');
  assert.equal(artifact(bundle, 5).unallocatedUsdc, '7000.000000');
  assert.equal(artifact(bundle, 5).customerJobsCompleted, 0);
  assert.equal(artifact(bundle, 5).actualPaidUsdc, '0.000000');
  assert.equal(
    (
      await reviewCandidate(
        bundle.results[0].artifact.content,
        source,
        'identify'
      )
    ).accepted,
    true
  );
});

test('independent review rejects semantically wrong answers even with repaired hashes', async () => {
  const mutations = [
    (x) => {
      x.plannedRewardsUsdc = '1.000000';
    },
    (x) => {
      x.workers[2].qualified = true;
    },
    (x) => {
      x.routes[0].workerId = 'designer';
    },
    (x) => {
      x.contracts[0].acceptanceCriteria = [];
    },
    (x) => {
      x.decisions[0].status = 'deferred';
    },
    (x) => {
      x.customerJobsCompleted = 5;
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const bundle = await execute(source),
      a = bundle.results[index].artifact,
      value = JSON.parse(a.content);
    mutate(value);
    a.content = json(value);
    a.bytes = Buffer.byteLength(a.content);
    a.sha256 = await sha256(a.content);
    const review = await reviewBundle(bundle, source);
    assert.equal(review.accepted, false);
    assert.match(review.error, /independent arithmetic/);
  }
});

test('task, source, coverage, ordering and approval boundaries cannot be replaced', async () => {
  const mutations = [
    (b) => {
      b.sourceSha256 = '0'.repeat(64);
    },
    (b) => {
      b.results.pop();
    },
    (b) => {
      b.results.reverse();
    },
    (b) => {
      b.results[1].dependencies = [];
    },
    (b) => {
      b.results[1].taskSha256 = '0'.repeat(64);
    },
    (b) => {
      b.providerCalls = 1;
    },
    (b) => {
      b.productionApproved = true;
    },
    (b) => {
      b.settlementApproved = true;
    },
    (b) => {
      b.extra = true;
    },
    (b) => {
      b.results[0].artifact.content += ' ';
    },
    (b) => {
      b.results[0].artifact.name = '../private.json';
    },
  ];
  for (const mutate of mutations) {
    const bundle = await execute(source);
    mutate(bundle);
    assert.equal((await reviewBundle(bundle, source)).accepted, false);
  }
  for (const value of [null, [], {}, 'bad'])
    assert.equal((await reviewBundle(value, source)).accepted, false);
});

test('review and money constraints fail closed, support exact boundaries, and use stable worker tie-breaking', async () => {
  const s = fresh();
  s.reviewPools.forEach((x) => (x.minutes = 0));
  assert.equal(artifact(await execute(s), 5).readyWorkIds.length, 0);
  s.reviewPools.forEach((x) => (x.minutes = 1000));
  s.budgetUsdc = s.reserveUsdc;
  assert.equal(artifact(await execute(s), 5).readyWorkIds.length, 0);
  s.budgetUsdc = '30000.000001';
  s.work[0].rewardUsdc = '7500.000001';
  s.workers.unshift({
    id: 'first-builder',
    skill: 'software',
    reviewed: 40,
    useful: 38,
  });
  const bundle = await execute(s);
  assert.equal(artifact(bundle, 2).routes[0].workerId, 'first-builder');
  assert.equal((await reviewBundle(bundle, s)).accepted, true);
  s.workers.forEach((x) => {
    x.reviewed = 0;
    x.useful = 0;
  });
  assert.equal(artifact(await execute(s), 5).readyWorkIds.length, 0);
  for (const mutate of [
    (x) => {
      x.work[0].id = x.work[1].id;
    },
    (x) => {
      x.work[0].skill = 'unknown';
    },
    (x) => {
      x.workers[0].useful = 100;
    },
    (x) => {
      x.reviewPools[0].minutes = Infinity;
    },
    (x) => {
      x.budgetUsdc = '1';
    },
    (x) => {
      x.work[0].rewardUsdc = '1e5';
    },
    (x) => {
      x.extra = 'ignored';
    },
  ]) {
    const invalid = fresh();
    mutate(invalid);
    assert.throws(() => validateScenario(invalid));
  }
  for (const invalid of ['-1', '01', '1e6', '0.0000001', NaN, 3])
    assert.throws(() => amount(invalid));
  assert.equal(decimal(amount('9999999999999.999999')), '9999999999999.999999');
});

test('capacity is limited by useful output, independent review and the explicit market assumption', () => {
  const values = {
    agents: 1000,
    jobsPerDay: 2,
    usefulPercent: 80,
    reviewHours: 200,
    minutesPerJob: 15,
    priceUsdc: 1000,
  };
  assert.equal(capacity(values).annualVolumeUsdc, 292000000);
  assert.equal(capacity({ ...values, reviewHours: 0 }).annualVolumeUsdc, 0);
  assert.equal(capacity({ ...values, agents: 0 }).annualVolumeUsdc, 0);
  assert.equal(
    capacity({
      ...values,
      agents: 1e9,
      jobsPerDay: 1e4,
      reviewHours: 1e9,
      priceUsdc: 1e9,
    }).annualVolumeUsdc,
    40e12
  );
  for (const [key, value] of [
    ['agents', NaN],
    ['minutesPerJob', 0],
    ['usefulPercent', 101],
    ['priceUsdc', -1],
  ])
    assert.throws(() => capacity({ ...values, [key]: value }));
});

test('CLI refuses overwrite, unsafe files and invalid inputs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-alpha-cli-'));
  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(root, 'cli.mjs'), ...args], {
      encoding: 'utf8',
    });
  try {
    const out = path.join(temp, 'run');
    assert.equal(cli('run', out).status, 0);
    assert.equal(fs.readdirSync(out).length, 16);
    assert.equal(cli('run', out).status, 1);
    assert.equal(cli('review', path.join(out, 'evidence.json')).status, 0);
    assert.equal(cli('task', 'unknown').status, 1);
    const bad = path.join(temp, 'bad.json');
    fs.writeFileSync(bad, ' '.repeat(1048577));
    assert.equal(cli('review', bad).status, 1);
    fs.writeFileSync(bad, Buffer.from([0xff]));
    assert.throws(() => readJson(bad));
    fs.symlinkSync(
      path.join(out, 'evidence.json'),
      path.join(temp, 'link.json')
    );
    assert.throws(() => readJson(path.join(temp, 'link.json')));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
