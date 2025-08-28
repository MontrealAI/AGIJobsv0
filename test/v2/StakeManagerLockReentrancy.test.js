const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager lock reentrancy", function () {
  let owner, employer, treasury;
  let token, stakeManager, jobRegistry;

  beforeEach(async () => {
    [owner, employer, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/mocks/ReentrantERC777.sol:ReentrantERC777"
    );
    token = await Token.deploy();
    await token.mint(employer.address, 1000);

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      0,
      50,
      50,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(0);

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/mocks/ReentrantJobRegistry.sol:ReentrantJobRegistry"
    );
    jobRegistry = await JobRegistry.deploy(
      await stakeManager.getAddress(),
      await token.getAddress()
    );

    await token.setCaller(await jobRegistry.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
  });

  it("guards lock against reentrancy", async () => {
    const amount = 100;
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), amount);

    await expect(
      jobRegistry.attackLock(employer.address, amount)
    ).to.be.revertedWithCustomError(
      stakeManager,
      "ReentrancyGuardReentrantCall"
    );
  });
});

