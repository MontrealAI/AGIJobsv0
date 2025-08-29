const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager slashing configuration", function () {
  let owner, treasury, token, stakeManager;

  beforeEach(async () => {
    [owner, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy();
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(0,
      50,
      50,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
  });

  it("rejects percentages that do not sum to 100", async () => {
    await expect(
      stakeManager.setSlashingPercentages(60, 30)
    ).to.be.revertedWith("pct");
  });
});
