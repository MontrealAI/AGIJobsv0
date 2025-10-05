const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');

describe('job finalization integration', function () {
  let token,
    stakeManager,
    rep,
    validation,
    nft,
    registry,
    dispute,
    feePool,
    policy;
  let owner, employer, agent, validator1, validator2;
  const reward = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  const stakeRequired = ethers.parseUnits('200', AGIALPHA_DECIMALS);
  const feePct = 10;
  const validatorRewardPct = 10;
  const mintAmount = ethers.parseUnits('10000', AGIALPHA_DECIMALS);

  beforeEach(async () => {
    [owner, employer, agent, validator1, validator2] =
      await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );
    await token.mint(owner.address, mintAmount);
    await token.mint(employer.address, mintAmount);
    await token.mint(agent.address, mintAmount);

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await Stake.deploy(
      0,
      10_000,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );

    await stakeManager.connect(owner).setMinStake(1);

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
      ethers.ZeroAddress,
      owner.address
    );
    await dispute.connect(owner).setDisputeFee(0);
    await dispute.connect(owner).setDisputeWindow(0);

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await feePool.setBurnPct(0);

    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy(
      'ipfs://policy',
      'All taxes on participants; contract and owner exempt'
    );

    await registry.setModules(
      await validation.getAddress(),
      await stakeManager.getAddress(),
      await rep.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await feePool.getAddress(),
      []
    );
    await validation.setJobRegistry(await registry.getAddress());
    await registry.setFeePct(feePct);
    await registry.setValidatorRewardPct(validatorRewardPct);
    await registry.setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await registry.setJobParameters(0, stakeRequired);
    await registry.setMaxJobReward(reward);
    await registry.setJobDurationLimit(86400);
    await stakeManager.setJobRegistry(await registry.getAddress());
    await stakeManager.setValidationModule(await validation.getAddress());
    await stakeManager.setDisputeModule(await dispute.getAddress());
    await stakeManager.setSlashingPercentages(100, 0);
    await nft.setJobRegistry(await registry.getAddress());
    await rep.setAuthorizedCaller(await registry.getAddress(), true);
    await rep.setThreshold(0);
    await nft.transferOwnership(await registry.getAddress());

    await policy.acknowledge();
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();
    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    const identity = await Identity.deploy();
    await registry.setIdentityRegistry(await identity.getAddress());
    await validation.setValidators([validator1.address, validator2.address]);
  });

  async function setupJob(result) {
    const fee = (reward * BigInt(feePct)) / 100n;
    const vReward = (reward * BigInt(validatorRewardPct)) / 100n;
    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    const burnPctNow = await stakeManager.burnPct();
    const burnAmt = ((reward - vReward) * BigInt(burnPctNow)) / 100n;
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee + burnAmt);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await registry.connect(agent).acknowledgeAndApply(jobId, 'agent', []);
    await validation.setResult(result);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('result'), 'result', 'agent', []);
    return { jobId, fee, vReward };
  }

  it('finalizes successful job', async () => {
    const { jobId, fee, vReward } = await setupJob(true);
    const agentBefore = await token.balanceOf(agent.address);
    await expect(validation.finalize(jobId))
      .to.emit(registry, 'JobCompleted')
      .withArgs(jobId, true);
    const burnTxHash = ethers.ZeroHash;
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTxHash, fee, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTxHash);
    await expect(registry.connect(employer).finalize(jobId))
      .to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);
    const agentAfter = await token.balanceOf(agent.address);
    const employerAfter = await token.balanceOf(employer.address);
    const v1Bal = await token.balanceOf(validator1.address);
    const v2Bal = await token.balanceOf(validator2.address);
    expect(agentAfter - agentBefore).to.equal(reward - vReward);
    expect(employerAfter).to.equal(mintAmount - reward - fee);
    expect(v1Bal).to.equal(vReward / 2n);
    expect(v2Bal).to.equal(vReward / 2n);
    expect(await rep.reputation(agent.address)).to.equal(152n);
    expect(await nft.balanceOf(agent.address)).to.equal(1n);
  });

  it('finalizes failed job after employer dispute', async () => {
    // seed reputation to observe subtraction
    await rep.connect(owner).setAuthorizedCaller(owner.address, true);
    await rep.connect(owner).add(agent.address, 5);

    const { jobId, fee } = await setupJob(false);
    const feePoolAddress = await feePool.getAddress();
    const feePoolBefore = await token.balanceOf(feePoolAddress);
    await expect(validation.finalize(jobId))
      .to.emit(registry, 'JobCompleted')
      .withArgs(jobId, false);
    await network.provider.send('hardhat_setBalance', [
      dispute.target,
      '0x56BC75E2D63100000',
    ]);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [dispute.target],
    });
    const disputeSigner = await ethers.getSigner(dispute.target);
    const employerBefore = await token.balanceOf(employer.address);
    const agentBefore = await token.balanceOf(agent.address);
    await expect(registry.connect(disputeSigner).resolveDispute(jobId, true))
      .to.emit(registry, 'DisputeResolved')
      .withArgs(jobId, true);
    const burnTxHash2 = ethers.ZeroHash;
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTxHash2, fee, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTxHash2);
    await expect(registry.connect(employer).finalize(jobId))
      .to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [dispute.target],
    });
    const employerAfter = await token.balanceOf(employer.address);
    const agentAfter = await token.balanceOf(agent.address);
    expect(employerAfter - employerBefore).to.equal(
      reward + fee + stakeRequired
    );
    expect(agentAfter).to.equal(agentBefore);
    const feePoolAfter = await token.balanceOf(feePoolAddress);
    expect(feePoolAfter).to.equal(feePoolBefore);
    expect(await rep.reputation(agent.address)).to.equal(4);
    expect(await nft.balanceOf(agent.address)).to.equal(0n);
  });

  it("finalizes job in agent's favour after dispute", async () => {
    const { jobId, fee, vReward } = await setupJob(false);
    await expect(validation.finalize(jobId))
      .to.emit(registry, 'JobCompleted')
      .withArgs(jobId, false);
    await network.provider.send('hardhat_setBalance', [
      dispute.target,
      '0x56BC75E2D63100000',
    ]);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [dispute.target],
    });
    const disputeSigner = await ethers.getSigner(dispute.target);
    const agentBefore = await token.balanceOf(agent.address);
    const employerBefore = await token.balanceOf(employer.address);
    const v1Before = await token.balanceOf(validator1.address);
    const v2Before = await token.balanceOf(validator2.address);
    await expect(registry.connect(disputeSigner).resolveDispute(jobId, false))
      .to.emit(registry, 'DisputeResolved')
      .withArgs(jobId, false);
    const validatorsAfterDispute = await registry.getJobValidators(jobId);
    expect(validatorsAfterDispute).to.have.lengthOf(0);
    const burnTxHash3 = ethers.ZeroHash;
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTxHash3, fee, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTxHash3);
    await expect(registry.connect(employer).finalize(jobId))
      .to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [dispute.target],
    });
    const agentAfter = await token.balanceOf(agent.address);
    const employerAfter = await token.balanceOf(employer.address);
    const v1Bal = await token.balanceOf(validator1.address);
    const v2Bal = await token.balanceOf(validator2.address);
    // Validators forfeited their share after being overruled by the dispute
    // module, so the agent receives the full reward.
    expect(agentAfter - agentBefore).to.equal(reward);
    expect(employerAfter).to.equal(employerBefore);
    expect(v1Bal - v1Before).to.equal(0n);
    expect(v2Bal - v2Before).to.equal(0n);
    expect(await rep.reputation(agent.address)).to.equal(152n);
    expect(await nft.balanceOf(agent.address)).to.equal(1n);
  });

  it('rejects non-employer finalization after validation', async () => {
    const { jobId } = await setupJob(true);
    await expect(validation.finalize(jobId))
      .to.emit(registry, 'JobCompleted')
      .withArgs(jobId, true);
    await expect(
      registry.connect(agent).finalize(jobId)
    ).to.be.revertedWithCustomError(registry, 'OnlyEmployer');
  });

  it('emits burn and reward events on employer finalization', async () => {
    await stakeManager.connect(owner).setBurnPct(10);
    const { jobId, fee } = await setupJob(true);
    await validation.finalize(jobId);
    const jobKey = ethers.toBeHex(jobId, 32);
    const validatorReward = (reward * BigInt(validatorRewardPct)) / 100n;
    const rewardAfterValidator = reward - validatorReward;
    const burnShare = (rewardAfterValidator * 10n) / 100n;
    const burnAmount = fee + burnShare;
    const agentReward = rewardAfterValidator - burnShare;
    const burnTxHash4 = ethers.ZeroHash;
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTxHash4, burnAmount, 0);
    await expect(
      registry.connect(employer).confirmEmployerBurn(jobId, burnTxHash4)
    )
      .to.emit(registry, 'BurnConfirmed')
      .withArgs(jobId, burnTxHash4);
    await expect(registry.connect(employer).finalize(jobId))
      .to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobKey, agent.address, agentReward);
  });

  it('allows employers to claim timeout for applied jobs', async () => {
    const grace = 300;
    await registry.connect(owner).setExpirationGracePeriod(BigInt(grace));

    const employerInitial = await token.balanceOf(employer.address);

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);

    const fee = (reward * BigInt(feePct)) / 100n;
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);

    const now = BigInt(await time.latest());
    const deadline = now + 1000n;
    const specHash = ethers.id('timeout-spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'timeout://job');

    const jobId = 1;
    await registry.connect(agent).acknowledgeAndApply(jobId, 'agent', []);

    await expect(
      registry.connect(employer).claimTimeout(jobId)
    ).to.be.revertedWithCustomError(registry, 'CannotExpire');

    const expiration = deadline + BigInt(grace);
    await time.increaseTo(expiration + 1n);

    const agentStakeBefore = await stakeManager.stakeOf(agent.address, 0);
    const employerBeforeClaim = await token.balanceOf(employer.address);
    const feePoolAddress = await feePool.getAddress();
    const feePoolBefore = await token.balanceOf(feePoolAddress);

    await expect(registry.connect(employer).claimTimeout(jobId))
      .to.emit(registry, 'JobTimedOut')
      .withArgs(jobId, employer.address);

    const employerAfter = await token.balanceOf(employer.address);
    expect(employerAfter - employerBeforeClaim).to.equal(
      reward + fee + stakeRequired
    );
    expect(employerAfter - employerInitial).to.equal(stakeRequired);

    const agentStakeAfter = await stakeManager.stakeOf(agent.address, 0);
    expect(agentStakeAfter).to.equal(agentStakeBefore - stakeRequired);

    const feePoolAfter = await token.balanceOf(feePoolAddress);
    expect(feePoolAfter).to.equal(feePoolBefore);

    const stats = await registry.employerStats(employer.address);
    expect(stats.failed).to.equal(1n);

    await expect(
      registry.connect(employer).claimTimeout(jobId)
    ).to.be.revertedWithCustomError(registry, 'InvalidJobState');
  });

  it('keeps modules tax exempt with zero balances after finalization', async () => {
    // eliminate fees and validator rewards so modules hold no residual funds
    await registry.setFeePct(0);
    await registry.setValidatorRewardPct(0);

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');

    const jobId = 1;
    await registry.connect(agent).acknowledgeAndApply(jobId, 'agent', []);
    await validation.setResult(true);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('result'), 'result', 'agent', []);

    await validation.finalize(jobId);
    await registry.connect(employer).finalize(jobId);

    expect(await registry.isTaxExempt()).to.equal(true);
    expect(await stakeManager.isTaxExempt()).to.equal(true);
    expect(await feePool.isTaxExempt()).to.equal(true);

    expect(await token.balanceOf(await registry.getAddress())).to.equal(0);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(0);
    expect(await token.balanceOf(await stakeManager.getAddress())).to.equal(
      stakeRequired
    );
  });
});
