'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const p = require('../scripts/playbook.cjs');
const { verifyArtifacts } = require('../scripts/verify-artifacts.cjs');
const input = () => structuredClone(p.loadInputs());
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redenom-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function cli(args, cwd = os.tmpdir()) {
  return spawnSync(
    process.execPath,
    [path.join(p.DEMO, 'scripts/playbook.cjs'), ...args],
    { encoding: 'utf8', cwd, timeout: 5000 }
  );
}

test('1000 old tokens become one new token across precision changes', () => {
  for (const decimals of [0, 6, 18, 24]) {
    const result = p.convert(1000n * 10n ** 18n, 1000n, 18, decimals);
    assert.equal(result.raw, 10n ** BigInt(decimals));
    assert.equal(result.remainderNumerator, '0');
  }
});
test('exact arithmetic survives amounts above Number.MAX_SAFE_INTEGER', () => {
  const source = '9007199254740993123.456789';
  assert.equal(p.formatUnits(p.parseUnits(source, 18), 18), source);
  assert.equal(
    p.formatUnits(p.convert(p.parseUnits(source, 18), 1000n, 18, 18).raw, 18),
    '9007199254740993.123456789'
  );
});
test('integer conversion conserves source value including residuals', () => {
  for (const oldDecimals of [0, 6, 18])
    for (const newDecimals of [0, 6, 18])
      for (const ratio of [1n, 3n, 1000n])
        for (const raw of [0n, 1n, 999n, 123456789123456789n]) {
          const result = p.convert(
            raw,
            ratio,
            oldDecimals,
            newDecimals,
            'floor'
          );
          const den = BigInt(result.remainderDenominator),
            rem = BigInt(result.remainderNumerator);
          assert.equal(
            result.raw * den + rem,
            raw * 10n ** BigInt(newDecimals)
          );
          assert.ok(rem >= 0n && rem < den);
        }
});
test('rounding is rejected by default and explicit floors disclose exact dust', () => {
  assert.throws(() => p.convert(1n, 1000n, 18, 18), /Non-exact/);
  const result = p.convert(1001n, 1000n, 18, 18, 'floor');
  assert.equal(result.raw, 1n);
  assert.equal(result.remainderNumerator, '1000000000000000000');
  assert.equal(result.remainderDenominator, '1000000000000000000000');
  const report = p.buildPlaybook(input(), { ratio: 3n, rounding: 'floor' });
  assert.ok(report.token.dust.length > 0);
});
test('invalid amounts and unsafe numeric values are rejected', () => {
  for (const value of [
    '-1',
    '+1',
    '1e18',
    'Infinity',
    'NaN',
    '',
    ' 1',
    '.5',
    '1.',
    {},
    null,
    0.1,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => p.parseUnits(value, 18));
  assert.throws(() => p.parseUnits('0.0000001', 6), /decimal places/);
  assert.equal(p.parseUnits('0', 0), 0n);
});
test('uint256 and supported precision boundaries are enforced', () => {
  assert.equal(p.parseUnits(p.UINT256_MAX.toString(), 0), p.UINT256_MAX);
  assert.throws(
    () => p.parseUnits((p.UINT256_MAX + 1n).toString(), 0),
    /range/
  );
  assert.throws(() => p.convert(p.UINT256_MAX, 1n, 0, 1), /range/);
  for (const decimals of [-1, 78, 1.5, NaN])
    assert.throws(() => p.parseUnits('1', decimals));
  for (const ratio of [0n, -1n, '1.5'])
    assert.throws(() => p.convert(1n, ratio, 18, 18));
});
test('CLI rejects unknown, missing and malformed options', () => {
  for (const args of [
    ['--wat'],
    ['--ratio'],
    ['--ratio', '0'],
    ['--new-decimals', '1.2'],
    ['--new-decimals', '256'],
    ['--rounding', 'nearest'],
    ['--symbol', '\n'],
    ['--symbol', 'x'.repeat(33)],
  ])
    assert.throws(() => p.parseArgs(args));
  assert.equal(cli(['--help']).status, 0);
  assert.notEqual(cli(['--ratio', 'bogus']).status, 0);
});
test('drafts retain all unrelated policies and convert full token guardrails', () => {
  const data = input(),
    before = structuredClone(data.configs);
  data.configs[2].maxStakePerAddressTokens = '9000';
  data.configs[2].stakeRecommendations.maxTokens = '5000';
  data.configs[2].autoStake.ceilingTokens = '2000';
  data.configs[2].customPolicy = { enabled: true, label: 'preserve me' };
  const report = p.buildPlaybook(data, { newDecimals: 6, newSymbol: 'NEW' });
  const stake = report.configSnapshots.stakeManager,
    job = report.configSnapshots.jobRegistry;
  assert.equal(stake.minStakeTokens, '0.1');
  assert.equal(stake.maxStakePerAddressTokens, '9.0');
  assert.equal(stake.autoStake.floorTokens, '0.1');
  assert.equal(stake.autoStake.ceilingTokens, '2.0');
  assert.equal(stake.stakeRecommendations.maxTokens, '5.0');
  assert.equal(stake.roleMinimums.validatorTokens, '1.0');
  assert.equal(stake.roleMinimums.platformTokens, '0.0');
  assert.equal(job.jobStakeTokens, '0.001');
  assert.equal(report.modules.jobRegistry.after.jobStake.raw, '1000');
  assert.equal(
    report.modules.jobRegistry.after.jobStake.formatted,
    '0.001 NEW'
  );
  assert.deepEqual(stake.customPolicy, data.configs[2].customPolicy);
  assert.equal(stake.autoStake.increasePct, before[2].autoStake.increasePct);
  assert.equal(stake.autoStake.threshold, before[2].autoStake.threshold);
  assert.equal(
    stake.autoStake.temperatureThreshold,
    before[2].autoStake.temperatureThreshold
  );
  assert.equal(
    stake.autoStake.hamiltonianWeight,
    before[2].autoStake.hamiltonianWeight
  );
  for (const key of [
    'treasury',
    'unbondingPeriodSeconds',
    'employerSlashPct',
    'maxTotalPayoutPct',
  ])
    assert.equal(stake[key], before[2][key]);
  assert.deepEqual(report.modules.feePool.before, report.modules.feePool.after);
  assert.equal(data.configs[2].minStakeTokens, '100');
});
test('raw fields use base units and conflicting dual units fail', () => {
  const data = input();
  delete data.configs[2].minStakeTokens;
  data.configs[2].minStake = '100000000000000000000';
  const report = p.buildPlaybook(data);
  assert.equal(report.configSnapshots.stakeManager.minStakeTokens, '0.1');
  assert.equal(
    report.configSnapshots.stakeManager.minStake,
    '100000000000000000'
  );
  data.configs[2].minStakeTokens = '999';
  assert.throws(() => p.buildPlaybook(data), /disagree/);
});
test('positive thresholds cannot disappear through floor rounding', () => {
  assert.throws(
    () =>
      p.buildPlaybook(input(), {
        ratio: 10000000n,
        newDecimals: 6,
        rounding: 'floor',
      }),
    /become zero/
  );
});
test('cross-field policy contradictions fail before writing', () => {
  const changes = [
    (s) => {
      s.autoStake.ceilingTokens = '1';
    },
    (s) => {
      s.maxStakePerAddressTokens = '1';
    },
    (s) => {
      s.stakeRecommendations.maxTokens = '1';
    },
    (s) => {
      s.validatorSlashRewardPct = 1;
    },
    (s) => {
      s.employerSlashPct = 51;
    },
    (s) => {
      s.maxTotalPayoutPct = 201;
    },
    (s) => {
      s.autoStake.increasePct = 101;
    },
  ];
  for (const change of changes) {
    const data = input();
    change(data.configs[2]);
    assert.throws(() => p.buildPlaybook(data));
  }
});
test('complete configured slash shares follow owner and contract upper bounds', () => {
  for (const [employer, treasury, validator] of [
    [40, 40, 0],
    [40, 40, 20],
    [0, 0, 0],
  ]) {
    const data = input();
    Object.assign(data.configs[2], {
      employerSlashPct: employer,
      treasurySlashPct: treasury,
      validatorSlashRewardPct: validator,
    });
    const draft = p.buildPlaybook(data).configSnapshots.stakeManager;
    assert.equal(draft.validatorSlashRewardPct, validator);
    assert.equal(draft.employerSlashPct, employer);
  }
  const data = input();
  data.configs[2].operatorSlashPct = 1;
  assert.throws(() => p.buildPlaybook(data), /Contract slash distribution/);
  data.configs[2].employerSlashPct = 40;
  data.configs[2].burnSlashPct = 10;
  assert.throws(() => p.buildPlaybook(data), /Contract slash distribution/);
  data.configs[2].operatorSlashPct = 0;
  data.configs[2].validatorSlashRewardPct = 10;
  assert.doesNotThrow(() => p.buildPlaybook(data));
});
test('fee policy totals cannot exceed 100 percent', () => {
  for (const index of [2, 3]) {
    const data = input();
    data.configs[index].feePct = index === 2 ? 89 : 90;
    assert.doesNotThrow(() => p.buildPlaybook(data));
    data.configs[index].feePct++;
    assert.throws(() => p.buildPlaybook(data), /fees: .*cannot exceed 100/);
  }
});
test('job bond and agent minimum fit uint96 before and after precision changes', () => {
  const max = (1n << 96n) - 1n;
  for (const key of ['jobStake', 'minAgentStake']) {
    const data = input();
    delete data.configs[3][`${key}Tokens`];
    data.configs[3][key] = max.toString();
    assert.equal(
      p.buildPlaybook(data, { ratio: 1n }).modules.jobRegistry.after[key].raw,
      max.toString()
    );
    data.configs[3][key] = (max + 1n).toString();
    assert.throws(
      () => p.buildPlaybook(data, { ratio: 1n }),
      /contract uint96/
    );
    data.configs[3][key] = (max / 10n + 1n).toString();
    assert.throws(
      () => p.buildPlaybook(data, { ratio: 1n, newDecimals: 19 }),
      /contract uint96/
    );
  }
});
test('required positive policies and AGI type cap match the owner planner', () => {
  for (const change of [
    (s) => {
      s.minStakeTokens = '0';
    },
    (s) => {
      s.stakeRecommendations.minTokens = '0';
    },
    (s) => {
      s.unbondingPeriodSeconds = 0;
    },
    (s) => {
      s.maxAGITypes = 0;
    },
    (s) => {
      s.maxAGITypes = 51;
    },
  ]) {
    const data = input();
    change(data.configs[2]);
    assert.throws(() => p.buildPlaybook(data));
  }
});
test('independent roles and economic choices are observations, not invented validity rules', () => {
  const data = input();
  data.configs[3].maxJobRewardTokens = '0.5';
  data.configs[3].minAgentStakeTokens = '0';
  data.configs[2].roleMinimums.agentTokens = '0.5';
  data.configs[2].roleMinimums.validatorTokens = '0.25';
  const report = p.buildPlaybook(data);
  assert.equal(report.policyObservations.length, 4);
  assert.equal(
    report.configSnapshots.stakeManager.roleMinimums.validatorTokens,
    '0.00025'
  );
  data.configs[2].roleMinimums = {
    agentTokens: '0',
    validatorTokens: '0',
    platformTokens: '0',
  };
  assert.equal(p.buildPlaybook(data).policyObservations.length, 2);
  delete data.configs[2].roleMinimums;
  assert.equal(p.buildPlaybook(data).policyObservations.length, 2);
});
test('supply example is exact and preserves zero explicitly', () => {
  const report = p.buildPlaybook(input(), {
    currentSupplyTokens: '42000000',
    newDecimals: 6,
  });
  assert.equal(report.token.supplyAfter.formatted, '42000.0 AGIΩ');
  assert.equal(report.token.supplyAfter.raw, '42000000000');
  assert.equal(
    p.buildPlaybook(input(), { currentSupplyTokens: '0' }).token.supplyAfter
      .raw,
    '0'
  );
  assert.equal(report.meta.liveProvider, false);
  assert.equal(report.meta.productionApproved, false);
});
test('CLI writes nested directories from any working directory', (t) => {
  const dir = temp(t),
    cfg = path.join(dir, 'nested/config'),
    out = path.join(dir, 'nested/ui/export/latest.json');
  const result = cli([
    '--config-dir',
    cfg,
    '--out',
    out,
    '--new-decimals',
    '6',
    '--symbol',
    'NEW',
    '--current-supply',
    '42000000',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    verifyArtifacts(path.join(dir, 'nested')).token.supplyAfter.formatted,
    '42000.0 NEW'
  );
});
test('invalid generation retains earlier artifacts without partial writes', (t) => {
  const dir = temp(t),
    out = path.join(dir, 'latest.json');
  fs.writeFileSync(out, 'previous plan');
  const result = cli([
    '--out',
    out,
    '--config-dir',
    path.join(dir, 'config'),
    '--new-decimals',
    '0',
  ]);
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(out, 'utf8'), 'previous plan');
  assert.equal(fs.existsSync(path.join(dir, 'config')), false);
});
test('source configurations cannot be overwritten through paths or symlinks', (t) => {
  const dir = temp(t);
  fs.symlinkSync(path.join(p.ROOT, 'config'), path.join(dir, 'link'));
  const before = fs.readFileSync(path.join(p.ROOT, 'config/agialpha.json'));
  for (const out of [
    path.join(p.ROOT, 'config/agialpha.json'),
    path.join(dir, 'link/agialpha.json'),
  ]) {
    const result = cli(['--out', out, '--config-dir', path.join(dir, 'draft')]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /outside source/);
  }
  assert.deepEqual(
    fs.readFileSync(path.join(p.ROOT, 'config/agialpha.json')),
    before
  );
});
test('artifact verification rejects corrupted arithmetic, snapshots, provenance and status', (t) => {
  const root = temp(t),
    cfg = path.join(root, 'config'),
    out = path.join(root, 'ui/export/latest.json');
  assert.equal(cli(['--out', out, '--config-dir', cfg]).status, 0);
  const saved = JSON.parse(fs.readFileSync(out));
  for (const change of [
    (r) => {
      r.token.redenominationFactor = '7';
    },
    (r) => {
      r.modules.jobRegistry.after.jobStake.raw = '1';
    },
    (r) => {
      r.meta.productionApproved = true;
    },
    (r) => {
      r.meta.inputs[0].sha256 = '0'.repeat(64);
    },
  ]) {
    const bad = structuredClone(saved);
    change(bad);
    fs.writeFileSync(out, JSON.stringify(bad));
    assert.throws(() => verifyArtifacts(root));
  }
  fs.writeFileSync(out, JSON.stringify(saved));
  fs.writeFileSync(path.join(cfg, 'job-registry-redenominated.json'), '{}');
  assert.throws(() => verifyArtifacts(root), /Job draft/);
});
test('all read-only CLIs terminate without a TTY and work outside repository root', () => {
  for (const name of [
    'run-demo',
    'mission-control',
    'owner-console',
    'guardian-drill',
    'verify-scenario',
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(p.DEMO, `scripts/${name}.mjs`)],
      { cwd: os.tmpdir(), encoding: 'utf8', timeout: 5000 }
    );
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /\bundefined\b|\bNaN\b/);
  }
});

test('original vision graph and README systems map are preserved', () => {
  const { createHash } = require('node:crypto');
  const scenario = JSON.parse(
    fs.readFileSync(path.join(p.DEMO, 'scenario.json'))
  );
  assert.equal(
    createHash('sha256').update(scenario.mermaid).digest('hex'),
    '8b1de41e0846556b761ac259784a845bbcac7692857b8f8e10de9a2e0ed2a369'
  );
  const readme = fs.readFileSync(path.join(p.DEMO, 'README.md'), 'utf8');
  assert.ok(
    readme.includes(
      'flowchart LR\n    Operators((Mission Owners)) --> demo_REDENOMINATION[[Demo → Redenomination]]\n    demo_REDENOMINATION --> Core[["AGI Jobs v0 (v2) Core Intelligence"]]\n    Core --> Observability[[Unified CI / CD & Observability]]\n    Core --> Governance[[Owner Control Plane]]'
    )
  );
  const provenance = JSON.parse(
    fs.readFileSync(path.join(p.DEMO, 'ui/architecture.provenance.json'))
  );
  assert.equal(
    provenance.sourceSha256,
    createHash('sha256').update(scenario.mermaid).digest('hex')
  );
  assert.equal(
    provenance.svgSha256,
    createHash('sha256')
      .update(fs.readFileSync(path.join(p.DEMO, 'ui/architecture.svg')))
      .digest('hex')
  );
  assert.equal(provenance.renderer, 'mermaid@12.1.0');
});
test('checked-in sample uses the current schema and exact conversion data', () => {
  const sample = JSON.parse(
    fs.readFileSync(path.join(p.DEMO, 'ui/sample.json'))
  );
  const expected = p.buildPlaybook(input(), {
    currentSupplyTokens: '42000000',
  });
  assert.equal(sample.meta.version, expected.meta.version);
  assert.deepEqual(sample.token, expected.token);
  assert.deepEqual(sample.configSnapshots, expected.configSnapshots);
});
