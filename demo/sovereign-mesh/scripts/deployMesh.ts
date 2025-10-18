import fs from "fs";
import path from "path";
import { artifacts, ethers } from "hardhat";
import { AGIALPHA } from "../../scripts/constants";

type HubRecord = {
  label: string;
  rpcUrl: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

const hubsPath = path.join(__dirname, "../config/hubs.mainnet.json");

async function ensureAgialphaMock(owner: string) {
  const artifact = await artifacts.readArtifact("contracts/test/AGIALPHAToken.sol:AGIALPHAToken");
  await ethers.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
  const ownerSlot = ethers.toBeHex(5, 32);
  const ownerValue = ethers.zeroPadValue(owner, 32);
  await ethers.provider.send("hardhat_setStorageAt", [AGIALPHA, ownerSlot, ownerValue]);
  const token = await ethers.getContractAt(
    "contracts/test/AGIALPHAToken.sol:AGIALPHAToken",
    AGIALPHA
  );
  return token;
}

async function deployHub(label: string, rpcUrl: string, subgraphUrl: string) {
  const [owner] = await ethers.getSigners();

  const StakeManager = await ethers.getContractFactory(
    "contracts/v2/StakeManager.sol:StakeManager"
  );
  const stakeManager = await StakeManager.deploy(
    ethers.parseEther("1"),
    0,
    100,
    owner.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );
  await stakeManager.waitForDeployment();

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine"
  );
  const reputation = await Reputation.deploy(await stakeManager.getAddress());
  await reputation.waitForDeployment();

  const ENS = await ethers.getContractFactory("contracts/legacy/MockENS.sol:MockENS");
  const ens = await ENS.deploy();
  await ens.waitForDeployment();

  const Wrapper = await ethers.getContractFactory(
    "contracts/legacy/MockNameWrapper.sol:MockNameWrapper"
  );
  const wrapper = await Wrapper.deploy();
  await wrapper.waitForDeployment();

  const Identity = await ethers.getContractFactory(
    "contracts/v2/IdentityRegistry.sol:IdentityRegistry"
  );
  const identity = await Identity.deploy(
    await ens.getAddress(),
    await wrapper.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await identity.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    "contracts/v2/ValidationModule.sol:ValidationModule"
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stakeManager.getAddress(),
    3600,
    3600,
    3,
    5,
    []
  );
  await validation.waitForDeployment();

  const Certificate = await ethers.getContractFactory(
    "contracts/v2/CertificateNFT.sol:CertificateNFT"
  );
  const certificate = await Certificate.deploy(`${label} Certificate`, "SMCERT");
  await certificate.waitForDeployment();

  const JobRegistry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const jobRegistry = await JobRegistry.deploy(
    await validation.getAddress(),
    await stakeManager.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await certificate.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address
  );
  await jobRegistry.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await jobRegistry.getAddress(),
    0,
    0,
    owner.address,
    owner.address
  );
  await dispute.waitForDeployment();

  await stakeManager.setJobRegistry(await jobRegistry.getAddress());
  await stakeManager.setDisputeModule(await dispute.getAddress());
  await validation.setJobRegistry(await jobRegistry.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());
  await validation.setReputationEngine(await reputation.getAddress());
  await jobRegistry.setIdentityRegistry(await identity.getAddress());
  await jobRegistry.setModules(
    await validation.getAddress(),
    await stakeManager.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await certificate.getAddress(),
    ethers.ZeroAddress,
    []
  );
  await dispute.setStakeManager(await stakeManager.getAddress());
  await certificate.setJobRegistry(await jobRegistry.getAddress());
  await certificate.setStakeManager(await stakeManager.getAddress());
  await reputation.setAuthorizedCaller(await jobRegistry.getAddress(), true);

  return {
    label,
    rpcUrl,
    subgraphUrl,
    addresses: {
      AGIALPHA,
      JobRegistry: await jobRegistry.getAddress(),
      StakeManager: await stakeManager.getAddress(),
      ValidationModule: await validation.getAddress(),
      DisputeModule: await dispute.getAddress(),
      IdentityRegistry: await identity.getAddress(),
      CertificateNFT: await certificate.getAddress(),
      FeePool: "0x0000000000000000000000000000000000000000"
    }
  } satisfies HubRecord;
}

async function main() {
  const [owner] = await ethers.getSigners();
  const token = await ensureAgialphaMock(owner.address);
  await token.mint(owner.address, ethers.parseEther("1000000"));

  const hubs: Record<string, HubRecord> = {};
  hubs["public-research"] = await deployHub(
    "Public Research Hub",
    "http://localhost:8545",
    "http://localhost:8000/subgraphs/name/agi/jobs-v2"
  );
  hubs["industrial-ops"] = await deployHub(
    "Industrial Ops Hub",
    "http://localhost:8545",
    "http://localhost:8000/subgraphs/name/agi/jobs-v2"
  );
  hubs["civic-governance"] = hubs["public-research"];

  fs.writeFileSync(hubsPath, `${JSON.stringify(hubs, null, 2)}\n`);
  console.log(`Mesh hubs deployed to ${hubsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
