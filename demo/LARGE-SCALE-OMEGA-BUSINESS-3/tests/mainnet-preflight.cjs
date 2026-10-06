'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mainnet = require('../lib/mainnet.cjs');

test('mainnet governance must be backed by the configured deployment key', () => {
  // Public, unfunded test scalar; never use it for a real account.
  const governance = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  assert.equal(
    mainnet.assertGovernanceSigner(governance, { MAINNET_PRIVATE_KEY: '1' }),
    governance
  );
  assert.equal(
    mainnet.assertGovernanceSigner(governance.toLowerCase(), {
      MAINNET_PRIVATE_KEY: '0x' + '1'.padStart(64, '0'),
    }),
    governance
  );
  for (const key of ['', '0', 'invalid', 'f'.repeat(65)])
    assert.throws(
      () =>
        mainnet.assertGovernanceSigner(governance, {
          MAINNET_PRIVATE_KEY: key,
        }),
      /signer/
    );
  assert.throws(
    () =>
      mainnet.assertGovernanceSigner('0x' + '2'.repeat(40), {
        MAINNET_PRIVATE_KEY: '1',
      }),
    /Governance must match/
  );
});
