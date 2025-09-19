const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT ether rejection', function () {
  let owner, nft;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT', 'bafybasecid');
    await nft.waitForDeployment();
  });

  it('reverts on direct ether transfer', async () => {
    await expect(
      owner.sendTransaction({ to: await nft.getAddress(), value: 1 })
    ).to.be.revertedWith('CertificateNFT: no ether');
  });

  it('reverts on unknown calldata with value', async () => {
    await expect(
      owner.sendTransaction({
        to: await nft.getAddress(),
        data: '0x12345678',
        value: 1,
      })
    ).to.be.revertedWith('CertificateNFT: no ether');
  });

  it('reports tax exemption', async () => {
    expect(await nft.isTaxExempt()).to.equal(true);
  });
});
