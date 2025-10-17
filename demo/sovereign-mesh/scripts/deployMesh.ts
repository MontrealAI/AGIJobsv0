import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

type HubConfig = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

const HUBS_PATH = path.join(__dirname, "../config/hubs.mainnet.json");

async function deployHub(label: string, agi: string): Promise<HubConfig> {
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
    subgraphUrl: "http://localhost:8000/subgraphs/name/agi/jobs-v2",
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
  const AGIALPHA = await ethers.getContractFactory("AGIALPHAToken");
  const token = await AGIALPHA.deploy("AGIALPHA", "AGIA", 18);
  await token.waitForDeployment();
  const agiAddress = await token.getAddress();

  const publicResearch = await deployHub("Public Research Hub", agiAddress);
  const industrialOps = await deployHub("Industrial Ops Hub", agiAddress);

  const hubs = {
    "public-research": publicResearch,
    "industrial-ops": industrialOps,
    "civic-governance": publicResearch
  };

  fs.writeFileSync(HUBS_PATH, JSON.stringify(hubs, null, 2));
  console.log("Mesh hubs deployed to", HUBS_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
