const { loadTokenConfig } = require('../scripts/config');
const Deployer = artifacts.require('Deployer');

module.exports = async function (deployer, network) {
  const { config: tokenConfig, network: resolvedNetwork } = loadTokenConfig({
    network,
  });
  if (!tokenConfig || !tokenConfig.address) {
    throw new Error('AGIALPHA token address missing from configuration');
  }
  if (tokenConfig.decimals !== undefined && tokenConfig.decimals !== 18) {
    console.warn(
      `Warning: expected AGIALPHA decimals to be 18, got ${tokenConfig.decimals}`
    );
  }

  console.log(
    `Using AGIALPHA token ${tokenConfig.address} for ${resolvedNetwork} deployment`
  );

  await deployer.deploy(Deployer, { overwrite: false });
  const instance = await Deployer.deployed();
  console.log(`Deployer contract deployed at ${instance.address}`);
};
