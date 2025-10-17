import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AGIALPHA } from "../../../scripts/constants";
import { ensureAgialphaStub } from "../shared/ensureAgialpha";
import { extractDeployedAddresses } from "../shared/deployUtils";

const ZERO_IDENTITY = {
  ens: ethers.ZeroAddress,
  nameWrapper: ethers.ZeroAddress,
  clubRootNode: ethers.ZeroHash,
  agentRootNode: ethers.ZeroHash,
  validatorMerkleRoot: ethers.ZeroHash,
  agentMerkleRoot: ethers.ZeroHash
};

const ECON_CONFIG = {
  feePct: 0,
  burnPct: 0,
  employerSlashPct: 0,
  treasurySlashPct: 0,
  validatorSlashRewardPct: 0,
  commitWindow: 60,
  revealWindow: 60,
  minStake: 0,
  jobStake: 0
};

type HubSnapshot = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

async function deployHub(label: string, governance: string): Promise<HubSnapshot> {
  await ensureAgialphaStub();
  const Deployer = await ethers.getContractFactory("contracts/v2/Deployer.sol:Deployer");
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const tx = await deployer["deployWithoutTaxPolicy"](
    ECON_CONFIG,
    ZERO_IDENTITY,
    governance
  );
  const receipt = await tx.wait();
  const deployed = extractDeployedAddresses(deployer.interface, receipt.logs);

  return {
    label,
    rpcUrl: "http://localhost:8545",
    subgraphUrl: "http://localhost:8000/subgraphs/name/agi/jobs-v2",
    addresses: {
      AGIALPHA,
      JobRegistry: deployed.job,
      StakeManager: deployed.stake,
      ValidationModule: deployed.validation,
      DisputeModule: deployed.dispute,
      IdentityRegistry: deployed.identityRegistry,
      CertificateNFT: deployed.certificate,
      FeePool: deployed.feePool,
      ReputationEngine: deployed.reputation,
      PlatformRegistry: deployed.platformRegistry,
      JobRouter: deployed.jobRouter,
      PlatformIncentives: deployed.platformIncentives,
      TaxPolicy: deployed.taxPolicy,
      SystemPause: deployed.systemPause
    }
  };
}

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const [deployer] = await ethers.getSigners();
  const governance = await deployer.getAddress();

  const publicResearch = await deployHub("Public Research Hub", governance);
  const industrialOps = await deployHub("Industrial Ops Hub", governance);

  const hubs = {
    "public-research": publicResearch,
    "industrial-ops": industrialOps,
    "civic-governance": await deployHub("Civic Governance Hub", governance)
  } satisfies Record<string, HubSnapshot>;

  fs.writeFileSync(hubsPath, JSON.stringify(hubs, null, 2));
  console.log(`Mesh hubs deployed and saved to ${hubsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
