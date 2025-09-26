import test from 'node:test';
import assert from 'node:assert/strict';
import { needsAttachmentPin, prepareJobPayload } from '../lib.mjs';

const IPFS_GATEWAY = 'https://w3s.link/ipfs/';

const CID = 'bafyreigdyrnucsac53examplecid0000000000000000000000000000000';
const CID_TWO = 'bafyreigdyrnucsac53examplecid1111111111111111111111111111111';
const PAYLOAD_CID = 'bafyreialpayloadexamplecid0000000000000000000000000000000000';

function assignCid(ics, cid) {
  const result = prepareJobPayload(ics, []);
  assert.ok(result.payload, 'expected a payload for submission intents');
  result.assign({ cid, gateways: [] });
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

test('prepareJobPayload normalises submission params and client metadata', () => {
  const ics = {
    intent: 'submit_work',
    params: {
      attachments: ['ipfs://existing'],
      note: 'submission',
      result: { status: 'draft', comment: 'keep-me' },
      uri: 'ipfs://old',
      resultUri: 'ipfs://old',
    },
    meta: {},
  };

  const attachments = [
    {
      cid: CID,
      uri: `ipfs://${CID}`,
      gateways: [`${IPFS_GATEWAY}${CID}`],
      name: 'result.txt',
      size: 2048,
    },
    {
      cid: CID_TWO,
      uri: `ipfs://${CID_TWO}`,
      gateways: [`${IPFS_GATEWAY}${CID_TWO}`],
      name: 'result-2.txt',
      size: 1024,
    },
  ];

  const prepared = prepareJobPayload(ics, attachments);

  assert.deepEqual(prepared.payload.attachments, [
    'ipfs://existing',
    `ipfs://${CID}`,
    `ipfs://${CID_TWO}`,
  ]);

  prepared.assign({ cid: PAYLOAD_CID, gateways: [`${IPFS_GATEWAY}${PAYLOAD_CID}`] });

  assert.deepEqual(ics.params.result, {
    status: 'draft',
    comment: 'keep-me',
    uri: `ipfs://${PAYLOAD_CID}`,
  });
  assert.equal('uri' in ics.params, false);
  assert.equal('resultUri' in ics.params, false);
  assert.deepEqual(ics.params.attachments, [
    'ipfs://existing',
    `ipfs://${CID}`,
    `ipfs://${CID_TWO}`,
  ]);
  assert.deepEqual(ics.meta.clientPinned, [
    {
      cid: CID,
      uri: `ipfs://${CID}`,
      gateways: [`${IPFS_GATEWAY}${CID}`],
      name: 'result.txt',
      size: 2048,
    },
    {
      cid: CID_TWO,
      uri: `ipfs://${CID_TWO}`,
      gateways: [`${IPFS_GATEWAY}${CID_TWO}`],
      name: 'result-2.txt',
      size: 1024,
    },
    {
      cid: PAYLOAD_CID,
      uri: `ipfs://${PAYLOAD_CID}`,
      gateways: [`${IPFS_GATEWAY}${PAYLOAD_CID}`],
    },
  ]);
});

test('prepareJobPayload merges multiple attachments for create_job intents', () => {
  const FIRST_ATTACHMENT = 'bafyreibulkcid3333333333333333333333333333333333333333333333';
  const SECOND_ATTACHMENT = 'bafyreibulkcid4444444444444444444444444444444444444444444444';
  const JOB_PAYLOAD = 'bafyreijobpayloadcid5555555555555555555555555555555555555555';

  const ics = {
    intent: 'create_job',
    params: {
      job: {
        title: 'Bulk labeling',
        description: 'Label dataset',
        attachments: ['ipfs://existing-spec'],
      },
    },
    meta: {},
  };

  const attachments = [
    {
      cid: FIRST_ATTACHMENT,
      uri: `ipfs://${FIRST_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${FIRST_ATTACHMENT}`],
      name: 'scope.pdf',
      size: 4096,
    },
    {
      cid: SECOND_ATTACHMENT,
      uri: `ipfs://${SECOND_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${SECOND_ATTACHMENT}`],
      name: 'examples.csv',
      size: 8192,
    },
  ];

  const prepared = prepareJobPayload(ics, attachments);

  assert.deepEqual(prepared.payload.attachments, [
    'ipfs://existing-spec',
    `ipfs://${FIRST_ATTACHMENT}`,
    `ipfs://${SECOND_ATTACHMENT}`,
  ]);

  prepared.assign({ cid: JOB_PAYLOAD, gateways: [`${IPFS_GATEWAY}${JOB_PAYLOAD}`] });

  assert.equal(ics.params.job.uri, `ipfs://${JOB_PAYLOAD}`);
  assert.deepEqual(ics.params.job.attachments, [
    'ipfs://existing-spec',
    `ipfs://${FIRST_ATTACHMENT}`,
    `ipfs://${SECOND_ATTACHMENT}`,
  ]);
  assert.deepEqual(ics.meta.clientPinned, [
    {
      cid: FIRST_ATTACHMENT,
      uri: `ipfs://${FIRST_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${FIRST_ATTACHMENT}`],
      name: 'scope.pdf',
      size: 4096,
    },
    {
      cid: SECOND_ATTACHMENT,
      uri: `ipfs://${SECOND_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${SECOND_ATTACHMENT}`],
      name: 'examples.csv',
      size: 8192,
    },
    {
      cid: JOB_PAYLOAD,
      uri: `ipfs://${JOB_PAYLOAD}`,
      gateways: [`${IPFS_GATEWAY}${JOB_PAYLOAD}`],
    },
  ]);
});

test('prepareJobPayload merges multiple attachments for dispute intents', () => {
  const FIRST_ATTACHMENT = 'bafyreibulkcid0000000000000000000000000000000000000000000000';
  const SECOND_ATTACHMENT = 'bafyreibulkcid1111111111111111111111111111111111111111111111';
  const DISPUTE_PAYLOAD = 'bafyreidispayloadcid2222222222222222222222222222222222222222';

  const ics = {
    intent: 'dispute',
    params: {
      attachments: ['ipfs://existing-evidence'],
      dispute: { reason: 'Quality issue' },
    },
    meta: {},
  };

  const attachments = [
    {
      cid: FIRST_ATTACHMENT,
      uri: `ipfs://${FIRST_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${FIRST_ATTACHMENT}`],
      name: 'before.png',
      size: 1024,
    },
    {
      cid: SECOND_ATTACHMENT,
      uri: `ipfs://${SECOND_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${SECOND_ATTACHMENT}`],
      name: 'after.png',
      size: 2048,
    },
  ];

  const prepared = prepareJobPayload(ics, attachments);

  assert.deepEqual(prepared.payload.attachments, [
    'ipfs://existing-evidence',
    `ipfs://${FIRST_ATTACHMENT}`,
    `ipfs://${SECOND_ATTACHMENT}`,
  ]);

  prepared.assign({ cid: DISPUTE_PAYLOAD, gateways: [`${IPFS_GATEWAY}${DISPUTE_PAYLOAD}`] });

  assert.equal(ics.params.evidenceUri, `ipfs://${DISPUTE_PAYLOAD}`);
  assert.equal(ics.params.dispute.evidenceUri, `ipfs://${DISPUTE_PAYLOAD}`);
  assert.deepEqual(ics.params.attachments, [
    'ipfs://existing-evidence',
    `ipfs://${FIRST_ATTACHMENT}`,
    `ipfs://${SECOND_ATTACHMENT}`,
  ]);
  assert.deepEqual(ics.meta.clientPinned, [
    {
      cid: FIRST_ATTACHMENT,
      uri: `ipfs://${FIRST_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${FIRST_ATTACHMENT}`],
      name: 'before.png',
      size: 1024,
    },
    {
      cid: SECOND_ATTACHMENT,
      uri: `ipfs://${SECOND_ATTACHMENT}`,
      gateways: [`${IPFS_GATEWAY}${SECOND_ATTACHMENT}`],
      name: 'after.png',
      size: 2048,
    },
    {
      cid: DISPUTE_PAYLOAD,
      uri: `ipfs://${DISPUTE_PAYLOAD}`,
      gateways: [`${IPFS_GATEWAY}${DISPUTE_PAYLOAD}`],
    },
  ]);
});
