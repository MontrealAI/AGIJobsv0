const { expect } = require('chai');
const { ethers } = require('hardhat');

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

  it('prevents minting until the IPFS base is configured', async () => {
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes('ipfs://job/1'));
    await expect(
      nft.connect(jobRegistry).mint(user.address, 1, uriHash)
    ).to.be.revertedWithCustomError(nft, 'BaseURIUnset');
  });

  it('mints with jobId tokenId and enforces registry and URI hash', async () => {
    const baseURI = 'ipfs://root/';
    await expect(nft.setBaseURI(baseURI))
      .to.emit(nft, 'BaseURISet')
      .withArgs(baseURI);
    const uri = 'ipfs://job/1';
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uriHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, uriHash);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    const hash = await nft.tokenHashes(1);
    expect(hash).to.equal(uriHash);
    expect(await nft.tokenURI(1)).to.equal(`${baseURI}${uriHash}`);

    await expect(
      nft.connect(jobRegistry).mint(user.address, 2, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(nft, 'EmptyURI');

    await expect(
      nft
        .connect(owner)
        .mint(user.address, 3, ethers.keccak256(ethers.toUtf8Bytes('ipfs://3')))
    )
      .to.be.revertedWithCustomError(nft, 'NotJobRegistry')
      .withArgs(owner.address);
  });

  it('locks the base URI to an IPFS prefix', async () => {
    await expect(nft.setBaseURI('https://example.com/')).to.be.revertedWithCustomError(
      nft,
      'InvalidBaseURI'
    );
    await nft.setBaseURI('ipfs://cid/');
    await expect(nft.setBaseURI('ipfs://second/')).to.be.revertedWithCustomError(
      nft,
      'BaseURIAlreadySet'
    );
  });

  it('batch mints certificates within the configured limit', async () => {
    await nft.setBaseURI('ipfs://batch/');
    const limit = Number(await nft.MAX_BATCH_MINT());
    const recipients = Array.from({ length: limit }, (_, i) =>
      i % 2 === 0 ? user.address : owner.address
    );
    const jobIds = Array.from({ length: limit }, (_, i) => i + 1);
    const uriHashes = jobIds.map((id) =>
      ethers.keccak256(ethers.toUtf8Bytes(`ipfs://job/${id}`))
    );

    const staticResult = await nft
      .connect(jobRegistry)
      .batchMint.staticCall(recipients, jobIds, uriHashes);
    expect(staticResult.map((bn) => Number(bn))).to.deep.equal(jobIds);

    const tx = await nft
      .connect(jobRegistry)
      .batchMint(recipients, jobIds, uriHashes);
    const receipt = await tx.wait();
    const parsed = receipt.logs
      .map((log) => {
        try {
          return nft.interface.parseLog(log);
        } catch (err) {
          return null;
        }
      })
      .filter(Boolean)
      .filter((decoded) => decoded.name === 'CertificateMinted');
    expect(parsed.length).to.equal(limit);
    for (let i = 0; i < limit; i += 1) {
      const event = parsed[i];
      expect(event.args.to).to.equal(recipients[i]);
      expect(event.args.jobId).to.equal(BigInt(jobIds[i]));
      expect(event.args.uriHash).to.equal(uriHashes[i]);
      expect(await nft.ownerOf(jobIds[i])).to.equal(recipients[i]);
      expect(await nft.tokenURI(jobIds[i])).to.equal(
        `ipfs://batch/${uriHashes[i]}`
      );
    }

    await expect(
      nft
        .connect(jobRegistry)
        .batchMint(
          recipients,
          jobIds.slice(0, limit - 1),
          uriHashes
        )
    ).to.be.revertedWithCustomError(nft, 'ArrayLengthMismatch');

    await expect(
      nft.connect(jobRegistry).batchMint([], [], [])
    ).to.be.revertedWithCustomError(nft, 'EmptyBatch');

    const tooManyRecipients = recipients.concat(user.address);
    const tooManyIds = jobIds.concat(limit + 1);
    const tooManyHashes = uriHashes.concat(
      ethers.keccak256(ethers.toUtf8Bytes(`ipfs://job/${limit + 1}`))
    );

    await expect(
      nft
        .connect(jobRegistry)
        .batchMint(tooManyRecipients, tooManyIds, tooManyHashes)
    )
      .to.be.revertedWithCustomError(nft, 'BatchMintLimitExceeded')
      .withArgs(BigInt(limit + 1), BigInt(limit));
  });
});
