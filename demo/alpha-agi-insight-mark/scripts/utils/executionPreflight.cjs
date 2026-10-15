'use strict';
const {
  EdrProviderWrapper,
} = require('hardhat/internal/hardhat-network/provider/provider');

function externalNetworkConfig(env) {
  const keys = [
    'RPC_URL',
    'NETWORK',
    'CHAIN_ID',
    'OWNER_KEY',
    'PARTICIPANT_KEYS',
    'ORACLE_KEYS',
  ];
  const supplied = keys.some((key) => env['INSIGHT_MARK_' + key] !== undefined);
  if (
    !supplied ||
    (env.INSIGHT_MARK_NETWORK === 'hardhat' &&
      keys
        .filter((key) => key !== 'NETWORK')
        .every((key) => env['INSIGHT_MARK_' + key] === undefined))
  )
    return {};
  const name = env.INSIGHT_MARK_NETWORK?.trim();
  if (
    !name ||
    name === 'hardhat' ||
    name === '__proto__' ||
    !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)
  )
    throw Error(
      'External Insight MARK requires an explicit non-reserved INSIGHT_MARK_NETWORK'
    );
  const rpc = env.INSIGHT_MARK_RPC_URL?.trim();
  let url;
  try {
    url = new URL(rpc);
  } catch {
    throw Error('Insight MARK RPC URL must be HTTP or HTTPS');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw Error('Insight MARK RPC URL must be HTTP or HTTPS');
  const rawChain = env.INSIGHT_MARK_CHAIN_ID;
  const chainId = Number(rawChain);
  if (!/^[1-9][0-9]*$/.test(rawChain || '') || !Number.isSafeInteger(chainId))
    throw Error('Insight MARK requires a positive safe integer chain ID');
  const owner = env.INSIGHT_MARK_OWNER_KEY;
  const parse = (raw) =>
    raw === undefined ? [] : raw.split(',').map((x) => x.trim());
  const accounts = [
    owner,
    ...parse(env.INSIGHT_MARK_PARTICIPANT_KEYS),
    ...parse(env.INSIGHT_MARK_ORACLE_KEYS),
  ];
  if (
    accounts.some(
      (key) => typeof key !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(key)
    )
  )
    throw Error('Insight MARK requires valid 32-byte account keys');
  if (new Set(accounts.map((x) => x.toLowerCase())).size !== accounts.length)
    throw Error('Insight MARK account keys must be distinct');
  return { [name]: { url: rpc, chainId, accounts } };
}

async function requireExecutionMode(network, rawFlag) {
  const flag = rawFlag === undefined ? 'true' : rawFlag.trim().toLowerCase();
  if (!['true', 'false'].includes(flag))
    throw Error('AGIJOBS_DEMO_DRY_RUN must be true or false');
  if (network.name !== 'hardhat') {
    if (flag !== 'false')
      throw Error(
        'External Insight MARK execution requires explicit AGIJOBS_DEMO_DRY_RUN=false and operator confirmation'
      );
    return 'broadcast';
  }
  if (
    network.config.chainId !== 31337 ||
    network.config.url ||
    network.config.forking?.enabled
  )
    throw Error(
      'Local rehearsal requires non-forked in-process Hardhat chain31337'
    );
  await network.provider.send('eth_chainId');
  let provider = network.provider,
    local = false;
  for (let n = 0; provider && n < 12; n++) {
    if (provider instanceof EdrProviderWrapper) {
      local = true;
      break;
    }
    provider = provider._wrapped || provider._provider || provider.provider;
  }
  if (!local)
    throw Error('Actual provider must be an in-process Hardhat EDR instance');
  const metadata = await network.provider.send('hardhat_metadata');
  if (
    metadata.chainId !== 31337 ||
    metadata.forkedNetwork ||
    metadata.latestBlockNumber !== 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(metadata.instanceId || '')
  )
    throw Error('A fresh unforked disposable Hardhat instance is required');
  return 'local-rehearsal';
}

function requireDistinctActors(actors) {
  if (
    actors.length !== 5 ||
    actors.some((a) => !a || !/^0x[0-9a-fA-F]{40}$/.test(a.address))
  )
    throw Error('Insight MARK requires five configured actors');
  if (new Set(actors.map((a) => a.address.toLowerCase())).size !== 5)
    throw Error('Insight MARK actor identities must be distinct');
}
module.exports = {
  externalNetworkConfig,
  requireExecutionMode,
  requireDistinctActors,
};
