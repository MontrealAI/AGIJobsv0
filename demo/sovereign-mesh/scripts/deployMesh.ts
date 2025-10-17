import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

type HubDescriptor = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

const hubsPath = path.join(__dirname, "..", "config", "hubs.mainnet.json");

async function deployHub(label: string, agi: string): Promise<HubDescriptor> {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(agi);
  await stake.waitForDeployment();

  const ReputationEngine = await (await ethers.getContractFactory("ReputationEngine")).deploy();
  await ReputationEngine.waitForDeployment();
  const IdentityRegistry = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
  await IdentityRegistry.waitForDeployment();
  const ValidationModule = await (await ethers.getContractFactory("ValidationModule")).deploy();
  await ValidationModule.waitForDeployment();
  const DisputeModule = await (await ethers.getContractFactory("DisputeModule")).deploy();
  await DisputeModule.waitForDeployment();
  const CertificateNFT = await (await ethers.getContractFactory("CertificateNFT")).deploy();
  await CertificateNFT.waitForDeployment();
  const JobRegistry = await (await ethers.getContractFactory("JobRegistry")).deploy(agi);
  await JobRegistry.waitForDeployment();

  await (
    await JobRegistry.setModules(
      await ValidationModule.getAddress(),
      await stake.getAddress(),
      await ReputationEngine.getAddress(),
      await DisputeModule.getAddress(),
      await CertificateNFT.getAddress(),
      ethers.ZeroAddress,
      []
    )
  ).wait();

  await (await stake.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await ValidationModule.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await DisputeModule.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await CertificateNFT.setJobRegistry(await JobRegistry.getAddress())).wait();
  await (await stake.setDisputeModule(await DisputeModule.getAddress())).wait();
  await (await CertificateNFT.setStakeManager(await stake.getAddress())).wait();

  return {
    label,
    rpcUrl: "http://localhost:8545",
    subgraphUrl: "http://localhost:8000/subgraphs/name/agi-jobs/local",
    addresses: {
      AGIALPHA: agi,
      JobRegistry: await JobRegistry.getAddress(),
      StakeManager: await stake.getAddress(),
      ValidationModule: await ValidationModule.getAddress(),
      DisputeModule: await DisputeModule.getAddress(),
      IdentityRegistry: await IdentityRegistry.getAddress(),
      CertificateNFT: await CertificateNFT.getAddress(),
      FeePool: ethers.ZeroAddress
    }
  };
}

async function main() {
  const hubsDir = path.dirname(hubsPath);
  if (!fs.existsSync(hubsDir)) {
    fs.mkdirSync(hubsDir, { recursive: true });
  }

  const Token = await ethers.getContractFactory("AGIALPHAToken");
  const token = await Token.deploy("AGIALPHA", "AGIA", 18);
  await token.waitForDeployment();
  const agiAddress = await token.getAddress();

  const research = await deployHub("Public Research Hub", agiAddress);
  const industrial = await deployHub("Industrial Ops Hub", agiAddress);
  const governance = await deployHub("Civic Governance Hub", agiAddress);

  const hubs = {
    "public-research": research,
    "industrial-ops": industrial,
    "civic-governance": governance
  } satisfies Record<string, HubDescriptor>;

  fs.writeFileSync(hubsPath, JSON.stringify(hubs, null, 2));
  console.log("Sovereign Mesh hubs deployed:");
  console.table(
    Object.entries(hubs).map(([key, hub]) => ({
      key,
      jobRegistry: hub.addresses.JobRegistry,
      stakeManager: hub.addresses.StakeManager
    }))
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
