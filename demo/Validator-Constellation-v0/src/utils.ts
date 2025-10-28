import crypto from 'crypto';

export function keccak256(data: string): string {
  return crypto.createHash('sha3-256').update(data).digest('hex');
}

export function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const mutable = [...items];
  let s = seed;
  for (let i = mutable.length - 1; i > 0; i -= 1) {
    s = keccak256(`${s}:${i}`);
    const j = parseInt(s.slice(0, 8), 16) % (i + 1);
    [mutable[i], mutable[j]] = [mutable[j], mutable[i]];
  }
  return mutable;
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function formatWei(value: bigint): string {
  return `${Number(value) / 1e18} ETH`;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function toHex(value: string): string {
  return Buffer.from(value).toString('hex');
}

export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function mixEntropy(inputs: string[]): string {
  return keccak256(inputs.join('|'));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function percentage(value: number, max = 100): string {
  return `${((value / max) * 100).toFixed(2)}%`;
}
