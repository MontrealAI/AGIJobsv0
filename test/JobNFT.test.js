const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, jobRegistry, user] = await ethers.getSigners();
  const JobNFT = await ethers.getContractFactory("JobNFT");
  const nft = await JobNFT.deploy("Job", "JOB", owner.address);
  await nft.waitForDeployment();
  await nft.setJobRegistry(jobRegistry.address);
  return { nft, owner, jobRegistry, user };
}

describe("JobNFT", function () {
  it("allows only owner to set base URI", async function () {
    const { nft, jobRegistry } = await deployFixture();
    await expect(nft.connect(jobRegistry).setBaseURI("ipfs://"))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
      .withArgs(jobRegistry.address);
    await expect(nft.setBaseURI("ipfs://"))
      .to.emit(nft, "BaseURIUpdated")
      .withArgs("ipfs://");
  });

  it("mints and burns only via JobRegistry", async function () {
    const { nft, jobRegistry, user } = await deployFixture();
    await expect(nft.connect(user).mint(user.address, "job1.json"))
      .to.be.revertedWith("only JobRegistry");
    await nft.connect(jobRegistry).mint(user.address, "job1.json");
    const tokenId = await nft.nextTokenId();

    expect(await nft.ownerOf(tokenId)).to.equal(user.address);
    await nft.connect(jobRegistry).burn(tokenId);
    await expect(nft.ownerOf(tokenId)).to.be.revertedWithCustomError(
      nft,
      "ERC721NonexistentToken"
    ).withArgs(tokenId);
  });

  it("prefixes tokenURI with base URI", async function () {
    const { nft, jobRegistry, user } = await deployFixture();
    await nft.setBaseURI("ipfs://");
    await nft.connect(jobRegistry).mint(user.address, "job1.json");
    const tokenId = await nft.nextTokenId();

    expect(await nft.tokenURI(tokenId)).to.equal("ipfs://job1.json");
  });
});
