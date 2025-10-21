export interface DifficultyConfig {
  readonly targetSuccessRate: number; // 0-1 range
  readonly minDifficulty: number;
  readonly maxDifficulty: number;
  readonly maxStep: number;
  readonly proportionalGain: number;
}

export interface DifficultyResult {
  readonly nextDifficulty: number;
  readonly delta: number;
}

export function computeNextDifficulty(
  currentDifficulty: number,
  observedSuccessRate: number,
  config: DifficultyConfig
): DifficultyResult {
  const target = clamp01(config.targetSuccessRate);
  const observed = clamp01(observedSuccessRate);
  const error = observed - target;
  const rawAdjustment = error * config.proportionalGain;
  let adjusted = currentDifficulty + rawAdjustment;

  const upperBound = currentDifficulty + config.maxStep;
  const lowerBound = currentDifficulty - config.maxStep;

  if (adjusted > upperBound) adjusted = upperBound;
  if (adjusted < lowerBound) adjusted = lowerBound;

  if (adjusted > config.maxDifficulty) adjusted = config.maxDifficulty;
  if (adjusted < config.minDifficulty) adjusted = config.minDifficulty;

  const nextDifficulty = Math.round(adjusted);
  return { nextDifficulty, delta: nextDifficulty - currentDifficulty };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
