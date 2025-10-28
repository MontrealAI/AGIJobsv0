import { formatUnits } from 'ethers';

function parseFloatSafe(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function weiToEtherNumber(value: bigint): number {
  return parseFloatSafe(formatUnits(value, 18));
}

export function ratioFromWei(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) {
    return 0;
  }
  const numeratorValue = weiToEtherNumber(numerator);
  const denominatorValue = weiToEtherNumber(denominator);
  if (!Number.isFinite(denominatorValue) || denominatorValue <= 0) {
    return 0;
  }
  const ratio = numeratorValue / denominatorValue;
  return Number.isFinite(ratio) ? ratio : 0;
}
