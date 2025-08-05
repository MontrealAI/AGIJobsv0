const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AGIJobManagerV1 AGI types", function () {
  async function deploy() {
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

    return { manager };
  }

  it("adds and removes AGI types", async function () {
    const { manager } = await deploy();
    const nftAddress = await manager.getAddress();

    await manager.addAGIType(nftAddress, 500);

    await expect(manager.removeAGIType(nftAddress))
      .to.emit(manager, "AGITypeRemoved")
      .withArgs(nftAddress);

    await expect(manager.removeAGIType(nftAddress)).to.be.revertedWithCustomError(
      manager,
      "AGITypeNotFound"
    );
  });
});
