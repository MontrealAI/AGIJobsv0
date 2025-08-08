const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateNFT", function () {
  let nft, owner, jobRegistry, user;

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
    );
    nft = await NFT.deploy("Cert", "CERT", owner.address);
    await nft.connect(owner).setJobRegistry(jobRegistry.address);
  });

  it("mints certificates only via JobRegistry", async () => {
    await expect(
      nft.connect(jobRegistry).mint(user.address, 1, "ipfs://job/1")
    )
      .to.emit(nft, "CertificateMinted")
      .withArgs(user.address, 1);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    expect(await nft.tokenURI(1)).to.equal("ipfs://job/1");
    await expect(
      nft.connect(owner).mint(user.address, 2, "ipfs://job/2")
    ).to.be.revertedWith("only JobRegistry");
  });
});
