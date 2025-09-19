const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT', function () {
  let nft, owner, jobRegistry, user, NFT;
  const baseCid = 'bafybasecid';

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    NFT = await ethers.getContractFactory(
      'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT', baseCid);
    await nft.connect(owner).setJobRegistry(jobRegistry.address);
  });

  it('mints certificates only via JobRegistry', async () => {
    const uri = 'metadata/job/1.json';
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uriHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, uriHash);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    const hash = await nft.tokenHashes(1);
    expect(hash).to.equal(uriHash);
    const expectedUri = `ipfs://${baseCid}/${uriHash}`;
    expect(await nft.tokenURI(1)).to.equal(expectedUri);
    await expect(
      nft
        .connect(owner)
        .mint(
          user.address,
          2,
          ethers.keccak256(ethers.toUtf8Bytes('metadata/job/2.json'))
        )
    ).to.be.revertedWith('only JobRegistry');
  });

  it('rejects empty base CID at deployment', async () => {
    await expect(NFT.deploy('Cert', 'CERT', '')).to.be.revertedWithCustomError(
      nft,
      'EmptyBaseCid'
    );
  });
});
