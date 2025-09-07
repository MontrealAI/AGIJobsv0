const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT stake manager validation', function () {
  let nft, owner;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
  });

  it('rejects stake manager with incompatible version', async () => {
    const BadStake = await ethers.getContractFactory(
      'contracts/test/BadStakeManager.sol:BadStakeManager'
    );
    const bad = await BadStake.deploy();
    await expect(
      nft.setStakeManager(await bad.getAddress())
    ).to.be.revertedWithCustomError(nft, 'InvalidStakeManagerVersion');
  });

  it('rejects stake manager with wrong token', async () => {
    const MockStake = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockStakeManager'
    );
    const mock = await MockStake.deploy();
    await expect(
      nft.setStakeManager(await mock.getAddress())
    ).to.be.revertedWithCustomError(nft, 'InvalidStakeManagerToken');
  });
});

