import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractCidFromPinningResponse,
  parseIpfsAddResponse,
} from '../execution';

test('extractCidFromPinningResponse handles plain cid strings', () => {
  const cid = 'bafybeigdyrzttoexamplecid';
  assert.equal(extractCidFromPinningResponse(cid), cid);
});

test('extractCidFromPinningResponse handles nested cid objects', () => {
  const payload = { cid: { '/': 'bafyNestedCid' } };
  assert.equal(extractCidFromPinningResponse(payload), 'bafyNestedCid');
});

test('extractCidFromPinningResponse handles Hash field', () => {
  const payload = { Hash: 'QmHashExample' };
  assert.equal(extractCidFromPinningResponse(payload), 'QmHashExample');
});

test('parseIpfsAddResponse parses multi-line responses', () => {
  const response = '\n{"Name":"file","Hash":"bafyHash","Size":"123"}\n';
  assert.equal(parseIpfsAddResponse(response), 'bafyHash');
});

test('parseIpfsAddResponse returns empty string for invalid payloads', () => {
  assert.equal(parseIpfsAddResponse('not-json'), '');
});
