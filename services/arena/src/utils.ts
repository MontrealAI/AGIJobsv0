export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function toCommitHash(payload: unknown): string {
  const normalized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const buffer = Buffer.from(normalized);
  return `0x${buffer.toString('hex')}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const list = [...items];
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  for (let i = list.length - 1; i > 0; i--) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const j = hash % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
