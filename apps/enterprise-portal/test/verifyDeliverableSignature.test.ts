import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, ethers } from 'ethers';
import { verifyDeliverableSignature } from '../src/lib/crypto.js';

test('verifies agent signatures over 32-byte digests', async () => {
  const wallet = Wallet.createRandom();
  const digest = ethers.keccak256(ethers.toUtf8Bytes('result-payload'));
  const signature = await wallet.signMessage(ethers.getBytes(digest));

  const verification = await verifyDeliverableSignature(
    signature,
    digest,
    wallet.address
  );

  assert.equal(verification.matchesHash, true);
  assert.equal(verification.matchesAgent, true);
  assert.equal(verification.recoveredAddress, wallet.address);
  assert.equal(verification.normalizedHash.toLowerCase(), digest.toLowerCase());
});

test('flags mismatched agent signatures', async () => {
  const signer = Wallet.createRandom();
  const other = Wallet.createRandom();
  const digest = ethers.keccak256(ethers.toUtf8Bytes('result-payload'));
  const signature = await signer.signMessage(ethers.getBytes(digest));

  const verification = await verifyDeliverableSignature(
    signature,
    digest,
    other.address
  );

  assert.equal(verification.matchesHash, true);
  assert.equal(verification.matchesAgent, false);
  assert.equal(verification.recoveredAddress, signer.address);
});

test('falls back to string verification for non-hex payloads', async () => {
  const signer = Wallet.createRandom();
  const message = 'custom-result-reference';
  const signature = await signer.signMessage(message);

  const verification = await verifyDeliverableSignature(
    signature,
    message,
    signer.address
  );

  assert.equal(verification.matchesHash, false);
  assert.equal(verification.matchesAgent, true);
  assert.equal(verification.recoveredAddress, signer.address);
  assert.equal(verification.normalizedHash, message);
});
