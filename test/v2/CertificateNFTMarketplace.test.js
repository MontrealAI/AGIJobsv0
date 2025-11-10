const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');

describe('CertificateNFT marketplace', function () {
  const price = ethers.parseUnits('1', AGIALPHA_DECIMALS);
  let owner, seller, buyer, token, stake, nft;

  beforeEach(async () => {
    [owner, seller, buyer] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    await token.mint(buyer.address, price);
    await token.mint(seller.address, price);
    await token.mint(owner.address, price);

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stake = await Stake.deploy(
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stake.setMinStake(1);

    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
    await nft.setJobRegistry(owner.address);
    await nft.setStakeManager(await stake.getAddress());
    await nft.setBaseURI('ipfs://certificates/');

    await nft.mint(
      seller.address,
      1,
      ethers.keccak256(ethers.toUtf8Bytes('ipfs://1'))
    );
  });

  it('lists, purchases, and delists with events', async () => {
    const sellerStart = await token.balanceOf(seller.address);
    const buyerStart = await token.balanceOf(buyer.address);

    await expect(nft.connect(seller).list(1, price))
      .to.emit(nft, 'NFTListed')
      .withArgs(1, seller.address, price);

    await expect(
      nft.connect(seller).list(1, price)
    ).to.be.revertedWithCustomError(nft, 'AlreadyListed');

    await expect(nft.connect(buyer).purchase(1)).to.be.revertedWithCustomError(
      nft,
      'InsufficientAllowance'
    );

    await token.connect(buyer).approve(await nft.getAddress(), price);
    await expect(nft.connect(buyer).purchase(1))
      .to.emit(nft, 'NFTPurchased')
      .withArgs(1, buyer.address, price);
    expect(await nft.ownerOf(1)).to.equal(buyer.address);

    expect(await token.balanceOf(seller.address)).to.equal(sellerStart + price);
    expect(await token.balanceOf(buyer.address)).to.equal(buyerStart - price);

    await nft.mint(
      seller.address,
      2,
      ethers.keccak256(ethers.toUtf8Bytes('ipfs://2'))
    );
    await nft.connect(seller).list(2, price);
    await expect(nft.connect(seller).delist(2))
      .to.emit(nft, 'NFTDelisted')
      .withArgs(2);
  });

  it('rejects invalid listings', async () => {
    await expect(
      nft.connect(buyer).list(1, price)
    ).to.be.revertedWithCustomError(nft, 'NotTokenOwner');
    await expect(nft.connect(seller).list(1, 0)).to.be.revertedWithCustomError(
      nft,
      'InvalidPrice'
    );

    await expect(nft.connect(buyer).purchase(1)).to.be.revertedWithCustomError(
      nft,
      'NotListed'
    );

    await nft.connect(seller).list(1, price);
    await expect(nft.connect(buyer).delist(1)).to.be.revertedWithCustomError(
      nft,
      'NotTokenOwner'
    );
    await expect(
      nft.connect(seller).list(1, price)
    ).to.be.revertedWithCustomError(nft, 'AlreadyListed');
  });

  it('cleans stale listings on transfer so the new owner can manage again', async () => {
    await nft.connect(seller).list(1, price);
    await nft
      .connect(seller)
      ['safeTransferFrom(address,address,uint256)'](
        seller.address,
        buyer.address,
        1
      );

    const staleListing = await nft.listings(1);
    expect(staleListing.active).to.equal(true);
    expect(staleListing.seller).to.equal(seller.address);

    const newPrice = price * 2n;
    await expect(nft.connect(buyer).list(1, newPrice))
      .to.emit(nft, 'NFTListed')
      .withArgs(1, buyer.address, newPrice);

    const refreshedListing = await nft.listings(1);
    expect(refreshedListing.active).to.equal(true);
    expect(refreshedListing.seller).to.equal(buyer.address);
    expect(refreshedListing.price).to.equal(newPrice);

    await expect(nft.connect(buyer).delist(1))
      .to.emit(nft, 'NFTDelisted')
      .withArgs(1);
  });

  it('lets the current owner delist stale listings after a transfer', async () => {
    await nft.connect(seller).list(1, price);
    await nft
      .connect(seller)
      ['safeTransferFrom(address,address,uint256)'](
        seller.address,
        buyer.address,
        1
      );

    await expect(nft.connect(buyer).delist(1))
      .to.emit(nft, 'NFTDelisted')
      .withArgs(1);

    const clearedListing = await nft.listings(1);
    expect(clearedListing.active).to.equal(false);

    const relistPrice = price * 3n;
    await expect(nft.connect(buyer).list(1, relistPrice))
      .to.emit(nft, 'NFTListed')
      .withArgs(1, buyer.address, relistPrice);
  });

  it('rejects purchase after delisting', async () => {
    await nft.connect(seller).list(1, price);
    await nft.connect(seller).delist(1);
    await token.connect(buyer).approve(await nft.getAddress(), price);
    await expect(nft.connect(buyer).purchase(1)).to.be.revertedWithCustomError(
      nft,
      'NotListed'
    );
  });

  it('prevents self purchase', async () => {
    await nft.connect(seller).list(1, price);
    await token.connect(seller).approve(await nft.getAddress(), price);
    await expect(nft.connect(seller).purchase(1)).to.be.revertedWithCustomError(
      nft,
      'SelfPurchase'
    );
  });

  it('pauses and unpauses marketplace actions', async () => {
    await expect(nft.connect(seller).pause())
      .to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount')
      .withArgs(seller.address);

    await nft.connect(owner).pause();
    await expect(
      nft.connect(seller).list(1, price)
    ).to.be.revertedWithCustomError(nft, 'EnforcedPause');

    await nft.connect(owner).unpause();
    await nft.connect(seller).list(1, price);
    await token.connect(buyer).approve(await nft.getAddress(), price);

    await nft.connect(owner).pause();
    await expect(nft.connect(buyer).purchase(1)).to.be.revertedWithCustomError(
      nft,
      'EnforcedPause'
    );
    await expect(nft.connect(seller).delist(1)).to.be.revertedWithCustomError(
      nft,
      'EnforcedPause'
    );

    await nft.connect(owner).unpause();
    await expect(nft.connect(buyer).purchase(1))
      .to.emit(nft, 'NFTPurchased')
      .withArgs(1, buyer.address, price);

    await nft.mint(
      seller.address,
      2,
      ethers.keccak256(ethers.toUtf8Bytes('ipfs://2'))
    );
    await nft.connect(seller).list(2, price);
    await nft.connect(owner).pause();
    await expect(nft.connect(seller).delist(2)).to.be.revertedWithCustomError(
      nft,
      'EnforcedPause'
    );
    await nft.connect(owner).unpause();
    await expect(nft.connect(seller).delist(2))
      .to.emit(nft, 'NFTDelisted')
      .withArgs(2);
  });

  it('guards purchase against reentrancy', async () => {
    await nft.connect(seller).list(1, price);

    const Reenter = await ethers.getContractFactory(
      'contracts/legacy/ReentrantBuyer.sol:ReentrantBuyer'
    );
    const attacker = await Reenter.deploy(await nft.getAddress());

    await token.transfer(await attacker.getAddress(), price);
    await attacker.approveToken(await token.getAddress(), price);

    await expect(attacker.buy(1))
      .to.emit(nft, 'NFTPurchased')
      .withArgs(1, await attacker.getAddress(), price);
    expect(await nft.ownerOf(1)).to.equal(await attacker.getAddress());
  });

  it('exposes deterministic metadata with an immutable base URI', async () => {
    expect(await nft.tokenURI(1)).to.equal('ipfs://certificates/1');

    await expect(nft.updateBaseURI('ipfs://certificates-v2/'))
      .to.emit(nft, 'BaseURIUpdated')
      .withArgs('ipfs://certificates/', 'ipfs://certificates-v2/');
    expect(await nft.tokenURI(1)).to.equal('ipfs://certificates-v2/1');

    await expect(nft.lockBaseURI())
      .to.emit(nft, 'BaseURILocked')
      .withArgs('ipfs://certificates-v2/');

    await expect(nft.updateBaseURI('ipfs://certificates-v3/')).to.be.revertedWithCustomError(
      nft,
      'BaseURIAlreadyLocked'
    );
    await expect(nft.lockBaseURI()).to.be.revertedWithCustomError(
      nft,
      'BaseURIAlreadyLocked'
    );
    await expect(nft.setBaseURI('ipfs://other/')).to.be.revertedWithCustomError(
      nft,
      'BaseURIAlreadySet'
    );
  });
});
