import fs from 'fs';
import { readGovernanceJson } from './governance-json';
import path from 'path';
import { ethers } from 'hardhat';
import {
  loadGovernanceConfig,
  resolveMandateWindow,
  validateGovernanceAddress,
} from './governance-config';

const CONFIG_PATH =
  process.env.AGIJOBS_GOV_CONFIG ??
  path.join(__dirname, '..', 'config', 'multinational-governance.json');
const DEPLOYMENT_LOG = path.join(
  __dirname,
  '..',
  'logs',
  'deployment-latest.json'
);

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const config = loadGovernanceConfig(CONFIG_PATH, now);
  // Resolve every window before registration can send its first transaction.
  const windows = config.mandates.map((mandate) =>
    resolveMandateWindow(mandate, now)
  );

  let targetAddress = process.env.GOVERNANCE_ADDRESS as string | undefined;
  if (targetAddress === undefined) {
    if (!fs.existsSync(DEPLOYMENT_LOG)) {
      throw new Error(
        'Missing deployment log. Provide GOVERNANCE_ADDRESS env variable or deploy contract first.'
      );
    }
    const deployment = readGovernanceJson(DEPLOYMENT_LOG) as {
      contract?: unknown;
    };
    validateGovernanceAddress(deployment.contract, 'deployment.contract');
    targetAddress = deployment.contract;
  }

  validateGovernanceAddress(
    targetAddress,
    'GOVERNANCE_ADDRESS/deployment.contract'
  );
  const contract = await ethers.getContractAt(
    'GlobalGovernanceCouncil',
    targetAddress!
  );
  console.log(`[seed] Using contract ${targetAddress}`);

  for (const nation of config.nations) {
    const tx = await contract.registerNation(
      nation.id,
      nation.governor,
      BigInt(nation.weight),
      nation.metadataURI
    );
    console.log(`[seed] registerNation ${nation.id} → ${tx.hash}`);
    await tx.wait();
  }

  for (const [index, mandate] of config.mandates.entries()) {
    const { start, end } = windows[index];
    const tx = await contract.createMandate(
      mandate.id,
      BigInt(mandate.quorum),
      start,
      end,
      mandate.metadataURI
    );
    console.log(`[seed] createMandate ${mandate.id} → ${tx.hash}`);
    await tx.wait();
  }
}

main().catch((error) => {
  console.error('[seed] failed', error);
  process.exitCode = 1;
});
