const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('JobRegistry agent gating', function () {
  let owner, employer, agent;
  let registry, rep, verifier, policy;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const Stake = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockStakeManager'
    );
    const stakeManager = await Stake.deploy();

    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    rep = await Rep.deploy(await stakeManager.getAddress());

    const Verifier = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    verifier = await Verifier.deploy();

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      await rep.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    await registry
      .connect(owner)
      .setIdentityRegistry(await verifier.getAddress());

    await rep
      .connect(owner)
      .setAuthorizedCaller(await registry.getAddress(), true);
    await rep.connect(owner).setAuthorizedCaller(owner.address, true);

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
    await verifier.setAgentRootNode(ethers.id('agi'));
    await verifier.setResult(false);
  });

  async function createJob(offset = 100) {
    const deadline = (await time.latest()) + offset;
    const specHash = ethers.id('spec');
    await registry.connect(employer).createJob(1, deadline, specHash, 'uri');
    const jobId = await registry.nextJobId();
    return { jobId, deadline };
  }

  it('syncs ENS roots and merkle updates to verifier', async () => {
    const newRoot = ethers.id('root');
    await expect(
      verifier.connect(agent).setAgentRootNode(newRoot)
    ).to.be.revertedWithCustomError(verifier, 'OwnableUnauthorizedAccount');
    await expect(verifier.setAgentRootNode(newRoot))
      .to.emit(verifier, 'AgentRootNodeUpdated')
      .withArgs(newRoot);
    expect(await verifier.agentRootNode()).to.equal(newRoot);

    const merkle = ethers.id('merkle');
    await expect(verifier.setAgentMerkleRoot(merkle))
      .to.emit(verifier, 'AgentMerkleRootUpdated')
      .withArgs(merkle);
    expect(await verifier.agentMerkleRoot()).to.equal(merkle);
  });

  it('rejects unverified agents', async () => {
    const { jobId } = await createJob();
    await expect(
      registry.connect(agent).applyForJob(jobId, 'a', [])
    ).to.be.revertedWithCustomError(registry, 'NotAuthorizedAgent');
  });

  it('allows manual allowlisted agents', async () => {
    await verifier.addAdditionalAgent(agent.address);
    const { jobId } = await createJob();
    await expect(registry.connect(agent).applyForJob(jobId, 'a', []))
      .to.emit(registry, 'AgentIdentityVerified')
      .withArgs(agent.address, ethers.ZeroHash, 'a', false, false)
      .and.to.emit(registry, 'ApplicationSubmitted')
      .withArgs(jobId, agent.address, 'a')
      .and.to.emit(registry, 'AgentAssigned')
      .withArgs(jobId, agent.address, 'a');
  });

  it('rejects blacklisted agents', async () => {
    await verifier.setResult(true);
    await rep.connect(owner).setBlacklist(agent.address, true);
    const { jobId } = await createJob();
    await expect(
      registry.connect(agent).applyForJob(jobId, 'a', [])
    ).to.be.revertedWithCustomError(registry, 'BlacklistedAgent');
  });

  it('rejects agents without acknowledging tax policy', async () => {
    const { jobId } = await createJob();
    await policy.bumpPolicyVersion();
    await expect(registry.connect(agent).applyForJob(jobId, 'a', []))
      .to.be.revertedWithCustomError(registry, 'TaxPolicyNotAcknowledged')
      .withArgs(agent.address);
  });

  it('enforces the maximum active jobs per agent', async () => {
    await verifier.addAdditionalAgent(agent.address);
    await registry.connect(owner).setMaxActiveJobsPerAgent(1);
    const { jobId: firstJobId } = await createJob();
    await registry.connect(agent).applyForJob(firstJobId, 'a', []);
    expect(await registry.activeJobs(agent.address)).to.equal(1n);

    const { jobId: secondJobId } = await createJob();
    await expect(
      registry.connect(agent).applyForJob(secondJobId, 'a', [])
    )
      .to.be.revertedWithCustomError(registry, 'MaxActiveJobsReached')
      .withArgs(1);
    expect(await registry.activeJobs(agent.address)).to.equal(1n);
  });

  it('releases active job slots once work is finalized', async () => {
    await verifier.addAdditionalAgent(agent.address);
    await registry.connect(owner).setMaxActiveJobsPerAgent(1);
    const { jobId: firstJobId, deadline } = await createJob(50);
    await registry.connect(agent).applyForJob(firstJobId, 'a', []);
    const { jobId: secondJobId } = await createJob();

    await expect(
      registry.connect(agent).applyForJob(secondJobId, 'a', [])
    )
      .to.be.revertedWithCustomError(registry, 'MaxActiveJobsReached')
      .withArgs(1);

    await time.increaseTo(deadline + 1);
    await registry.connect(employer).cancelExpiredJob(firstJobId);
    expect(await registry.activeJobs(agent.address)).to.equal(0n);

    await expect(registry.connect(agent).applyForJob(secondJobId, 'a', []))
      .to.emit(registry, 'AgentAssigned')
      .withArgs(secondJobId, agent.address, 'a');
    expect(await registry.activeJobs(agent.address)).to.equal(1n);
  });
});
