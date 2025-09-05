const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('JobRegistry Treasury', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let registry, stakeManager, _token;
  let owner, treasury;

  beforeEach(async function () {
    [owner, treasury] = await ethers.getSigners();

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
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
  });

  it('rejects zero treasury address', async function () {
    await expect(
      registry.connect(owner).setTreasury(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(registry, 'InvalidTreasury');
  });

  it('sets a valid treasury address', async function () {
    await registry.connect(owner).setTreasury(treasury.address);
    expect(await registry.treasury()).to.equal(treasury.address);
  });
});
