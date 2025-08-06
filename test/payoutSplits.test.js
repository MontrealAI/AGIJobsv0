const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("payout split validation", function () {
  async function deployFixture() {
    const [owner] = await ethers.getSigners();

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

    return { manager, owner };
  }

  it("reverts when burn and validation reward exceed 100%", async function () {
    const { manager } = await deployFixture();
    await expect(manager.setBurnPercentage(9500)).to.be.revertedWithCustomError(
      manager,
      "InvalidPercentageCombination"
    );
  });

  it("reverts when validation reward and burn exceed 100%", async function () {
    const { manager } = await deployFixture();
    await expect(
      manager.setValidationRewardPercentage(9800)
    ).to.be.revertedWithCustomError(manager, "InvalidPercentageCombination");
  });

  it("reverts when validator config percentages exceed combined limit", async function () {
    const { manager, owner } = await deployFixture();
    await expect(
      manager.setValidatorConfig(
        9800,
        100,
        0,
        100,
        0,
        0,
        1,
        1,
        owner.address,
        1,
        1,
        3,
        1
      )
    ).to.be.revertedWithCustomError(manager, "InvalidPercentageCombination");
  });

  it("allows updates when combined percentages are within limit", async function () {
    const { manager, owner } = await deployFixture();
    await expect(manager.setBurnPercentage(2000)).to.emit(
      manager,
      "BurnPercentageUpdated"
    ).withArgs(2000);
    await expect(manager.setValidationRewardPercentage(7000)).to.emit(
      manager,
      "ValidationRewardPercentageUpdated"
    ).withArgs(7000);
    await expect(
      manager.setValidatorConfig(
        400,
        100,
        0,
        100,
        0,
        0,
        1,
        1,
        owner.address,
        1,
        1,
        3,
        1
      )
    ).to.emit(manager, "ValidatorConfigUpdated");
  });

  it("returns current payout configuration", async function () {
    const { manager } = await deployFixture();
    const initial = await manager.getPayoutConfig();
    expect(initial.burnPct).to.equal(500n);
    expect(initial.validationRewardPct).to.equal(800n);
    expect(initial.cancelRewardPct).to.equal(100n);
    expect(initial.resolveRewardPct).to.equal(100n);
    expect(initial.burnAddr).to.equal(await manager.BURN_ADDRESS());

    const newBurnAddr = ethers.Wallet.createRandom().address;
    await manager.setBurnConfig(newBurnAddr, 1000);
    await manager.setValidationRewardPercentage(700);
    await manager.setCancelRewardPercentage(200);
    await manager.setResolveRewardPercentage(300);

    const updated = await manager.getPayoutConfig();
    expect(updated.burnPct).to.equal(1000n);
    expect(updated.validationRewardPct).to.equal(700n);
    expect(updated.cancelRewardPct).to.equal(200n);
    expect(updated.resolveRewardPct).to.equal(300n);
    expect(updated.burnAddr).to.equal(newBurnAddr);
  });
});
