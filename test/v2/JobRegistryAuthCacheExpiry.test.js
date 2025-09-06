const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('JobRegistry auth cache invalidation', function () {
  let owner, employer, agent;
  let registry, identity, policy;
  let jobId = 0;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    jobId = 0;

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setAgentRootNode(ethers.ZeroHash);
    await identity.setResult(true);

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
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

    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy('uri', 'ack');
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();

    await registry.connect(owner).setMaxJobReward(1000);
    await registry.connect(owner).setJobDurationLimit(1000);
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).setJobParameters(0, 0);
  });

  async function createJob() {
    const deadline = (await time.latest()) + 100;
    jobId++;
    const specHash = ethers.id('spec');
    await registry.connect(employer).createJob(1, deadline, specHash, 'uri');
    return jobId;
  }

  it('requires re-verification after agent cache expiration', async () => {
    await registry.connect(owner).setAgentAuthCacheDuration(5);

    const first = await createJob();
    await registry.connect(agent).applyForJob(first, 'a', []);

    await identity.connect(owner).setResult(false);

    const second = await createJob();
    await registry.connect(agent).applyForJob(second, 'a', []);

    await time.increase(6);

    const third = await createJob();
    await expect(
      registry.connect(agent).applyForJob(third, 'a', [])
    ).to.be.revertedWithCustomError(registry, 'NotAuthorizedAgent');
  });

  it('invalidates cache on agent root node update', async () => {
    await registry.connect(owner).setAgentAuthCacheDuration(1000);

    const first = await createJob();
    await registry.connect(agent).applyForJob(first, 'a', []);

    await identity.connect(owner).setResult(false);
    await identity
      .connect(owner)
      .transferOwnership(await registry.getAddress());
    await registry.connect(owner).setAgentRootNode(ethers.id('newroot'));

    const second = await createJob();
    await expect(
      registry.connect(agent).applyForJob(second, 'a', [])
    ).to.be.revertedWithCustomError(registry, 'NotAuthorizedAgent');
  });

  it('invalidates cache on manual version bump', async () => {
    await registry.connect(owner).setAgentAuthCacheDuration(1000);

    const first = await createJob();
    await registry.connect(agent).applyForJob(first, 'a', []);

    await identity.connect(owner).setResult(false);

    const second = await createJob();
    await registry.connect(agent).applyForJob(second, 'a', []);

    await registry.connect(owner).bumpAgentAuthCacheVersion();

    const third = await createJob();
    await expect(
      registry.connect(agent).applyForJob(third, 'a', [])
    ).to.be.revertedWithCustomError(registry, 'NotAuthorizedAgent');
  });
});
