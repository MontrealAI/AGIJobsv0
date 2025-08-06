const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [owner, employer, agent, validator, moderator] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("ReentrantERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();
  await token.mint(employer.address, ethers.parseEther("1000"));

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

  await manager.setRequiredValidatorApprovals(1);
  await manager.setRequiredValidatorDisapprovals(1);
  await manager.setReviewWindow(7200);
  await manager.setCommitRevealWindows(1000, 1000);
  await manager.setReviewWindow(2000);
  await manager.addAdditionalAgent(agent.address);
  await manager.addAdditionalValidator(validator.address);
  await manager.setValidatorsPerJob(1);
  await manager.addModerator(moderator.address);
  await manager.addModerator(await token.getAddress());

  const stakeAmount = ethers.parseEther("100");
  await token.mint(agent.address, stakeAmount);
  await token.connect(agent).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(agent).stakeAgent(stakeAmount);

  return { token, manager, owner, employer, agent, validator, moderator };
}

describe("Finalization reentrancy", function () {
  it("guards finalization via validateJob", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("reentrancy1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator.address, jobId, true, salt]
    );
    await manager
      .connect(validator)
      .commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator).revealValidation(jobId, true, salt);
    await time.increase(1000);
    await token.setAttack(await manager.getAddress(), jobId);
    await expect(
      manager.connect(validator).validateJob(jobId, "", [])
    ).to.be.revertedWithCustomError(manager, "ReentrancyGuardReentrantCall");
  });

  it("guards finalization via resolveDispute", async function () {
    const { token, manager, employer, agent, moderator } = await deployFixture();
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    await time.increase(3001); // pass commit, reveal and review windows
    await manager.connect(agent).disputeJob(jobId);
    await token.setAttack(await manager.getAddress(), jobId);
    await expect(
      manager
        .connect(moderator)
        .resolveDispute(jobId, 0) // AgentWin
    ).to.be.revertedWithCustomError(manager, "ReentrancyGuardReentrantCall");
  });
});
