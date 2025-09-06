const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('JobRegistry authorization cache', function () {
  let owner, employer, agent;
  let registry, identity, policy;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await identity.setAgentRootNode(ethers.ZeroHash);

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
    await registry.connect(owner).setIdentityRegistry(await identity.getAddress());

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
    const specHash = ethers.id('spec');
    const tx = await registry
      .connect(employer)
      .createJob(1, deadline, specHash, 'uri');
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'JobCreated'
    );
    return event.args[0];
  }

  it('fails once cache duration elapses', async () => {
    await registry.connect(owner).setAgentAuthCacheDuration(5);
    await identity.setResult(true);

    const first = await createJob();
    await registry.connect(agent).applyForJob(first, 'a', []);

    await identity.setResult(false);
    const second = await createJob();
    await registry.connect(agent).applyForJob(second, 'a', []);

    await time.increase(6);
    const third = await createJob();
    await expect(
      registry.connect(agent).applyForJob(third, 'a', [])
    ).to.be.revertedWithCustomError(registry, 'NotAuthorizedAgent');
  });

  it('re-verifies when cache version is bumped', async () => {
    await registry.connect(owner).setAgentAuthCacheDuration(1000);
    await identity.setResult(true);

    const first = await createJob();
    await registry.connect(agent).applyForJob(first, 'a', []);

    await identity.setResult(false);
    await identity.transferOwnership(await registry.getAddress());
    await registry.connect(owner).setAgentMerkleRoot(ethers.ZeroHash);

    const second = await createJob();
    await expect(
      registry.connect(agent).applyForJob(second, 'a', [])
    ).to.be.revertedWithCustomError(registry, 'NotAuthorizedAgent');
  });
});

