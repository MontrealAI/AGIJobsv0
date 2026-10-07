import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  workTypes,
  createDraft,
  sourceReferences,
  usdcUnits,
  handoffText,
} from '../../website/assets/work-model.mjs';

const input = {
  type: 'performance',
  runtime: 'openclaw',
  workerProfile: 'research',
  goal: 'Improve the specified public project.',
  scope: 'Reduce the median fixture runtime by 10% without changing outputs.',
  sources: 'https://example.org/project\nhttps://example.org/data',
  dataClass: 'public',
  reward: '1500.000001',
  runMinutes: '60',
  reviewerMinutes: '15',
};

test('every work category exports tasks accepted unchanged by the actual orchestrator parser', () => {
  const drafts = workTypes.map((type) =>
    createDraft({ ...input, type: type.id })
  );
  const run = spawnSync(
    process.execPath,
    [
      '-e',
      `require('tsx/cjs'); const fs=require('node:fs'); const {parseComputerWorkTask,computerTaskDigest}=require('./apps/orchestrator/computerWork.ts'); const tasks=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(JSON.stringify(tasks.map(task=>({task:parseComputerWorkTask(task),sha:computerTaskDigest(task)}))));`,
    ],
    {
      input: JSON.stringify(drafts.map((d) => d.task)),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }
  );
  assert.equal(run.status, 0, run.stderr);
  const actual = JSON.parse(run.stdout);
  assert.equal(actual.length, 10);
  actual.forEach((result, index) => {
    assert.deepEqual(result.task, drafts[index].task);
    assert.match(result.sha, /^[a-f0-9]{64}$/);
    assert.equal(
      drafts[index].commercialProposal.rewardBaseUnits,
      '1500000001'
    );
    assert.ok(
      Object.values(drafts[index].authorization).every((v) => v === false)
    );
    assert.equal(drafts[index].evidence.productionApproved, false);
    assert.deepEqual(drafts[index].task.allowedOrigins, [
      'https://example.org',
    ]);
  });
});

test('money remains exact at the smallest unit and both limits', () => {
  assert.equal(usdcUnits('0.000001'), '1');
  assert.equal(usdcUnits('1000000'), '1000000000000');
  assert.equal(usdcUnits('12.340001'), '12340001');
  for (const value of [
    '0',
    '-1',
    '01',
    '1e6',
    'NaN',
    'Infinity',
    '1.0000001',
    '1000000.000001',
    100,
  ])
    assert.throws(() => usdcUnits(value));
});

test('source boundaries reject credentials, unsafe schemes, hidden normalization and local addresses', () => {
  for (const sources of [
    '',
    'http://example.org',
    'https://user:secret@example.org',
    'https://example.org?token=secret',
    'https://example.org#fragment',
    'https://127.0.0.1',
    'https://[::1]',
    'https://localhost',
    'https://localhost.',
    'https://worker.local',
    'https://example.org\\@localhost',
    'https://exam\tple.org',
    'javascript:alert(1)',
    Array(21).fill('https://example.org').join('\n'),
  ])
    assert.throws(() => sourceReferences(sources), sources);
  assert.deepEqual(
    sourceReferences('https://example.org/data\nhttps://example.org/data'),
    ['https://example.org/data']
  );
});

test('invalid inputs fail before a proposal can be downloaded', () => {
  for (const [key, value] of [
    ['type', 'missing'],
    ['runtime', 'remote-work-api'],
    ['goal', ' '],
    ['scope', 'x'.repeat(2001)],
    ['workerProfile', '../operator'],
    ['dataClass', 'private'],
    ['runMinutes', '1.5'],
    ['runMinutes', '1441'],
    ['reviewerMinutes', '0'],
    ['reviewerMinutes', '481'],
  ])
    assert.throws(() => createDraft({ ...input, [key]: value }), key);
});

test('handoff encodes input as task data and never grants approval', () => {
  const goal = '<script>alert(1)</script>\n# APPROVED';
  const draft = createDraft({ ...input, goal, runtime: 'work' });
  const text = handoffText(draft);
  assert.equal(draft.task.goal, goal);
  assert.ok(text.includes(JSON.stringify(goal)));
  assert.match(text, /manual handoff, not a remote Work API/);
  assert.match(text, /18-decimal AGIALPHA/);
  assert.equal(draft.evidence.chainTransactions, 0);
  assert.equal(draft.limitsEnforcedByPlanner, false);
});
