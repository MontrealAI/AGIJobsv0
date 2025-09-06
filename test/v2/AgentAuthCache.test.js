const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Agent authorization cache invalidation', function () {
  let owner, employer, agent;
  let registry, stake, identity1, identity2;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const StakeMock = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockStakeManager'
    );
    stake = await StakeMock.deploy();
    await stake.waitForDeployment();

    const IdentityMock = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity1 = await IdentityMock.deploy();
    await identity1.waitForDeployment();
    identity2 = await IdentityMock.deploy();
    await identity2.waitForDeployment();

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
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
    await registry.connect(owner).setIdentityRegistry(await identity1.getAddress());
    await registry.connect(owner).setJobParameters(0, 0);
  });

  async function createJob() {
    const deadline = (await time.latest()) + 1000;
    await registry
      .connect(employer)
      .createJob(1, deadline, ethers.id('spec'), 'uri');
    return await registry.nextJobId();
  }

  it('requires re-verification after identity registry update', async () => {
    const job1 = await createJob();
    let tx = await registry.connect(agent).applyForJob(job1, '', []);
    const gas1 = (await tx.wait()).gasUsed;

    const job2 = await createJob();
    tx = await registry.connect(agent).applyForJob(job2, '', []);
    const gas2 = (await tx.wait()).gasUsed;
    expect(gas2).to.be.lt(gas1);

    await registry
      .connect(owner)
      .setIdentityRegistry(await identity2.getAddress());

    const job3 = await createJob();
    tx = await registry.connect(agent).applyForJob(job3, '', []);
    const gas3 = (await tx.wait()).gasUsed;
    expect(gas3).to.be.gt(gas2);
  });

  it('requires re-verification after agent root node update', async () => {
    const job1 = await createJob();
    let tx = await registry.connect(agent).applyForJob(job1, '', []);
    const gas1 = (await tx.wait()).gasUsed;

    const job2 = await createJob();
    tx = await registry.connect(agent).applyForJob(job2, '', []);
    const gas2 = (await tx.wait()).gasUsed;
    expect(gas2).to.be.lt(gas1);

    await registry.connect(owner).setAgentRootNode(ethers.id('node'));

    const job3 = await createJob();
    tx = await registry.connect(agent).applyForJob(job3, '', []);
    const gas3 = (await tx.wait()).gasUsed;
    expect(gas3).to.be.gt(gas2);
  });

  it('allows manual cache invalidation', async () => {
    const job1 = await createJob();
    let tx = await registry.connect(agent).applyForJob(job1, '', []);
    const gas1 = (await tx.wait()).gasUsed;

    const job2 = await createJob();
    tx = await registry.connect(agent).applyForJob(job2, '', []);
    const gas2 = (await tx.wait()).gasUsed;
    expect(gas2).to.be.lt(gas1);

    const prev = await registry.agentAuthCacheVersion();
    await expect(registry.connect(owner).bumpAgentAuthCacheVersion())
      .to.emit(registry, 'AgentAuthCacheVersionBumped')
      .withArgs(prev + 1n);

    const job3 = await createJob();
    tx = await registry.connect(agent).applyForJob(job3, '', []);
    const gas3 = (await tx.wait()).gasUsed;
    expect(gas3).to.be.gt(gas2);
  });
});

