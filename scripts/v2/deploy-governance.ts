import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const governance = deployer.address;

  const Token = await ethers.getContractFactory(
    "contracts/mocks/MockERC20.sol:MockERC20"
  );
  const token = await Token.deploy();
  await token.waitForDeployment();

  const Stake = await ethers.getContractFactory(
    "contracts/v2/StakeManager.sol:StakeManager"
  );
  const stake = await Stake.deploy(
    governance,
    await token.getAddress(),
    0,
    0,
    0,
    governance,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await stake.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "contracts/v2/JobRegistry.sol:JobRegistry"
  );
  const registry = await Registry.deploy(
    governance,
    ethers.ZeroAddress,
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    []
  );
  await registry.waitForDeployment();

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/DisputeModule.sol:DisputeModule"
  );
  const dispute = await Dispute.deploy(
    governance,
    await registry.getAddress(),
    await stake.getAddress(),
    governance,
    0
  );
  await dispute.waitForDeployment();

  console.log("StakeManager:", await stake.getAddress());
  console.log("JobRegistry:", await registry.getAddress());
  console.log("DisputeModule:", await dispute.getAddress());

  await registry.setFeePct(1);
  await dispute.setModerator(governance);
  console.log("Governance actions executed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
