import fs from "fs";
import path from "path";
import { artifacts, ethers, network } from "hardhat";
import agialpha from "../../../config/agialpha.json";

type HubConfig = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

async function ensureMockAgialpha() {
  const artifact = await artifacts.readArtifact("contracts/test/MockERC20.sol:MockERC20");
  await network.provider.send("hardhat_setCode", [agialpha.address, artifact.deployedBytecode]);
}

async function deployHub(label: string, governance: string): Promise<HubConfig> {
  const Deployer = await ethers.getContractFactory("contracts/v2/Deployer.sol:Deployer");
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();

  const identity = {
    ens: ethers.ZeroAddress,
    nameWrapper: ethers.ZeroAddress,
    clubRootNode: ethers.ZeroHash,
    agentRootNode: ethers.ZeroHash,
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash
  };

  const result = await deployer.deployDefaultsWithoutTaxPolicy(identity, governance);
  const [
    stakeManager,
    jobRegistry,
    validationModule,
    reputationEngine,
    disputeModule,
    certificateNFT,
    platformRegistry,
    jobRouter,
    platformIncentives,
    feePool,
    taxPolicy,
    identityRegistry,
    systemPause
  ] = result;

  return {
    label,
    rpcUrl: "http://127.0.0.1:8545",
    subgraphUrl: "http://127.0.0.1:8000/subgraphs/name/agi/jobs-v2",
    addresses: {
      AGIALPHA: agialpha.address,
      JobRegistry: jobRegistry,
      StakeManager: stakeManager,
      ValidationModule: validationModule,
      DisputeModule: disputeModule,
      IdentityRegistry: identityRegistry,
      CertificateNFT: certificateNFT,
      FeePool: feePool,
      ReputationEngine: reputationEngine,
      PlatformRegistry: platformRegistry,
      JobRouter: jobRouter,
      PlatformIncentives: platformIncentives,
      SystemPause: systemPause,
      TaxPolicy: taxPolicy
    }
  };
}

async function main() {
  const configPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const [deployer] = await ethers.getSigners();
  await ensureMockAgialpha();

  const publicResearch = await deployHub("Public Research Hub", deployer.address);
  const industrialOps = await deployHub("Industrial Ops Hub", deployer.address);
  const civicGovernance = await deployHub("Civic Governance Hub", deployer.address);

  const hubs: Record<string, HubConfig> = {
    "public-research": publicResearch,
    "industrial-ops": industrialOps,
    "civic-governance": civicGovernance
  };

  fs.writeFileSync(configPath, JSON.stringify(hubs, null, 2));
  console.log(`Mesh hubs deployed and written to ${configPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
