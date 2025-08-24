const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Governable modules", function () {
  it("allows only governance to perform restricted actions", async function () {
    const [gov, other] = await ethers.getSigners();

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stake = await Stake.deploy(
      gov.address,
      ethers.ZeroAddress,
      0,
      0,
      0,
      gov.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stake.waitForDeployment();

    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const registry = await Registry.deploy(
      gov.address,
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
      gov.address,
      await registry.getAddress(),
      await stake.getAddress(),
      gov.address,
      0
    );
    await dispute.waitForDeployment();

    // Governance restricted calls
    await expect(stake.connect(other).setMinStake(1)).to.be.reverted;
    await stake.setMinStake(1);

    await expect(registry.connect(other).setFeePct(1)).to.be.reverted;
    await registry.setFeePct(1);

    await expect(dispute.connect(other).setModerator(other.address)).to.be
      .reverted;
    await dispute.setModerator(other.address);

    // Transfer governance
    await stake.transferGovernance(other.address);
    await expect(stake.setMinStake(2)).to.be.reverted;
    await stake.connect(other).setMinStake(2);
  });
});
