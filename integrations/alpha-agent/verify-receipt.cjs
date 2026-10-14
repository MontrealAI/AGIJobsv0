'use strict';

// Read-only verification. Never signs, submits, approves, stakes or settles.
const { Interface, getAddress } = require('ethers');
const profile = require('./jobregistry-v2.json');
const abi = new Interface(profile.abi);
const hash = (value) =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.toLowerCase() === b.toLowerCase();
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function address(value) {
  const result = getAddress(value);
  requireValue(
    !/^0x0{40}$/.test(result),
    'Zero address is not a deployment identity'
  );
  return result;
}

/** A caller-supplied receipt is not evidence: fetch it and canonical headers from RPC.
 * trustedDeployment is an independently reviewed full-runtime pin, never the
 * historical inventory's masked template digest. Local fixtures must say local.
 */
async function verifyReceipt(provider, trustedDeployment, expected) {
  requireValue(trustedDeployment.backend === profile.backend, 'Wrong backend');
  const registry = address(trustedDeployment.registry);
  requireValue(
    hash(trustedDeployment.runtimeKeccak256),
    'Full runtime keccak256 pin required'
  );
  requireValue(
    Number.isSafeInteger(trustedDeployment.chainId) &&
      trustedDeployment.chainId > 0,
    'Invalid chain ID'
  );
  requireValue(
    Number.isSafeInteger(expected.minimumConfirmations) &&
      expected.minimumConfirmations >= 1,
    'Positive confirmation threshold required'
  );
  requireValue(hash(expected.transactionHash), 'Invalid transaction hash');
  requireValue(
    [
      'AgentAssigned',
      'ResultSubmitted',
      'JobCompleted',
      'JobFinalized',
    ].includes(expected.event),
    'Unsupported lifecycle event'
  );
  requireValue(
    typeof expected.jobId === 'string' && /^[1-9][0-9]*$/.test(expected.jobId),
    'Job ID must be a positive decimal string'
  );
  if (expected.event !== 'JobCompleted') address(expected.worker);
  if (expected.event === 'ResultSubmitted') {
    requireValue(hash(expected.resultHash), 'Expected result hash required');
    requireValue(
      typeof expected.resultURI === 'string',
      'Expected result URI required'
    );
  }
  if (expected.event === 'JobCompleted')
    requireValue(
      typeof expected.success === 'boolean',
      'Expected validation decision required'
    );
  const network = await provider.getNetwork();
  requireValue(
    network.chainId === BigInt(trustedDeployment.chainId),
    'Chain mismatch'
  );
  const receipt = await provider.getTransactionReceipt(
    expected.transactionHash
  );
  requireValue(
    receipt && receipt.status === 1,
    'Missing or failed transaction'
  );
  requireValue(
    same(receipt.hash, expected.transactionHash),
    'Receipt transaction mismatch'
  );
  requireValue(hash(receipt.blockHash), 'Invalid receipt block hash');
  const block = await provider.getBlock(receipt.blockNumber);
  requireValue(
    block && same(block.hash, receipt.blockHash),
    'Receipt is not canonical'
  );
  const head = await provider.getBlockNumber();
  requireValue(
    head - receipt.blockNumber + 1 >= expected.minimumConfirmations,
    'Insufficient confirmations'
  );
  const { keccak256 } = require('ethers');
  const code = await provider.getCode(registry, receipt.blockNumber);
  requireValue(
    code !== '0x' && same(keccak256(code), trustedDeployment.runtimeKeccak256),
    'Registry runtime mismatch'
  );
  const matches = [];
  for (const log of receipt.logs) {
    if (!same(log.address, registry)) continue;
    requireValue(!log.removed, 'Removed log');
    let decoded;
    try {
      decoded = abi.parseLog(log);
    } catch {
      continue;
    }
    if (
      !decoded ||
      decoded.name !== expected.event ||
      decoded.args.jobId !== BigInt(expected.jobId)
    )
      continue;
    if (expected.event === 'JobCompleted') {
      requireValue(
        decoded.args.success === expected.success,
        'Validation decision mismatch'
      );
    } else {
      const worker =
        expected.event === 'AgentAssigned'
          ? decoded.args.agent
          : decoded.args.worker;
      requireValue(same(worker, expected.worker), 'Worker mismatch');
    }
    if (expected.event === 'ResultSubmitted') {
      requireValue(
        same(decoded.args.resultHash, expected.resultHash),
        'Artifact hash mismatch'
      );
      requireValue(
        decoded.args.resultURI === expected.resultURI,
        'Artifact URI mismatch'
      );
    }
    matches.push(log.index);
  }
  requireValue(
    matches.length === 1,
    'Expected exactly one matching registry event'
  );
  // Recheck the block after all reads to catch a reorg during verification.
  const finalBlock = await provider.getBlock(receipt.blockNumber);
  requireValue(
    finalBlock && same(finalBlock.hash, receipt.blockHash),
    'Reorganization during verification'
  );
  return {
    backend: profile.backend,
    chainId: trustedDeployment.chainId,
    registry,
    transactionHash: receipt.hash,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    logIndex: matches[0],
    event: expected.event,
    jobId: expected.jobId,
    finalizationEventProven: expected.event === 'JobFinalized',
  };
}
module.exports = { verifyReceipt, profile, abi };
