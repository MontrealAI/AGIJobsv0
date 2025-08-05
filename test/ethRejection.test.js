const { ethers } = require("hardhat");

describe("Ether rejection", function () {
  async function deployManager() {
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

  it("reverts when sending ETH directly", async function () {
    const { manager, owner } = await deployManager();
    await expect(
      owner.sendTransaction({ to: await manager.getAddress(), value: 1n })
    ).to.be.revertedWithCustomError(manager, "ETHNotAccepted");
  });
});
