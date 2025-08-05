const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture(burnPct = 1000) {
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
  await manager.setBurnPercentage(burnPct);
  await manager.setReviewWindow(7200);
  await manager.setCommitRevealWindows(1000, 1000);
  await manager.setReviewWindow(2000);
  await manager.addAdditionalAgent(agent.address);
  await manager.addAdditionalValidator(validator.address);

  return { token, manager, owner, employer, agent, validator };
}

describe("Burn configuration", function () {
  it("burns a portion of payout when job is finalized", async function () {
    const { token, manager, employer, agent, validator } = await deployFixture();
    const payout = ethers.parseEther("1000");
    await token.connect(employer).approve(await manager.getAddress(), payout);
    await manager.connect(employer).createJob("jobhash", payout, 1000, "details");

    const jobId = 0;
    await manager.connect(agent).applyForJob(jobId, "", []);
    await manager.connect(agent).requestJobCompletion(jobId, "result");
    const salt = ethers.id("burn1");
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
    await manager.connect(validator).validateJob(jobId, "", []);

    const burnAmount = (payout * 1000n) / 10000n;
    const burnAddr = await manager.burnAddress();
    expect(await token.balanceOf(burnAddr)).to.equal(burnAmount);
  });

  it("restricts burn address updates to owner and emits event", async function () {
    const { manager, employer } = await deployFixture();
    const newAddress = ethers.getAddress("0x000000000000000000000000000000000000BEEF");

    await expect(manager.connect(employer).setBurnAddress(newAddress))
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(manager.setBurnAddress(newAddress))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddress);
  });

  it("restricts burn percentage updates to owner and emits event", async function () {
    const { manager, employer } = await deployFixture();
    const newPercentage = 500;

    await expect(manager.connect(employer).setBurnPercentage(newPercentage))
      .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);

    await expect(manager.setBurnPercentage(newPercentage))
      .to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPercentage);
  });

  it("allows owner to update burn config atomically", async function () {
    const { manager } = await deployFixture();
    const newAddress = ethers.getAddress("0x000000000000000000000000000000000000BEEF");
    const newPercentage = 750;

    await expect(manager.setBurnConfig(newAddress, newPercentage))
      .to.emit(manager, "BurnAddressUpdated")
      .withArgs(newAddress)
      .and.to.emit(manager, "BurnPercentageUpdated")
      .withArgs(newPercentage);

    expect(await manager.burnAddress()).to.equal(newAddress);
    expect(await manager.burnPercentage()).to.equal(newPercentage);
  });
});
