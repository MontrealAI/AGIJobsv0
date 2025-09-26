import test from 'node:test';
import assert from 'node:assert/strict';
import { needsAttachmentPin, prepareJobPayload } from '../lib.mjs';
import { createMaybePinPayload } from '../pin-payload.mjs';

const IPFS_GATEWAY = 'https://w3s.link/ipfs/';

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

test('maybePinPayload normalises submission params in app.js', async () => {
  const maybePinPayload = createMaybePinPayload({
    deepClone: (value) => JSON.parse(JSON.stringify(value)),
    IPFS_GATEWAY,
    pinJSON: async () => ({ cid: 'unused' }),
    pinFile: async (file) => ({ cid: CID, file }),
  });

  const file = {
    name: 'result.txt',
    size: 2048,
  };

  const original = {
    intent: 'submit_work',
    params: {
      attachments: ['ipfs://existing'],
      note: 'submission',
      result: { status: 'draft', comment: 'keep-me' },
      uri: 'ipfs://old',
      resultUri: 'ipfs://old',
    },
  };

  const enriched = await maybePinPayload(original, [file]);

  assert.deepEqual(enriched.params.result, {
    status: 'draft',
    comment: 'keep-me',
    uri: `ipfs://${CID}`,
  });
  assert.equal('uri' in enriched.params, false);
  assert.equal('resultUri' in enriched.params, false);
  assert.deepEqual(enriched.params.attachments, [
    'ipfs://existing',
    `ipfs://${CID}`,
  ]);
  assert.equal(enriched.params.gatewayUri, `${IPFS_GATEWAY}${CID}`);
  assert.deepEqual(enriched.meta.clientPinned, {
    cid: CID,
    uri: `ipfs://${CID}`,
    gateway: `${IPFS_GATEWAY}${CID}`,
    name: 'result.txt',
    size: 2048,
  });
});
