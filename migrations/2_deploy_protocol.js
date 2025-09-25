const { ethers } = require('ethers');
const { loadTokenConfig, loadDeploymentPlan } = require('../scripts/config');
const Deployer = artifacts.require('Deployer');

module.exports = async function (deployer, network) {
  const { config: tokenConfig, network: resolvedNetwork } = loadTokenConfig({
    network,
  });
  const { plan: deploymentPlan, path: planPath, exists: hasPlan } =
    loadDeploymentPlan({ network, optional: true });

  if (!hasPlan) {
    console.warn(
      `Warning: deployment-config for ${resolvedNetwork || network} not found at ${planPath}. Using defaults.`
    );
  }
  if (!tokenConfig || !tokenConfig.address) {
    throw new Error('AGIALPHA token address missing from configuration');
  }
  if (tokenConfig.decimals !== undefined && tokenConfig.decimals !== 18) {
    console.warn(
      `Warning: expected AGIALPHA decimals to be 18, got ${tokenConfig.decimals}`
    );
  }

  if (deploymentPlan.agialpha) {
    const planAddress = ethers.getAddress(deploymentPlan.agialpha);
    const configAddress = ethers.getAddress(tokenConfig.address);
    if (planAddress !== configAddress) {
      throw new Error(
        `AGIALPHA token mismatch between config/agialpha (${configAddress}) and deployment-config (${planAddress}). Align both before deploying.`
      );
    }
  }

  console.log(
    `Using AGIALPHA token ${tokenConfig.address} for ${resolvedNetwork} deployment`
  );

  await deployer.deploy(Deployer, { overwrite: false });
  const instance = await Deployer.deployed();
  console.log(`Deployer contract deployed at ${instance.address}`);
};
