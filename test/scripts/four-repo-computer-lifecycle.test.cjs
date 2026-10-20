'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  assertDisposableNetwork,
  observeMockGas,
  boundedUtf8,
} = require('../../integrations/alpha-agent/four-repo-computer-lifecycle.cjs');

test('only in-process network is admitted, before an external provider can be contacted', async () => {
  for (const network of [
    { name: 'mainnet', config: {} },
    { name: 'localhost', config: { url: 'http://127.0.0.1:8545' } },
    { name: 'hardhat', config: { url: 'https://example.invalid/rpc' } },
    {
      name: 'hardhat',
      config: { forking: { url: 'https://example.invalid/rpc' } },
    },
  ]) {
    const provider = {
      getNetwork() {
        throw Error('Provider must remain untouched');
      },
    };
    await assert.rejects(
      assertDisposableNetwork(network, provider),
      (error) => !error.message.includes('Provider must remain untouched')
    );
  }
});

test('an append after descriptor inspection cannot trigger an unbounded read or reach Hardhat', (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-bounded-draft-')
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'draft.json');
  fs.writeFileSync(filename, '{}');
  assert.equal(boundedUtf8(filename, 8), '{}');
  const originalStat = fs.fstatSync,
    originalRead = fs.readSync;
  let injected = false,
    requested = 0;
  try {
    fs.fstatSync = (...args) => {
      const before = originalStat(...args);
      if (!injected) {
        injected = true;
        fs.appendFileSync(filename, 'small controlled append');
      }
      return before;
    };
    fs.readSync = (fd, buffer, offset, length, position) => {
      requested += length;
      return originalRead(fd, buffer, offset, length, position);
    };
    assert.throws(() => boundedUtf8(filename, 8), /Input grew or changed/);
    assert(
      requested <= 9,
      'Read allocation/request must stop at maximum plus one byte'
    );
  } finally {
    fs.fstatSync = originalStat;
    fs.readSync = originalRead;
  }
  assert.equal(
    Object.keys(require.cache).some((name) =>
      /hardhat\/internal\/lib\/hardhat-lib/.test(name)
    ),
    false
  );
});

test('mock gas is measured from bound block receipts and cannot relabel missing or foreign receipt data', async () => {
  const hash = '0x' + '1'.repeat(64);
  const blockHash = '0x' + '2'.repeat(64);
  const block = { number: '0x1', hash: blockHash, transactions: [hash] };
  const receipt = {
    transactionHash: hash,
    blockHash,
    blockNumber: '0x1',
    transactionIndex: '0x0',
    status: '0x1',
    gasUsed: '0x5208',
    effectiveGasPrice: '0x7',
  };
  const provider = (selected = receipt) => ({
    async send(method, args) {
      if (method === 'eth_getBlockByNumber') {
        assert.deepEqual(args, ['0x1', false]);
        return block;
      }
      assert.equal(method, 'eth_getTransactionReceipt');
      assert.deepEqual(args, [hash]);
      return selected;
    },
  });
  const measured = await observeMockGas(provider(), 0, 1);
  assert.equal(
    measured.classification,
    'DISPOSABLE_MOCK_GAS_NOT_REAL_EXPENDITURE'
  );
  assert.equal(measured.publicNetworkEstimate, false);
  assert.equal(measured.realAssetExpenditure, false);
  assert.equal(measured.totalGasUsed, '21000');
  assert.equal(measured.totalMockFeeWei, '147000');
  assert.equal(measured.receipts[0].effectiveGasPriceWei, '7');
  for (const mutation of [
    { blockHash: '0x' + '3'.repeat(64) },
    { transactionHash: '0x' + '4'.repeat(64) },
    { blockNumber: '0x2' },
    { transactionIndex: '0x1' },
    { gasUsed: '0x0' },
    { gasUsed: '21000' },
    { effectiveGasPrice: undefined },
    { status: '0x2' },
  ])
    await assert.rejects(
      observeMockGas(provider({ ...receipt, ...mutation }), 0, 1)
    );
});

test('chain ID and actual node metadata reject a disguised or already forked runtime', async () => {
  const network = { name: 'hardhat', config: {} };
  await assert.rejects(
    assertDisposableNetwork(network, {
      async getNetwork() {
        return { chainId: 1n };
      },
      async send() {
        throw Error('Metadata must remain untouched');
      },
    })
  );
  await assert.rejects(
    assertDisposableNetwork(network, {
      async getNetwork() {
        return { chainId: 31337n };
      },
      async send() {
        return { forkedNetwork: { chainId: 1 } };
      },
    }),
    /fork/
  );
  let metadataCalls = 0;
  await assertDisposableNetwork(network, {
    async getNetwork() {
      return { chainId: 31337n };
    },
    async send(method) {
      assert.equal(method, 'hardhat_metadata');
      metadataCalls += 1;
      return {};
    },
  });
  assert.equal(metadataCalls, 1);
});
