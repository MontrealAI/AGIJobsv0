import { describe, expect, it } from '@jest/globals';
import {
  computeMetrics,
  crossVerifyMetrics,
  loadConfig,
  parseManifest,
  resolveEnvironment,
} from '../run-phase8-demo';
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
