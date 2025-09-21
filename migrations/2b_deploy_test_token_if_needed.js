const fs = require('fs');
const path = require('path');
const TestAGIALPHA = artifacts.require(
  'contracts/mocks/TestAGIALPHA.sol:TestAGIALPHA'
);
const { loadTokenConfig } = require('../scripts/config');

function parseIntegerEnv(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`${label} must be an integer value`);
  }
  return parsed;
}

module.exports = async function (deployer, network, accounts) {
  if (!process.env.DEPLOY_LOCAL_ERC20) {
    console.log('Skipping local ERC20 deployment; DEPLOY_LOCAL_ERC20 not set.');
    return;
  }

  const {
    config: tokenConfig,
    path: tokenConfigPath,
    network: resolvedNetwork,
  } = loadTokenConfig({
    network,
  });

  if (resolvedNetwork !== 'sepolia') {
    console.log(
      `DEPLOY_LOCAL_ERC20 ignored on ${resolvedNetwork}; only sepolia supported.`
    );
    return;
  }

  const defaultDecimals = tokenConfig.decimals ?? 18;
  const decimalsOverride = parseIntegerEnv(
    process.env.AGIALPHA_MOCK_DECIMALS,
    'AGIALPHA_MOCK_DECIMALS'
  );
  const decimals = decimalsOverride ?? defaultDecimals;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('AGIALPHA decimals must be between 0 and 255');
  }

  const supplyTokens = process.env.AGIALPHA_MOCK_SUPPLY?.trim() || '1000000';
  if (!/^[0-9]+$/.test(supplyTokens)) {
    throw new Error('AGIALPHA_MOCK_SUPPLY must be a positive integer');
  }
  const decimalsFactor = 10n ** BigInt(decimals);
  const initialSupply = (BigInt(supplyTokens) * decimalsFactor).toString();

  const recipient =
    process.env.AGIALPHA_MOCK_RECIPIENT ||
    process.env.GOVERNANCE_ADDRESS ||
    accounts[0];
  if (
    !recipient ||
    recipient === '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error(
      'Recipient for mock token deployment cannot be the zero address'
    );
  }

  const name = tokenConfig.name || 'AGI ALPHA';
  const symbol = tokenConfig.symbol || 'AGIALPHA';

  await deployer.deploy(
    TestAGIALPHA,
    name,
    symbol,
    decimals,
    recipient,
    initialSupply
  );
  const mockToken = await TestAGIALPHA.deployed();

  const updatedConfig = {
    ...tokenConfig,
    address: mockToken.address,
    decimals,
    name,
    symbol,
  };
  fs.writeFileSync(
    tokenConfigPath,
    `${JSON.stringify(updatedConfig, null, 2)}\n`
  );

  const relativePath = path.relative(process.cwd(), tokenConfigPath);
  console.log(
    `Deployed TestAGIALPHA to ${mockToken.address} and updated ${relativePath}`
  );
  console.log(
    `Minted ${supplyTokens} tokens (${initialSupply} base units) to ${recipient}`
  );
};
