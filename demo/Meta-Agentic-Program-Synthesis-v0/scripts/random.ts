export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    const normalized = Number.isFinite(seed) ? Math.floor(Math.abs(seed)) : 1;
    this.state = normalized % 2147483647;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  next(): number {
    this.state = (this.state * 48271) % 2147483647;
    return this.state / 2147483647;
  }

  nextInRange(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    return min + (max - min) * this.next();
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      return 0;
    }
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(values: T[]): T {
    if (values.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    return values[this.nextInt(values.length)];
  }

  perturb(value: number, amplitude: number, clamp?: { min?: number; max?: number }): number {
    const delta = (this.next() * 2 - 1) * amplitude;
    let result = value + delta;
    if (clamp?.min !== undefined) {
      result = Math.max(clamp.min, result);
    }
    if (clamp?.max !== undefined) {
      result = Math.min(clamp.max, result);
    }
    return result;
  }
}

export interface RandomSource {
  next(): number;
  nextInt(maxExclusive: number): number;
  pick<T>(values: T[]): T;
  nextInRange(min: number, max: number): number;
  perturb(value: number, amplitude: number, clamp?: { min?: number; max?: number }): number;
}
