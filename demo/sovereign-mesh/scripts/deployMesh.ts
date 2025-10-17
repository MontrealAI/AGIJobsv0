import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

type HubDescriptor = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

async function deployHub(label: string, token: string): Promise<HubDescriptor> {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(token);
  await stake.waitForDeployment();

  const ReputationEngine = await ethers.getContractFactory("ReputationEngine");
  const reputation = await ReputationEngine.deploy();
  await reputation.waitForDeployment();

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
  const certificate = await CertificateNFT.deploy();
  await certificate.waitForDeployment();

  const JobRegistry = await ethers.getContractFactory("JobRegistry");
  const jobs = await JobRegistry.deploy(token);
  await jobs.waitForDeployment();

  await (await jobs.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await certificate.getAddress(),
    ethers.ZeroAddress,
    []
  )).wait();
  await (await jobs.setIdentityRegistry(await identity.getAddress())).wait();

  await (await stake.setJobRegistry(await jobs.getAddress())).wait();
  await (await stake.setDisputeModule(await dispute.getAddress())).wait();

  await (await validation.setJobRegistry(await jobs.getAddress())).wait();
  await (await validation.setIdentityRegistry(await identity.getAddress())).wait();

  await (await dispute.setJobRegistry(await jobs.getAddress())).wait();

  await (await certificate.setJobRegistry(await jobs.getAddress())).wait();
  await (await certificate.setStakeManager(await stake.getAddress())).wait();

  return {
    label,
    rpcUrl: "http://localhost:8545",
    subgraphUrl: "http://localhost:8000/subgraphs/name/agi/jobs-v2",
    addresses: {
      AGIALPHA: token,
      JobRegistry: await jobs.getAddress(),
      StakeManager: await stake.getAddress(),
      ValidationModule: await validation.getAddress(),
      DisputeModule: await dispute.getAddress(),
      IdentityRegistry: await identity.getAddress(),
      CertificateNFT: await certificate.getAddress(),
      FeePool: ethers.ZeroAddress
    }
  };
}

async function main() {
  const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");
  const AGI = await ethers.getContractFactory("AGIALPHAToken");
  const agi = await AGI.deploy("AGIALPHA", "AGIA", 18);
  await agi.waitForDeployment();
  const tokenAddress = await agi.getAddress();

  const research = await deployHub("Public Research Hub", tokenAddress);
  const industrial = await deployHub("Industrial Ops Hub", tokenAddress);
  const civic = await deployHub("Civic Governance Hub", tokenAddress);

  const hubs = {
    "public-research": research,
    "industrial-ops": industrial,
    "civic-governance": civic
  } satisfies Record<string, HubDescriptor>;

  fs.writeFileSync(hubsPath, `${JSON.stringify(hubs, null, 2)}\n`);
  console.log("✅ Sovereign Mesh hubs deployed", hubsPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
