export interface DifficultyConfig {
  readonly targetSuccessRate: number; // 0-1 range
  readonly minDifficulty: number;
  readonly maxDifficulty: number;
  readonly maxStep: number;
  readonly proportionalGain: number;
  readonly integralGain?: number;
  readonly derivativeGain?: number;
  readonly integralDecay?: number;
  readonly maxIntegral?: number;
}

export interface DifficultyResult {
  readonly nextDifficulty: number;
  readonly delta: number;
}

const controllerState = new Map<number, ControllerState>();

function getOrCreateState(key: number): ControllerState {
  let state = controllerState.get(key);
  if (!state) {
    state = { integral: 0, previousError: 0 };
    controllerState.set(key, state);
  }
  return state;
}

export function computeNextDifficulty(
  currentDifficulty: number,
  observedSuccessRate: number,
  config: DifficultyConfig
): DifficultyResult {
  const target = clamp01(config.targetSuccessRate);
  const observed = clamp01(observedSuccessRate);
  const error = observed - target;
  const integralGain = config.integralGain ?? 0;
  const derivativeGain = config.derivativeGain ?? 0;
  const integralDecay = clamp01(config.integralDecay ?? 0.5);
  const maxIntegral = config.maxIntegral ?? 5;

  // We piggy-back on a static integral accumulator scoped by currentDifficulty.
  const state = getOrCreateState(currentDifficulty);
  state.integral = state.integral * (1 - integralDecay) + error;
  if (state.integral > maxIntegral) state.integral = maxIntegral;
  if (state.integral < -maxIntegral) state.integral = -maxIntegral;

  const derivative = error - state.previousError;
  state.previousError = error;

  const rawAdjustment =
    error * config.proportionalGain + state.integral * integralGain + derivative * derivativeGain;
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

interface ControllerState {
  integral: number;
  previousError: number;
}

export class DifficultyController {
  private integral = 0;
  private previousError = 0;

  constructor(private readonly config: DifficultyConfig) {}

  update(currentDifficulty: number, observedSuccessRate: number): DifficultyResult {
    const target = clamp01(this.config.targetSuccessRate);
    const observed = clamp01(observedSuccessRate);
    const error = observed - target;
    this.integral =
      this.integral * (1 - clamp01(this.config.integralDecay ?? 0.5)) + error;
    const maxIntegral = this.config.maxIntegral ?? 5;
    if (this.integral > maxIntegral) this.integral = maxIntegral;
    if (this.integral < -maxIntegral) this.integral = -maxIntegral;

    const derivative = error - this.previousError;
    this.previousError = error;

    const proportionalTerm = error * this.config.proportionalGain;
    const integralTerm = this.integral * (this.config.integralGain ?? 0);
    const derivativeTerm = derivative * (this.config.derivativeGain ?? 0);
    const totalAdjustment = proportionalTerm + integralTerm + derivativeTerm;
    return computeNextDifficulty(currentDifficulty + totalAdjustment, observed, this.config);
  }

  static reset(): void {
    controllerState.clear();
  }
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
