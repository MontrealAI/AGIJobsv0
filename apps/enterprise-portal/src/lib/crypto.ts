import {
  keccak256,
  toUtf8Bytes,
  verifyMessage,
  getBytes,
  isHexString
} from 'ethers';

type Hex = `0x${string}`;

export interface VerificationResult {
  recoveredAddress: string;
  matchesAgent: boolean;
  matchesHash: boolean;
  normalizedHash: string;
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

const toUint8Array = (payload: ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
};

export const hashDeliverableBytes = (payload: ArrayBuffer | ArrayBufferView): Hex => {
  return keccak256(toUint8Array(payload)) as Hex;
};

export const verifyDeliverableSignature = async (
  signature: string,
  expectedHash: string,
  agentAddress: string
): Promise<VerificationResult> => {
  const normalizedHash = expectedHash.trim();
  const isHashHex = isHexString(normalizedHash, 32);
  const message = isHashHex ? getBytes(normalizedHash) : normalizedHash;
  const recovered = await verifyMessage(message, signature);
  const matchesAgent = recovered.toLowerCase() === agentAddress.toLowerCase();
  const matchesHash = isHashHex;
  return {
    recoveredAddress: recovered,
    matchesAgent,
    matchesHash,
    normalizedHash
  };
};
