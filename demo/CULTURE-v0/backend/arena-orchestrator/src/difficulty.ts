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

// The standalone helper is deliberately stateless. Each controller owns its PID history.
export function computeNextDifficulty(
  currentDifficulty: number,
  observedSuccessRate: number,
  config: DifficultyConfig,
): DifficultyResult {
  return new DifficultyController(config).update(
    currentDifficulty,
    observedSuccessRate,
  );
}

export class DifficultyController {
  private integral = 0;
  private previousError = 0;

  constructor(private readonly config: DifficultyConfig) {}

  update(
    currentDifficulty: number,
    observedSuccessRate: number,
  ): DifficultyResult {
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
    const boundedAdjustment = Math.max(
      -this.config.maxStep,
      Math.min(this.config.maxStep, totalAdjustment),
    );
    const nextDifficulty = Math.round(
      Math.max(
        this.config.minDifficulty,
        Math.min(
          this.config.maxDifficulty,
          currentDifficulty + boundedAdjustment,
        ),
      ),
    );
    return { nextDifficulty, delta: nextDifficulty - currentDifficulty };
  }

  // Retained for callers that reset between test runs; no global state remains.
  static reset(): void {}
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
