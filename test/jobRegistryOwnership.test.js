const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry ownership", function () {
  let owner, user, registry;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(
      "contracts/JobRegistry.sol:JobRegistry"
    );
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("restricts configuration to owner", async () => {
    await expect(
      registry
        .connect(user)
        .setModules(
          user.address,
          user.address,
          user.address,
          user.address,
          user.address
        )
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(user.address);

    await expect(
      registry.connect(user).setJobParameters(1, 1)
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
  });
});
