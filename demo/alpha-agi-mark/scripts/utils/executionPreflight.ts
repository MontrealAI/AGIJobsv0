import { formatEther, parseEther } from 'ethers';

export const DEMO_CURVE = {
  basePrice: parseEther('0.1'),
  slope: parseEther('0.05'),
  maxSupply: 100,
};
export const MIN_GAS_RESERVE = parseEther('0.05');
export const DEMO_PURCHASES = [
  { label: 'Investor A', tokens: 5n, overpayment: parseEther('0.2') },
  { label: 'Investor B', tokens: 3n, overpayment: 0n },
  { label: 'Investor C', tokens: 4n, overpayment: 0n },
] as const;

/** Classify the actual execution surface, not just the requested mode. */
export function resolveExecutionMode(
  networkName: string,
  chainId: bigint,
  rawFlag?: string
): 'dry-run' | 'broadcast' {
  const flag = rawFlag?.trim().toLowerCase() ?? 'true';
  if (flag !== 'true' && flag !== 'false')
    throw new Error('AGIJOBS_DEMO_DRY_RUN must be true or false');
  if (networkName === 'hardhat') {
    if (chainId !== 31337n)
      throw new Error(
        'The in-memory Hardhat rehearsal requires chain ID 31337'
      );
    return 'dry-run';
  }
  if (flag !== 'false')
    throw new Error(
      'Dry-run requires the in-memory hardhat network; set AGIJOBS_DEMO_DRY_RUN=false only for an authorized broadcast'
    );
  return 'broadcast';
}

export function assertDistinctActors(
  actors: Array<{ label: string; address: string }>
): void {
  const seen = new Map<string, string>();
  for (const actor of actors) {
    const address = actor.address.toLowerCase();
    const previous = seen.get(address);
    if (previous)
      throw new Error(
        `Demo actor identities must be distinct: ${previous} and ${actor.label} share ${actor.address}`
      );
    seen.set(address, actor.label);
  }
}

/** Include temporary overpayment: its refund is unavailable until the buy executes. */
export function investorMinimumBalances(): bigint[] {
  let supply = 0n;
  return DEMO_PURCHASES.map(({ tokens, overpayment }) => {
    const cost =
      DEMO_CURVE.basePrice * tokens +
      (DEMO_CURVE.slope * tokens * (2n * supply + tokens - 1n)) / 2n;
    supply += tokens;
    return cost + overpayment + MIN_GAS_RESERVE;
  });
}

export function assertSufficientBalance(
  label: string,
  address: string,
  balance: bigint,
  minimum: bigint
): void {
  if (balance < minimum)
    throw new Error(
      `${label} (${address}) requires at least ${formatEther(
        minimum
      )} ETH for planned value and the gas reserve but only has ${formatEther(
        balance
      )} ETH`
    );
}
