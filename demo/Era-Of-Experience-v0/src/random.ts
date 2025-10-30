export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) {
      throw new Error("Seed must be a finite number");
    }
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  public next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state & 0xffffffff) / 0x100000000;
  }

  public nextBetween(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from empty array");
    }
    const idx = Math.floor(this.next() * items.length);
    return items[Math.min(idx, items.length - 1)];
  }
}
