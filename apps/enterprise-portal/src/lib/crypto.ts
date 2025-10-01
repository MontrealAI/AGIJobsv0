import { keccak256, toUtf8Bytes, verifyMessage } from 'ethers';

type Hex = `0x${string}`;

export interface VerificationResult {
  recoveredAddress: string;
  matchesAgent: boolean;
  matchesHash: boolean;
}

const orderValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(orderValue);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = orderValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
};

export const computeSpecHash = (payload: unknown): Hex => {
  const ordered = orderValue(payload);
  const serialised = JSON.stringify(ordered);
  return keccak256(toUtf8Bytes(serialised)) as Hex;
};

export const verifyDeliverableSignature = async (
  signature: string,
  expectedHash: string,
  agentAddress: string
): Promise<VerificationResult> => {
  const recovered = await verifyMessage(expectedHash, signature);
  const matchesAgent = recovered.toLowerCase() === agentAddress.toLowerCase();
  return {
    recoveredAddress: recovered,
    matchesAgent,
    matchesHash: expectedHash.length === 66
  };
};
