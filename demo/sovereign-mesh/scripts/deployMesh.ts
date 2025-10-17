import fs from "fs";
import path from "path";
import { artifacts, ethers } from "hardhat";

const AGIALPHA = "0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA";
const HUBS_FILE = path.join(__dirname, "../config/hubs.mainnet.json");
const TOKEN_ARTIFACT = "contracts/test/AGIALPHAToken.sol:AGIALPHAToken";

type HubAddresses = {
  StakeManager: string;
  JobRegistry: string;
  ValidationModule: string;
  ReputationEngine: string;
  DisputeModule: string;
  CertificateNFT: string;
  PlatformRegistry: string;
  JobRouter: string;
  PlatformIncentives: string;
  FeePool: string;
  TaxPolicy: string;
  IdentityRegistry: string;
  SystemPause: string;
};

const hubLabels: Array<[string, string]> = [
  ["public-research", "Public Research Hub"],
  ["industrial-ops", "Industrial Ops Hub"],
  ["civic-governance", "Civic Governance Hub"],
];

async function ensureAgialpha(owner: string) {
  const artifact = await artifacts.readArtifact(TOKEN_ARTIFACT);
  await ethers.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
  const ownerSlot = ethers.toBeHex(5, 32);
  const ownerValue = ethers.zeroPadValue(owner, 32);
  await ethers.provider.send("hardhat_setStorageAt", [AGIALPHA, ownerSlot, ownerValue]);
  return ethers.getContractAt(artifact.abi, AGIALPHA, await ethers.getSigner(owner));
}

async function deployHub(governance: string): Promise<HubAddresses> {
  const Deployer = await ethers.getContractFactory("contracts/v2/Deployer.sol:Deployer");
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const identityParams = {
    ens: ethers.ZeroAddress,
    nameWrapper: ethers.ZeroAddress,
    clubRootNode: ethers.ZeroHash,
    agentRootNode: ethers.ZeroHash,
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };
  const tx = await deployer.deployDefaults(identityParams, governance);
  const receipt = await tx.wait();
  const deployerAddress = await deployer.getAddress();
  const deploymentLog = receipt?.logs?.find((log) => log.address === deployerAddress);
  if (!deploymentLog) {
    throw new Error("Deployment event not found");
  }
  const decoded = deployer.interface.decodeEventLog(
    "Deployed",
    deploymentLog.data,
    deploymentLog.topics,
  );
  return {
    StakeManager: decoded[0],
    JobRegistry: decoded[1],
    ValidationModule: decoded[2],
    ReputationEngine: decoded[3],
    DisputeModule: decoded[4],
    CertificateNFT: decoded[5],
    PlatformRegistry: decoded[6],
    JobRouter: decoded[7],
    PlatformIncentives: decoded[8],
    FeePool: decoded[9],
    TaxPolicy: decoded[10],
    IdentityRegistry: decoded[11],
    SystemPause: decoded[12],
  } as HubAddresses;
}

async function main() {
  const [governance, agent, validatorA, validatorB] = await ethers.getSigners();
  const token = await ensureAgialpha(governance.address);
  const participants = [governance.address, agent.address, validatorA.address, validatorB.address];
  for (const addr of participants) {
    const minted = ethers.parseEther("1000");
    const tx = await token.mint(addr, minted);
    await tx.wait();
  }

  let config: Record<string, any> = {};
  if (fs.existsSync(HUBS_FILE)) {
    config = JSON.parse(fs.readFileSync(HUBS_FILE, "utf8"));
  }

  for (const [id, label] of hubLabels) {
    const addresses = await deployHub(governance.address);
    config[id] = {
      label,
      rpcUrl: "http://localhost:8545",
      subgraphUrl:
        config[id]?.subgraphUrl ?? "http://localhost:8000/subgraphs/name/agi/jobs-v2",
      addresses: {
        AGIALPHA,
        JobRegistry: addresses.JobRegistry,
        StakeManager: addresses.StakeManager,
        ValidationModule: addresses.ValidationModule,
        DisputeModule: addresses.DisputeModule,
        IdentityRegistry: addresses.IdentityRegistry,
        CertificateNFT: addresses.CertificateNFT,
        ReputationEngine: addresses.ReputationEngine,
        PlatformRegistry: addresses.PlatformRegistry,
        JobRouter: addresses.JobRouter,
        PlatformIncentives: addresses.PlatformIncentives,
        FeePool: addresses.FeePool,
        TaxPolicy: addresses.TaxPolicy,
        SystemPause: addresses.SystemPause,
      },
    };
    console.log(`Deployed hub ${label}`);
  }

  fs.writeFileSync(HUBS_FILE, JSON.stringify(config, null, 2));
  console.log(`Configuration updated at ${HUBS_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
