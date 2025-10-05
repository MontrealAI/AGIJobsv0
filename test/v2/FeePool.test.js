const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('FeePool', function () {
  let token,
    stakeManager,
    jobRegistry,
    feePool,
    policy,
    owner,
    user1,
    user2,
    user3,
    employer,
    treasury,
    registrySigner;

  const { AGIALPHA } = require('../../scripts/constants');
  beforeEach(async () => {
    [owner, user1, user2, user3, employer, treasury] =
      await ethers.getSigners();
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
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
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    jobRegistry = await JobRegistry.deploy(
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
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await policy.connect(user1).acknowledge();
    await policy.connect(user2).acknowledge();
    await policy.connect(user3).acknowledge();

    await token.mint(user1.address, 1000);
    await token.mint(user2.address, 1000);
    await token.mint(user3.address, 1000);
    await token.mint(employer.address, 1000);

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      await policy.getAddress(),
      ethers.ZeroAddress
    );
    await feePool.setBurnPct(0);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await token.connect(user1).approve(await stakeManager.getAddress(), 1000);
    await token.connect(user2).approve(await stakeManager.getAddress(), 1000);
    await token.connect(user3).approve(await stakeManager.getAddress(), 1000);
    await stakeManager.connect(user1).depositStake(2, 100);
    await stakeManager.connect(user2).depositStake(2, 300);
  });

  it('allows direct contributions', async () => {
    await token.connect(user1).approve(await feePool.getAddress(), 100);
    await expect(feePool.connect(user1).contribute(100))
      .to.emit(feePool, 'RewardPoolContribution')
      .withArgs(user1.address, 100);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(100n);
    expect(await feePool.pendingFees()).to.equal(100n);
  });

  it('distributes rewards proportionally', async () => {
    const feeAmount = 100;
    const jobId = ethers.encodeBytes32String('job1');
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        registrySigner.address,
        user1.address,
        0,
        0,
        feeAmount,
        await feePool.getAddress(),
        false
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(25n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(75n);
  });

  it('burns configured share when fees are deposited', async () => {
    await feePool.connect(owner).setBurnPct(5);
    const amount = 200;
    await token.mint(await feePool.getAddress(), amount);
    const stakeManagerAddr = await stakeManager.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      stakeManagerAddr,
      '0x56BC75E2D63100000',
    ]);
    const smSigner = await ethers.getImpersonatedSigner(stakeManagerAddr);
    const burn = Math.floor((amount * 5) / 100);
    await expect(feePool.connect(smSigner).depositFee(amount))
      .to.emit(feePool, 'FeesBurned')
      .withArgs(smSigner.address, burn);
    expect(await feePool.pendingFees()).to.equal(BigInt(amount - burn));
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(
      BigInt(amount - burn)
    );
  });

  it('accounts for NFT multipliers when distributing rewards', async () => {
    const MockNFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const tier1 = await MockNFT.deploy();
    const tier2 = await MockNFT.deploy();
    await stakeManager.connect(owner).addAGIType(await tier1.getAddress(), 150);
    await stakeManager.connect(owner).addAGIType(await tier2.getAddress(), 200);
    await tier1.mint(user2.address);
    await tier2.mint(user3.address);
    await stakeManager.connect(user3).depositStake(2, 100);
    await stakeManager.connect(user2).withdrawStake(2, 200);

    const feeAmount = 450;
    await token.mint(await feePool.getAddress(), feeAmount);
    await ethers.provider.send('hardhat_setBalance', [
      await stakeManager.getAddress(),
      '0x56BC75E2D63100000',
    ]);
    const smSigner = await ethers.getImpersonatedSigner(
      await stakeManager.getAddress()
    );
    await feePool.connect(smSigner).depositFee(feeAmount);

    await feePool.connect(owner).distributeFees();
    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    const before3 = await token.balanceOf(user3.address);
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    await feePool.connect(user3).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(100n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(150n);
    expect((await token.balanceOf(user3.address)) - before3).to.equal(200n);
  });

  it('records leftover distributions to the treasury', async () => {
    await feePool.connect(owner).setTreasuryAllowlist(treasury.address, true);
    await feePool.connect(owner).setTreasury(treasury.address);
    await feePool.connect(owner).setRewarder(owner.address, true);
    await token.mint(await feePool.getAddress(), 50);

    await expect(feePool.connect(owner).reward(treasury.address, 50))
      .to.emit(feePool, 'TreasuryRewarded')
      .withArgs(treasury.address, 50);
    expect(await feePool.treasuryRewards(treasury.address)).to.equal(50n);
  });

  it('prevents rewarders from depleting pending fees', async () => {
    await feePool.connect(owner).setRewarder(owner.address, true);

    const poolAddress = await feePool.getAddress();
    await token.mint(poolAddress, 150);

    const stakeManagerAddr = await stakeManager.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      stakeManagerAddr,
      '0x56BC75E2D63100000',
    ]);
    const smSigner = await ethers.getImpersonatedSigner(stakeManagerAddr);
    await feePool.connect(smSigner).depositFee(100);

    await expect(
      feePool.connect(owner).reward(owner.address, 60)
    ).to.be.revertedWithCustomError(feePool, 'InsufficientRewardBalance');

    await expect(feePool.connect(owner).reward(owner.address, 50)).to.not.be
      .reverted;

    expect(await feePool.pendingFees()).to.equal(100n);
    expect(await token.balanceOf(poolAddress)).to.equal(100n);
  });

  it('distributes rewards to validators when configured', async () => {
    // additional validator stakes
    await token.connect(user1).approve(await stakeManager.getAddress(), 100);
    await token.connect(user2).approve(await stakeManager.getAddress(), 300);
    await stakeManager.connect(user1).depositStake(1, 100);
    await stakeManager.connect(user2).depositStake(1, 300);
    await feePool.connect(owner).setRewardRole(1);

    const feeAmount = 100;
    const jobId = ethers.encodeBytes32String('jobV');
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        registrySigner.address,
        user1.address,
        0,
        0,
        feeAmount,
        await feePool.getAddress(),
        false
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(25n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(75n);
  });

  it('burns configured percentage of fees', async () => {
    await feePool.connect(owner).setBurnPct(25);
    const feeAmount = 80;
    const jobId = ethers.encodeBytes32String('job2');
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), feeAmount);
    const supplyBefore = await token.totalSupply();
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        registrySigner.address,
        user1.address,
        0,
        0,
        feeAmount,
        await feePool.getAddress(),
        false
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(15n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(45n);
    const supplyAfter = await token.totalSupply();
    expect(supplyBefore - supplyAfter).to.equal(20n);
  });

  it('finalizes jobs after a tax policy bump without stake manager re-acknowledgement', async () => {
    const stakeManagerAddress = await stakeManager.getAddress();
    const feePoolAddress = await feePool.getAddress();

    await policy.connect(owner).setAcknowledger(owner.address, true);
    await policy.connect(owner).acknowledgeFor(stakeManagerAddress);
    expect(await policy.hasAcknowledged(stakeManagerAddress)).to.equal(true);

    await policy.connect(owner).bumpPolicyVersion();
    expect(await policy.hasAcknowledged(stakeManagerAddress)).to.equal(false);

    const jobId = ethers.encodeBytes32String('jobPolicyReset');
    const feeAmount = 100n;
    await token.connect(employer).approve(stakeManagerAddress, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);

    await expect(
      stakeManager
        .connect(registrySigner)
        .finalizeJobFunds(
          jobId,
          registrySigner.address,
          user1.address,
          0,
          0,
          feeAmount,
          feePoolAddress,
          false
        )
    ).to.not.be.reverted;

    expect(await feePool.pendingFees()).to.equal(feeAmount);
    expect(await feePool.cumulativePerToken()).to.equal(0n);

    await policy.connect(user1).acknowledge();
    await policy.connect(user2).acknowledge();
    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(25n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(75n);
  });

  it('emits zero payout for owner without stake', async () => {
    const feeAmount = 50;
    const jobId = ethers.encodeBytes32String('job4');
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        registrySigner.address,
        user1.address,
        0,
        0,
        feeAmount,
        await feePool.getAddress(),
        false
      );
    await feePool.connect(owner).distributeFees();
    const before = await token.balanceOf(owner.address);
    await expect(feePool.connect(owner).claimRewards())
      .to.emit(feePool, 'RewardsClaimed')
      .withArgs(owner.address, 0);
    expect(await token.balanceOf(owner.address)).to.equal(before);
  });

  it('burns pending fees when no stakers are present', async () => {
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    const emptyStakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    const burnPool = await FeePool.deploy(
      await emptyStakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await token.connect(user1).approve(await burnPool.getAddress(), 100);
    await burnPool.connect(user1).contribute(100);
    expect(await burnPool.pendingFees()).to.equal(100n);
    const supplyBefore = await token.totalSupply();
    const ownerBalBefore = await token.balanceOf(owner.address);
    await burnPool.connect(owner).distributeFees();
    expect(await burnPool.pendingFees()).to.equal(0n);
    const supplyAfter = await token.totalSupply();
    expect(supplyBefore - supplyAfter).to.equal(100n);
    expect(await token.balanceOf(owner.address)).to.equal(ownerBalBefore);
  });

  it('keeps modules tax exempt with zero balances after fee distribution', async () => {
    const staked = await token.balanceOf(await stakeManager.getAddress());
    const feeAmount = 100;
    const jobId = ethers.encodeBytes32String('jobT');
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        registrySigner.address,
        user1.address,
        0,
        0,
        feeAmount,
        await feePool.getAddress(),
        false
      );
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();

    expect(await jobRegistry.isTaxExempt()).to.equal(true);
    expect(await stakeManager.isTaxExempt()).to.equal(true);
    expect(await feePool.isTaxExempt()).to.equal(true);

    expect(await token.balanceOf(await jobRegistry.getAddress())).to.equal(0n);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(0n);
    expect(await token.balanceOf(await stakeManager.getAddress())).to.equal(
      staked
    );
  });

  it('owner stakeAndActivate(0) yields zero score, weight and payout', async () => {
    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const rep = await Rep.connect(owner).deploy(
      await stakeManager.getAddress()
    );
    await rep.setStakeManager(await stakeManager.getAddress());
    await rep.setAuthorizedCaller(owner.address, true);

    const Registry = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
    const registry = await Registry.connect(owner).deploy(
      await stakeManager.getAddress(),
      await rep.getAddress(),
      1
    );

    const JobRouter = await ethers.getContractFactory(
      'contracts/v2/modules/JobRouter.sol:JobRouter'
    );
    const jobRouter = await JobRouter.connect(owner).deploy(
      await registry.getAddress()
    );

    const Incentives = await ethers.getContractFactory(
      'contracts/v2/PlatformIncentives.sol:PlatformIncentives'
    );
    const incentives = await Incentives.connect(owner).deploy(
      await stakeManager.getAddress(),
      await registry.getAddress(),
      await jobRouter.getAddress()
    );

    await registry.setRegistrar(await incentives.getAddress(), true);
    await jobRouter.setRegistrar(await incentives.getAddress(), true);

    await expect(incentives.connect(owner).stakeAndActivate(0))
      .to.emit(registry, 'Registered')
      .withArgs(owner.address);
    expect(await registry.getScore(owner.address)).to.equal(0);
    expect(await jobRouter.routingWeight(owner.address)).to.equal(0);

    await expect(feePool.connect(owner).claimRewards())
      .to.emit(feePool, 'RewardsClaimed')
      .withArgs(owner.address, 0);

    await expect(
      incentives.connect(user1).stakeAndActivate(0)
    ).to.be.revertedWith('amount');
  });

  it('returns immediately when distributing with zero fees', async () => {
    const cumulative = await feePool.cumulativePerToken();
    await expect(feePool.connect(owner).distributeFees()).to.not.be.reverted;
    expect(await feePool.pendingFees()).to.equal(0);
    expect(await feePool.cumulativePerToken()).to.equal(cumulative);
  });

  it('reverts when setting a zero stake manager', async () => {
    await expect(
      feePool.connect(owner).setStakeManager(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(feePool, 'ZeroAddress');
  });

  it('reverts when stake manager has wrong version', async () => {
    const Mock = await ethers.getContractFactory(
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    const bad = await Mock.deploy(1);
    await expect(
      feePool.connect(owner).setStakeManager(await bad.getAddress())
    ).to.be.revertedWithCustomError(feePool, 'InvalidStakeManagerVersion');
  });

  it('rejects treasury set to owner', async () => {
    await expect(
      feePool.connect(owner).setTreasury(owner.address)
    ).to.be.revertedWithCustomError(feePool, 'InvalidTreasury');
  });
});

describe('FeePool with no stakers', function () {
  let token, stakeManager, feePool, owner, contributor, treasury;
  const { AGIALPHA } = require('../../scripts/constants');

  beforeEach(async () => {
    [owner, contributor, , , treasury] = await ethers.getSigners();
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
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
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);

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
    await feePool.setTreasuryAllowlist(treasury.address, true);
    await feePool.setTreasury(treasury.address);
  });

  it('burns fees when no stakers even with treasury set', async () => {
    await token.mint(contributor.address, 100);
    await token.connect(contributor).approve(await feePool.getAddress(), 100);
    await feePool.connect(contributor).contribute(100);

    expect(await feePool.pendingFees()).to.equal(100n);

    const treasuryBefore = await token.balanceOf(treasury.address);
    const supplyBefore = await token.totalSupply();

    await feePool.connect(owner).distributeFees();

    expect(await feePool.pendingFees()).to.equal(0);
    expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore);
    expect(await token.totalSupply()).to.equal(supplyBefore - 100n);
  });

  it('burns fees when no stakers and no treasury', async () => {
    const BurnFeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    const burnPool = await BurnFeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await burnPool.setBurnPct(0);
    await token.mint(contributor.address, 100);
    await token.connect(contributor).approve(await burnPool.getAddress(), 100);
    await burnPool.connect(contributor).contribute(100);

    const supplyBefore = await token.totalSupply();

    await burnPool.connect(owner).distributeFees();

    expect(await token.totalSupply()).to.equal(supplyBefore - 100n);
  });
});
