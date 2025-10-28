import crypto from 'node:crypto';

export function ensurePrivateKey(key?: string): string {
  if (!key) {
    throw new Error('Private key is required to sign transactions. Provide via env or CLI.');
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('Invalid private key format. Expected 0x-prefixed 32-byte hex string.');
  }
  return key;
}

export function deriveOperatorId(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Invalid address format');
  }
  return crypto.createHash('sha256').update(address.toLowerCase()).digest('hex');
}
