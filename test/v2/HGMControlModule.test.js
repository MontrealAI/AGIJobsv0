const { expect } = require('chai');
const { ethers } = require('hardhat');

async function deployMocks() {
  const JobMock = await ethers.getContractFactory('HGMJobRegistryMock');
  const jobMock = await JobMock.deploy();

  const StakeMock = await ethers.getContractFactory('HGMStakeManagerMock');
  const stakeMock = await StakeMock.deploy();

  const PauseMock = await ethers.getContractFactory('HGMSystemPauseMock');
  const pauseMock = await PauseMock.deploy();

  const PlatformMock = await ethers.getContractFactory('HGMPlatformRegistryMock');
  const platformMock = await PlatformMock.deploy();

  const ReputationMock = await ethers.getContractFactory('HGMReputationEngineMock');
  const reputationMock = await ReputationMock.deploy();

  return { jobMock, stakeMock, pauseMock, platformMock, reputationMock };
}

describe('HGMControlModule', function () {
  let owner;
  let other;
  let module;
  let mocks;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    mocks = await deployMocks();
    const Module = await ethers.getContractFactory('HGMControlModule');
    module = await Module.deploy(
      [
        await mocks.jobMock.getAddress(),
        await mocks.stakeMock.getAddress(),
        await mocks.pauseMock.getAddress(),
        await mocks.platformMock.getAddress(),
        await mocks.reputationMock.getAddress(),
      ],
      owner.address,
    );
  });

  it('restricts non-owner access', async function () {
    await expect(module.connect(other).pauseSystem())
      .to.be.revertedWithCustomError(module, 'OwnableUnauthorizedAccount')
      .withArgs(other.address);
  });

  it('pauses and resumes the system', async function () {
    await expect(module.pauseSystem()).to.emit(module, 'SystemPaused');
    expect(await mocks.pauseMock.paused()).to.equal(true);

    await expect(module.resumeSystem()).to.emit(module, 'SystemUnpaused');
    expect(await mocks.pauseMock.paused()).to.equal(false);
  });

  it('updates job economics in batch', async function () {
    await module.updateJobEconomics({
      setJobStake: true,
      jobStake: 5n,
      setMinAgentStake: true,
      minAgentStake: 6n,
      setFeePct: true,
      feePct: 7n,
      setValidatorRewardPct: true,
      validatorRewardPct: 8n,
      setMaxJobReward: true,
      maxJobReward: 9n,
      setJobDurationLimit: true,
      jobDurationLimit: 10n,
      setMaxActiveJobsPerAgent: true,
      maxActiveJobsPerAgent: 11n,
      setExpirationGracePeriod: true,
      expirationGracePeriod: 12n,
    });

    expect(await mocks.jobMock.jobStake()).to.equal(5n);
    expect(await mocks.jobMock.minAgentStake()).to.equal(6n);
    expect(await mocks.jobMock.feePct()).to.equal(7n);
    expect(await mocks.jobMock.validatorRewardPct()).to.equal(8n);
    expect(await mocks.jobMock.maxJobReward()).to.equal(9n);
    expect(await mocks.jobMock.jobDurationLimit()).to.equal(10n);
    expect(await mocks.jobMock.maxActiveJobsPerAgent()).to.equal(11n);
    expect(await mocks.jobMock.expirationGracePeriod()).to.equal(12n);
  });

  it('updates job access metadata', async function () {
    await module.updateJobAccess({
      setAgentRootNode: true,
      agentRootNode: ethers.encodeBytes32String('agent-root'),
      setAgentMerkleRoot: true,
      agentMerkleRoot: ethers.encodeBytes32String('agent-merkle'),
      setValidatorRootNode: true,
      validatorRootNode: ethers.encodeBytes32String('validator-root'),
      setValidatorMerkleRoot: true,
      validatorMerkleRoot: ethers.encodeBytes32String('validator-merkle'),
      bumpAgentAuthCacheVersion: true,
      setAgentAuthCacheDuration: true,
      agentAuthCacheDuration: 777n,
    });

    expect(await mocks.jobMock.agentRootNode()).to.equal(ethers.encodeBytes32String('agent-root'));
    expect(await mocks.jobMock.agentMerkleRoot()).to.equal(ethers.encodeBytes32String('agent-merkle'));
    expect(await mocks.jobMock.validatorRootNode()).to.equal(ethers.encodeBytes32String('validator-root'));
    expect(await mocks.jobMock.validatorMerkleRoot()).to.equal(ethers.encodeBytes32String('validator-merkle'));
    expect(await mocks.jobMock.authCacheVersionBumps()).to.equal(1n);
    expect(await mocks.jobMock.authCacheDuration()).to.equal(777n);
  });

  it('coordinates funding updates across modules', async function () {
    const feePool = ethers.Wallet.createRandom().address;
    const treasury = ethers.Wallet.createRandom().address;

    await module.updateJobFunding({
      setFeePool: true,
      feePool,
      setTreasury: true,
      treasury,
      setTaxPolicy: true,
      taxPolicy: ethers.ZeroAddress,
    });

    expect(await mocks.jobMock.feePool()).to.equal(feePool);
    expect(await mocks.jobMock.treasury()).to.equal(treasury);
    expect(await mocks.stakeMock.feePool()).to.equal(feePool);
    expect(await mocks.stakeMock.treasury()).to.equal(treasury);
    expect(await mocks.jobMock.taxPolicy()).to.equal(ethers.ZeroAddress);
  });

  it('validates stake manager allowlist length', async function () {
    await expect(
      module.configureStakeManager({
        setFeePct: false,
        feePct: 0,
        setBurnPct: false,
        burnPct: 0,
        setValidatorRewardPct: false,
        validatorRewardPct: 0,
        setMinStake: false,
        minStake: 0,
        setMaxStakePerAddress: false,
        maxStakePerAddress: 0,
        setUnbondingPeriod: false,
        unbondingPeriod: 0,
        setFeePool: false,
        feePool: ethers.ZeroAddress,
        setTreasury: false,
        treasury: ethers.ZeroAddress,
        treasuryAllowlist: [owner.address],
        treasuryAllowlistStatus: [],
      }),
    ).to.be.revertedWithCustomError(module, 'ArrayLengthMismatch');
  });

  it('configures stake manager values and allowlist', async function () {
    const allowlistAddress = ethers.Wallet.createRandom().address;
    await module.configureStakeManager({
      setFeePct: true,
      feePct: 101n,
      setBurnPct: true,
      burnPct: 55n,
      setValidatorRewardPct: true,
      validatorRewardPct: 202n,
      setMinStake: true,
      minStake: 303n,
      setMaxStakePerAddress: true,
      maxStakePerAddress: 404n,
      setUnbondingPeriod: true,
      unbondingPeriod: 505n,
      setFeePool: true,
      feePool: allowlistAddress,
      setTreasury: true,
      treasury: owner.address,
      treasuryAllowlist: [allowlistAddress],
      treasuryAllowlistStatus: [true],
    });

    expect(await mocks.stakeMock.feePct()).to.equal(101n);
    expect(await mocks.stakeMock.burnPct()).to.equal(55n);
    expect(await mocks.stakeMock.validatorRewardPct()).to.equal(202n);
    expect(await mocks.stakeMock.minStake()).to.equal(303n);
    expect(await mocks.stakeMock.maxStakePerAddress()).to.equal(404n);
    expect(await mocks.stakeMock.unbondingPeriod()).to.equal(505n);
    expect(await mocks.stakeMock.feePool()).to.equal(allowlistAddress);
    expect(await mocks.stakeMock.treasury()).to.equal(owner.address);
    expect(await mocks.stakeMock.treasuryAllowlist(allowlistAddress)).to.equal(true);
  });

  it('configures pausers across modules', async function () {
    const cfg = {
      setJobRegistryPauserManager: true,
      jobRegistryPauserManager: owner.address,
      setStakeManagerPauserManager: true,
      stakeManagerPauserManager: owner.address,
      setSystemPauseGlobalPauser: true,
      systemPauseGlobalPauser: other.address,
      refreshSystemPause: true,
      setPlatformRegistryPauser: true,
      platformRegistryPauser: owner.address,
      setPlatformRegistryPauserManager: true,
      platformRegistryPauserManager: other.address,
      setReputationEnginePauser: true,
      reputationEnginePauser: owner.address,
      setReputationEnginePauserManager: true,
      reputationEnginePauserManager: other.address,
    };

    await expect(module.configurePausers(cfg)).to.emit(module, 'PausersUpdated');
    expect(await mocks.jobMock.pauserManager()).to.equal(owner.address);
    expect(await mocks.stakeMock.pauserManager()).to.equal(owner.address);
    expect(await mocks.pauseMock.globalPauser()).to.equal(other.address);
    expect(await mocks.pauseMock.refreshCount()).to.equal(1n);
    expect(await mocks.platformMock.pauser()).to.equal(owner.address);
    expect(await mocks.platformMock.pauserManager()).to.equal(other.address);
    expect(await mocks.reputationMock.pauser()).to.equal(owner.address);
    expect(await mocks.reputationMock.pauserManager()).to.equal(other.address);
  });

  it('applies platform registry configuration', async function () {
    const config = {
      setStakeManager: true,
      stakeManager: await mocks.stakeMock.getAddress(),
      setReputationEngine: true,
      reputationEngine: await mocks.reputationMock.getAddress(),
      setMinPlatformStake: true,
      minPlatformStake: 42n,
      setPauser: true,
      pauser: owner.address,
      setPauserManager: true,
      pauserManager: other.address,
    };

    const registrarUpdates = [{ registrar: owner.address, allowed: true }];
    const blacklistUpdates = [{ operator: other.address, status: true }];

    await expect(
      module.configurePlatformRegistry(config, registrarUpdates, blacklistUpdates),
    ).to.emit(module, 'PlatformRegistryConfigured').withArgs(
      registrarUpdates.length,
      blacklistUpdates.length,
      true,
      true,
      owner.address,
    );

    const stored = await mocks.platformMock.lastConfig();
    expect(stored.setStakeManager).to.equal(true);
    expect(stored.setReputationEngine).to.equal(true);
    expect(stored.setMinPlatformStake).to.equal(true);
    expect(await mocks.platformMock.registrarUpdates()).to.equal(1n);
    expect(await mocks.platformMock.blacklistUpdates()).to.equal(1n);
    expect(await mocks.platformMock.applyCalls()).to.equal(1n);
  });

  it('validates reputation engine blacklist arrays', async function () {
    await expect(
      module.configureReputationEngine({
        setScoringWeights: false,
        stakeWeight: 0,
        reputationWeight: 0,
        setPremiumThreshold: false,
        premiumThreshold: 0,
        setValidationRewardPercentage: false,
        validationRewardPercentage: 0,
        setStakeManager: false,
        stakeManager: ethers.ZeroAddress,
        addCallers: [],
        removeCallers: [],
        blacklist: [owner.address],
        blacklistStatus: [],
        setPauser: false,
        pauser: ethers.ZeroAddress,
        setPauserManager: false,
        pauserManager: ethers.ZeroAddress,
      }),
    ).to.be.revertedWithCustomError(module, 'ArrayLengthMismatch');
  });

  it('configures reputation engine tuning and access', async function () {
    const addCaller = ethers.Wallet.createRandom().address;
    const removeCaller = ethers.Wallet.createRandom().address;
    const blacklistAddress = ethers.Wallet.createRandom().address;

    await module.configureReputationEngine({
      setScoringWeights: true,
      stakeWeight: 1_000n,
      reputationWeight: 2_000n,
      setPremiumThreshold: true,
      premiumThreshold: 3_000n,
      setValidationRewardPercentage: true,
      validationRewardPercentage: 4_000n,
      setStakeManager: true,
      stakeManager: await mocks.stakeMock.getAddress(),
      addCallers: [addCaller],
      removeCallers: [removeCaller],
      blacklist: [blacklistAddress],
      blacklistStatus: [true],
      setPauser: true,
      pauser: owner.address,
      setPauserManager: true,
      pauserManager: other.address,
    });

    expect(await mocks.reputationMock.stakeWeight()).to.equal(1_000n);
    expect(await mocks.reputationMock.reputationWeight()).to.equal(2_000n);
    expect(await mocks.reputationMock.premiumThreshold()).to.equal(3_000n);
    expect(await mocks.reputationMock.validationRewardPercentage()).to.equal(4_000n);
    expect(await mocks.reputationMock.stakeManager()).to.equal(await mocks.stakeMock.getAddress());
    expect(await mocks.reputationMock.callers(addCaller)).to.equal(true);
    expect(await mocks.reputationMock.callers(removeCaller)).to.equal(false);
    expect(await mocks.reputationMock.blacklist(blacklistAddress)).to.equal(true);
    expect(await mocks.reputationMock.pauser()).to.equal(owner.address);
    expect(await mocks.reputationMock.pauserManager()).to.equal(other.address);
  });

  it('rejects zero addresses when updating control targets', async function () {
    await expect(
      module.updateControlTargets([
        ethers.ZeroAddress,
        await mocks.stakeMock.getAddress(),
        await mocks.pauseMock.getAddress(),
        await mocks.platformMock.getAddress(),
        await mocks.reputationMock.getAddress(),
      ]),
    )
      .to.be.revertedWithCustomError(module, 'ControlTargetUnset')
      .withArgs(ethers.encodeBytes32String('JOB_REGISTRY'));
  });
});
