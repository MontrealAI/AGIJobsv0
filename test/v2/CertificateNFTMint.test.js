const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateNFT minting", function () {
  let owner, jobRegistry, user, nft;

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    nft = await NFT.deploy("Cert", "CERT");
    await nft.setJobRegistry(jobRegistry.address);
  });

  it("mints with jobId tokenId and enforces registry and URI", async () => {
    await expect(
      nft.connect(jobRegistry).mint(user.address, 1, "ipfs://1")
    )
      .to.emit(nft, "CertificateMinted")
      .withArgs(user.address, 1);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    expect(await nft.tokenURI(1)).to.equal("ipfs://1");

    await expect(
      nft.connect(jobRegistry).mint(user.address, 2, "")
    ).to.be.revertedWithCustomError(nft, "EmptyURI");

    await expect(
      nft.connect(owner).mint(user.address, 3, "ipfs://3")
    ).to.be.revertedWithCustomError(nft, "NotJobRegistry").withArgs(
      owner.address
    );
  });

  it("updates base URI and emits event", async () => {
    await nft.connect(jobRegistry).mint(user.address, 1, "1");
    await expect(nft.setBaseURI("https://base/"))
      .to.emit(nft, "BaseURIUpdated")
      .withArgs("https://base/");
    expect(await nft.tokenURI(1)).to.equal("https://base/1");
  });
});
