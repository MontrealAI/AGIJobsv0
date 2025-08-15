const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateNFT marketplace", function () {
  const price = ethers.parseUnits("1", 6);
  let owner, seller, buyer, token, stake, nft;

  beforeEach(async () => {
    [owner, seller, buyer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/mocks/MockERC206Decimals.sol:MockERC206Decimals"
    );
    token = await Token.deploy();
    await token.mint(buyer.address, price);
    await token.mint(seller.address, price);

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stake = await Stake.deploy(
      await token.getAddress(),
      0,
      0,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );

    const NFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    nft = await NFT.deploy("Cert", "CERT");
    await nft.setJobRegistry(owner.address);
    await nft.setStakeManager(await stake.getAddress());

    await nft.mint(seller.address, 1, "ipfs://1");
  });

  it("lists, purchases, and delists with events", async () => {
    await expect(nft.connect(seller).list(1, price))
      .to.emit(nft, "NFTListed")
      .withArgs(1, seller.address, price);

    await expect(nft.connect(seller).list(1, price)).to.be.revertedWith(
      "listed"
    );

    await expect(nft.connect(buyer).purchase(1)).to.be.revertedWith(
      "allowance"
    );

    await token.connect(buyer).approve(await nft.getAddress(), price);
    await expect(nft.connect(buyer).purchase(1))
      .to.emit(nft, "NFTPurchased")
      .withArgs(1, buyer.address, price);
    expect(await nft.ownerOf(1)).to.equal(buyer.address);

    await nft.mint(seller.address, 2, "ipfs://2");
    await nft.connect(seller).list(2, price);
    await expect(nft.connect(seller).delist(2))
      .to.emit(nft, "NFTDelisted")
      .withArgs(2);
  });
});
