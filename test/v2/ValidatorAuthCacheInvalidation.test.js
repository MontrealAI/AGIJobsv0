const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('JobRegistry validator auth cache', function () {
  let owner, employer, v1, v2, v3;
  let stakeManager, jobMock, validation, identity, registry;

  beforeEach(async () => {
    [owner, employer, v1, v2, v3] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const JobMock = await ethers.getContractFactory('MockJobRegistry');
    jobMock = await JobMock.deploy();
    await jobMock.waitForDeployment();

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      await jobMock.getAddress(),
      await stakeManager.getAddress(),
      60,
      60,
      3,
      3,
      []
    );
    await validation.waitForDeployment();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setClubRootNode(ethers.ZeroHash);
    await identity.setAgentRootNode(ethers.ZeroHash);
    await identity.setResult(true);

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      await validation.getAddress(),
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
    await registry.waitForDeployment();

    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await validation
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);
    await validation.connect(owner).setValidatorAuthCacheDuration(1000);

    await stakeManager.setStake(v1.address, 1, ethers.parseEther('100'));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther('50'));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther('25'));
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
    await jobMock.setJob(id, jobStruct);
  }

  async function select(jobId) {
    await validation.selectValidators(jobId, 0);
    await ethers.provider.send('evm_mine', []);
    return validation.connect(v1).selectValidators(jobId, 0);
  }

  it('invalidates cache on validator root node update', async () => {
    await createJob(1);
    await select(1);

    await identity.connect(owner).setResult(false);

    await createJob(2);
    await select(2);

    await validation
      .connect(owner)
      .transferOwnership(await registry.getAddress());
    await identity
      .connect(owner)
      .transferOwnership(await registry.getAddress());

    await registry.connect(owner).setValidatorRootNode(ethers.id('newroot'));

    await createJob(3);
    await expect(select(3)).to.be.revertedWithCustomError(
      validation,
      'InsufficientValidators'
    );
  });

  it('invalidates cache on validator merkle root update', async () => {
    await createJob(1);
    await select(1);

    await identity.connect(owner).setResult(false);

    await createJob(2);
    await select(2);

    await validation
      .connect(owner)
      .transferOwnership(await registry.getAddress());
    await identity
      .connect(owner)
      .transferOwnership(await registry.getAddress());

    await registry.connect(owner).setValidatorMerkleRoot(ethers.id('newroot'));

    await createJob(3);
    await expect(select(3)).to.be.revertedWithCustomError(
      validation,
      'InsufficientValidators'
    );
  });

  it('invalidates cache on identity registry update', async () => {
    await createJob(1);
    await select(1);

    await identity.connect(owner).setResult(false);

    await createJob(2);
    await select(2);

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const identity2 = await Identity.connect(owner).deploy();
    await identity2.waitForDeployment();
    await identity2.setClubRootNode(ethers.ZeroHash);
    await identity2.setAgentRootNode(ethers.ZeroHash);

    await validation
      .connect(owner)
      .setIdentityRegistry(await identity2.getAddress());
    await validation
      .connect(owner)
      .transferOwnership(await registry.getAddress());
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity2.getAddress());

    await createJob(3);
    await expect(select(3)).to.be.revertedWithCustomError(
      validation,
      'InsufficientValidators'
    );
  });

  it('invalidates cache on manual version bump', async () => {
    await createJob(1);
    await select(1);

    await identity.connect(owner).setResult(false);

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
