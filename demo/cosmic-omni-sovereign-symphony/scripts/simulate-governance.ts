import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

const CONFIG_PATH = process.env.AGIJOBS_GOV_CONFIG ?? path.join(__dirname, "..", "config", "multinational-governance.json");
const DEPLOYMENT_LOG = path.join(__dirname, "..", "logs", "deployment-latest.json");
const OUTPUT_LOG = path.join(__dirname, "..", "logs", "vote-simulation.json");

interface NationConfig {
  id: string;
  governor: string;
  weight?: number;
  metadataURI?: string;
}

interface MandateConfig {
  id: string;
  quorum?: number;
  metadataURI?: string;
  startDelaySeconds?: number;
  durationSeconds?: number;
}

interface VotePlan {
  mandateId: string;
  nationId: string;
  support: boolean;
  metadataURI?: string;
}

interface GovernanceConfig {
  owner?: string;
  nations?: NationConfig[];
  mandates?: MandateConfig[];
  votes?: VotePlan[];
}

async function impersonate(address: string) {
  const provider = ethers.provider;
  const checksum = ethers.getAddress(address);
  await provider.send("hardhat_impersonateAccount", [checksum]);
  // 100 ETH balance to avoid gas exhaustion when bridging to live networks.
  await provider.send("hardhat_setBalance", [
    checksum,
    "0x56BC75E2D63100000" // 100 ETH
  ]);
  return ethers.getImpersonatedSigner(checksum);
}

async function stopImpersonating(address: string) {
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [ethers.getAddress(address)]);
}

async function ensureMandateWindow(contractAddress: string, mandateId: string) {
  const contract = await ethers.getContractAt("GlobalGovernanceCouncil", contractAddress);
  const mandate = await contract.getMandate(mandateId);
  if (!mandate.exists) {
    throw new Error(`Mandate ${mandateId} does not exist on ${contractAddress}`);
  }
  const provider = ethers.provider;
  const block = await provider.getBlock("latest");
  const now = BigInt(block.timestamp);
  const start = BigInt(mandate.startTimestamp);
  if (now < start) {
    const advanceBy = start - now + 1n;
    await provider.send("evm_increaseTime", [Number(advanceBy)]);
    await provider.send("evm_mine", []);
  }
  const end = BigInt(mandate.endTimestamp);
  if (end !== 0n) {
    const newBlock = await provider.getBlock("latest");
    if (BigInt(newBlock.timestamp) > end) {
      throw new Error(`Mandate ${mandateId} voting window already closed`);
    }
  }
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Configuration file not found at ${CONFIG_PATH}`);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as GovernanceConfig;
  const votes = config.votes ?? [];
  if (votes.length === 0) {
    throw new Error("No votes defined in configuration. Add a votes array to simulate governance.");
  }

  let contractAddress = process.env.GOVERNANCE_ADDRESS as string | undefined;
  if (!contractAddress) {
    if (!fs.existsSync(DEPLOYMENT_LOG)) {
      throw new Error("Missing deployment log. Provide GOVERNANCE_ADDRESS env variable or deploy contract first.");
    }
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_LOG, "utf-8"));
    contractAddress = deployment.contract;
  }

  const network = await ethers.provider.getNetwork();
  const ledger: any = {
    contract: contractAddress,
    network: {
      name: network.name,
      chainId: network.chainId.toString()
    },
    generatedAt: new Date().toISOString(),
    votes: [] as any[],
    ownerActions: [] as any[]
  };

  const nationMap = new Map<string, NationConfig>();
  for (const nation of config.nations ?? []) {
    nationMap.set(nation.id, nation);
  }

  const contract = await ethers.getContractAt("GlobalGovernanceCouncil", contractAddress!);

  for (const vote of votes) {
    const nation = nationMap.get(vote.nationId);
    if (!nation) {
      throw new Error(`Nation ${vote.nationId} missing from configuration`);
    }
    await ensureMandateWindow(contractAddress!, vote.mandateId);
    const checksum = ethers.getAddress(nation.governor);
    const signer = await impersonate(checksum);
    try {
      const tx = await contract
        .connect(signer)
        .recordNationVote(vote.mandateId, vote.nationId, vote.support, vote.metadataURI ?? "");
      const receipt = await tx.wait();
      ledger.votes.push({
        mandateId: vote.mandateId,
        nationId: vote.nationId,
        support: vote.support,
        metadataURI: vote.metadataURI ?? "",
        transactionHash: tx.hash,
        blockNumber: receipt?.blockNumber ?? null
      });
    } finally {
      await stopImpersonating(checksum);
    }
  }

  const owner = config.owner;
  if (owner) {
    const checksum = ethers.getAddress(owner);
    const ownerSigner = await impersonate(checksum);
    try {
      const pauseTx = await contract.connect(ownerSigner).pause();
      const pauseReceipt = await pauseTx.wait();
      ledger.ownerActions.push({
        action: "pause",
        transactionHash: pauseTx.hash,
        blockNumber: pauseReceipt?.blockNumber ?? null
      });
      const unpauseTx = await contract.connect(ownerSigner).unpause();
      const unpauseReceipt = await unpauseTx.wait();
      ledger.ownerActions.push({
        action: "unpause",
        transactionHash: unpauseTx.hash,
        blockNumber: unpauseReceipt?.blockNumber ?? null
      });
    } finally {
      await stopImpersonating(checksum);
    }
  }

  const mandateIds = Array.from(new Set(votes.map((vote) => vote.mandateId)));
  ledger.quorum = [];
  for (const mandateId of mandateIds) {
    const hasQuorum = await contract.hasMandateReachedQuorum(mandateId);
    ledger.quorum.push({ mandateId, reached: hasQuorum });
  }

  fs.mkdirSync(path.dirname(OUTPUT_LOG), { recursive: true });
  fs.writeFileSync(OUTPUT_LOG, JSON.stringify(ledger, null, 2));
  console.log(`[simulate] wrote vote simulation log to ${OUTPUT_LOG}`);
}

main().catch((error) => {
  console.error("[simulate] failed", error);
  process.exitCode = 1;
});
