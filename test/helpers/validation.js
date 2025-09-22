const { ethers } = require('hardhat');

/**
 * Finalize validator selection for a given job by coordinating entropy
 * contributions and advancing the block height beyond the target selection
 * block. The helper mirrors the production flow used by the ValidationModule
 * contract so tests can deterministically reach the commit phase without
 * duplicating boilerplate logic.
 *
 * @param {import('ethers').Contract} validation ValidationModule instance
 * @param {number} jobId Job identifier being selected
 * @param {object} [options]
 * @param {import('ethers').Signer[]} options.contributors Signers that should
 *   contribute entropy before finalization. The first signer is reused for the
 *   final selection call.
 * @param {number|bigint} [options.entropy=0] Base entropy value; each
 *   subsequent contributor increments this value by one to avoid duplicates.
 * @param {import('ethers').AbstractProvider} [options.provider=ethers.provider]
 *   Provider used for block queries and mining.
 * @returns {Promise<import('ethers').ContractTransactionResponse>} Finalization
 *   transaction response so callers can await confirmations if needed.
 */
async function finalizeValidatorSelection(
  validation,
  jobId,
  { contributors = [], entropy = 0, provider = ethers.provider } = {}
) {
  if (!validation) {
    throw new Error('validation contract instance is required');
  }
  if (!Array.isArray(contributors) || contributors.length === 0) {
    throw new Error('finalizeValidatorSelection requires contributors');
  }

  const baseEntropy = BigInt(entropy);
  const entropies = contributors.map((_, index) => baseEntropy + BigInt(index));

  const leader = contributors[0];
  // Initial contribution seeds the selection round and schedules the target
  // block that anchors final randomness.
  await validation.connect(leader).selectValidators(jobId, entropies[0]);

  // Additional contributors mix their entropy while the target block is still
  // pending. Each call is awaited so any revert bubbles up to the test.
  for (let i = 1; i < contributors.length; i += 1) {
    await validation
      .connect(contributors[i])
      .selectValidators(jobId, entropies[i]);
  }

  // Mine blocks until the chain has advanced past the stored selection target.
  let target = await validation.selectionBlock(jobId);
  let current = await provider.getBlockNumber();
  while (BigInt(current) <= BigInt(target)) {
    await provider.send('evm_mine', []);
    current = await provider.getBlockNumber();
  }

  // Final call completes validator selection and sets the commit deadline.
  return validation.connect(leader).selectValidators(jobId, entropies[0]);
}

module.exports = {
  finalizeValidatorSelection,
};
