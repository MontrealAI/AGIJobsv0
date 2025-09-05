const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('StakeManager ether rejection', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, _token, stakeManager;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    _token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.waitForDeployment();
  });

  it('reverts on direct ether transfer', async () => {
    await expect(
      owner.sendTransaction({ to: await stakeManager.getAddress(), value: 1 })
    ).to.be.revertedWithCustomError(stakeManager, 'EtherNotAccepted');
  });

  it('reverts on unknown calldata with value', async () => {
    await expect(
      owner.sendTransaction({
        to: await stakeManager.getAddress(),
        data: '0x12345678',
        value: 1,
      })
    ).to.be.revertedWithCustomError(stakeManager, 'EtherNotAccepted');
  });

  it('reports tax exemption', async () => {
    expect(await stakeManager.isTaxExempt()).to.equal(true);
  });
});
