'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { review } = require('../../demo/One-Box/computer-work/review.cjs');
const root = path.join(
  __dirname,
  '../../integrations/alpha-agent/supplier-browser-proof'
);
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name)));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, canonical(value[k])])
      )
    : value;
const identity = read('fixture-identity.json');
const verify = (artifact) => {
  assert.equal(artifact.public_key, identity.publicKey);
  assert.equal(hash(JSON.stringify(canonical(artifact.body))), artifact.sha256);
  const key = crypto.createPublicKey({
    key: Buffer.from('302a300506032b6570032100' + identity.publicKey, 'hex'),
    format: 'der',
    type: 'spki',
  });
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(artifact.sha256, 'hex'),
      key,
      Buffer.from(artifact.signature, 'base64')
    ),
    true
  );
};
test('retained signed fixture binds exact artifact bytes, spec and local receipt result', () => {
  const raw = fs.readFileSync(path.join(root, 'artifact.json'));
  const artifact = JSON.parse(raw);
  verify(artifact);
  const acceptance = read('acceptance.json'),
    browser = read('browser-evidence.json');
  assert.equal('0x' + hash(raw), acceptance.resultHash);
  assert.equal(raw.length, acceptance.artifactBytes);
  assert.equal(acceptance.resultHash, browser.resultHash);
  assert.equal(
    '0x' + hash(Buffer.from(artifact.body.spec_base64, 'base64')),
    acceptance.specHash
  );
  assert.equal(review(artifact.body.result.delivery).accepted, true);
  assert.equal(review(artifact.body.result.delivery).checks.length, 11);
  assert.equal(artifact.body.productionApproved, false);
  assert.equal(artifact.body.settlementApproved, false);
});
test('wrong identity, signature and signed binding mutations fail', () => {
  const artifact = read('artifact.json');
  for (const mutate of [
    (a) => {
      a.public_key = '00'.repeat(32);
    },
    (a) => {
      a.signature = Buffer.alloc(64).toString('base64');
    },
    (a) => {
      a.body.binding.job_id = '999';
    },
  ]) {
    const changed = structuredClone(artifact);
    mutate(changed);
    assert.throws(() => verify(changed));
  }
});
test('independent arithmetic rejects a rehashed wrong winner', () => {
  const delivery = structuredClone(read('artifact.json').body.result.delivery);
  const file = delivery.artifacts.find((x) => x.name === 'comparison.json');
  const comparison = JSON.parse(file.content);
  comparison.recommendedSupplier = 'Boreal';
  file.content = JSON.stringify(comparison);
  file.sha256 = hash(file.content);
  assert.equal(review(delivery).accepted, false);
});
test('actual browser negative has no exported artifact or chain submission', () => {
  const negative = read('negative-acceptance.json');
  assert.equal(negative.observedStatus, 'Applied');
  assert.equal(negative.resultHash, '0x' + '0'.repeat(64));
  for (const key of [
    'artifactExported',
    'submissionPerformed',
    'finalizationPerformed',
    'productionApproved',
  ])
    assert.equal(negative[key], false);
  for (const name of [
    'browser-evidence.json',
    'negative-browser-evidence.json',
  ]) {
    const evidence = read(name);
    assert.equal(evidence.externalFetches, 0);
    if (name === 'browser-evidence.json') {
      assert.equal(evidence.liveProvider, false);
      assert.equal(evidence.dockerQualified, false);
    }
    assert.ok(evidence.observations.length > 1);
    assert.ok(
      evidence.cleanup.every(
        (x) =>
          x.groupClosed && x.leaderExited && x.liveGroupMembers.length === 0
      )
    );
  }
});
