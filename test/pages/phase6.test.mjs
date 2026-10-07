import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import {
  createWave,
  createExample,
  examples,
} from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/ui/model.mjs';

const config = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/config/domains.phase6.json',
      import.meta.url
    )
  )
);
const input = () => ({
  budget: '1000',
  reward: '100',
  reviewers: '2',
  minutes: '120',
  reviewMinutes: '30',
  domains: config.domains.map((domain) => ({
    slug: domain.slug,
    workers: '4',
    requested: '6',
    mode: 'planned',
  })),
});
const example = () => ({
  domain: 'finance',
  runtime: 'openclaw',
  workerProfile: 'research',
  reward: '100',
  reviewMinutes: '30',
  authority: true,
  sources: true,
  review: true,
});

test('Phase 6 allocates a bounded dispatch wave fairly across domains', () => {
  const wave = createWave(input(), config);
  assert.equal(wave.candidateJobs, 8);
  assert.deepEqual(
    wave.domains.map((row) => row.candidateJobs),
    [2, 2, 2, 1, 1]
  );
  assert.deepEqual(wave.bottlenecks, ['reviewSlots']);
  assert.equal(wave.proposedRewardsBaseUnits, '800000000');
  assert.equal(wave.unallocatedBudgetBaseUnits, '200000000');
  assert.equal(wave.reviewMinutesReserved, 240);
  assert.equal(
    wave.domains.reduce((sum, row) => sum + row.deferredJobs, 0),
    22
  );
  for (const value of Object.values(wave.execution).slice(1))
    assert.equal(value, false);
});

test('Phase 6 exact rewards, zero reviewers and pause states constrain allocations', () => {
  const values = input();
  values.budget = '99.999999';
  assert.equal(createWave(values, config).candidateJobs, 0);
  values.budget = '1000';
  values.reviewers = '0';
  assert.equal(createWave(values, config).candidateJobs, 0);
  values.reviewers = '2';
  values.domains[0].mode = 'paused';
  const wave = createWave(values, config);
  assert.equal(wave.domains[0].candidateJobs, 0);
  assert.deepEqual(
    wave.domains.slice(1).map((row) => row.candidateJobs),
    [2, 2, 2, 2]
  );
  const inactive = structuredClone(config);
  inactive.domains[1].active = false;
  assert.equal(createWave(values, inactive).domains[1].candidateJobs, 0);
  inactive.domains[1].active = true;
  inactive.domains[1].lifecycle = 'sunset';
  assert.equal(createWave(values, inactive).domains[1].candidateJobs, 0);
});

test('Phase 6 respects requested work, assigned workers and configured concurrency', () => {
  const values = input();
  values.reviewers = '100';
  const restricted = structuredClone(config);
  restricted.domains[0].operations.maxActiveJobs = 1;
  values.domains[1].workers = '0';
  values.domains[2].requested = '1';
  const wave = createWave(values, restricted);
  assert.deepEqual(
    wave.domains.map((row) => row.candidateJobs),
    [1, 0, 1, 4, 4]
  );
  assert.equal(
    wave.domains.reduce((sum, row) => sum + row.candidateJobs, 0),
    wave.candidateJobs
  );
  assert.ok(
    BigInt(wave.proposedRewardsBaseUnits) <=
      BigInt(wave.assumptions.budgetBaseUnits)
  );
});

test('Phase 6 rejects invalid, unbounded, duplicate and misordered inputs', () => {
  for (const [field, value] of [
    ['reviewers', 'NaN'],
    ['minutes', '0'],
    ['reviewMinutes', '1.5'],
    ['budget', '1e3'],
    ['reward', '0'],
    ['reward', '0.0000001'],
    ['budget', '1000001'],
  ]) {
    const values = input();
    values[field] = value;
    assert.throws(() => createWave(values, config));
  }
  const values = input();
  values.domains.reverse();
  assert.throws(() => createWave(values, config), /order/);
  const duplicate = structuredClone(config);
  duplicate.domains[1].slug = duplicate.domains[0].slug;
  assert.throws(() => createWave(input(), duplicate), /order/);
  for (const bad of ['-1', '10001', '1.2', '1e2']) {
    const values = input();
    values.domains[0].workers = bad;
    assert.throws(() => createWave(values, config));
  }
});

test('Phase 6 synthetic tasks retain explicit operator admission and independent review', () => {
  const wave = createWave(input(), config);
  for (const domain of Object.keys(examples)) {
    for (const runtime of ['openclaw', 'work']) {
      const proposal = createExample({ ...example(), domain, runtime }, wave);
      assert.equal(proposal.task.schemaVersion, 1);
      assert.equal(proposal.task.dataClass, 'synthetic');
      assert.deepEqual(proposal.task.allowedOrigins, ['https://github.com']);
      assert.ok(proposal.task.inputText.includes(examples[domain].rows));
      assert.equal(proposal.phase6.domain, domain);
      assert.ok(
        proposal.task.deliverables.some((file) => file.name === 'evidence.json')
      );
      for (const value of Object.values(proposal.authorization))
        assert.equal(value, false);
      assert.equal(proposal.evidence.independentReviewComplete, false);
      assert.equal(proposal.commercialProposal.escrowFunded, false);
    }
  }
  for (const key of ['authority', 'sources', 'review'])
    assert.throws(
      () => createExample({ ...example(), [key]: false }, wave),
      /commitments/
    );
  const paused = input();
  paused.domains[0].mode = 'paused';
  assert.throws(
    () => createExample(example(), createWave(paused, config)),
    /candidate slot/
  );
});

test('Phase 6 source preserves the original architecture independently of configured diagrams', () => {
  const html = fs.readFileSync(
    new URL(
      '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/index.html',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(html, /id="mermaid-original"/);
  const original = new JSDOM(html).window.document.querySelector(
    '#mermaid-original'
  ).textContent;
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    '9717f7239455f00a0954b20160aca97bc0af328f0781eda93371b652298b9987'
  );
  assert.match(html, /Domains -->\|events\| Subgraph/);
  assert.match(html, /L2Gateways --> Settlement\[Ethereum Mainnet\]/);
  assert.match(html, /id="mermaid-diagram"/);
  assert.equal((html.match(/<script(?![^>]*src)/g) || []).length, 0);
  assert.doesNotMatch(html, /cdn\.jsdelivr|fonts\.googleapis/);
});
