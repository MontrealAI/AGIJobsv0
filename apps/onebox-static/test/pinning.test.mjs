import test from 'node:test';
import assert from 'node:assert/strict';
import { needsAttachmentPin, prepareJobPayload } from '../lib.mjs';

const CID = 'bafyreigdyrnucsac53examplecid0000000000000000000000000000000';

function assignCid(ics, cid) {
  const result = prepareJobPayload(ics, null);
  assert.ok(result.payload, 'expected a payload for submission intents');
  result.assign(cid);
  return ics;
}

test('submit_work ICS without result uri pins and normalises result field', () => {
  const ics = {
    intent: 'submit_work',
    params: {
      note: 'Hello world',
      attachments: ['ipfs://existing-cid'],
    },
  };

  assert.equal(needsAttachmentPin(ics), true);

  assignCid(ics, CID);

  assert.deepEqual(ics.params.result, {
    uri: `ipfs://${CID}`,
  });
  assert.equal('resultUri' in ics.params, false);
});

test('submit_work ICS with result uri keeps other result metadata', () => {
  const ics = {
    intent: 'submit_work',
    params: {
      result: {
        uri: 'ipfs://preexisting',
        status: 'draft',
      },
    },
  };

  assert.equal(needsAttachmentPin(ics), false);

  assignCid(ics, CID);

  assert.deepEqual(ics.params.result, {
    status: 'draft',
    uri: `ipfs://${CID}`,
  });
});
