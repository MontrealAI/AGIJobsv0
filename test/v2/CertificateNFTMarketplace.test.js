const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateNFT marketplace", function () {
  const price = ethers.parseUnits("1", 18);
  let owner, seller, buyer, token, stake, nft;

  beforeEach(async () => {
    [owner, seller, buyer] = await ethers.getSigners();

    const { AGIALPHA } = require("../../scripts/constants");
    token = await ethers.getContractAt("MockERC20", AGIALPHA);
    await token.mint(buyer.address, price);
    await token.mint(seller.address, price);
    await token.mint(owner.address, price);

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stake = await Stake.deploy(
      0,
      0,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stake.setMinStake(0);

    const NFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    nft = await NFT.deploy("Cert", "CERT");
    await nft.setJobRegistry(owner.address);
    await nft.setStakeManager(await stake.getAddress());

    await nft.mint(
      seller.address,
      1,
      ethers.keccak256(ethers.toUtf8Bytes("ipfs://1"))
    );
  });

  it("lists, purchases, and delists with events", async () => {
      const sellerStart = await token.balanceOf(seller.address);
      const buyerStart = await token.balanceOf(buyer.address);

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

      expect(await token.balanceOf(seller.address)).to.equal(
        sellerStart + price
      );
      expect(await token.balanceOf(buyer.address)).to.equal(
        buyerStart - price
      );

      await nft.mint(
        seller.address,
        2,
        ethers.keccak256(ethers.toUtf8Bytes("ipfs://2"))
      );
      await nft.connect(seller).list(2, price);
      await expect(nft.connect(seller).delist(2))
        .to.emit(nft, "NFTDelisted")
        .withArgs(2);
    });

  it("rejects invalid listings", async () => {
      await expect(nft.connect(buyer).list(1, price)).to.be.revertedWith(
        "owner"
      );
      await expect(nft.connect(seller).list(1, 0)).to.be.revertedWith("price");

      await expect(nft.connect(buyer).purchase(1)).to.be.revertedWith(
        "not listed"
      );

      await nft.connect(seller).list(1, price);
      await expect(nft.connect(buyer).delist(1)).to.be.revertedWith("owner");
      await expect(nft.connect(seller).list(1, price)).to.be.revertedWith(
        "listed"
      );
    });

  it("rejects purchase after delisting", async () => {
      await nft.connect(seller).list(1, price);
      await nft.connect(seller).delist(1);
      await token.connect(buyer).approve(await nft.getAddress(), price);
      await expect(nft.connect(buyer).purchase(1)).to.be.revertedWith(
        "not listed"
      );
    });

  it("prevents self purchase", async () => {
      await nft.connect(seller).list(1, price);
      await token.connect(seller).approve(await nft.getAddress(), price);
      await expect(nft.connect(seller).purchase(1)).to.be.revertedWith(
        "self"
      );
    });

  it("guards purchase against reentrancy", async () => {
      await nft.connect(seller).list(1, price);

      const Reenter = await ethers.getContractFactory(
        "contracts/legacy/ReentrantBuyer.sol:ReentrantBuyer"
      );
      const attacker = await Reenter.deploy(await nft.getAddress());

      await token.transfer(await attacker.getAddress(), price);
      await attacker.approveToken(await token.getAddress(), price);

      await expect(attacker.buy(1))
        .to.emit(nft, "NFTPurchased")
        .withArgs(1, await attacker.getAddress(), price);
      expect(await nft.ownerOf(1)).to.equal(await attacker.getAddress());
    });
});
