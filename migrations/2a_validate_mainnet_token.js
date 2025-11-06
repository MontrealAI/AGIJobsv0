const { ethers } = require('ethers');
const { loadTokenConfig } = require('../scripts/config');

const CANONICAL_MAINNET_TOKEN = '0xa61a3b3a130a9c20768eebf97e21515a6046a1fa';

const ERC20_METADATA_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
];

function normaliseNetworkKey(rawNetwork, resolvedNetwork) {
  if (resolvedNetwork && resolvedNetwork.trim()) {
    return resolvedNetwork.trim().toLowerCase();
  }
  if (rawNetwork && typeof rawNetwork === 'string') {
    return rawNetwork.trim().toLowerCase();
  }
  return '';
}

function assertCanonicalAddress(address) {
  if (!address) {
    throw new Error('AGIALPHA token address missing from configuration');
  }
  const checksum = ethers.getAddress(address);
  const canonical = ethers.getAddress(CANONICAL_MAINNET_TOKEN);
  if (checksum !== canonical) {
    throw new Error(
      `AGIALPHA token mismatch: configuration points to ${checksum}, expected ${canonical}`
    );
  }
  return checksum;
}

async function verifyMetadata(web3, address, expected) {
  const contract = new web3.eth.Contract(ERC20_METADATA_ABI, address);
  const [decimals, symbol, name] = await Promise.all([
    contract.methods.decimals().call(),
    contract.methods.symbol().call(),
    contract.methods.name().call(),
  ]);

  const resolvedDecimals = Number(decimals);
  if (!Number.isFinite(resolvedDecimals)) {
    throw new Error('Unable to read decimals from AGIALPHA token');
  }
  if (resolvedDecimals !== 18) {
    throw new Error(
      `AGIALPHA token must expose 18 decimals, got ${resolvedDecimals}`
    );
  }

  if (expected.symbol && symbol !== expected.symbol) {
    console.warn(
      `Warning: AGIALPHA symbol on-chain (${symbol}) does not match configuration (${expected.symbol}).`
    );
  }

  if (expected.name && name !== expected.name) {
    console.warn(
      `Warning: AGIALPHA name on-chain (${name}) does not match configuration (${expected.name}).`
    );
  }

  return { decimals: resolvedDecimals, symbol, name };
}

module.exports = async function (_deployer, network) {
  const { config: tokenConfig, network: resolvedNetwork } = loadTokenConfig({
    network,
  });
  const networkKey = normaliseNetworkKey(network, resolvedNetwork);

  if (networkKey !== 'mainnet') {
    const printableNetwork = networkKey || 'unknown network';
    console.log(
      `Skipping AGIALPHA mainnet validation for ${printableNetwork}.`
    );
    return;
  }

  const address = assertCanonicalAddress(tokenConfig.address);

  const web3Instance =
    global.web3 || (typeof web3 !== 'undefined' ? web3 : null);
  if (!web3Instance) {
    throw new Error(
      'web3 provider unavailable; unable to validate AGIALPHA token metadata'
    );
  }

  const metadata = await verifyMetadata(web3Instance, address, tokenConfig);
  const { decimals, symbol, name } = metadata;
  console.log('Validated AGIALPHA mainnet token', {
    address,
    decimals,
    symbol,
    name,
  });
};

module.exports.tags = ['agialpha', 'agialpha-mainnet'];
