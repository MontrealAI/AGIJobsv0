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

  it('mints with jobId tokenId and enforces registry and URI', async () => {
    const uri = 'ipfs://1';
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
        .mint(user.address, 3, ethers.keccak256(ethers.toUtf8Bytes('ipfs://3')))
    )
      .to.be.revertedWithCustomError(nft, 'NotJobRegistry')
      .withArgs(owner.address);
  });

  it('exposes metadata URIs once the base CID is configured', async () => {
    const uri = 'ipfs://1';
    const uriHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    await nft.connect(jobRegistry).mint(user.address, 1, uriHash);

    await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(
      nft,
      'BaseURIUnset'
    );

    const base = 'ipfs://metadata/';
    await expect(nft.setBaseURI(base))
      .to.emit(nft, 'BaseURISet')
      .withArgs(base);

    const expected = `${base}${uriHash.slice(2)}`;
    expect(await nft.tokenURI(1)).to.equal(expected);
  });

  it('rejects invalid or repeated base URI configuration', async () => {
    await expect(nft.setBaseURI(''))
      .to.be.revertedWithCustomError(nft, 'EmptyBaseURI');
    await expect(nft.setBaseURI('https://metadata/'))
      .to.be.revertedWithCustomError(nft, 'InvalidBaseURI');

    const base = 'ipfs://metadata/';
    await nft.setBaseURI(base);
    await expect(nft.setBaseURI(base)).to.be.revertedWithCustomError(
      nft,
      'BaseURIAlreadySet'
    );
  });
});
