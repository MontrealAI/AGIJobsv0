import { formatTokenAmount } from './apiHelpers';
import { decodeJobMetadata } from './jobMetadata';

export function serialiseChainJob(entry: any): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const plain: Record<string, unknown> = {};
  const employer = entry.employer ?? entry[0];
  if (typeof employer === 'string') {
    plain.employer = employer;
  }
  const agent = entry.agent ?? entry[1];
  if (typeof agent === 'string') {
    plain.agent = agent;
  }
  const rewardValue = entry.reward ?? entry[2];
  if (rewardValue !== undefined) {
    try {
      const value = BigInt(rewardValue.toString());
      plain.rewardRaw = value.toString();
      plain.rewardFormatted = formatTokenAmount(value);
    } catch {
      plain.rewardRaw = rewardValue?.toString?.();
    }
  }
  const stakeValue = entry.stake ?? entry[3];
  if (stakeValue !== undefined) {
    try {
      const value = BigInt(stakeValue.toString());
      plain.stakeRaw = value.toString();
      plain.stakeFormatted = formatTokenAmount(value);
    } catch {
      plain.stakeRaw = stakeValue?.toString?.();
    }
  }
  const burnReceiptAmount = entry.burnReceiptAmount ?? entry[4];
  if (burnReceiptAmount !== undefined)
    plain.burnReceiptAmount = BigInt(burnReceiptAmount).toString();
  const packed = entry.packedMetadata ?? entry[8];
  if (packed !== undefined) {
    const metadata = decodeJobMetadata(packed);
    Object.assign(plain, metadata);
    // Keep ordinary timestamps numeric for existing clients. Preserve an exact
    // decimal string if a configured uint64 exceeds JavaScript's safe range.
    for (const key of ['deadline', 'assignedAt'] as const)
      plain[key] =
        metadata[key] <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(metadata[key])
          : metadata[key].toString();
    plain.packedMetadata = BigInt(packed).toString();
  }
  for (const [key, index] of [
    ['uriHash', 5],
    ['resultHash', 6],
    ['specHash', 7],
  ] as const) {
    const hash = entry[key] ?? entry[index];
    if (typeof hash === 'string') plain[key] = hash;
  }
  return plain;
}
