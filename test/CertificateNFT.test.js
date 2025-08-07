const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateNFT", function () {
  let nft, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("CertificateNFT");
    nft = await NFT.deploy("Cert", "CERT", owner.address);
  });

  it("mints certificates", async () => {
    await nft.connect(owner).setBaseURI("ipfs://base/");
    await nft.connect(owner).mint(user.address);
    const tokenId = await nft.nextId();
    expect(await nft.ownerOf(tokenId)).to.equal(user.address);
    expect(await nft.tokenURI(tokenId)).to.equal("ipfs://base/" + tokenId.toString());
  });
});

