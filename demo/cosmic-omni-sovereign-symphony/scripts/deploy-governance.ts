import fs from 'fs';
import path from 'path';
import { ethers } from 'hardhat';
import { loadGovernanceConfig } from './governance-config';

const CONFIG_PATH =
  process.env.AGIJOBS_GOV_CONFIG ??
  path.join(__dirname, '..', 'config', 'multinational-governance.json');

async function main() {
  const config = loadGovernanceConfig(CONFIG_PATH);
  const [signer] = await ethers.getSigners();
  const { owner, pauserRole } = config;

  console.log(`[deploy] deploying GlobalGovernanceCouncil with owner ${owner}`);
  const factory = await ethers.getContractFactory('GlobalGovernanceCouncil');
  const contract = await factory.deploy(owner, pauserRole);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`[deploy] deployed at ${address}`);

  const output = {
    network: await signer.provider?.getNetwork(),
    deployer: signer.address,
    owner,
    pauserRole,
    contract: address,
    timestamp: Date.now(),
  };

  const logDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    path.join(logDir, 'deployment-latest.json'),
    JSON.stringify(output, null, 2)
  );
}

main().catch((error) => {
  console.error('[deploy] failed', error);
  process.exitCode = 1;
});
