const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Validator selection cache', function () {
  let validation, stake, identity, owner, other;

  beforeEach(async () => {
    const [o1, o2] = await ethers.getSigners();
    owner = o1;
    other = o2;

    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stake = await StakeMock.deploy();
    await stake.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);

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
      await identity.addAdditionalValidator(addr);
    }
    await validation.setValidatorPool(validators);
    await validation.setValidatorsPerJob(3);
    // Sample a fixed window for shuffle-based selection.
    await validation.setValidatorPoolSampleSize(10);
  });

  async function select(jobId, entropy = 0) {
    await validation.selectValidators(jobId, entropy);
    await ethers.provider.send('evm_mine', []);
    return validation.connect(other).selectValidators(jobId, 0);
  }

  it('skips repeat ENS checks and expires cache', async () => {
    await expect(validation.setValidatorAuthCacheDuration(5))
      .to.emit(validation, 'ValidatorAuthCacheDurationUpdated')
      .withArgs(5);

    const tx1 = await select(1);
    const gas1 = (await tx1.wait()).gasUsed;

    const tx2 = await select(2);
    const gas2 = (await tx2.wait()).gasUsed;
    expect(gas2).to.be.lt(gas1);

    await time.increase(6);

    const tx3 = await select(3);
    const gas3 = (await tx3.wait()).gasUsed;
    expect(gas3).to.be.gt(gas2);
  });

  it('invalidates cached validator authorization on club root update', async () => {
    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    const stake2 = await StakeMock.deploy();
    await stake2.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const identity2 = await Identity.deploy();
    await identity2.waitForDeployment();
    await identity2.setClubRootNode(ethers.ZeroHash);
    await identity2.setAgentRootNode(ethers.ZeroHash);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const validation2 = await Validation.deploy(
      ethers.ZeroAddress,
      await stake2.getAddress(),
      1,
      1,
      1,
      10,
      []
    );
    await validation2.waitForDeployment();
    await validation2.setIdentityRegistry(await identity2.getAddress());
    await validation2.setValidatorsPerJob(1);

    const validator = ethers.Wallet.createRandom().address;
    await stake2.setStake(validator, 1, ethers.parseEther('1'));
    await identity2.addAdditionalValidator(validator);
    await validation2.setValidatorPool([validator]);

    await identity2.setResult(true);

    await validation2.selectValidators(1, 0);
    await ethers.provider.send('evm_mine', []);
    await validation2.connect(other).selectValidators(1, 0);

    await identity2.setResult(false);

    await validation2.selectValidators(2, 0);
    await ethers.provider.send('evm_mine', []);
    await validation2.connect(other).selectValidators(2, 0);

    await identity2.transferOwnership(await validation2.getAddress());
    await validation2.setClubRootNode(ethers.id('newclub'));

    await validation2.selectValidators(3, 0);
    await ethers.provider.send('evm_mine', []);
    await expect(
      validation2.connect(other).selectValidators(3, 0)
    ).to.be.revertedWithCustomError(validation2, 'InsufficientValidators');
  });
});
