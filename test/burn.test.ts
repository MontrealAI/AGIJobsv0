const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, employer, agent, validator] = await ethers.getSigners();

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

  await manager.setRequiredValidatorApprovals(1);
  await manager.addAdditionalAgent(agent.address);
  await manager.addAdditionalValidator(validator.address);

  return { owner, employer, agent, validator, token, manager };
}

describe("burn mechanics", function () {
  it("burns the expected portion of funds on job finalization", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("100");

    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager
      .connect(employer)
      .createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");

    const burnPct = await manager.burnPercentage();
    const expectedBurn = (payout * burnPct) / 10_000n;

    await manager.connect(validator).validateJob(jobId, "", []);

    const burnAddr = await manager.burnAddress();
    expect(await token.balanceOf(burnAddr)).to.equal(expectedBurn);
  });

  it("updates burn percentage and emits event", async function () {
    const { manager } = await deployFixture();
    const newPct = 750;
    await expect(manager.setBurnPercentage(newPct))
      .to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPct);
    expect(await manager.burnPercentage()).to.equal(newPct);
  });

  it("updates burn address and emits event", async function () {
    const { manager } = await deployFixture();
    const newAddr = ethers.getAddress(
      "0x000000000000000000000000000000000000BEEF"
    );
    await expect(manager.setBurnAddress(newAddr))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddr);
    expect(await manager.burnAddress()).to.equal(newAddr);
  });

  it("updates burn config atomically and emits events", async function () {
    const { manager } = await deployFixture();
    const newAddr = ethers.getAddress(
      "0x000000000000000000000000000000000000BEEF"
    );
    const newPct = 250;
    await expect(manager.setBurnConfig(newAddr, newPct))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddr)
      .and.to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPct);
    expect(await manager.burnAddress()).to.equal(newAddr);
    expect(await manager.burnPercentage()).to.equal(newPct);
  });
});

