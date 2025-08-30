const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager pause", function () {
  const { AGIALPHA } = require("../../scripts/constants");
  let owner, user, token, stakeManager;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    token = await ethers.getContractAt("contracts/v2/AGIALPHAToken.sol:AGIALPHAToken", AGIALPHA);
    const MockRegistry = await ethers.getContractFactory(
      "contracts/legacy/MockV2.sol:MockJobRegistry"
    );
    const mockReg = await MockRegistry.deploy();
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      owner.address,
      await mockReg.getAddress(),
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(0);
    await token.mint(user.address, 1000);
    await token.connect(user).approve(await stakeManager.getAddress(), 1000);
  });

  it("pauses deposits and withdrawals", async () => {
    await stakeManager.connect(owner).pause();
    await expect(
      stakeManager.connect(user).depositStake(0, 100)
    ).to.be.revertedWithCustomError(stakeManager, "EnforcedPause");

    await stakeManager.connect(owner).unpause();
    await stakeManager.connect(user).depositStake(0, 100);

    await stakeManager.connect(owner).pause();
    await expect(
      stakeManager.connect(user).withdrawStake(0, 100)
    ).to.be.revertedWithCustomError(stakeManager, "EnforcedPause");

    await stakeManager.connect(owner).unpause();
    await stakeManager.connect(user).withdrawStake(0, 100);
  });
});
