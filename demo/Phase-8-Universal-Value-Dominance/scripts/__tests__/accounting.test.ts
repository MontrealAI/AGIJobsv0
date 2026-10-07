import { describe, expect, it } from '@jest/globals';
import {
  computeMetrics,
  crossVerifyMetrics,
  loadConfig,
  parseManifest,
  resolveEnvironment,
  writeArtifacts,
  calldata,
} from '../run-phase8-demo';
import { validateArtifacts } from '../validate-phase8-config';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Phase 8 accounting and numerical boundaries', () => {
  it('conserves the total shared capital instead of assigning each domain the entire stream', () => {
    const config = loadConfig();
    const metrics = computeMetrics(config);
    const allocated = Object.values(metrics.domainFundingMap).reduce(
      (sum: number, n: number) => sum + n,
      0
    );
    expect(allocated).toBeCloseTo(1970000000000, 2);
    expect(allocated).toBeCloseTo(metrics.annualBudget, 2);
    expect(metrics.domainFundingMap['planetary-finance']).toBe(296666666666);
    crossVerifyMetrics(config);
  });
  it('allocates whole-dollar remainders once, independent of target order', () => {
    const config = loadConfig();
    config.capitalStreams = [
      {
        ...config.capitalStreams[0],
        annualBudget: 2,
        domains: [
          'planetary-finance',
          'health-sovereign',
          'knowledge-lattice',
          'health-sovereign',
        ],
      },
    ];
    const first = computeMetrics(config);
    expect(first.domainFundingMap['planetary-finance'] || 0).toBe(0);
    expect(first.domainFundingMap['health-sovereign']).toBe(1);
    expect(first.domainFundingMap['knowledge-lattice']).toBe(1);
    config.capitalStreams[0].domains.reverse();
    expect(computeMetrics(config).domainFundingMap).toEqual(
      first.domainFundingMap
    );
    crossVerifyMetrics(config);
  });
  it('cannot satisfy active-domain coverage with a disabled sentinel', () => {
    const config = loadConfig();
    config.sentinels.forEach((sentinel) => (sentinel.active = false));
    expect(() => parseManifest(config)).toThrow(/coverage/);
  });
  it('excludes disabled capital and sentinels from active capacity', () => {
    const config = loadConfig();
    config.capitalStreams.forEach((s) => (s.active = false));
    config.sentinels.forEach((s) => (s.active = false));
    const metrics = computeMetrics(config);
    expect(metrics.annualBudget).toBe(0);
    expect(metrics.fundedDomainRatio).toBe(0);
    expect(metrics.coverageRatio).toBe(0);
    crossVerifyMetrics(config);
  });
  it.each([1.5, Number.MAX_SAFE_INTEGER + 1, -1n])(
    'rejects lossy or negative token amounts: %s',
    (amount) => {
      const config = loadConfig();
      expect(() =>
        parseManifest({
          ...config,
          domains: config.domains.map((domain, index) =>
            index === 0 ? { ...domain, tvlLimit: amount } : domain
          ),
        })
      ).toThrow();
    }
  );
  it('retains large decimal amounts without rounding', () => {
    const config = loadConfig();
    config.domains[0].tvlLimit = '123456789123456789123456789';
    expect(parseManifest(config).domains[0].tvlLimit).toBe(
      config.domains[0].tvlLimit
    );
  });
  it('bounds risk and resilience inputs', () => {
    const config = loadConfig();
    config.domains[0].resilienceIndex = 1.1;
    expect(() => parseManifest(config)).toThrow(/cannot exceed 1/);
    config.domains[0].resilienceIndex = 1;
    config.domains[0].autonomyLevelBps = 10001;
    expect(() => parseManifest(config)).toThrow(/10000/);
  });
  it('defaults to the local chain and rejects an unsafe chain ID', () => {
    expect(resolveEnvironment({}).chainId).toBe(31337);
    expect(() =>
      resolveEnvironment({ PHASE8_CHAIN_ID: '9007199254740992' })
    ).toThrow();
  });
});

it('validates generated artifacts after disabling a domain, its sentinel, and a capital stream', () => {
  const config = loadConfig();
  config.domains.find((entry) => entry.slug === 'health-sovereign')!.active = false;
  config.sentinels.find((entry) => entry.slug === 'bio-sentinel')!.active = false;
  config.capitalStreams.find((entry) => entry.slug === 'innovation-thrust')!.active = false;
  // An AI team covering only an inactive domain contributes no active coverage.
  config.aiTeams = [{ ...config.aiTeams[0], domains: ['health-sovereign'] }];
  const parsed = parseManifest(config);
  const { metrics } = crossVerifyMetrics(parsed);
  expect(metrics.aiTeamCoverageRatio).toBe(0);
  const outputDir = mkdtempSync(join(tmpdir(), 'phase8-disabled-'));
  try {
    writeArtifacts(parsed, metrics, calldata(parsed), resolveEnvironment({ PHASE8_MANAGER_ADDRESS: parsed.global.phase8Manager }), { outputDir });
    expect(() => validateArtifacts(parsed, outputDir)).not.toThrow();
    const scorecard = JSON.parse(readFileSync(join(outputDir, 'phase8-dominance-scorecard.json'), 'utf8'));
    expect(scorecard.activityPolicy).toContain('active entities only');
    const csv = readFileSync(join(outputDir, 'phase8-cycle-report.csv'), 'utf8').trim().split('\n');
    expect(csv[0]).toContain(',active,');
    expect(csv.find((line) => line.startsWith('health-sovereign,'))).toMatch(/,false,.*inactive$/);
    for (const [key, field, expected] of [
      ['domains', 'valueFlowMonthlyUSD', metrics.totalMonthlyUSD],
      ['sentinels', 'coverageSeconds', metrics.guardianCoverageMinutes * 60],
      ['capitalStreams', 'annualBudgetUSD', metrics.annualBudget],
    ] as const) {
      expect(scorecard[key].some((entry: any) => entry.active === false)).toBe(true);
      expect(scorecard[key].filter((entry: any) => entry.active).reduce((sum: number, entry: any) => sum + entry[field], 0)).toBe(expected);
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

it('rejects unsafe aggregate budgets before any allocation and preserves the exact boundary', () => {
  const config = loadConfig();
  config.capitalStreams.forEach((stream) => { stream.annualBudget = Number.MAX_SAFE_INTEGER; });
  expect(() => parseManifest(config)).toThrow(/Aggregate active annual budget/);
  expect(() => computeMetrics(config)).toThrow(/Aggregate active annual budget/);
  config.capitalStreams.slice(1).forEach((stream) => { stream.active = false; });
  config.capitalStreams[0].domains = config.domains.map((domain) => domain.slug);
  const parsed = parseManifest(config);
  const { metrics } = crossVerifyMetrics(parsed);
  expect(metrics.annualBudget).toBe(Number.MAX_SAFE_INTEGER);
  expect(Object.values(metrics.domainFundingMap).reduce((sum, value) => sum + value, 0)).toBe(Number.MAX_SAFE_INTEGER);
});
