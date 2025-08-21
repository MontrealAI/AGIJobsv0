const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, jobRegistry, seller, buyer] = await ethers.getSigners();

  const AGI = await ethers.getContractFactory(
    "contracts/AGIALPHAToken.sol:AGIALPHAToken"
  );
  const initialSupply = ethers.parseUnits("1000", 6);
  const token = await AGI.deploy("AGI ALPHA", "AGIA", initialSupply);
  const StakeManager = await ethers.getContractFactory(
    "contracts/StakeManager.sol:StakeManager"
  );
  const stakeManager = await StakeManager.deploy();
  await stakeManager.waitForDeployment();
  await stakeManager.setToken(await token.getAddress());

  const JobNFT = await ethers.getContractFactory("JobNFT");
  const nft = await JobNFT.deploy();
  await nft.waitForDeployment();
  await nft.setJobRegistry(jobRegistry.address);
  await nft.setStakeManager(await stakeManager.getAddress());

  // distribute tokens
  const price = ethers.parseUnits("1", 6);
  await token.transfer(seller.address, price);
  await token.transfer(buyer.address, price);

  return { nft, token, owner, jobRegistry, seller, buyer, price };
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

  it("allows only owner to set job registry", async function () {
    const { nft, jobRegistry, buyer } = await deployFixture();
    await expect(nft.connect(jobRegistry).setJobRegistry(buyer.address))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
      .withArgs(jobRegistry.address);
    await expect(nft.setJobRegistry(buyer.address))
      .to.emit(nft, "JobRegistryUpdated")
      .withArgs(buyer.address);
  });

  it("mints only via JobRegistry", async function () {
    const { nft, jobRegistry, seller } = await deployFixture();
    await expect(nft.connect(seller).mint(seller.address, 1)).to.be.revertedWith(
      "only JobRegistry"
    );
    await expect(nft.connect(jobRegistry).mint(seller.address, 1))
      .to.emit(nft, "NFTMinted")
      .withArgs(seller.address, 1);
    expect(await nft.ownerOf(1)).to.equal(seller.address);
  });

  it("prefixes tokenURI with base URI", async function () {
    const { nft, jobRegistry, seller } = await deployFixture();
    await nft.setBaseURI("ipfs://");
    await nft.connect(jobRegistry).mint(seller.address, 1);
    expect(await nft.tokenURI(1)).to.equal("ipfs://1");
  });

  it("lists, purchases and delists with $AGIALPHA", async function () {
    const { nft, token, jobRegistry, seller, buyer, price } = await deployFixture();

    await nft.connect(jobRegistry).mint(seller.address, 1);

    const sellerStart = await token.balanceOf(seller.address);
    const buyerStart = await token.balanceOf(buyer.address);

    await expect(nft.connect(seller).list(1, price))
      .to.emit(nft, "NFTListed")
      .withArgs(1, seller.address, price);

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
    expect(await token.balanceOf(buyer.address)).to.equal(buyerStart - price);

    await nft.connect(jobRegistry).mint(seller.address, 2);
    await expect(nft.connect(seller).list(2, price))
      .to.emit(nft, "NFTListed")
      .withArgs(2, seller.address, price);
    await expect(nft.connect(seller).delist(2))
      .to.emit(nft, "NFTDelisted")
      .withArgs(2);
    await expect(nft.connect(seller).delist(2)).to.be.revertedWith("not listed");
  });

  it("rejects invalid listings", async function () {
    const { nft, token, jobRegistry, seller, buyer, price } = await deployFixture();

    await nft.connect(jobRegistry).mint(seller.address, 1);

    await expect(nft.connect(buyer).list(1, price)).to.be.revertedWith("owner");
    await expect(nft.connect(seller).list(1, 0)).to.be.revertedWith("price");
    await expect(nft.connect(seller).list(1, price - 1n)).to.be.revertedWith(
      "decimals"
    );

    await expect(nft.connect(buyer).purchase(1)).to.be.revertedWith("not listed");

    await nft.connect(seller).list(1, price);
    await expect(nft.connect(buyer).delist(1)).to.be.revertedWith("owner");
    await expect(nft.connect(seller).list(1, price)).to.be.revertedWith("listed");

    await token.connect(buyer).approve(await nft.getAddress(), price);
    await expect(nft.connect(buyer).purchase(1))
      .to.emit(nft, "NFTPurchased")
      .withArgs(1, buyer.address, price);
  });

  it("guards purchase against reentrancy", async function () {
    const { nft, token, jobRegistry, seller, price } = await deployFixture();

    await nft.connect(jobRegistry).mint(seller.address, 1);
    await nft.connect(seller).list(1, price);

    const Reenter = await ethers.getContractFactory(
      "contracts/mocks/ReentrantBuyer.sol:ReentrantBuyer"
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

