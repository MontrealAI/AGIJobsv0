const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT minting', function () {
  const BASE_URI = 'ipfs://certificates.example/';
  let owner, jobRegistry, user, nft;

  beforeEach(async () => {
    [owner, jobRegistry, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT', BASE_URI);
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
    expect(await nft.tokenURI(1)).to.equal(`${BASE_URI}1`);

    await expect(
      nft
        .connect(jobRegistry)
        .mint(user.address, 1, ethers.keccak256(ethers.toUtf8Bytes('ipfs://1')))
    )
      .to.be.revertedWithCustomError(nft, 'CertificateAlreadyMinted')
      .withArgs(1);

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
});
