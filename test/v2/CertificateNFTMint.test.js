const { expect } = require('chai');
const { ethers } = require('hardhat');

const BASE_URI = 'ipfs://bafybeicert/';

describe('CertificateNFT minting', function () {
  let owner, jobRegistry, user, nft;

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
    await nft.setJobRegistry(jobRegistry.address);
  });

  it('mints with jobId tokenId and enforces registry and URI', async () => {
    const placeholder = ethers.keccak256(ethers.toUtf8Bytes('ipfs://1'));
    await expect(nft.connect(jobRegistry).mint(user.address, 1, placeholder))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, placeholder);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(
      nft,
      'BaseURINotSet'
    );

    await nft.setBaseURI(BASE_URI);
    const uri = `${BASE_URI}1`;
    expect(await nft.tokenURI(1)).to.equal(uri);

    await expect(
      nft.connect(jobRegistry).mint(user.address, 2, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(nft, 'EmptyURI');

    await expect(
      nft
        .connect(owner)
        .mint(user.address, 3, ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}3`)))
    )
      .to.be.revertedWithCustomError(nft, 'NotJobRegistry')
      .withArgs(owner.address);
  });

  it('locks the base URI and enforces IPFS prefix', async () => {
    await expect(nft.setBaseURI('https://example.com/metadata/'))
      .to.be.revertedWithCustomError(nft, 'InvalidBaseURI');

    await expect(nft.setBaseURI('ipfs://cid'))
      .to.be.revertedWithCustomError(nft, 'InvalidBaseURI');

    await expect(nft.setBaseURI(BASE_URI))
      .to.emit(nft, 'BaseURISet')
      .withArgs(BASE_URI);

    await expect(nft.setBaseURI(`${BASE_URI}next/`))
      .to.be.revertedWithCustomError(nft, 'BaseURIAlreadySet');
  });

  it('rejects mismatched metadata hashes and supports batch minting limits', async () => {
    await nft.setBaseURI(BASE_URI);
    const goodHash = ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}1`));
    await expect(
      nft.connect(jobRegistry).mint(
        user.address,
        1,
        ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}2`))
      )
    ).to.be.revertedWithCustomError(nft, 'MetadataHashMismatch');

    await expect(nft.connect(jobRegistry).mint(user.address, 1, goodHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, goodHash);

    const recipients = [user.address, user.address];
    const jobIds = [2n, 3n];
    const hashes = jobIds.map((id) =>
      ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}${id}`))
    );

    await expect(
      nft.connect(jobRegistry).mintBatch(recipients, jobIds, hashes)
    )
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 2, hashes[0]);

    const maxBatch = await nft.MAX_BATCH_MINT();
    const overSize = Number(maxBatch) + 1;
    const tooManyRecipients = Array(overSize).fill(user.address);
    const tooManyIds = Array.from({ length: overSize }, (_, idx) =>
      BigInt(idx + 4)
    );
    const tooManyHashes = tooManyIds.map((id) =>
      ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}${id}`))
    );

    await expect(
      nft.connect(jobRegistry).mintBatch(tooManyRecipients, tooManyIds, tooManyHashes)
    ).to.be.revertedWithCustomError(nft, 'BatchSizeTooLarge');

    await expect(
      nft.connect(jobRegistry).mintBatch([user.address], [10n, 11n], [hashes[0]])
    ).to.be.revertedWithCustomError(nft, 'ArrayLengthMismatch');
  });
});
