'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = require('../../config/implementation-modules.json');
const address = /^0x[0-9a-fA-F]{40}$/;
const txHash = /^0x[0-9a-fA-F]{64}$/;
function checkCommissioning(receipts) {
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(receipts, name), 'utf8'));
  const deployment = read('deploy.json');
  assert.equal(deployment.network, 'localhost');
  const expected = Object.values(modules).flat().sort();
  assert.deepEqual(
    Object.keys(deployment.implementations || {}).sort(),
    expected
  );
  const addresses = Object.values(deployment.implementations);
  assert.equal(
    new Set(addresses.map((value) => value.toLowerCase())).size,
    expected.length
  );
  assert.ok(
    addresses.every((value) => address.test(value) && !/^0x0{40}$/.test(value))
  );
  assert.equal(Object.keys(deployment.creationRecords || {}).length, 14);
  for (const [name, record] of Object.entries(deployment.creationRecords)) {
    assert.ok(address.test(record.address));
    assert.ok(Array.isArray(record.args));
    assert.ok(record.source.endsWith(`:${name}`));
    if (deployment.contracts[name])
      assert.equal(record.address, deployment.contracts[name]);
  }
  const mission = read('mission.json');
  assert.equal(
    mission.jobs.length,
    3,
    'All three commissioned jobs must finish'
  );
  const ids = new Set(),
    transactions = new Set();
  for (const job of mission.jobs) {
    assert.match(job.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const final = read(`jobs/${job.slug}/finalize.json`);
    const validation = read(`jobs/${job.slug}/validate.json`);
    assert.equal(final.status, 'Finalized');
    assert.equal(final.success, true);
    assert.equal(final.chainId, '31337');
    assert.equal(final.jobId, job.jobId);
    assert.ok(Number.isSafeInteger(final.blockNumber) && final.blockNumber > 0);
    assert.match(final.txHash, txHash);
    assert.equal(validation.commits, 3);
    assert.equal(validation.reveals, 3);
    assert.equal(
      new Set(
        validation.validators.map((validator) =>
          validator.address.toLowerCase()
        )
      ).size,
      3
    );
    assert.ok(
      validation.validators.every(
        (validator) =>
          address.test(validator.address) &&
          txHash.test(validator.commitTx) &&
          txHash.test(validator.revealTx)
      )
    );
    assert.ok(
      Object.values(final.payouts).filter((payout) => Number(payout.delta) > 0)
        .length >= 4,
      'Worker and three validators must receive payouts'
    );
    ids.add(final.jobId);
    transactions.add(final.txHash);
  }
  assert.equal(ids.size, 3);
  assert.equal(transactions.size, 3);
  return {
    chainId: 31337,
    settledJobs: 3,
    validatorsPerJob: 3,
    fixedImplementations: expected.length,
    constructorRecords: 14,
    simulatedTokenAndWork: true,
    independentOperators: false,
  };
}
module.exports = { checkCommissioning };
