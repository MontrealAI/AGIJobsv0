const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("slashUnrevealedVotes", function () {
  async function deployFixture() {
    const [owner, employer, agent, validator] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy();
    await token.waitForDeployment();
    await token.mint(employer.address, ethers.parseEther("1000"));
    await token.mint(validator.address, ethers.parseEther("100"));

    const ENSMock = await ethers.getContractFactory("MockENS");
    const ens = await ENSMock.deploy();
    await ens.waitForDeployment();

    const WrapperMock = await ethers.getContractFactory("MockNameWrapper");
    const wrapper = await WrapperMock.deploy();
    await wrapper.waitForDeployment();

    const Manager = await ethers.getContractFactory("AGIJobManagerV1");
    const manager = await Manager.deploy(
      await token.getAddress(),
      "ipfs://",
      await ens.getAddress(),
      await wrapper.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash,
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await manager.waitForDeployment();

    await manager.setCommitRevealWindows(100, 100);
    await manager.setReviewWindow(300);
    await manager.setSlashingPercentage(1000); // 10%
    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator.address);
    await manager.setValidatorsPerJob(1);

    return { token, manager, owner, employer, agent, validator };
  }

  it("slashes stake and reputation for unrevealed commits", async function () {
    const { token, manager, owner, employer, agent, validator } = await deployFixture();

    const stakeAmount = ethers.parseEther("10");
    await token.connect(validator).approve(await manager.getAddress(), stakeAmount);
    await manager.connect(validator).stake(stakeAmount);

    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;

    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    const salt = ethers.id("secret");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);

    await time.increase(201); // pass commit and reveal windows

    const expectedSlash = (stakeAmount * 1000n) / 10000n;
    const ownerBalanceBefore = await token.balanceOf(owner.address);

    await expect(manager.slashUnrevealedVotes(jobId))
      .to.emit(manager, "UnrevealedVoteSlashed")
      .withArgs(validator.address, expectedSlash);

    expect(await token.balanceOf(owner.address)).to.equal(
      ownerBalanceBefore + expectedSlash
    );
    expect(await manager.validatorStake(validator.address)).to.equal(
      stakeAmount - expectedSlash
    );
    expect(await manager.pendingCommits(validator.address)).to.equal(0);
  });
});
