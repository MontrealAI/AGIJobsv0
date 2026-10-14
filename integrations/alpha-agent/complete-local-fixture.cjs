'use strict';
const fs = require('node:fs');
const { readArtifactCommitment } = require('./artifact-commitment.cjs');
const assert = require('node:assert/strict');
const { ethers, network } = require('hardhat');
const { verifyReceipt } = require('./verify-receipt.cjs');
async function main() {
  const rpc = new URL(network.config.url);
  if (
    network.name !== 'localhost' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(rpc.hostname) ||
    (await ethers.provider.getNetwork()).chainId !== 31337n
  )
    throw new Error('Disposable loopback chain 31337 only');
  const fixture = JSON.parse(
    fs.readFileSync(
      process.env.ALPHA_FIXTURE_OUTPUT || '/tmp/agijobsv0-alpha-fixture.json'
    )
  );
  const result = JSON.parse(
    fs.readFileSync(
      process.env.ALPHA_RESULT || '/tmp/agijobsv0-alpha-result.json'
    )
  );
  const artifact = readArtifactCommitment(
    process.env.ALPHA_ARTIFACT || '/tmp/agijobsv0-alpha-artifact.json'
  );
  assert.equal(result.resultHash, artifact.resultHash);
  const [owner, employer, agent, treasury] = await ethers.getSigners();
  assert.equal(agent.address, fixture.worker);
  assert.equal(employer.address, fixture.employer);
  const registry = await ethers.getContractAt(
    'contracts/v2/JobRegistry.sol:JobRegistry',
    fixture.addresses.registry
  );
  const validation = await ethers.getContractAt(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub',
    fixture.addresses.validationModule
  );
  const token = await ethers.getContractAt(
    'contracts/test/MockERC20.sol:MockERC20',
    fixture.addresses.token
  );
  const deployment = {
    backend: fixture.backend,
    chainId: 31337,
    registry: fixture.addresses.registry,
    runtimeKeccak256: fixture.codePins.registry,
  };
  const base = {
    jobId: fixture.jobId,
    worker: fixture.worker,
    minimumConfirmations: 1,
  };
  const assignment = await verifyReceipt(ethers.provider, deployment, {
    ...base,
    event: 'AgentAssigned',
    transactionHash: fixture.assignmentTransactionHash,
  });
  assert.equal((await registry.jobs(fixture.jobId)).specHash, fixture.specHash);
  await (await validation.connect(owner).setResult(true)).wait();
  await (
    await validation
      .connect(owner)
      .setValidators([owner.address, treasury.address])
  ).wait();
  const submissionTx = await registry
    .connect(agent)
    .submit(fixture.jobId, result.resultHash, result.resultURI, 'agent', []);
  await submissionTx.wait();
  const expected = {
    ...base,
    event: 'ResultSubmitted',
    transactionHash: submissionTx.hash,
    resultHash: result.resultHash,
    resultURI: result.resultURI,
  };
  const submission = await verifyReceipt(ethers.provider, deployment, expected);
  await assert.rejects(
    verifyReceipt(ethers.provider, deployment, {
      ...expected,
      resultHash: '0x' + 'f'.repeat(64),
    }),
    /Artifact hash mismatch/
  );
  const validationTx = await validation.finalize(fixture.jobId);
  await validationTx.wait();
  const approval = await verifyReceipt(ethers.provider, deployment, {
    ...base,
    event: 'JobCompleted',
    transactionHash: validationTx.hash,
    success: true,
  });
  const balanceBefore = await token.balanceOf(agent.address);
  const finalizeTx = await registry.connect(employer).finalize(fixture.jobId);
  await finalizeTx.wait();
  const finalization = await verifyReceipt(ethers.provider, deployment, {
    ...base,
    event: 'JobFinalized',
    transactionHash: finalizeTx.hash,
  });
  const balanceAfter = await token.balanceOf(agent.address);
  assert.equal(balanceAfter - balanceBefore, 100n);
  const finalJob = await registry.jobs(fixture.jobId);
  assert.equal(finalJob.resultHash, result.resultHash);
  assert.equal(finalJob.packedMetadata & 7n, 6n);
  const evidence = {
    schema: 'agijobsv0/alpha-local-acceptance/1',
    scope: 'disposable-local-fixture',
    productionApproved: false,
    sourceCommit: '9ea22d49414751a49f7f8cd9d9e65c26e8317570',
    specHash: fixture.specHash,
    artifactBytes: artifact.bytes.length,
    resultHash: result.resultHash,
    resultURI: result.resultURI,
    assignment,
    submission,
    approval,
    finalization,
    observedMockTokenPayoutBaseUnits: String(balanceAfter - balanceBefore),
    negativeChecks: ['Wrong exact artifact digest rejected'],
    limitations: fixture.limitations.concat([
      'Local fixture operator review is not independent marketplace review',
      'Artifact URI is a fixture label, not a published IPFS artifact',
      'No production transaction or deployment',
    ]),
  };
  fs.writeFileSync(
    process.env.ALPHA_ACCEPTANCE_OUTPUT ||
      '/tmp/agijobsv0-alpha-acceptance.json',
    JSON.stringify(evidence, null, 2) + '\n'
  );
  console.log(JSON.stringify(evidence, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
