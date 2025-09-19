const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT', function () {
  let nft, owner, jobRegistry, user;

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
    await nft.connect(owner).setJobRegistry(jobRegistry.address);
  });

  it('mints certificates via JobRegistry with deterministic metadata', async () => {
    const uri = 'ipfs://job/1';
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await expect(nft.connect(jobRegistry).mint(user.address, 1, uriHash))
      .to.emit(nft, 'CertificateMinted')
      .withArgs(user.address, 1, uriHash);
    expect(await nft.ownerOf(1)).to.equal(user.address);
    const hash = await nft.tokenHashes(1);
    expect(hash).to.equal(uriHash);
    await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(
      nft,
      'BaseURIUnset'
    );

    await expect(nft.setBaseURI('')).to.be.revertedWithCustomError(
      nft,
      'EmptyBaseURI'
    );

    const baseURI = 'ipfs://module/';
    await expect(nft.setBaseURI(baseURI))
      .to.emit(nft, 'BaseURISet')
      .withArgs(baseURI);
    expect(await nft.tokenURI(1)).to.equal('ipfs://module/1');

    await expect(nft.setBaseURI('ipfs://other/')).to.be.revertedWithCustomError(
      nft,
      'BaseURIAlreadySet'
    );
    await expect(
      nft
        .connect(owner)
        .mint(
          user.address,
          2,
          ethers.keccak256(ethers.toUtf8Bytes('ipfs://job/2'))
        )
    ).to.be.revertedWith('only JobRegistry');
  });
});
