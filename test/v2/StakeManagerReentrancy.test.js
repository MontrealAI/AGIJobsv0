const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager reentrancy", function () {
  let owner, employer, agent, validator, treasury;
  let token, stakeManager, jobRegistry;

  beforeEach(async () => {
    [owner, employer, agent, validator, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/mocks/ReentrantERC206.sol:ReentrantERC206"
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

  it("guards finalizeJobFunds against reentrancy", async () => {
    const jobId = ethers.encodeBytes32String("job1");
    const reward = 100;
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    await jobRegistry.lockReward(jobId, employer.address, reward);

    await expect(
      jobRegistry.attackFinalize(jobId, agent.address, reward)
    ).to.be.revertedWithCustomError(
      stakeManager,
      "ReentrancyGuardReentrantCall"
    );
  });

  it("guards distributeValidatorRewards against reentrancy", async () => {
    const jobId = ethers.encodeBytes32String("job2");
    const amount = 100;

    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    const validation = await Validation.deploy();
    await validation.setValidators([validator.address]);
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), amount);
    await jobRegistry.lockReward(jobId, employer.address, amount);

    await expect(
      jobRegistry.attackValidator(jobId, amount)
    ).to.be.revertedWithCustomError(
      stakeManager,
      "ReentrancyGuardReentrantCall"
    );
  });
});

