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
  await manager.setAgentSlashingPercentage(2000);

  const stake = ethers.parseEther("100");
  await token.mint(agent.address, stake);
  await token.connect(agent).approve(await manager.getAddress(), stake);
  await manager.connect(agent).stakeAgent(stake);

  return { token, manager, owner, employer, agent, stake };
}

describe("AGIJobManagerV1 expiration penalties", function () {
  it("slashes agent stake and reputation on expiration", async function () {
    const { token, manager, employer, agent, owner, stake } = await deployFixture();
    const payout = ethers.parseEther("10");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await time.increase(2);
    const ownerStart = await token.balanceOf(owner.address);
    await expect(manager.cancelExpiredJob(jobId))
      .to.emit(manager, "AgentPenalized");
    const slashAmount = (stake * 2000n) / 10000n;
    expect(await manager.agentStake(agent.address)).to.equal(stake - slashAmount);
    expect(await token.balanceOf(owner.address)).to.equal(ownerStart + slashAmount);
    expect(await token.balanceOf(agent.address)).to.equal(0n);
  });
});
