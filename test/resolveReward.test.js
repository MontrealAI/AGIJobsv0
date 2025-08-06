const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [ , employer, agent, resolver, v1, v2, v3] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy();
  await token.waitForDeployment();

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
  await manager.addAdditionalValidator(v1.address);
  await manager.addAdditionalValidator(v2.address);
  await manager.addAdditionalValidator(v3.address);

  await manager.setTimingConfig(1, 1, 2, 1);
  await manager.setResolveRewardPercentage(200);

  return { token, manager, employer, agent, resolver };
}

describe("resolveStalledJob reward", function () {
  it("pays caller from escrow when resolving", async function () {
    const { token, manager, employer, agent, resolver } = await deployFixture();
    const payout = ethers.parseEther("10");
    await token.mint(employer.address, payout);
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1, "details");
    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    await time.increase(4);
    const resolverStart = await token.balanceOf(resolver.address);
    const employerStart = await token.balanceOf(employer.address);
    await expect(manager.connect(resolver).resolveStalledJob(jobId)).to.emit(
      manager,
      "StalledJobResolved"
    );
    const rewardBps = await manager.resolveRewardPercentage();
    const reward = (payout * rewardBps) / 10000n;
    expect(await token.balanceOf(resolver.address)).to.equal(resolverStart + reward);
    expect(await token.balanceOf(employer.address)).to.equal(
      employerStart + payout - reward
    );
  });
});
