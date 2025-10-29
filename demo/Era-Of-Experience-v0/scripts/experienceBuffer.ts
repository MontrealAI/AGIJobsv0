import { ExperienceRecord } from './types';

export class ExperienceBuffer {
  private buffer: ExperienceRecord[] = [];

  constructor(
    private readonly capacity: number,
    private readonly randomFn: () => number = Math.random,
  ) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error(`ExperienceBuffer requires positive capacity, received ${capacity}`);
    }
    if (typeof randomFn !== 'function') {
      throw new Error('ExperienceBuffer requires a random function');
    }
  }

  append(record: ExperienceRecord): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(record);
  }

  sample(batchSize: number): ExperienceRecord[] {
    if (batchSize <= 0) {
      throw new Error('Batch size must be positive');
    }
    if (this.buffer.length === 0) {
      return [];
    }
    const size = Math.min(batchSize, this.buffer.length);
    const sampled = new Array<ExperienceRecord>(size);
    const indices = new Set<number>();
    while (indices.size < size) {
      const randomValue = this.randomFn();
      if (!Number.isFinite(randomValue)) {
        continue;
      }
      const index = Math.floor(Math.abs(randomValue % 1) * this.buffer.length);
      indices.add(index);
    }
    let i = 0;
    for (const index of indices) {
      sampled[i++] = this.buffer[index];
    }
    return sampled;
  }

  snapshot(limit = this.buffer.length): ExperienceRecord[] {
    return this.buffer.slice(-limit);
  }

  get size(): number {
    return this.buffer.length;
  }
}
