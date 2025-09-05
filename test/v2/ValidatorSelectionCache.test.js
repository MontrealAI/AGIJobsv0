const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Validator selection cache', function () {
  let validation, stake, identity, other;

  beforeEach(async () => {
    const [_, o] = await ethers.getSigners();
    other = o;

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
});
