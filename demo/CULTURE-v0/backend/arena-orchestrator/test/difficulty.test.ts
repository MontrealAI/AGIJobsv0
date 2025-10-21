import { describe, expect, it } from 'vitest';
import { computeNextDifficulty } from '../src/difficulty.js';

describe('computeNextDifficulty', () => {
  const baseConfig = {
    targetSuccessRate: 0.6,
    minDifficulty: 1,
    maxDifficulty: 9,
    maxStep: 2,
    proportionalGain: 5
  };

  it('increases difficulty when success rate is too high', () => {
    const result = computeNextDifficulty(3, 0.9, baseConfig);
    expect(result.nextDifficulty).toBeGreaterThan(3);
  });

  it('decreases difficulty when success rate is too low', () => {
    const result = computeNextDifficulty(5, 0.1, baseConfig);
    expect(result.nextDifficulty).toBeLessThan(5);
  });

  it('respects bounds and max step', () => {
    const result = computeNextDifficulty(8, 1, baseConfig);
    expect(result.nextDifficulty).toBeLessThanOrEqual(9);
    expect(result.nextDifficulty - 8).toBeLessThanOrEqual(baseConfig.maxStep);
  });
});
