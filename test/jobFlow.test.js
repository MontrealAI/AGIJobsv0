const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [owner, employer, agent, v1, v2] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();
  await token.mint(employer.address, ethers.parseEther("1000"));
  const ENSMock = await ethers.getContractFactory("MockENS");
  const ens = await ENSMock.deploy();
  await ens.waitForDeployment();
  const Wrapper = await ethers.getContractFactory("MockNameWrapper");
  const wrapper = await Wrapper.deploy();
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
  await manager.addAdditionalAgent(agent.address);
  await manager.addAdditionalValidator(v1.address);
  await manager.addAdditionalValidator(v2.address);
  await manager.connect(agent).acceptTerms("ipfs://terms");
  await manager.connect(v1).acceptTerms("ipfs://terms");
  await manager.connect(v2).acceptTerms("ipfs://terms");
  await manager.connect(employer).acceptTerms("ipfs://terms");
  await manager.setCommitRevealWindows(2, 3);
  await manager.setReviewWindow(10);
  await manager.setRequiredValidatorApprovals(1);
  await manager.setRequiredValidatorDisapprovals(2);
  await manager.setValidatorsPerJob(2);
  await manager.setValidatorSlashingPercentage(1000);
  await manager.setAgentSlashingPercentage(1000);
  await manager.addModerator(owner.address);
  const stake = ethers.parseEther("10");
  await token.mint(agent.address, stake);
  await token.connect(agent).approve(await manager.getAddress(), stake);
  await manager.connect(agent).stakeAgent(stake);
  await token.mint(v1.address, stake);
  await token.connect(v1).approve(await manager.getAddress(), stake);
  await manager.connect(v1).stake(stake);
  await token.mint(v2.address, stake);
  await token.connect(v2).approve(await manager.getAddress(), stake);
  await manager.connect(v2).stake(stake);
  return { token, manager, owner, employer, agent, v1, v2 };
}

describe("AGI job flow", function () {
  it("runs full flow and mints NFT", async function () {
    const { token, manager, employer, agent, v1, v2 } = await deployFixture();
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    await manager.connect(agent).applyForJob(0, "", []);
    const tx = await manager.connect(agent).requestJobCompletion(0, "result");
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ValidatorsSelected"
    );
    expect(event.args[1]).to.include.members([v1.address, v2.address]);
    const salt1 = ethers.id("v1");
    const commit1 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v1.address, 0, true, salt1]
    );
    const salt2 = ethers.id("v2");
    const commit2 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v2.address, 0, true, salt2]
    );
    await manager.connect(v1).commitValidation(0, commit1, "", []);
    await manager.connect(v2).commitValidation(0, commit2, "", []);
    await time.increase(1);
    await manager.connect(v1).revealValidation(0, true, salt1);
    await manager.connect(v2).revealValidation(0, true, salt2);
    await time.increase(6);
    await manager.connect(v1).validateJob(0, "", []);
    expect(await manager.balanceOf(employer.address)).to.equal(1n);
    expect(await manager.ownerOf(0)).to.equal(employer.address);
  });

  it("slashes incorrect validator vote", async function () {
    const { token, manager, employer, agent, v1, v2 } = await deployFixture();
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "result");
    const salt1 = ethers.id("a");
    const commit1 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v1.address, 0, true, salt1]
    );
    const salt2 = ethers.id("b");
    const commit2 = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool", "bytes32"],
      [v2.address, 0, false, salt2]
    );
    await manager.connect(v1).commitValidation(0, commit1, "", []);
    await manager.connect(v2).commitValidation(0, commit2, "", []);
    await time.increase(1);
    await manager.connect(v1).revealValidation(0, true, salt1);
    await manager.connect(v2).revealValidation(0, false, salt2);
    await time.increase(6);
    await manager.connect(v2).disapproveJob(0, "", []);
    const before = await manager.validatorStake(v2.address);
    await manager.connect(v1).validateJob(0, "", []);
    const after = await manager.validatorStake(v2.address);
    expect(before - after).to.equal(ethers.parseEther("1"));
  });

  it("resolves dispute and slashes agent", async function () {
    const { token, manager, owner, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("100");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");
    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "result");
    await time.increase(12);
    await manager.connect(employer).disputeJob(0);
    const before = await manager.agentStake(agent.address);
    await manager.connect(owner).resolveDispute(0, 1);
    const after = await manager.agentStake(agent.address);
    expect(before - after).to.equal(ethers.parseEther("1"));
    await expect(manager.ownerOf(0)).to.be.reverted;
  });
});

