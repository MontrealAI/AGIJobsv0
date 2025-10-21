export interface DifficultyParams {
  current: number;
  targetSuccessRate: number; // expressed in basis points (0-10000)
  observedSuccessRate: number; // basis points
  minDifficulty: number;
  maxDifficulty: number;
  maxStep: number;
  proportionalGain?: number;
}

const DEFAULT_GAIN = 0.01;

/**
 * Adaptive difficulty controller inspired by proportional-integral design.
 * For v0 we only implement proportional control with clamping and sanity checks.
 */
export function nextDifficulty(params: DifficultyParams): number {
  const {
    current,
    targetSuccessRate,
    observedSuccessRate,
    minDifficulty,
    maxDifficulty,
    maxStep,
    proportionalGain = DEFAULT_GAIN,
  } = params;

  if (minDifficulty > maxDifficulty) {
    throw new Error("Invalid difficulty bounds");
  }

  const error = observedSuccessRate - targetSuccessRate;
  const rawDelta = error * proportionalGain;
  const unclamped = current + rawDelta;

  const clampedToBounds = Math.min(Math.max(unclamped, minDifficulty), maxDifficulty);
  const upperBound = current + maxStep;
  const lowerBound = current - maxStep;
  const boundedStep = Math.min(Math.max(clampedToBounds, lowerBound), upperBound);

  // Difficulty must be an integer for on-chain storage.
  return Math.round(boundedStep);
}

export function successRateFromOutcomes(totalStudents: number, successful: number): number {
  if (totalStudents <= 0) {
    return 0;
  }
  const rate = (successful / totalStudents) * 10_000;
  return Math.round(Math.min(Math.max(rate, 0), 10_000));
}
