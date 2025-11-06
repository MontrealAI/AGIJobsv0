const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('ValidationModule authorization cache', function () {
  let owner, other, v1, v2, v3;
  let validation, stake, identity;

  beforeEach(async () => {
    [owner, other, v1, v2, v3] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stake = await StakeMock.deploy();
    await stake.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setAgentRootNode(ethers.ZeroHash);
    await identity.setClubRootNode(ethers.ZeroHash);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      1,
      1,
      3,
      10,
      []
    );
    await validation.waitForDeployment();
    await validation.setIdentityRegistry(await identity.getAddress());

    const validators = [v1.address, v2.address, v3.address];
    for (const addr of validators) {
      await stake.setStake(addr, 1, ethers.parseEther('1'));
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(3);
    await validation.setValidatorPoolSampleSize(10);
  });

  async function finalizeSelect(jobId) {
    await validation.selectValidators(jobId, 0);
    await ethers.provider.send('evm_mine', []);
    return validation.connect(other).selectValidators(jobId, 0);
    }

  it('fails once validator cache duration elapses', async () => {
    await validation.setValidatorAuthCacheDuration(5);
    await identity.setResult(true);
    await finalizeSelect(1);

    await identity.setResult(false);

    await finalizeSelect(2);

    await time.increase(6);
    await expect(finalizeSelect(3)).to.be.revertedWithCustomError(
      validation,
      'InsufficientValidators'
    );
  });

  it('re-verifies validators when cache version bumped', async () => {
    await validation.setValidatorAuthCacheDuration(1000);
    await identity.setResult(true);
    await finalizeSelect(1);

    await identity.setResult(false);
    await validation.bumpValidatorAuthCacheVersion();

    await expect(finalizeSelect(2)).to.be.revertedWithCustomError(
      validation,
      'InsufficientValidators'
    );
  });
});

