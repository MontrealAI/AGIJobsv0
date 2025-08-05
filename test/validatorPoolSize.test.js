const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("maxValidatorPoolSize", function () {
  async function deployFixture() {
    const [owner, v1, v2, v3] = await ethers.getSigners();

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

    return { manager, owner, v1, v2, v3 };
  }

  it("reverts when adding a validator beyond the max", async function () {
    const { manager, v1, v2, v3 } = await deployFixture();
    await manager.setMaxValidatorPoolSize(2);
    await manager.addAdditionalValidator(v1.address);
    await manager.addAdditionalValidator(v2.address);
    await expect(
      manager.addAdditionalValidator(v3.address)
    ).to.be.revertedWithCustomError(manager, "ValidatorPoolFull");
  });

  it("reverts when setting a pool larger than the max", async function () {
    const { manager, v1, v2, v3 } = await deployFixture();
    await manager.setMaxValidatorPoolSize(2);
    await expect(
      manager.setValidatorPool([v1.address, v2.address, v3.address])
    ).to.be.revertedWithCustomError(manager, "ValidatorPoolFull");
  });
});
