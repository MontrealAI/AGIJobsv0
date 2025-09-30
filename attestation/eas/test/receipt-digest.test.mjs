import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptAttester } from '../dist/attester.js';
import { ethers } from 'ethers';

test('computeReceiptDigest is order-insensitive for objects', () => {
  const payloadA = {
    stage: 'PLAN',
    details: { a: 1, b: 'two', nested: { x: true, y: null } },
    array: [1, 2, 3],
  };
  const payloadB = {
    array: [1, 2, 3],
    details: { nested: { y: null, x: true }, b: 'two', a: 1 },
    stage: 'PLAN',
  };
  const digestA = ReceiptAttester.computeDigest(payloadA);
  const digestB = ReceiptAttester.computeDigest(payloadB);
  assert.equal(digestA, digestB);
});

test('computeReceiptDigest changes when payload changes', () => {
  const payload = { foo: 'bar' };
  const digest1 = ReceiptAttester.computeDigest(payload);
  const digest2 = ReceiptAttester.computeDigest({ foo: 'baz' });
  assert.notEqual(digest1, digest2);
});

const schemaUid = '0x' + '11'.repeat(32);

test('verify returns true when attestation matches digest and cid', async () => {
  const signer = ethers.Wallet.createRandom();
  const attester = new ReceiptAttester({
    easAddress: ethers.ZeroAddress,
    schemaUid,
    signer,
  });
  const payload = { foo: 'bar', count: 1 };
  const digest = ReceiptAttester.computeDigest(payload);
  const cid = 'bafytestcid';
  const encoder = attester.encoder;
  attester.eas = {
    async getAttestation(uid) {
      return {
        uid,
        schema: schemaUid,
        data: encoder.encodeData([
          { name: 'stage', type: 'string', value: 'EXECUTION' },
          { name: 'digest', type: 'bytes32', value: digest },
          { name: 'cid', type: 'string', value: cid },
          { name: 'uri', type: 'string', value: 'ipfs://' + cid },
          { name: 'context', type: 'string', value: '' },
        ]),
      };
    },
  };
  const result = await attester.verify('0xattestation', digest, cid);
  assert.equal(result, true);
});

test('verify returns false when digest mismatches', async () => {
  const signer = ethers.Wallet.createRandom();
  const attester = new ReceiptAttester({
    easAddress: ethers.ZeroAddress,
    schemaUid,
    signer,
  });
  const digest = ReceiptAttester.computeDigest({ foo: 'bar' });
  const encoder = attester.encoder;
  attester.eas = {
    async getAttestation() {
      return {
        schema: schemaUid,
        data: encoder.encodeData([
          { name: 'stage', type: 'string', value: 'PLAN' },
          { name: 'digest', type: 'bytes32', value: digest },
          { name: 'cid', type: 'string', value: '' },
          { name: 'uri', type: 'string', value: '' },
          { name: 'context', type: 'string', value: '' },
        ]),
      };
    },
  };
  const result = await attester.verify('0xattestation', digest, 'different');
  assert.equal(result, false);
});
