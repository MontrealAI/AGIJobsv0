'use strict';
// Called only after requireExecutionMode has proved a fresh, unforked EDR chain.
// Preserve JSON-RPC receipts verbatim; never serialize a provider or signer.
async function collectLocalReceipts(provider, executionMode) {
  if (executionMode !== 'local-rehearsal') return null;
  if ((await provider.send('eth_chainId')) !== '0x7a69')
    throw Error('Receipt evidence requires chain 31337');
  const last = Number(BigInt(await provider.send('eth_blockNumber')));
  if (!Number.isSafeInteger(last) || last < 1 || last > 4096)
    throw Error('Receipt block bound exceeded');
  const receipts = [],
    blocks = [];
  const seen = new Set();
  for (let n = 1; n <= last; n++) {
    const block = await provider.send('eth_getBlockByNumber', [
      '0x' + n.toString(16),
      false,
    ]);
    if (!block || !Array.isArray(block.transactions))
      throw Error('Missing local block');
    if (receipts.length + block.transactions.length > 4096)
      throw Error('Receipt count bound exceeded');
    if (
      !/^0x[0-9a-f]+$/i.test(block.number) ||
      Number(BigInt(block.number)) !== n ||
      !/^0x[0-9a-f]{64}$/i.test(block.hash)
    )
      throw Error('Invalid local block identity');
    blocks.push({
      number: block.number,
      hash: block.hash,
      transactions: block.transactions,
    });
    for (const [index, hash] of block.transactions.entries()) {
      if (!/^0x[0-9a-f]{64}$/i.test(hash) || seen.has(hash))
        throw Error('Invalid/duplicate local transaction');
      seen.add(hash);
      if (receipts.length >= 4096) throw Error('Receipt count bound exceeded');
      const receipt = await provider.send('eth_getTransactionReceipt', [hash]);
      if (
        !receipt ||
        receipt.transactionHash !== hash ||
        receipt.blockHash !== block.hash ||
        !/^0x[0-9a-f]+$/i.test(receipt.transactionIndex) ||
        BigInt(receipt.transactionIndex) !== BigInt(index) ||
        Number(BigInt(receipt.blockNumber)) !== n ||
        receipt.status !== '0x1'
      )
        throw Error('Invalid local receipt');
      receipts.push(receipt);
    }
  }
  return {
    schemaVersion: 1,
    proofScope: 'fresh-local-hardhat-31337-only',
    chainId: 31337,
    lastBlock: last,
    blocks,
    receipts,
  };
}
module.exports = { collectLocalReceipts };
