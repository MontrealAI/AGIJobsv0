const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateNFT", function () {
  let nft, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
    );
    nft = await NFT.deploy("Cert", "CERT", owner.address);
  });

  it("mints certificates", async () => {
    await nft.connect(owner).setBaseURI("ipfs://base/");
    await nft.connect(owner).setJobRegistry(owner.address);
    await expect(
      nft.connect(owner).mintCertificate(user.address, 1, "")
    )
      .to.emit(nft, "CertificateMinted")
      .withArgs(user.address, 1);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    expect(await nft.tokenURI(1)).to.equal("ipfs://base/1");
  });

  it("allows owner to update token URI", async () => {
    await nft.connect(owner).setJobRegistry(owner.address);
    await nft.connect(owner).mintCertificate(user.address, 1, "ipfs://old");
    await nft.connect(owner).updateTokenURI(1, "ipfs://new");
    expect(await nft.tokenURI(1)).to.equal("ipfs://new");
  });
});

