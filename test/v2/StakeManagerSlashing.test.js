const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager slashing configuration", function () {
  const { AGIALPHA } = require("../../scripts/constants");
  let owner, treasury, token, stakeManager, router;

  beforeEach(async () => {
    [owner, treasury] = await ethers.getSigners();
    token = await ethers.getContractAt("contracts/test/AGIALPHAToken.sol:AGIALPHAToken", AGIALPHA);
    const Router = await ethers.getContractFactory(
      "contracts/v2/PaymentRouter.sol:PaymentRouter"
    );
    router = await Router.deploy(owner.address);

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      0,
      50,
      50,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address,
      await router.getAddress()
    );
  });

  it("rejects percentages that do not sum to 100", async () => {
    await expect(
      stakeManager.setSlashingPercentages(60, 30)
    ).to.be.revertedWithCustomError(stakeManager, "InvalidPercentage");
  });
});
