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
    const uri = "ipfs://1";
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uri))
      .to.emit(nft, "CertificateMinted")
      .withArgs(user.address, 1, uri);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    const hash = await nft.tokenHashes(1);
    expect(hash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(uri)));

    await expect(
      nft.connect(jobRegistry).mint(user.address, 2, "")
    ).to.be.revertedWithCustomError(nft, "EmptyURI");

    await expect(
      nft.connect(owner).mint(user.address, 3, "ipfs://3")
    ).to.be.revertedWithCustomError(nft, "NotJobRegistry").withArgs(
      owner.address
    );
  });
});
