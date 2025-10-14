import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const CONFIG_PATH = process.env.AGIJOBS_GOV_CONFIG ?? path.join(__dirname, "..", "config", "multinational-governance.json");
const DEPLOYMENT_LOG = path.join(__dirname, "..", "logs", "deployment-latest.json");

function parseArgs() {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1 || outputIndex + 1 >= process.argv.length) {
    throw new Error("--output <path> is required");
  }
  return process.argv[outputIndex + 1];
}

async function main() {
  const outputPath = parseArgs();

  let targetAddress = process.env.GOVERNANCE_ADDRESS as string | undefined;
  if (!targetAddress) {
    if (!fs.existsSync(DEPLOYMENT_LOG)) {
      throw new Error("Missing deployment log. Provide GOVERNANCE_ADDRESS env variable or deploy contract first.");
    }
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_LOG, "utf-8"));
    targetAddress = deployment.contract;
  }

  const contract = await ethers.getContractAt("GlobalGovernanceCouncil", targetAddress!);
  const nations = await contract.getNationIds();
  const data: any = {
    contract: targetAddress,
    timestamp: new Date().toISOString(),
    network: await contract.runner?.provider?.getNetwork(),
    nations: [] as any[],
    mandates: [] as any[]
  };

  for (const id of nations) {
    const nation = await contract.getNation(id);
    data.nations.push({
      id,
      governor: nation.governor,
      weight: nation.votingWeight.toString(),
      active: nation.active,
      metadataURI: nation.metadataURI
    });
  }

  let mandateIds: string[] = [];
  if (fs.existsSync(CONFIG_PATH)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    mandateIds = (config.mandates ?? []).map((m: any) => m.id);
  }

  for (const mandateId of mandateIds) {
    const mandate = await contract.getMandate(mandateId);
    const votes = [] as any[];
    for (const nationId of nations) {
      const vote = await contract.getMandateVote(mandateId, nationId);
      if (vote.cast) {
        votes.push({
          nationId,
          support: vote.support,
          weight: vote.weight.toString(),
          metadataURI: vote.metadataURI,
          timestamp: vote.timestamp.toString()
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
      votes
    });
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`[export] wrote ledger to ${outputPath}`);
}

main().catch((error) => {
  console.error("[export] failed", error);
  process.exitCode = 1;
});
