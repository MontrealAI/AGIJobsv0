const { expect } = require('chai');
const { ethers } = require('hardhat');
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

    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
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
      100,
      0,
      owner.address,
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
      ethers.ZeroAddress
    );
    await dispute.connect(owner).setDisputeFee(0);
    await dispute.connect(owner).setDisputeWindow(0);

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
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
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await registry.connect(agent).acknowledgeAndApply(jobId, '', []);
    await validation.setResult(result);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('result'), 'result', '', []);
    return { jobId, fee, vReward };
  }

  it('finalizes successful job', async () => {
    const { jobId, fee, vReward } = await setupJob(true);
    const agentBefore = await token.balanceOf(agent.address);
    await expect(validation.finalize(jobId))
      .to.emit(registry, 'JobCompleted')
      .withArgs(jobId, true);
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
    expect(await rep.reputation(agent.address)).to.equal(4);
    expect(await nft.balanceOf(agent.address)).to.equal(0n);
  });

  it("finalizes job in agent's favour after dispute", async () => {
    const { jobId, vReward } = await setupJob(false);
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
    await expect(registry.connect(disputeSigner).resolveDispute(jobId, false))
      .to.emit(registry, 'DisputeResolved')
      .withArgs(jobId, false);
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
    expect(agentAfter - agentBefore).to.equal(reward - vReward);
    expect(employerAfter).to.equal(employerBefore);
    expect(v1Bal).to.equal(vReward / 2n);
    expect(v2Bal).to.equal(vReward / 2n);
    expect(await rep.reputation(agent.address)).to.equal(152n);
    expect(await nft.balanceOf(agent.address)).to.equal(1n);
  });
});
