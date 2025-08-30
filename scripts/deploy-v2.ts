import { ethers } from "hardhat";
import { AGIALPHA } from "./constants";

async function main() {
  const [deployer] = await ethers.getSigners();

  // Canonical $AGIALPHA token on all networks. If the token is not
  // already deployed (e.g. on a local testnet), deploy a minimal instance
  // for development purposes. This keeps deployments fixed to a single
  // ERC‑20 without requiring environment overrides.
  let tokenAddress = AGIALPHA;
  if ((await ethers.provider.getCode(AGIALPHA)) === "0x") {
    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy();
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
  }

  const Stake = await ethers.getContractFactory("contracts/v2/StakeManager.sol:StakeManager");
  const stake = await Stake.deploy(
    tokenAddress,
    0,
    0,
    0,
    deployer.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    deployer.address
  );
  await stake.waitForDeployment();

  const Reputation = await ethers.getContractFactory("contracts/v2/ReputationEngine.sol:ReputationEngine");
  const reputation = await Reputation.deploy(await stake.getAddress());
  await reputation.waitForDeployment();

  const ENS = await ethers.getContractFactory("contracts/legacy/MockENS.sol:MockENS");
  const ens = await ENS.deploy();
  await ens.waitForDeployment();
  const Wrapper = await ethers.getContractFactory("contracts/legacy/MockNameWrapper.sol:MockNameWrapper");
  const wrapper = await Wrapper.deploy();
  await wrapper.waitForDeployment();

  const Identity = await ethers.getContractFactory("contracts/v2/IdentityRegistry.sol:IdentityRegistry");
  const identity = await Identity.deploy(
    await ens.getAddress(),
    await wrapper.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await identity.waitForDeployment();

  const Validation = await ethers.getContractFactory("contracts/v2/mocks/ValidationStub.sol:ValidationStub");
  const validation = await Validation.deploy();
  await validation.waitForDeployment();

  const NFT = await ethers.getContractFactory("contracts/v2/CertificateNFT.sol:CertificateNFT");
  const nft = await NFT.deploy("Cert", "CERT");
  await nft.waitForDeployment();

  const Registry = await ethers.getContractFactory("contracts/v2/JobRegistry.sol:JobRegistry");
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    deployer.address
  );
  await registry.waitForDeployment();

  const committee = deployer; // replace with multisig for production
  const Dispute = await ethers.getContractFactory(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    committee.address
  );
  await dispute.waitForDeployment();
  await dispute.setStakeManager(await stake.getAddress());

  const FeePool = await ethers.getContractFactory(
    "contracts/v2/FeePool.sol:FeePool"
  );
  const feePool = await FeePool.deploy(
    tokenAddress,
    await stake.getAddress(),
    0,
    deployer.address
  );
  await feePool.waitForDeployment();

  const PlatformRegistry = await ethers.getContractFactory(
    "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
  );
  const platformRegistry = await PlatformRegistry.deploy(
    await stake.getAddress(),
    await reputation.getAddress(),
    0
  );
  await platformRegistry.waitForDeployment();

  await stake.setModules(await registry.getAddress(), await dispute.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    await feePool.getAddress(),
    []
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);

  const ensureContract = async (addr: string, name: string) => {
    if ((await ethers.provider.getCode(addr)) === "0x") {
      throw new Error(`${name} must be a deployed contract`);
    }
  };

  await Promise.all([
    ensureContract(tokenAddress, "Token"),
    ensureContract(await registry.getAddress(), "JobRegistry"),
    ensureContract(await stake.getAddress(), "StakeManager"),
    ensureContract(await validation.getAddress(), "ValidationModule"),
    ensureContract(await dispute.getAddress(), "DisputeModule"),
    ensureContract(await platformRegistry.getAddress(), "PlatformRegistry"),
    ensureContract(await feePool.getAddress(), "FeePool"),
    ensureContract(await reputation.getAddress(), "ReputationEngine"),
  ]);

  const SystemPause = await ethers.getContractFactory(
    "contracts/v2/SystemPause.sol:SystemPause"
  );
  const pause = await SystemPause.deploy(
    await registry.getAddress(),
    await stake.getAddress(),
    await validation.getAddress(),
    await dispute.getAddress(),
    await platformRegistry.getAddress(),
    await feePool.getAddress(),
    await reputation.getAddress(),
    deployer.address
  );
  await pause.waitForDeployment();
  await pause.setModules(
    await registry.getAddress(),
    await stake.getAddress(),
    await validation.getAddress(),
    await dispute.getAddress(),
    await platformRegistry.getAddress(),
    await feePool.getAddress(),
    await reputation.getAddress()
  );
  await stake.setGovernance(await pause.getAddress());
  await registry.setGovernance(await pause.getAddress());
  await validation.transferOwnership(await pause.getAddress());
  await dispute.transferOwnership(await pause.getAddress());
  await platformRegistry.transferOwnership(await pause.getAddress());
  await feePool.transferOwnership(await pause.getAddress());
  await reputation.transferOwnership(await pause.getAddress());

  console.log("Token:", tokenAddress);
  console.log("StakeManager:", await stake.getAddress());
  console.log("ReputationEngine:", await reputation.getAddress());
  console.log("IdentityRegistry:", await identity.getAddress());
  console.log("JobRegistry:", await registry.getAddress());
  console.log("DisputeModule:", await dispute.getAddress());
  console.log("CertificateNFT:", await nft.getAddress());
  console.log("SystemPause:", await pause.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
