export class DeterministicRng {
  private state: number;

  constructor(seed: string) {
    this.state = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 1;
  }

  next(): number {
    // Xorshift32 variant for determinism
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return ((x >>> 0) % 1000000) / 1000000;
  }

  pick<T>(values: readonly T[]): T {
    if (!values.length) {
      throw new Error('Cannot pick from empty array');
    }
    const index = Math.floor(this.next() * values.length);
    return values[index];
  }
}
