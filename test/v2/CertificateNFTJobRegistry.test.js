const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CertificateNFT job registry validation', function () {
  let nft;

  beforeEach(async () => {
    await ethers.getSigners();
    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
  });

  it('rejects job registry with incompatible version', async () => {
    const BadRegistry = await ethers.getContractFactory(
      'contracts/test/BadJobRegistry.sol:BadJobRegistry'
    );
    const bad = await BadRegistry.deploy();
    await expect(
      nft.setJobRegistry(await bad.getAddress())
    ).to.be.revertedWithCustomError(nft, 'InvalidJobRegistryVersion');
  });
});
