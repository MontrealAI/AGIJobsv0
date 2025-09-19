const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT minting', function () {
  let owner, jobRegistry, user, nft;
  const baseURI = 'ipfs://proof-of-completion/';

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
    await nft.setJobRegistry(jobRegistry.address);
  });

  it('mints with jobId tokenId and enforces registry and URI', async () => {
    await nft.connect(owner).setBaseURI(baseURI);
    const uri = `${baseURI}1.json`;
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uriHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, uriHash);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    const hash = await nft.tokenHashes(1);
    expect(hash).to.equal(uriHash);
    expect(await nft.tokenURI(1)).to.equal(uri);

    await expect(
      nft.connect(jobRegistry).mint(user.address, 2, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(nft, 'EmptyURI');

    await expect(
      nft
        .connect(owner)
        .mint(
          user.address,
          3,
          ethers.keccak256(ethers.toUtf8Bytes(`${baseURI}3.json`))
        )
    )
      .to.be.revertedWithCustomError(nft, 'NotJobRegistry')
      .withArgs(owner.address);
  });

  it('supports bounded batch minting with strict validation', async () => {
    await nft.connect(owner).setBaseURI(baseURI);
    const recipients = [user.address, owner.address];
    const jobIds = [1, 2];
    const uriHashes = jobIds.map((id) =>
      ethers.keccak256(ethers.toUtf8Bytes(`${baseURI}${id}.json`))
    );
    const tx = await nft
      .connect(jobRegistry)
      .mintBatch(recipients, jobIds, uriHashes);
    const receipt = await tx.wait();
    expect(
      receipt.logs.filter((log) => log.eventName === 'CertificateMinted')
    ).to.have.length(2);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    expect(await nft.ownerOf(2)).to.equal(owner.address);
    expect(await nft.tokenURI(2)).to.equal(`${baseURI}2.json`);

    await expect(
      nft
        .connect(jobRegistry)
        .mintBatch([ethers.ZeroAddress], [3], [uriHashes[0]])
    ).to.be.revertedWithCustomError(nft, 'ZeroAddress');

    const maxBatch = Number(await nft.MAX_BATCH_MINT());
    const overflow = maxBatch + 1;
    const overflowRecipients = Array.from({ length: overflow }, () => user.address);
    const overflowJobIds = Array.from({ length: overflow }, (_, i) => i + 10);
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
  });
});
