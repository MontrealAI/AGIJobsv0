import { computeNextDifficulty, DifficultyController } from '../src/difficulty.js';

describe('computeNextDifficulty', () => {
  const baseConfig = {
    targetSuccessRate: 0.6,
    minDifficulty: 1,
    maxDifficulty: 9,
    maxStep: 2,
    proportionalGain: 5,
    integralGain: 0.2,
    derivativeGain: 0.1
  };

  beforeEach(() => {
    DifficultyController.reset();
  });

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

  it('handles streaks without runaway escalation', () => {
    let difficulty = 4;
    for (let i = 0; i < 20; i += 1) {
      const { nextDifficulty } = computeNextDifficulty(difficulty, i % 2 === 0 ? 1 : 0, baseConfig);
      expect(nextDifficulty).toBeGreaterThanOrEqual(baseConfig.minDifficulty);
      expect(nextDifficulty).toBeLessThanOrEqual(baseConfig.maxDifficulty);
      difficulty = nextDifficulty;
    }
  });

  it('stabilises near target success rate', () => {
    let difficulty = 5;
    for (let i = 0; i < 10; i += 1) {
      const { nextDifficulty } = computeNextDifficulty(difficulty, 0.6, baseConfig);
      difficulty = nextDifficulty;
    }
    expect(Math.abs(difficulty - 5)).toBeLessThanOrEqual(1);
  });
});

describe('DifficultyController', () => {
  const config = {
    targetSuccessRate: 0.5,
    minDifficulty: 1,
    maxDifficulty: 10,
    maxStep: 3,
    proportionalGain: 4,
    integralGain: 0.5,
    derivativeGain: 0.25,
    integralDecay: 0.3
  };

  beforeEach(() => {
    DifficultyController.reset();
  });

  it('tracks integral error to avoid oscillation', () => {
    const controller = new DifficultyController(config);
    let result: { nextDifficulty: number } = { nextDifficulty: config.minDifficulty };
    let difficulty = 5;
    for (let i = 0; i < 5; i += 1) {
      result = controller.update(difficulty, 1);
      difficulty = result.nextDifficulty;
    }
    const afterFailures = controller.update(difficulty, 0);
    expect(afterFailures.nextDifficulty).toBeLessThanOrEqual(result.nextDifficulty);
  });
});
