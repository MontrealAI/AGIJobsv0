const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

async function deployFixture() {
  const [owner, employer, agent, validator1, validator2, validator3] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();

  await token.mint(employer.address, ethers.parseEther("1000"));
  const stakeAmount = ethers.parseEther("100");
  await token.mint(agent.address, stakeAmount);
  await token.mint(validator1.address, stakeAmount);
  await token.mint(validator2.address, stakeAmount);
  await token.mint(validator3.address, stakeAmount);

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

  await manager.setCommitRevealWindows(1000, 1000);
  await manager.setReviewWindow(2000);
  await manager.setValidatorsPerJob(3);
  await manager.setStakeRequirement(ethers.parseEther("100"));
  await manager.setSlashingPercentage(500);
  await manager.addAdditionalAgent(agent.address);
  await manager.addAdditionalValidator(validator1.address);
  await manager.addAdditionalValidator(validator2.address);
  await manager.addAdditionalValidator(validator3.address);

  await token.connect(agent).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(agent).stakeAgent(stakeAmount);
  await token.connect(validator1).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(validator1).stake(stakeAmount);
  await token.connect(validator2).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(validator2).stake(stakeAmount);
  await token.connect(validator3).approve(await manager.getAddress(), stakeAmount);
  await manager.connect(validator3).stake(stakeAmount);

  return { token, manager, owner, employer, agent, validator1, validator2, validator3, stakeAmount };
}

describe("finalizeStaleJob", function () {
  it("finalizes in favor of the agent and slashes inactive validators", async function () {
    const { token, manager, employer, agent, validator1, validator2, validator3, stakeAmount } = await deployFixture();
    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    const salt = ethers.id("stale1");
    const commitment = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [validator1.address, jobId, true, salt]
    );
    await manager.connect(validator1).commitValidation(jobId, commitment, "", []);
    await time.increase(1001);
    await manager.connect(validator1).revealValidation(jobId, true, salt);
    await time.increase(2000);

    await expect(manager.connect(employer).finalizeStaleJob(jobId)).to.emit(manager, "StaleJobFinalized").withArgs(jobId, true);

    const slashAmt = (stakeAmount * 500n) / 10000n;
    expect(await manager.validatorStake(validator2.address)).to.equal(stakeAmount - slashAmt);
    expect(await manager.validatorStake(validator3.address)).to.equal(stakeAmount - slashAmt);
    expect(await manager.validatorStake(validator1.address)).to.equal(stakeAmount);
    expect(await token.balanceOf(agent.address)).to.be.gt(0n);
  });

  it("refunds employer and slashes all validators when none participate", async function () {
    const { token, manager, owner, employer, agent, validator1, validator2, validator3, stakeAmount } = await deployFixture();
    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    await time.increase(3001);
    const employerBalance = await token.balanceOf(employer.address);
    await expect(manager.connect(employer).finalizeStaleJob(jobId)).to.emit(manager, "StaleJobFinalized").withArgs(jobId, false);
    expect(await token.balanceOf(employer.address)).to.equal(employerBalance + payout);

    const slashAmt = (stakeAmount * 500n) / 10000n;
    expect(await manager.validatorStake(validator1.address)).to.equal(stakeAmount - slashAmt);
    expect(await manager.validatorStake(validator2.address)).to.equal(stakeAmount - slashAmt);
    expect(await manager.validatorStake(validator3.address)).to.equal(stakeAmount - slashAmt);
    expect(await manager.agentStake(agent.address)).to.equal(stakeAmount - slashAmt);
    expect(await token.balanceOf(owner.address)).to.equal(slashAmt * 4n);
  });
});
