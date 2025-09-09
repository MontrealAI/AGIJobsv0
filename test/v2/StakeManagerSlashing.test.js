const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('StakeManager slashing configuration', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, treasury, token, stakeManager;

  beforeEach(async () => {
    [owner, treasury] = await ethers.getSigners();
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      50,
      50,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
  });

  it('rejects percentages that exceed 100 total', async () => {
    await expect(
      stakeManager.setSlashingPercentages(60, 50)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });
});
