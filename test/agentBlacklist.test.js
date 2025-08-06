const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [owner, employer, agent] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
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

  await manager.addAdditionalAgent(agent.address);
  await manager.setAgentStakeRequirement(ethers.parseEther("100"));
  await manager.setValidatorSlashingPercentage(2000);
  await manager.setAgentSlashingPercentage(0);

  await manager.connect(agent).acceptTerms("ipfs://terms");

  const stake = ethers.parseEther("100");
  await token.mint(agent.address, stake);
  await token.connect(agent).approve(await manager.getAddress(), stake);
  await manager.connect(agent).stakeAgent(stake);

  return { token, manager, employer, agent };
}

describe("Agent blacklist threshold", function () {
  it("blacklists an agent after three penalties", async function () {
    const { token, manager, employer, agent } = await deployFixture();
    const payout = ethers.parseEther("10");

    for (let i = 0; i < 3; i++) {
      await token.connect(employer).approve(await manager.getAddress(), payout);
      await manager.connect(employer).createJob("jobhash", payout, 1, "details");
      await manager.connect(agent).applyForJob(i, "", []);
      await time.increase(2);
      if (i < 2) {
        await manager.cancelExpiredJob(i);
        expect(await manager.blacklistedAgents(agent.address)).to.equal(false);
      } else {
        await expect(manager.cancelExpiredJob(i))
          .to.emit(manager, "AgentBlacklisted")
          .withArgs(agent.address, true);
      }
    }

    expect(await manager.agentPenaltyCount(agent.address)).to.equal(3n);
    expect(await manager.blacklistedAgents(agent.address)).to.equal(true);

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash3", payout, 1, "details");
    await expect(
      manager.connect(agent).applyForJob(3, "", [])
    ).to.be.revertedWithCustomError(manager, "Unauthorized");
  });
});
