'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = require('../../config/implementation-modules.json');
const { missionPlan } = require('../../demo/aurora/bin/mission-plan.cjs');
const address = /^0x[0-9a-fA-F]{40}$/;
const txHash = /^0x[0-9a-fA-F]{64}$/;
function checkCommissioning(
  receipts,
  { expectedJobs = 3, committees, deploymentFile } = {}
) {
  assert.ok(Number.isSafeInteger(expectedJobs) && expectedJobs > 0);
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(receipts, name), 'utf8'));
  const deployment = deploymentFile
    ? JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))
    : read('deploy.json');
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
    assert.ok(!/^0x0{40}$/.test(record.address));
    assert.ok(Array.isArray(record.args));
    assert.ok(record.source.endsWith(`:${name}`));
    const deployedAddress =
      deployment.contracts[name] || deployment.implementations[name];
    if (deployedAddress) assert.equal(record.address, deployedAddress);
  }
  const mission = read('mission.json');
  assert.equal(
    mission.jobs.length,
    expectedJobs,
    'Every configured mission job must finish'
  );
  const ids = new Set(),
    transactions = new Set();
  for (const job of mission.jobs) {
    assert.match(job.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (committees)
      assert.ok(
        committees[job.slug],
        'Receipt job must match the configured mission'
      );
    const committee = committees?.[job.slug];
    const expectedValidators = committee?.n || 3;
    const final = read(`jobs/${job.slug}/finalize.json`);
    const validation = read(`jobs/${job.slug}/validate.json`);
    assert.equal(final.status, 'Finalized');
    assert.equal(final.success, true);
    assert.equal(final.chainId, '31337');
    assert.equal(final.jobId, job.jobId);
    assert.match(final.jobId, /^[1-9][0-9]*$/);
    assert.ok(Number.isSafeInteger(final.blockNumber) && final.blockNumber > 0);
    assert.match(final.txHash, txHash);
    assert.notEqual(final.txHash, `0x${'0'.repeat(64)}`);
    assert.equal(validation.commits, expectedValidators);
    assert.equal(validation.reveals, expectedValidators);
    assert.equal(validation.validators.length, expectedValidators);
    if (committee) {
      assert.equal(validation.committeeSize, committee.n);
      assert.equal(validation.requiredApprovals, committee.k);
    }
    assert.equal(
      new Set(
        validation.validators.map((validator) =>
          validator.address.toLowerCase()
        )
      ).size,
      expectedValidators
    );
    assert.ok(
      validation.validators.every(
        (validator) =>
          address.test(validator.address) &&
          !/^0x0{40}$/.test(validator.address) &&
          txHash.test(validator.commitTx) &&
          !/^0x0{64}$/.test(validator.commitTx) &&
          txHash.test(validator.revealTx) &&
          !/^0x0{64}$/.test(validator.revealTx)
      )
    );
    assert.ok(
      Object.values(final.payouts).filter((payout) => Number(payout.delta) > 0)
        .length >=
        expectedValidators + 1,
      'Worker and every selected validator must receive payouts'
    );
    ids.add(final.jobId);
    transactions.add(final.txHash);
  }
  assert.equal(ids.size, expectedJobs);
  assert.equal(transactions.size, expectedJobs);
  return {
    chainId: 31337,
    settledJobs: expectedJobs,
    validatorsPerJob: committees
      ? mission.jobs.map((job) => committees[job.slug].n)
      : 3,
    fixedImplementations: expected.length,
    constructorRecords: 14,
    simulatedTokenAndWork: true,
    independentOperators: false,
  };
}
module.exports = { checkCommissioning };

if (require.main === module) {
  try {
    const [receipts, missionPath, deploymentFile, ...extra] =
      process.argv.slice(2);
    if (!receipts || !missionPath || extra.length)
      throw new Error(
        'Usage: node scripts/production/commissioning.cjs <receipts-directory> <mission-config.json> [deployment.json]'
      );
    const plan = missionPlan(missionPath);
    const committees = Object.fromEntries(
      plan.map((job) => [job.slug, { k: job.k, n: job.n }])
    );
    console.log(
      JSON.stringify(
        checkCommissioning(receipts, {
          expectedJobs: plan.length,
          committees,
          deploymentFile,
        }),
        null,
        2
      )
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
