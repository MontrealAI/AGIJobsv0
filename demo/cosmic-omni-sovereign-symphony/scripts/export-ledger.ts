import fs from 'fs';
import { readGovernanceJson } from './governance-json';
import path from 'path';
import { ethers } from 'hardhat';
import {
  loadGovernanceConfig,
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

function parseArgs() {
  const args = process.argv.slice(2);
  const usage = 'Usage: export-ledger.ts --output <path>';
  if (args.length === 0) {
    throw new Error(`--output <path> is required. ${usage}`);
  }
  if (args[0] !== '--output') {
    throw new Error(`Unknown argument ${JSON.stringify(args[0])}. ${usage}`);
  }
  if (!args[1]?.trim() || args[1].startsWith('-')) {
    throw new Error(`--output <path> is required. ${usage}`);
  }
  if (args.length !== 2) {
    throw new Error(`Unexpected argument ${JSON.stringify(args[2])}. ${usage}`);
  }
  return args[1];
}

async function main() {
  const outputPath = parseArgs();
  const config = loadGovernanceConfig(CONFIG_PATH);

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
  const nations = await contract.getNationIds();
  const data: any = {
    contract: targetAddress,
    timestamp: new Date().toISOString(),
    network: await contract.runner?.provider?.getNetwork(),
    nations: [] as any[],
    mandates: [] as any[],
  };

  for (const id of nations) {
    const nation = await contract.getNation(id);
    data.nations.push({
      id,
      governor: nation.governor,
      weight: nation.votingWeight.toString(),
      active: nation.active,
      metadataURI: nation.metadataURI,
    });
  }

  const mandateIds = config.mandates.map((mandate) => mandate.id);

  for (const mandateId of mandateIds) {
    const mandate = await contract.getMandate(mandateId);
    if (!mandate.exists)
      throw new Error(
        `Mandate ${mandateId} does not exist on ${targetAddress}`
      );
    const votes = [] as any[];
    for (const nationId of nations) {
      const vote = await contract.getMandateVote(mandateId, nationId);
      if (vote.cast) {
        votes.push({
          nationId,
          support: vote.support,
          weight: vote.weight.toString(),
          metadataURI: vote.metadataURI,
          timestamp: vote.timestamp.toString(),
        });
      }
    }
    data.mandates.push({
      id: mandateId,
      quorum: mandate.quorum.toString(),
      startTimestamp: mandate.startTimestamp.toString(),
      endTimestamp: mandate.endTimestamp.toString(),
      supportWeight: mandate.supportWeight.toString(),
      againstWeight: mandate.againstWeight.toString(),
      executed: mandate.executed,
      metadataURI: mandate.metadataURI,
      votes,
    });
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`[export] wrote ledger to ${outputPath}`);
}

main().catch((error) => {
  console.error('[export] failed', error);
  process.exitCode = 1;
});
