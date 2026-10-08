'use strict';
const { parse } = require('dotenv');
const NETWORK_CHAINS = Object.freeze({
  hardhat: '31337',
  localhost: '31337',
  anvil: '31337',
  mainnet: '1',
  sepolia: '11155111',
  optimismSepolia: '11155420',
});
const LOCAL = new Set(['hardhat', 'localhost', 'anvil']);
function chainId(value) {
  if (!/^[1-9][0-9]*$/.test(String(value)))
    throw new Error('Deployment chainId must be a positive decimal integer');
  return BigInt(value).toString();
}
function deploymentNetwork(manifest = {}, requested) {
  const network = manifest.network ?? requested;
  if (!network || !Object.hasOwn(NETWORK_CHAINS, network))
    throw new Error(
      'A supported deployment network is required in the addressbook or --network'
    );
  if (requested !== undefined && requested !== network)
    throw new Error(
      'Requested network conflicts with the deployment addressbook'
    );
  const id =
    manifest.chainId === undefined
      ? NETWORK_CHAINS[network]
      : chainId(manifest.chainId);
  if (id !== NETWORK_CHAINS[network])
    throw new Error('Deployment network and chainId do not match');
  return { network, chainId: id, local: LOCAL.has(network) };
}
function runtimeEnvironment(text, identity) {
  const env = parse(text);
  // All three routing labels derive from the reviewed deployment, never from
  // an old local template. Server and browser endpoint values stay separate.
  env.CHAIN_ID = identity.chainId;
  env.NEXT_PUBLIC_CHAIN_ID = identity.chainId;
  env.AGJ_NETWORK = identity.network;
  if (identity.local) {
    env.RPC_URL ||= 'http://anvil:8545';
    env.NEXT_PUBLIC_RPC_URL ||= 'http://localhost:8545';
  }
  for (const key of ['RPC_URL', 'NEXT_PUBLIC_RPC_URL']) {
    const value = env[key];
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(
        `${key} must be explicitly configured for ${identity.network}`
      );
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      /[\r\n\0$]/.test(value)
    )
      throw new Error(
        `${key} must be a literal HTTP(S) URL without embedded credentials`
      );
    if (
      !identity.local &&
      (url.protocol !== 'https:' ||
        ['anvil', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw new Error(
        `${key} must be an explicit HTTPS endpoint for ${identity.network}; local template URLs cannot be reused`
      );
  }
  return env;
}
async function rpcRequest(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error('RPC HTTP failure');
  const body = await response.json();
  if (
    body?.error ||
    body?.jsonrpc !== '2.0' ||
    body?.id !== 1 ||
    typeof body?.result !== 'string'
  )
    throw new Error('Invalid JSON-RPC response');
  return body.result;
}
async function verifyRuntimeNetwork(
  env,
  identity,
  { request = rpcRequest, registry } = {}
) {
  // The local stack uses anvil's Docker DNS name, unavailable on the host.
  // Its fixed chain configuration and separate browser URL remain unchanged.
  if (identity.local) return;
  for (const key of ['RPC_URL', 'NEXT_PUBLIC_RPC_URL']) {
    try {
      const observed = await request(env[key], 'eth_chainId', []);
      if (
        !/^0x[0-9a-fA-F]+$/.test(observed) ||
        BigInt(observed).toString() !== identity.chainId
      )
        throw new Error('chain mismatch');
      if (registry) {
        const code = await request(env[key], 'eth_getCode', [
          registry,
          'latest',
        ]);
        if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code))
          throw new Error('registry bytecode unavailable');
      }
    } catch {
      // Endpoints can contain private API tokens. Do not echo URLs or provider
      // responses in errors or copy a server URL into a NEXT_PUBLIC variable.
      throw new Error(
        `${key} failed deployment verification (expected chain ${
          identity.chainId
        }${
          registry ? ' and deployed JobRegistry' : ''
        }); update the endpoint before launch`
      );
    }
  }
}
function composeNetworkEnvironment(env, inherited = process.env) {
  const routingKey = (key) =>
    [
      'RPC_URL',
      'CHAIN_ID',
      'AGJ_NETWORK',
      'JOB_REGISTRY',
      'AGIALPHA_TOKEN',
      'AGIALPHA_DECIMALS',
    ].includes(key) ||
    key.startsWith('NEXT_PUBLIC_') ||
    key.endsWith('_ADDRESS');
  const overrides = Object.fromEntries(
    Object.keys(inherited)
      .filter(routingKey)
      .map((key) => [key, undefined])
  );
  return Object.assign(
    overrides,
    Object.fromEntries(Object.entries(env).filter(([key]) => routingKey(key)))
  );
}
module.exports = {
  deploymentNetwork,
  runtimeEnvironment,
  verifyRuntimeNetwork,
  composeNetworkEnvironment,
};
