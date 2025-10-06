const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('ValidationModule validator auth cache', function () {
  let owner, employer, v1, v2, v3;
  let validation, stakeManager, jobRegistry, identity;

  beforeEach(async () => {
    [owner, employer, v1, v2, v3] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      60,
      60,
      3,
      3,
      []
    );
    await validation.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);
    await validation
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());

    await stakeManager.setStake(
      v1.address,
      1,
      ethers.parseEther('100')
    );
    await stakeManager.setStake(
      v2.address,
      1,
      ethers.parseEther('50')
    );
    await stakeManager.setStake(
      v3.address,
      1,
      ethers.parseEther('25')
    );

    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);

    await validation.connect(owner).setValidatorSubdomains(
      [v1.address, v2.address, v3.address],
      ['validator-1', 'validator-2', 'validator-3']
    );
  });

  async function createJob(id) {
    const jobStruct = {
      employer: employer.address,
      agent: ethers.ZeroAddress,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    };
    await jobRegistry.setJob(id, jobStruct);
  }

  async function select(jobId) {
    await validation.selectValidators(jobId, 0);
    await ethers.provider.send('evm_mine', []);
    return validation.connect(v1).selectValidators(jobId, 0);
  }

  it('skips repeat ENS checks and expires cache', async () => {
    await validation.connect(owner).setValidatorAuthCacheDuration(5);

    await createJob(1);
    const tx1 = await select(1);
    const gas1 = (await tx1.wait()).gasUsed;

    await createJob(2);
    const tx2 = await select(2);
    const gas2 = (await tx2.wait()).gasUsed;
    expect(gas2).to.be.lt(gas1);

    await time.increase(6);

    await createJob(3);
    const tx3 = await select(3);
    const gas3 = (await tx3.wait()).gasUsed;
    expect(gas3).to.be.gt(gas2);
  });

  it('requires re-verification after validator cache expiration', async () => {
    await validation.connect(owner).setValidatorAuthCacheDuration(5);

    const Toggle = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const toggle = await Toggle.deploy();
    await toggle.waitForDeployment();
    await toggle.setResult(true);
    await toggle.setClubRootNode(ethers.ZeroHash);
    await toggle.setAgentRootNode(ethers.ZeroHash);
    await validation
      .connect(owner)
      .setIdentityRegistry(await toggle.getAddress());

    await createJob(1);
    await select(1);

    await toggle.connect(owner).setResult(false);

    await time.increase(6);

    await createJob(2);
    await expect(select(2)).to.be.revertedWithCustomError(
      validation,
      'InsufficientValidators'
    );
  });

  it('invalidates cached authorization on version bump', async () => {
    await validation.connect(owner).setValidatorAuthCacheDuration(1000);

    const Toggle = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const toggle = await Toggle.deploy();
    await toggle.waitForDeployment();
    await toggle.setResult(true);
    await toggle.setClubRootNode(ethers.ZeroHash);
    await toggle.setAgentRootNode(ethers.ZeroHash);
    await validation
      .connect(owner)
      .setIdentityRegistry(await toggle.getAddress());

    await createJob(1);
    await select(1);

    await toggle.setResult(false);

    await createJob(2);
    await select(2);

    await validation.connect(owner).bumpValidatorAuthCacheVersion();

    await createJob(3);
    await expect(select(3)).to.be.revertedWithCustomError(
      validation,
      'InsufficientValidators'
    );
  });
});
