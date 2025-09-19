const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT minting', function () {
  let owner, jobRegistry, user, nft, NFT;
  const baseCid = 'bafybasecid';

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT', baseCid);
    await nft.setJobRegistry(jobRegistry.address);
  });

  it('mints with jobId tokenId and enforces registry and URI', async () => {
    const uri = 'metadata/1.json';
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uriHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, uriHash);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    const hash = await nft.tokenHashes(1);
    expect(hash).to.equal(uriHash);

    await expect(
      nft.connect(jobRegistry).mint(user.address, 2, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(nft, 'EmptyURI');

    await expect(
      nft
        .connect(owner)
        .mint(user.address, 3, ethers.keccak256(ethers.toUtf8Bytes('metadata/3.json')))
    )
      .to.be.revertedWithCustomError(nft, 'NotJobRegistry')
      .withArgs(owner.address);

    expect(await nft.baseCid()).to.equal(baseCid);
    const expectedUri = `ipfs://${baseCid}/${uriHash}`;
    expect(await nft.tokenURI(1)).to.equal(expectedUri);
  });

  it('rejects an empty base CID', async () => {
    await expect(
      NFT.deploy('Cert', 'CERT', '')
    ).to.be.revertedWithCustomError(nft, 'EmptyBaseCid');
  });
});
