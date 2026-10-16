'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  EdrProviderWrapper,
} = require('hardhat/internal/hardhat-network/provider/provider');
const {
  externalNetworkConfig,
  requireExecutionMode,
  requireDistinctActors,
} = require('../scripts/utils/executionPreflight.cjs');
const key = '0x' + '11'.repeat(32);
const external = {
  INSIGHT_MARK_NETWORK: 'reviewed',
  INSIGHT_MARK_RPC_URL: 'https://example.invalid',
  INSIGHT_MARK_CHAIN_ID: '1',
  INSIGHT_MARK_OWNER_KEY: key,
};
function local(overrides = {}) {
  const provider = Object.create(EdrProviderWrapper.prototype);
  provider.send = async (method) =>
    method === 'eth_chainId'
      ? '0x7a69'
      : {
          chainId: 31337,
          latestBlockNumber: 0,
          instanceId: '0x' + 'ab'.repeat(32),
          ...overrides,
        };
  return { name: 'hardhat', config: { chainId: 31337 }, provider };
}
test('external configuration is explicit and cannot override reserved Hardhat', () => {
  assert.deepEqual(externalNetworkConfig({}), {});
  assert.deepEqual(
    externalNetworkConfig({ INSIGHT_MARK_NETWORK: 'hardhat' }),
    {}
  );
  assert.equal(externalNetworkConfig(external).reviewed.chainId, 1);
  for (const patch of [
    { INSIGHT_MARK_NETWORK: undefined },
    { INSIGHT_MARK_NETWORK: 'hardhat' },
    { INSIGHT_MARK_NETWORK: '__proto__' },
    { INSIGHT_MARK_RPC_URL: '' },
    { INSIGHT_MARK_RPC_URL: 'file:///tmp/a' },
    { INSIGHT_MARK_CHAIN_ID: '0' },
    { INSIGHT_MARK_CHAIN_ID: '1.0' },
    { INSIGHT_MARK_CHAIN_ID: '9007199254740993' },
    { INSIGHT_MARK_OWNER_KEY: undefined },
    { INSIGHT_MARK_PARTICIPANT_KEYS: key },
    { INSIGHT_MARK_ORACLE_KEYS: '' },
  ])
    assert.throws(() => externalNetworkConfig({ ...external, ...patch }));
});
test('mode validation rejects before touching a provider', async () => {
  const network = {
    name: 'external',
    config: {},
    provider: {
      send() {
        throw Error('RPC touched');
      },
    },
  };
  for (const flag of [undefined, 'true', '', 'typo', '1'])
    await assert.rejects(
      requireExecutionMode(network, flag),
      /requires explicit|must be true/
    );
  assert.equal(await requireExecutionMode(network, 'false'), 'broadcast');
});
test('local rehearsal requires actual EDR identity and fresh unforked metadata', async () => {
  assert.equal(
    await requireExecutionMode(local(), undefined),
    'local-rehearsal'
  );
  assert.equal(await requireExecutionMode(local(), 'false'), 'local-rehearsal');
  for (const change of [
    { chainId: 1 },
    { latestBlockNumber: 1 },
    { forkedNetwork: {} },
    { instanceId: 'wrong' },
  ])
    await assert.rejects(
      requireExecutionMode(local(change), 'true'),
      /fresh unforked/
    );
  for (const config of [
    { chainId: 1 },
    { chainId: 31337, url: 'http://example.invalid' },
    { chainId: 31337, forking: { enabled: true } },
  ])
    await assert.rejects(
      requireExecutionMode({ ...local(), config }, 'true'),
      /in-process/
    );
  await assert.rejects(
    requireExecutionMode(
      { ...local(), provider: { send: async () => ({ chainId: 31337 }) } },
      'true'
    ),
    /Actual provider/
  );
});
test('five distinct actor identities required, case-insensitively', () => {
  const actors = Array.from({ length: 5 }, (_, i) => ({
    address: '0x' + String(i + 1).repeat(40),
  }));
  requireDistinctActors(actors);
  assert.throws(() => requireDistinctActors(actors.slice(1)), /five/);
  assert.throws(
    () => requireDistinctActors([...actors.slice(0, 4), actors[0]]),
    /distinct/
  );
});
test('entrypoint qualifies mode before scenario writes, signers and deployment', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../scripts/runDemo.ts'),
    'utf8'
  );
  const main = source.slice(source.indexOf('async function main()'));
  assert(
    main.indexOf('await requireExecutionMode') <
      main.indexOf('await ethers.getSigners')
  );
  assert(
    main.indexOf('await requireExecutionMode') <
      main.indexOf('await ensureReportsDir')
  );
  assert(
    main.indexOf('requireDistinctActors(') < main.indexOf('AccessToken.deploy(')
  );
  assert(main.includes('executionMode === "broadcast"'));
  assert(main.includes('expectedNetworkName !== hardhatNetwork.name'));
});
