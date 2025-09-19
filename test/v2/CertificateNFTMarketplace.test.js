const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT batch minting', function () {
  const BASE_URI = 'ipfs://certificates.example/';
  let registry, alice, bob, charlie, nft;

  beforeEach(async () => {
    [registry, alice, bob, charlie] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT', BASE_URI);
    await nft.setJobRegistry(registry.address);
  });

  it('mints bounded batches and emits events for each certificate', async () => {
    const mints = [
      {
        to: alice.address,
        jobId: 11,
        uriHash: ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}11`)),
      },
      {
        to: bob.address,
        jobId: 12,
        uriHash: ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}12`)),
      },
      {
        to: charlie.address,
        jobId: 13,
        uriHash: ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}13`)),
      },
    ];

    const tokenIds = await nft.connect(registry).mintBatch.staticCall(mints);
    expect(tokenIds).to.deep.equal(mints.map(({ jobId }) => BigInt(jobId)));

    await expect(nft.connect(registry).mintBatch(mints))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(alice.address, 11, mints[0].uriHash)
      .and.to.emit(nft, 'CertificateMinted')
      .withArgs(bob.address, 12, mints[1].uriHash)
      .and.to.emit(nft, 'CertificateMinted')
      .withArgs(charlie.address, 13, mints[2].uriHash);

    expect(await nft.ownerOf(11)).to.equal(alice.address);
    expect(await nft.tokenURI(11)).to.equal(`${BASE_URI}11`);
    expect(await nft.ownerOf(12)).to.equal(bob.address);
    expect(await nft.ownerOf(13)).to.equal(charlie.address);
  });

  it('rejects oversized batches', async () => {
    const maxBatch = Number(await nft.MAX_BATCH_MINT());
    const entries = Array.from({ length: maxBatch + 1 }, (_, i) => ({
      to: alice.address,
      jobId: i + 100,
      uriHash: ethers.keccak256(ethers.toUtf8Bytes(`${BASE_URI}${i + 100}`)),
    }));

    await expect(
      nft.connect(registry).mintBatch(entries)
    ).to.be.revertedWithCustomError(nft, 'MintBatchTooLarge');
  });

  it('rejects empty batches', async () => {
    await expect(
      nft.connect(registry).mintBatch([])
    ).to.be.revertedWithCustomError(nft, 'EmptyMintBatch');
  });
});
