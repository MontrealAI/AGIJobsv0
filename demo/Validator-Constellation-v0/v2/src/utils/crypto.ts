import { keccak256, toHex, stringToHex } from 'viem';

export function hashCommit(payload: { roundId: string; jobId: string; vote: boolean }, salt: string) {
  const voteValue = payload.vote ? '1' : '0';
  return keccak256(
    toHex(
      new TextEncoder().encode(`${payload.roundId}|${payload.jobId}|${voteValue}|${salt}`)
    )
  );
}

export function hashMetadata(metadata: Record<string, unknown>): `0x${string}` {
  return keccak256(stringToHex(JSON.stringify(metadata)));
}

export function deterministicRandom(seed: string, domainSeparator: string, upperBound: number): number {
  if (upperBound <= 0) {
    throw new Error('upperBound must be greater than zero');
  }
  const combined = keccak256(stringToHex(`${seed}|${domainSeparator}`));
  const numeric = BigInt(combined);
  return Number(numeric % BigInt(upperBound));
}

export function deriveProofId(inputs: string[]): `0x${string}` {
  const sorted = [...inputs].sort();
  return keccak256(stringToHex(sorted.join('|')));
}
