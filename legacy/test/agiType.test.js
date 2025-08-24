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
    const types = await manager.getAGITypes();
    expect(types.length).to.equal(1);
    expect(types[0].nftAddress).to.equal(nftAddress);
    expect(types[0].payoutPercentage).to.equal(500n);

    await expect(manager.removeAGIType(nftAddress))
      .to.emit(manager, "AGITypeRemoved")
      .withArgs(nftAddress);

    await expect(manager.removeAGIType(nftAddress)).to.be.revertedWithCustomError(
      manager,
      "AGITypeNotFound"
    );
  });

  it("handles malicious NFT balanceOf revert", async function () {
    const { manager } = await deploy();
    const [agent] = await ethers.getSigners();

    const Mal = await ethers.getContractFactory("MaliciousERC721");
    const mal = await Mal.deploy();
    await mal.waitForDeployment();

    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.mint(agent.address);

    await manager.addAGIType(await mal.getAddress(), 1000);
    await manager.addAGIType(await nft.getAddress(), 500);

    expect(await manager.getHighestPayoutPercentage(agent.address)).to.equal(500);
  });

  it("updates max AGI types", async function () {
    const { manager } = await deploy();
    await expect(manager.setMaxAGITypes(100))
      .to.emit(manager, "MaxAGITypesUpdated")
      .withArgs(50n, 100n);
    expect(await manager.maxAGITypes()).to.equal(100n);
  });

  it("enforces AGI type cap", async function () {
    const { manager } = await deploy();
    const max = Number(await manager.maxAGITypes());

    for (let i = 0; i < max; i++) {
      await manager.addAGIType(ethers.Wallet.createRandom().address, 100);
    }

    await expect(
      manager.addAGIType(ethers.Wallet.createRandom().address, 100)
    ).to.be.revertedWithCustomError(manager, "MaxAGITypesReached");
  });
});
