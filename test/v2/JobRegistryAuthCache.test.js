const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('JobRegistry agent auth cache', function () {
  let owner, employer, agent;
  let registry, verifier, policy;
  let jobId = 0;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    verifier = await Identity.deploy();
    await verifier.waitForDeployment();
    await verifier.setAgentRootNode(ethers.ZeroHash);

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
      .setIdentityRegistry(await verifier.getAddress());

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
    await expect(registry.connect(owner).setAgentAuthCacheDuration(5))
      .to.emit(registry, 'AgentAuthCacheDurationUpdated')
      .withArgs(5);
  });

  async function createJob() {
    const deadline = (await time.latest()) + 100;
    jobId++;
    const specHash = ethers.id('spec');
    await registry.connect(employer).createJob(1, deadline, specHash, 'uri');
    return jobId;
  }

  it('skips repeat ENS checks and expires cache', async () => {
    const first = await createJob();
    const tx1 = await registry.connect(agent).applyForJob(first, 'a', []);
    const gas1 = (await tx1.wait()).gasUsed;

    const second = await createJob();
    const tx2 = await registry.connect(agent).applyForJob(second, 'a', []);
    const gas2 = (await tx2.wait()).gasUsed;
    expect(gas2).to.be.lt(gas1);

    await time.increase(6);

    const third = await createJob();
    const tx3 = await registry.connect(agent).applyForJob(third, 'a', []);
    const gas3 = (await tx3.wait()).gasUsed;
    expect(gas3).to.be.gt(gas2);
  });

  it('invalidates cached authorization on root update', async () => {
    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const verifier2 = await Identity.connect(owner).deploy();
    await verifier2.waitForDeployment();
    await verifier2.setAgentRootNode(ethers.ZeroHash);

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const registry2 = await Registry.deploy(
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
    await registry2.waitForDeployment();
    await verifier2.connect(owner).setResult(true);
    await registry2
      .connect(owner)
      .setIdentityRegistry(await verifier2.getAddress());

    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy2 = await Policy.deploy('uri', 'ack');
    await registry2.connect(owner).setTaxPolicy(await policy2.getAddress());
    await policy2.connect(employer).acknowledge();
    await policy2.connect(agent).acknowledge();

    await registry2.connect(owner).setMaxJobReward(1000);
    await registry2.connect(owner).setJobDurationLimit(1000);
    await registry2.connect(owner).setFeePct(0);
    await registry2.connect(owner).setJobParameters(0, 0);
    await registry2.connect(owner).setAgentAuthCacheDuration(1000);

    let deadline = (await time.latest()) + 100;
    const specHash = ethers.id('spec');
    await registry2.connect(employer).createJob(1, deadline, specHash, 'uri');
    await registry2.connect(agent).applyForJob(1, 'a', []);

    await verifier2.connect(owner).setResult(false);

    deadline = (await time.latest()) + 100;
    await registry2.connect(employer).createJob(1, deadline, specHash, 'uri');
    await registry2.connect(agent).applyForJob(2, 'a', []);

    await verifier2
      .connect(owner)
      .transferOwnership(await registry2.getAddress());
    await registry2.connect(owner).setAgentMerkleRoot(ethers.id('newroot'));

    deadline = (await time.latest()) + 100;
    await registry2.connect(employer).createJob(1, deadline, specHash, 'uri');
    await expect(
      registry2.connect(agent).applyForJob(3, 'a', [])
    ).to.be.revertedWithCustomError(registry2, 'NotAuthorizedAgent');
  });
});
