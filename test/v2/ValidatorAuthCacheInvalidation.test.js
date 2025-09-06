const { expect } = require('chai');
const { ethers } = require('hardhat');

// Helper to perform selection fully by calling twice with block mine
async function finalizeSelection(validation, jobId, other, entropy = 0) {
  await validation.selectValidators(jobId, entropy);
  await ethers.provider.send('evm_mine', []);
  return validation.connect(other).selectValidators(jobId, 0);
}

describe('Validator auth cache invalidation', function () {
  let stake, validation, other;

  beforeEach(async () => {
    const [_, o] = await ethers.getSigners();
    other = o;
  });

  it('invalidates cached authorization on root update', async () => {
    const Stake = await ethers.getContractFactory('MockStakeManager');
    stake = await Stake.deploy();
    await stake.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setAgentRootNode(ethers.ZeroHash);
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setResult(true);

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

    const validators = [];
    for (let i = 0; i < 3; i++) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
      await stake.setStake(addr, 1, ethers.parseEther('1'));
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(3);
    await validation.setValidatorPoolSampleSize(10);

    await finalizeSelection(validation, 1, other);

    await identity.setResult(false);
    await finalizeSelection(validation, 2, other);

    await identity.transferOwnership(await validation.getAddress());
    await expect(
      validation.setValidatorMerkleRoot(ethers.id('new'))
    ).to.emit(validation, 'ValidatorAuthCacheVersionBumped');

    await expect(
      finalizeSelection(validation, 3, other)
    ).to.be.revertedWithCustomError(validation, 'InsufficientValidators');
  });

  it('invalidates cached authorization on registry update', async () => {
    const Stake = await ethers.getContractFactory('MockStakeManager');
    stake = await Stake.deploy();
    await stake.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const identity1 = await Identity.deploy();
    await identity1.waitForDeployment();
    await identity1.setAgentRootNode(ethers.ZeroHash);
    await identity1.setClubRootNode(ethers.ZeroHash);
    await identity1.setResult(true);

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
    await validation.setIdentityRegistry(await identity1.getAddress());

    const validators = [];
    for (let i = 0; i < 3; i++) {
      const addr = ethers.Wallet.createRandom().address;
      validators.push(addr);
      await stake.setStake(addr, 1, ethers.parseEther('1'));
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(3);
    await validation.setValidatorPoolSampleSize(10);

    await finalizeSelection(validation, 1, other);

    const identity2 = await Identity.deploy();
    await identity2.waitForDeployment();
    await identity2.setAgentRootNode(ethers.ZeroHash);
    await identity2.setClubRootNode(ethers.ZeroHash);
    await identity2.setResult(false);

    await expect(
      validation.setIdentityRegistry(await identity2.getAddress())
    ).to.emit(validation, 'ValidatorAuthCacheVersionBumped');

    await expect(
      finalizeSelection(validation, 2, other)
    ).to.be.revertedWithCustomError(validation, 'InsufficientValidators');
  });
});
