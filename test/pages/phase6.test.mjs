import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Interface } from 'ethers';
import {
  buildCalldata,
  computeMetrics,
} from '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/ui/preview-model.mjs';
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

// Exercise the actual CLI blueprint alongside the browser projection so shared
// configuration variants cannot silently diverge after either implementation changes.
const require = createRequire(import.meta.url);
require('ts-node/register/transpile-only');
const {
  buildPhase6Blueprint,
} = require('../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/phase6-blueprint.ts');
const abi = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../demo/Phase-6-Scaling-Multi-Domain-Expansion/abi/Phase6ExpansionManager.json',
      import.meta.url
    )
  )
);
const clone = () => structuredClone(config);
const minimal = () => ({
  global: { manifestURI: config.global.manifestURI },
  domains: [
    {
      slug: config.domains[0].slug,
      name: config.domains[0].name,
      manifestURI: config.domains[0].manifestURI,
      validationModule: config.domains[0].validationModule,
      subgraph: config.domains[0].subgraph,
    },
  ],
});
const variants = {
  full: clone,
  missingTelemetry: () => {
    const value = clone();
    for (const domain of value.domains) {
      domain.telemetry.resilienceBps =
        value.global.telemetry.resilienceFloorBps;
      domain.telemetry.automationBps =
        value.global.telemetry.automationFloorBps;
    }
    delete value.domains[0].telemetry;
    value.domains[1].telemetry.resilienceBps = 1;
    return value;
  },
  absentOptionalSetters: () => {
    const value = clone();
    delete value.global.guards;
    delete value.global.telemetry;
    delete value.global.infrastructure;
    for (const domain of value.domains) {
      delete domain.operations;
      delete domain.telemetry;
      delete domain.infrastructureControl;
    }
    return value;
  },
  sunsetAndExperimental: () => {
    const value = clone();
    value.domains[0].lifecycle = 'sunset';
    value.domains[0].sunsetPlan = {
      reason: 'Reassign work before retirement.',
      handoffDomains: ['health'],
    };
    value.domains[1].lifecycle = 'experimental';
    value.domains[1].active = true;
    return value;
  },
  explicitManual: () => {
    const value = clone();
    value.global.l2SyncCadence = 0;
    return value;
  },
  minimal,
};

for (const [name, makeConfig] of Object.entries(variants))
  test(`Phase 6 browser/CLI calldata and telemetry parity: ${name}`, () => {
    const variant = makeConfig();
    const blueprint = buildPhase6Blueprint(variant);
    const expected = [
      ...Object.values(blueprint.calldata),
      ...blueprint.domains.flatMap((domain) => Object.values(domain.calldata)),
    ].filter((value) => value !== undefined);
    const actual = buildCalldata(variant, abi);
    assert.deepEqual(
      actual.map((call) => call.data),
      expected
    );
    const metrics = computeMetrics(variant);
    for (const key of [
      'resilienceSampleCount',
      'automationSampleCount',
      'telemetryMissingCount',
      'resilienceFloorCoverage',
      'automationFloorCoverage',
      'averageResilience',
      'averageAutomation',
      'averageCompliance',
      'averageLatency',
    ])
      assert.equal(metrics[key] ?? null, blueprint.metrics[key] ?? null, key);
    assert.equal(metrics.l2Coverage, blueprint.metrics.l2SettlementCoverage);
    assert.equal(metrics.sentinelCount, blueprint.metrics.sentinelFamilies);
    if (name === 'sunsetAndExperimental') {
      assert.deepEqual(
        actual
          .filter((call) => call.label.includes('(finance)'))
          .map((call) => call.label),
        ['removeDomain(finance)']
      );
      const wave = createWave(input(), variant);
      assert.deepEqual(
        wave.domains.slice(0, 2).map((domain) => domain.candidateJobs),
        [0, 0]
      );
    }
    if (name === 'missingTelemetry') {
      assert.equal(metrics.telemetryMissingCount, 1);
      assert.equal(metrics.resilienceFloorCoverage, 3 / 5);
      assert.equal(metrics.automationFloorCoverage, 4 / 5);
    }
    if (name === 'absentOptionalSetters')
      assert.ok(
        actual.every(
          (call) =>
            !/^set(?:Domain(?:Operations|Telemetry|Infrastructure)|Global(?:Guards|Telemetry|Infrastructure))\(/.test(
              call.label
            )
        )
      );
    if (name === 'minimal') {
      assert.deepEqual(
        actual.map((call) => call.label),
        [
          'setGlobalConfig(GlobalConfig)',
          'registerDomain(finance)',
          'updateDomain(finance)',
        ]
      );
      const values = input();
      values.domains = values.domains.slice(0, 1);
      const wave = createWave(values, variant);
      assert.equal(wave.candidateJobs, 0);
      assert.equal(wave.domains[0].configuredConcurrencyLimit, null);
    }
  });

test('Phase 6 omitted telemetry never establishes floor coverage, even at zero floors', () => {
  const value = clone();
  value.global.telemetry.resilienceFloorBps = 0;
  value.global.telemetry.automationFloorBps = 0;
  for (const domain of value.domains) delete domain.telemetry;
  assert.equal(computeMetrics(value).resilienceFloorCoverage, 0);
  assert.equal(computeMetrics(value).automationFloorCoverage, 0);
  value.domains = [];
  assert.equal(computeMetrics(value).resilienceFloorCoverage, 0);
});

test('Phase 6 browser registration and update encode only active lifecycle as enabled', () => {
  const iface = new Interface(abi);
  const {
    isPhase6DomainActive,
  } = require('../../scripts/phase6/config-validation.ts');
  for (const lifecycle of [undefined, 'active', 'experimental']) {
    for (const requestedActive of [undefined, true, false]) {
      const value = clone();
      const domain = value.domains[0];
      if (lifecycle === undefined) delete domain.lifecycle;
      else domain.lifecycle = lifecycle;
      if (requestedActive === undefined) delete domain.active;
      else domain.active = requestedActive;
      const expected =
        lifecycle !== 'experimental' && requestedActive !== false;
      assert.equal(isPhase6DomainActive(domain), expected);
      const blueprint = buildPhase6Blueprint(value);
      assert.equal(blueprint.domains[0].active, expected);
      for (const call of buildCalldata(value, abi).filter((call) =>
        /^(registerDomain|updateDomain)\(finance\)$/.test(call.label)
      )) {
        const action = call.label.startsWith('register')
          ? 'registerDomain'
          : 'updateDomain';
        const decoded = iface.decodeFunctionData(action, call.data);
        const tuple = decoded[action === 'registerDomain' ? 0 : 1];
        assert.equal(
          tuple.active,
          expected,
          `${lifecycle}/${requestedActive}/${action}`
        );
        assert.equal(call.data, blueprint.domains[0].calldata[action]);
      }
    }
  }
});

test('Phase 6 rejects non-string known display metadata before preview generation', () => {
  const {
    validatePhase6Config,
  } = require('../../scripts/phase6/config-validation.ts');
  for (const key of ['sentinel', 'uptime', 'valueFlowDisplay']) {
    for (const invalid of [99, true, [], {}]) {
      const value = clone();
      value.domains[0].metadata[key] = invalid;
      const expected = new RegExp(`metadata\\.${key}`);
      assert.throws(() => validatePhase6Config(value), expected);
      assert.throws(() => buildPhase6Blueprint(value), expected);
    }
  }
});

test('Phase 6 null, empty and string display metadata retain browser/CLI parity', () => {
  const {
    validatePhase6Config,
  } = require('../../scripts/phase6/config-validation.ts');
  for (const accepted of [null, '', 'declared example']) {
    const value = clone();
    for (const domain of value.domains) {
      for (const key of ['sentinel', 'uptime', 'valueFlowDisplay'])
        domain.metadata[key] = accepted;
    }
    assert.doesNotThrow(() => validatePhase6Config(value));
    const blueprint = buildPhase6Blueprint(value);
    const metrics = computeMetrics(value);
    assert.equal(metrics.sentinelCount, accepted ? 1 : 0);
    assert.equal(metrics.sentinelCount, blueprint.metrics.sentinelFamilies);
    for (const domain of blueprint.domains) {
      assert.equal(domain.metadata.sentinel, accepted);
      assert.equal(domain.metadata.uptime, accepted);
      assert.equal(domain.metadata.valueFlowDisplay, accepted);
    }
    assert.deepEqual(
      buildCalldata(value, abi).map((call) => call.data),
      [
        ...Object.values(blueprint.calldata),
        ...blueprint.domains.flatMap((domain) =>
          Object.values(domain.calldata)
        ),
      ].filter((call) => call !== undefined)
    );
  }
});
