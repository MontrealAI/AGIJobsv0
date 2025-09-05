const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('JobRegistry integration', function () {
  let token,
    stakeManager,
    rep,
    validation,
    nft,
    registry,
    dispute,
    policy,
    identity;
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, employer, agent, treasury;
  let feePool;

  const reward = 100;
  const stake = 200;
  const disputeFee = 0;

  beforeEach(async () => {
    [owner, employer, agent, treasury] = await ethers.getSigners();
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);
    await stakeManager.connect(owner).setSlashingPercentages(100, 0);
    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    validation = await Validation.deploy();
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    rep = await Rep.deploy(await stakeManager.getAddress());
    const NFT = await ethers.getContractFactory(
      'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');
    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      treasury.address
    );
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
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
    const Dispute = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress
    );
    await dispute.connect(owner).setDisputeFee(disputeFee);
    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy('ipfs://policy', 'ack');

    await registry
      .connect(owner)
      .setModules(
        await validation.getAddress(),
        await stakeManager.getAddress(),
        await rep.getAddress(),
        await dispute.getAddress(),
        await nft.getAddress(),
        await feePool.getAddress(),
        []
      );
    await validation.setJobRegistry(await registry.getAddress());
    await registry.connect(owner).setJobParameters(reward, stake);
    await registry.connect(owner).setMaxJobReward(1000000);
    await registry.connect(owner).setJobDurationLimit(86400);
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).setValidatorRewardPct(0);
    await nft.connect(owner).setJobRegistry(await registry.getAddress());
    await rep
      .connect(owner)
      .setAuthorizedCaller(await registry.getAddress(), true);
    await rep.connect(owner).setThreshold(0);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());
    await stakeManager.connect(owner).setFeePool(await feePool.getAddress());
    await nft.connect(owner).transferOwnership(await registry.getAddress());
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy.connect(owner).acknowledge();
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();

    await token.mint(employer.address, 1000);
    await token.mint(agent.address, 1000);

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stake + disputeFee);
    await stakeManager.connect(agent).depositStake(0, stake);
    await stakeManager
      .connect(owner)
      .setDisputeModule(await dispute.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
  });

  it('runs successful job lifecycle', async () => {
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await expect(
      registry
        .connect(employer)
        ['createJob(uint256,uint64,bytes32,string)'](
          reward,
          deadline,
          specHash,
          'uri'
        )
    )
      .to.emit(registry, 'JobCreated')
      .withArgs(
        1,
        employer.address,
        ethers.ZeroAddress,
        reward,
        stake,
        0,
        specHash,
        'uri'
      );
    const created = await registry.jobs(1);
    expect(created.specHash).to.equal(specHash);
    const jobId = 1;
    await expect(registry.connect(agent).applyForJob(jobId, '', []))
      .to.emit(registry, 'JobApplied')
      .withArgs(jobId, agent.address);
    await validation.connect(owner).setResult(true);
    const resultHash = ethers.id('result');
    await expect(
      registry.connect(agent).submit(jobId, resultHash, 'result', '', [])
    )
      .to.emit(registry, 'JobSubmitted')
      .withArgs(jobId, agent.address, resultHash, 'result');
    await expect(validation.finalize(jobId))
      .to.emit(registry, 'JobCompleted')
      .withArgs(jobId, true)
      .and.to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);

    expect(await token.balanceOf(agent.address)).to.equal(900);
    expect(await rep.reputation(agent.address)).to.equal(0);
    expect(await rep.isBlacklisted(agent.address)).to.equal(false);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it('acknowledges and applies in one call for zero-stake jobs', async () => {
    const [, , , newAgent] = await ethers.getSigners();
    await registry.connect(owner).setJobParameters(reward, 0);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    await expect(registry.connect(newAgent).acknowledgeAndApply(1, '', []))
      .to.emit(registry, 'JobApplied')
      .withArgs(1, newAgent.address);
    expect(await policy.hasAcknowledged(newAgent.address)).to.equal(true);
  });

  it('distributes platform fee to stakers', async () => {
    // set up fee pool rewarding platform stakers
    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    const feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      treasury.address
    );
    await feePool.setBurnPct(0);
    await registry.connect(owner).setFeePool(await feePool.getAddress());
    await registry.connect(owner).setFeePct(10); // 10%
    await token.mint(owner.address, reward);
    await token.connect(owner).approve(await stakeManager.getAddress(), reward);
    await stakeManager.connect(owner).depositStake(2, reward); // owner is platform operator

    // employer locks reward + fee
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + reward / 10);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, '', []);
    await validation.connect(owner).setResult(true);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('result'), 'result', '', []);
    await validation.finalize(jobId);

    // platform operator should be able to claim fee
    const before = await token.balanceOf(owner.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(owner).claimRewards();
    const after = await token.balanceOf(owner.address);
    expect(after - before).to.equal(BigInt(reward / 10));
  });

  it('allows employer to cancel before completion', async () => {
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await expect(registry.connect(employer).cancelJob(jobId))
      .to.emit(registry, 'JobCancelled')
      .withArgs(jobId);
    const job = await registry.jobs(jobId);
    expect(job.state).to.equal(7); // Cancelled enum value
    expect(await token.balanceOf(employer.address)).to.equal(1000);
  });

  it('allows owner to delist unassigned job', async () => {
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await expect(registry.connect(owner).delistJob(jobId))
      .to.emit(registry, 'JobCancelled')
      .withArgs(jobId);
    const job = await registry.jobs(jobId);
    expect(job.state).to.equal(7);
  });

  it('enforces owner-only controls', async () => {
    await expect(
      registry
        .connect(employer)
        .setModules(
          await validation.getAddress(),
          await stakeManager.getAddress(),
          await rep.getAddress(),
          await dispute.getAddress(),
          await nft.getAddress(),
          ethers.ZeroAddress,
          []
        )
    ).to.be.revertedWith('governance only');

    await expect(
      registry.connect(agent).setJobParameters(1, 1)
    ).to.be.revertedWith('governance only');

    await expect(
      dispute.connect(agent).setDisputeFee(1)
    ).to.be.revertedWithCustomError(dispute, 'OwnableUnauthorizedAccount');
  });

  it('validates fee percentage caps', async () => {
    await registry.connect(owner).setValidatorRewardPct(60);
    await expect(
      registry.connect(owner).setFeePct(50)
    ).to.be.revertedWithCustomError(registry, 'InvalidPercentage');
    await registry.connect(owner).setFeePct(40);
    await expect(
      registry.connect(owner).setValidatorRewardPct(70)
    ).to.be.revertedWithCustomError(registry, 'InvalidPercentage');
  });

  it('emits events when setting modules', async () => {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await validation.getAddress(),
          await stakeManager.getAddress(),
          await rep.getAddress(),
          await dispute.getAddress(),
          await nft.getAddress(),
          await feePool.getAddress(),
          []
        )
    )
      .to.emit(registry, 'ValidationModuleUpdated')
      .withArgs(await validation.getAddress())
      .and.to.emit(registry, 'StakeManagerUpdated')
      .withArgs(await stakeManager.getAddress())
      .and.to.emit(registry, 'ReputationEngineUpdated')
      .withArgs(await rep.getAddress())
      .and.to.emit(registry, 'DisputeModuleUpdated')
      .withArgs(await dispute.getAddress())
      .and.to.emit(registry, 'CertificateNFTUpdated')
      .withArgs(await nft.getAddress())
      .and.to.emit(registry, 'AcknowledgerUpdated')
      .withArgs(await stakeManager.getAddress(), true);
  });

  it('auto-registers acknowledgers', async () => {
    // stake manager registered during setup
    expect(
      await registry.acknowledgers(await stakeManager.getAddress())
    ).to.equal(true);

    const AckStub = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const ack = await AckStub.deploy(ethers.ZeroAddress);
    await registry
      .connect(owner)
      .setModules(
        await validation.getAddress(),
        await stakeManager.getAddress(),
        await rep.getAddress(),
        await dispute.getAddress(),
        await nft.getAddress(),
        await feePool.getAddress(),
        [await ack.getAddress()]
      );

    expect(await registry.acknowledgers(await ack.getAddress())).to.equal(true);
  });

  it('updates additional agents individually', async () => {
    await expect(identity.addAdditionalAgent(treasury.address))
      .to.emit(identity, 'AdditionalAgentUpdated')
      .withArgs(treasury.address, true);
    expect(await identity.additionalAgents(treasury.address)).to.equal(true);

    await expect(identity.removeAdditionalAgent(treasury.address))
      .to.emit(identity, 'AdditionalAgentUpdated')
      .withArgs(treasury.address, false);
    expect(await identity.additionalAgents(treasury.address)).to.equal(false);
  });
});
