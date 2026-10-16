'use strict';
// Read-only attachment. RPC observations never authorize a payment or admission.
const { Interface, Contract, getAddress } = require('ethers');
const { verifyReceipt, profile } = require('./verify-receipt.cjs');
const tokenAbi = new Interface(['function token() view returns (address)', 'function decimals() view returns (uint8)']);
function fail(ok, code) { if (!ok) throw Object.assign(Error(code), { code }); }
function same(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }
async function verifyProjectReceipt(raw, { provider, trustedDeployment, expected, ...options }) {
  const { inspectProjectTransfer } = await import('./project-transfer.mjs');
  const { canonical } = await import('./vendor/alpha/docs/assets/successor/engine.mjs');
  const { exactDigest } = await import('./vendor/alpha/examples/successor-project/engine.mjs');
  const checked = await inspectProjectTransfer(raw, options);
  fail(['disposable-local-fixture','reviewed-deployment'].includes(trustedDeployment.scope), 'JOBS_PROJECT_DEPLOYMENT_SCOPE');
  const token = getAddress(trustedDeployment.token);
  fail(!/^0x0{40}$/.test(token), 'JOBS_PROJECT_TOKEN');
  if (trustedDeployment.scope === 'reviewed-deployment') fail(same(token, profile.token.address), 'JOBS_PROJECT_TOKEN');
  const expectedSpecHash = '0x' + checked.transfer.work.specSha256;
  let expectedResultHash = null;
  if (expected.event !== 'AgentAssigned') {
    fail(checked.transfer.history.length > 1, 'JOBS_PROJECT_RESULT_REQUIRED');
    expectedResultHash = '0x' + checked.transfer.history.at(-1).sha256;
    if (expected.event === 'ResultSubmitted') fail(same(expected.resultHash, expectedResultHash), 'JOBS_PROJECT_RESULT_BINDING');
  }
  const observed = await verifyReceipt(provider, trustedDeployment, expected);
  const registry = new Contract(trustedDeployment.registry, profile.abi, provider);
  const job = await registry.jobs(expected.jobId, { blockTag: observed.blockNumber });
  fail(same(job.specHash, expectedSpecHash), 'JOBS_PROJECT_SPEC_BINDING');
  fail(job.reward.toString() === checked.transfer.planning.amountBaseUnits, 'JOBS_PROJECT_REWARD_BINDING');
  fail(same(job.agent, expected.worker), 'JOBS_PROJECT_WORKER_BINDING');
  if (expectedResultHash) fail(same(job.resultHash, expectedResultHash), 'JOBS_PROJECT_RESULT_BINDING');
  const stake = await registry.stakeManager({ blockTag: observed.blockNumber });
  const encoded = await provider.call({ to: stake, data: tokenAbi.encodeFunctionData('token'), blockTag: observed.blockNumber });
  fail(same(tokenAbi.decodeFunctionResult('token', encoded)[0], token), 'JOBS_PROJECT_TOKEN_BINDING');
  const decimalBytes = await provider.call({ to: token, data: tokenAbi.encodeFunctionData('decimals'), blockTag: observed.blockNumber });
  fail(tokenAbi.decodeFunctionResult('decimals', decimalBytes)[0] === 18n, 'JOBS_PROJECT_TOKEN_DECIMALS');
  const block = await provider.getBlock(observed.blockNumber);
  fail(block && same(block.hash, observed.blockHash), 'JOBS_PROJECT_RECEIPT_REORGANIZED');
  const normalizedExpected = { transactionHash: expected.transactionHash, event: expected.event, jobId: expected.jobId, worker: getAddress(expected.worker), minimumConfirmations: expected.minimumConfirmations };
  if (expected.event === 'ResultSubmitted') Object.assign(normalizedExpected, { resultHash: expected.resultHash, resultURI: expected.resultURI });
  if (expected.event === 'JobCompleted') normalizedExpected.success = expected.success;
  const deployment = Object.fromEntries(['backend','chainId','registry','runtimeKeccak256','scope','token'].map(key => [key, trustedDeployment[key]]));
  const body = { schema: 'agijobsv0/project-receipt/v1', original: { raw, sha256: await exactDigest(raw) }, project: checked.transfer.project, route: checked.transfer.route,
    binding: { specHash: expectedSpecHash, rewardBaseUnits: job.reward.toString(), decimals: 18, resultHash: expectedResultHash, token, worker: getAddress(expected.worker) },
    scope: trustedDeployment.scope, receipt: observed, expected: normalizedExpected, deployment,
    trust: 'rpc-observation-reverify-before-use', authority: 'none', qualification: 'source-only', settlement: 'not-connected', payoutReconciled: false, productionApproved: false };
  return canonical({ ...body, sha256: await exactDigest(canonical(body)) });
}
module.exports = Object.freeze({ verifyProjectReceipt });
