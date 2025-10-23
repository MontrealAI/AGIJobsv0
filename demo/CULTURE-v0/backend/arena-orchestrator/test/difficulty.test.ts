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

  it('uses default gains when configuration omits tuning', () => {
    const config = {
      targetSuccessRate: 1.5,
      minDifficulty: 0,
      maxDifficulty: 10,
      maxStep: 4,
      proportionalGain: 3
    };
    const result = computeNextDifficulty(4, -0.5, config);
    expect(result.nextDifficulty).toBeGreaterThanOrEqual(config.minDifficulty);
    expect(result.nextDifficulty).toBeLessThanOrEqual(config.maxDifficulty);
  });

  it('clamps movement to configured step window', () => {
    const config = { ...baseConfig, maxStep: 1, proportionalGain: 20 };
    const hugeIncrease = computeNextDifficulty(5, 1, config);
    const hugeDecrease = computeNextDifficulty(5, 0, config);
    expect(hugeIncrease.nextDifficulty).toBe(6);
    expect(hugeDecrease.nextDifficulty).toBe(4);
  });

  it('honours absolute min and max difficulty bounds', () => {
    const config = { ...baseConfig, maxDifficulty: 6, minDifficulty: 2, proportionalGain: 50 };
    const nearTop = computeNextDifficulty(6, 1, config);
    const nearBottom = computeNextDifficulty(2, 0, config);
    expect(nearTop.nextDifficulty).toBe(config.maxDifficulty);
    expect(nearBottom.nextDifficulty).toBe(config.minDifficulty);
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

  it('clamps integral accumulation when oscillating', () => {
    const config = {
      ...baseConfig,
      integralGain: 1,
      derivativeGain: 0.5,
      integralDecay: 0,
      maxIntegral: 0.25
    };
    let difficulty = 4;
    for (let i = 0; i < 8; i += 1) {
      const { nextDifficulty } = computeNextDifficulty(difficulty, i % 2 === 0 ? 1 : 0, config);
      difficulty = nextDifficulty;
    }
    expect(difficulty).toBeGreaterThanOrEqual(config.minDifficulty);
    expect(difficulty).toBeLessThanOrEqual(config.maxDifficulty);
  });

  it('limits shared controller integral between +/-max', () => {
    const config = {
      ...baseConfig,
      proportionalGain: 0,
      integralGain: 10,
      derivativeGain: 0,
      integralDecay: 0,
      maxIntegral: 0.1,
      maxStep: 5
    };

    let difficulty = 5;
    for (let i = 0; i < 10; i += 1) {
      const { nextDifficulty } = computeNextDifficulty(difficulty, 1, config);
      expect(nextDifficulty - difficulty).toBeLessThanOrEqual(config.maxStep);
      difficulty = nextDifficulty;
    }

    for (let i = 0; i < 10; i += 1) {
      const { nextDifficulty } = computeNextDifficulty(difficulty, 0, config);
      expect(difficulty - nextDifficulty).toBeLessThanOrEqual(config.maxStep);
      difficulty = nextDifficulty;
    }
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

  it('clamps controller integral to configured bounds', () => {
    const controller = new DifficultyController({ ...config, maxIntegral: 0.2, integralDecay: 0 });
    let difficulty = 6;
    for (let i = 0; i < 6; i += 1) {
      difficulty = controller.update(difficulty, 1).nextDifficulty;
    }
    for (let i = 0; i < 6; i += 1) {
      difficulty = controller.update(difficulty, 0).nextDifficulty;
    }
    expect(difficulty).toBeGreaterThanOrEqual(config.minDifficulty);
    expect(difficulty).toBeLessThanOrEqual(config.maxDifficulty);
  });

  it('respects controller reset between difficulty bands', () => {
    const controller = new DifficultyController(config);
    controller.update(5, 1);
    controller.update(5, 0);
    DifficultyController.reset();
    const freshController = new DifficultyController(config);
    const result = freshController.update(5, 0.5);
    expect(result.nextDifficulty).toBeGreaterThanOrEqual(config.minDifficulty);
  });

  it('clamps controller input domain via decay limits', () => {
    const controller = new DifficultyController({ ...config, integralDecay: 5 });
    const result = controller.update(5, -1);
    expect(result.nextDifficulty).toBeGreaterThanOrEqual(config.minDifficulty);
    expect(result.nextDifficulty).toBeLessThanOrEqual(config.maxDifficulty);
  });
});
