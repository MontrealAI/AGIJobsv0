const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT', function () {
  let nft, owner, jobRegistry, user;
  const baseURI = 'ipfs://complete-certificates/';

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
    await nft.connect(owner).setJobRegistry(jobRegistry.address);
  });

  it('mints certificates only via JobRegistry', async () => {
    const uri = `${baseURI}1.json`;
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await nft.connect(owner).setBaseURI(baseURI);
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uriHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, uriHash);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    const hash = await nft.tokenHashes(1);
    expect(hash).to.equal(uriHash);
    expect(await nft.tokenURI(1)).to.equal(uri);
    await expect(
      nft.connect(owner).setBaseURI(`${baseURI}override/`)
    ).to.be.revertedWithCustomError(nft, 'BaseURIAlreadySet');
    await expect(
      nft
        .connect(owner)
        .mint(
          user.address,
          2,
          ethers.keccak256(ethers.toUtf8Bytes(`${baseURI}2.json`))
        )
    ).to.be.revertedWith('only JobRegistry');
  });

  it('reverts when querying metadata before base URI configuration', async () => {
    const uri = `${baseURI}1.json`;
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uriHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, uriHash);
    await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(
      nft,
      'BaseURINotSet'
    );
  });

  it('validates base URI formatting and batch size bounds', async () => {
    await expect(
      nft.connect(owner).setBaseURI('https://example/')
    ).to.be.revertedWithCustomError(nft, 'InvalidBaseURI');
    await expect(
      nft.connect(owner).setBaseURI('ipfs://missing-trailing-slash')
    ).to.be.revertedWithCustomError(nft, 'InvalidBaseURI');
    await nft.connect(owner).setBaseURI(baseURI);

    const recipients = [user.address, jobRegistry.address];
    const jobIds = [1, 2];
    const uriHashes = jobIds.map((id) =>
      ethers.keccak256(ethers.toUtf8Bytes(`${baseURI}${id}.json`))
    );
    await expect(
      nft.connect(jobRegistry).mintBatch(recipients, jobIds, uriHashes)
    )
      .to.emit(nft, 'CertificateMinted')
      .withArgs(jobRegistry.address, 2, uriHashes[1]);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    expect(await nft.ownerOf(2)).to.equal(jobRegistry.address);

    const maxBatch = Number(await nft.MAX_BATCH_MINT());
    const overflow = maxBatch + 1;
    const overflowRecipients = Array.from({ length: overflow }, () => user.address);
    const overflowJobIds = Array.from({ length: overflow }, (_, i) => i + 3);
    const overflowHashes = overflowJobIds.map((id) =>
      ethers.keccak256(ethers.toUtf8Bytes(`${baseURI}${id}.json`))
    );
    await expect(
      nft
        .connect(jobRegistry)
        .mintBatch(overflowRecipients, overflowJobIds, overflowHashes)
    )
      .to.be.revertedWithCustomError(nft, 'BatchSizeExceeded')
      .withArgs(overflow, maxBatch);

    await expect(
      nft
        .connect(jobRegistry)
        .mintBatch([user.address], [999, 1000], [ethers.ZeroHash])
    ).to.be.revertedWithCustomError(nft, 'ArrayLengthMismatch');
  });
});
