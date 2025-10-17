import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

type HubDescriptor = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

const writeConfig = (hubs: Record<string, HubDescriptor>) => {
  const file = path.join(__dirname, "../config/hubs.mainnet.json");
  fs.writeFileSync(file, JSON.stringify(hubs, null, 2));
  console.log(`Mesh hubs deployed and written to config: ${file}`);
};

const deployHub = async (label: string, agi: string): Promise<HubDescriptor> => {
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stake = await StakeManager.deploy(agi);
  await stake.waitForDeployment();
  const ReputationEngine = await ethers.getContractFactory("ReputationEngine");
  const rep = await ReputationEngine.deploy();
  await rep.waitForDeployment();
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const id = await IdentityRegistry.deploy();
  await id.waitForDeployment();
  const ValidationModule = await ethers.getContractFactory("ValidationModule");
  const val = await ValidationModule.deploy();
  await val.waitForDeployment();
  const DisputeModule = await ethers.getContractFactory("DisputeModule");
  const disp = await DisputeModule.deploy();
  await disp.waitForDeployment();
  const CertificateNFT = await ethers.getContractFactory("CertificateNFT");
  const cert = await CertificateNFT.deploy();
  await cert.waitForDeployment();
  const JobRegistry = await ethers.getContractFactory("JobRegistry");
  const job = await JobRegistry.deploy(agi);
  await job.waitForDeployment();

  await (await job.setModules(
    await val.getAddress(),
    await stake.getAddress(),
    await rep.getAddress(),
    await disp.getAddress(),
    await cert.getAddress(),
    ethers.ZeroAddress,
    []
  )).wait();
  await (await stake.setJobRegistry(await job.getAddress())).wait();
  await (await val.setJobRegistry(await job.getAddress())).wait();
  await (await disp.setJobRegistry(await job.getAddress())).wait();
  await (await cert.setJobRegistry(await job.getAddress())).wait();
  await (await stake.setDisputeModule(await disp.getAddress())).wait();
  await (await cert.setStakeManager(await stake.getAddress())).wait();

  return {
    label,
    rpcUrl: "http://localhost:8545",
    subgraphUrl: "http://localhost:8000/subgraphs/name/agi/jobs-v2",
    addresses: {
      AGIALPHA: agi,
      JobRegistry: await job.getAddress(),
      StakeManager: await stake.getAddress(),
      ValidationModule: await val.getAddress(),
      DisputeModule: await disp.getAddress(),
      IdentityRegistry: await id.getAddress(),
      CertificateNFT: await cert.getAddress(),
      FeePool: ethers.ZeroAddress
    }
  };
};

async function main() {
  const AGI = await ethers.getContractFactory("AGIALPHAToken");
  const agi = await AGI.deploy("AGIALPHA", "AGIA", 18);
  await agi.waitForDeployment();
  const agiAddress = await agi.getAddress();

  const publicResearch = await deployHub("Public Research Hub", agiAddress);
  const industrialOps = await deployHub("Industrial Ops Hub", agiAddress);

  const hubs = {
    "public-research": publicResearch,
    "industrial-ops": industrialOps,
    "civic-governance": publicResearch
  } satisfies Record<string, HubDescriptor>;

  writeConfig(hubs);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
