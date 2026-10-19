'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertDisposableNetwork,
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
