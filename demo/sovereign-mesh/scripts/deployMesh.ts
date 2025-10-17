import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

type HubConfig = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

type HubMap = Record<string, HubConfig>;

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

const deployHub = async (label: string, agi: string): Promise<HubConfig> => {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(agi);
  await stake.waitForDeployment();

  const ReputationEngine = await ethers.getContractFactory("ReputationEngine");
  const rep = await ReputationEngine.deploy();
  await rep.waitForDeployment();

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identity = await IdentityRegistry.deploy();
  await identity.waitForDeployment();

  const ValidationModule = await ethers.getContractFactory("ValidationModule");
  const validation = await ValidationModule.deploy();
  await validation.waitForDeployment();

  const DisputeModule = await ethers.getContractFactory("DisputeModule");
  const dispute = await DisputeModule.deploy();
  await dispute.waitForDeployment();

  const CertificateNFT = await ethers.getContractFactory("CertificateNFT");
  const cert = await CertificateNFT.deploy();
  await cert.waitForDeployment();

  const JobRegistry = await ethers.getContractFactory("JobRegistry");
  const job = await JobRegistry.deploy(agi);
  await job.waitForDeployment();

  await (await job.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await rep.getAddress(),
    await dispute.getAddress(),
    await cert.getAddress(),
    ethers.ZeroAddress,
    []
  )).wait();

  await (await stake.setJobRegistry(await job.getAddress())).wait();
  await (await validation.setJobRegistry(await job.getAddress())).wait();
  await (await dispute.setJobRegistry(await job.getAddress())).wait();
  await (await cert.setJobRegistry(await job.getAddress())).wait();
  await (await stake.setDisputeModule(await dispute.getAddress())).wait();
  await (await cert.setStakeManager(await stake.getAddress())).wait();

  return {
    label,
    rpcUrl: "http://localhost:8545",
    subgraphUrl: "http://localhost:8000/subgraphs/name/agi/jobs-v2",
    addresses: {
      AGIALPHA: agi,
      JobRegistry: await job.getAddress(),
      StakeManager: await stake.getAddress(),
      ValidationModule: await validation.getAddress(),
      DisputeModule: await dispute.getAddress(),
      IdentityRegistry: await identity.getAddress(),
      CertificateNFT: await cert.getAddress(),
      FeePool: ethers.ZeroAddress
    }
  };
};

async function main() {
  const AGI = await ethers.getContractFactory("AGIALPHAToken");
  const token = await AGI.deploy("AGIALPHA", "AGIA", 18);
  await token.waitForDeployment();
  const agi = await token.getAddress();

  const publicResearch = await deployHub("Public Research Hub", agi);
  const industrialOps = await deployHub("Industrial Ops Hub", agi);
  const civicGov = await deployHub("Civic Governance Hub", agi);

  const hubs: HubMap = {
    "public-research": publicResearch,
    "industrial-ops": industrialOps,
    "civic-governance": civicGov
  };

  fs.writeFileSync(hubsPath, JSON.stringify(hubs, null, 2));
  console.log("Sovereign Mesh hubs deployed:", hubsPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
