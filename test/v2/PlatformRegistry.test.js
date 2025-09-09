const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('PlatformRegistry', function () {
  let owner, platform, sybil, treasury;
  let token, stakeManager, reputationEngine, registry;

  const STAKE = 10n ** 18n; // 1 token with 18 decimals

  beforeEach(async () => {
    [owner, platform, sybil, treasury] = await ethers.getSigners();

    const { AGIALPHA } = require('../../scripts/constants');
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    await token.mint(platform.address, STAKE);
    await token.mint(owner.address, STAKE);

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await Stake.connect(platform).deploy(
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      platform.address
    );
    await stakeManager.connect(platform).setMinStake(STAKE);
    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockRegistry = await MockRegistry.deploy();
    await stakeManager
      .connect(platform)
      .setJobRegistry(await mockRegistry.getAddress());
    await token
      .connect(platform)
      .approve(await stakeManager.getAddress(), STAKE);
    await stakeManager.connect(platform).depositStake(2, STAKE); // Role.Platform = 2

    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    reputationEngine = await Rep.connect(owner).deploy(
      await stakeManager.getAddress()
    );
    await reputationEngine.setStakeManager(await stakeManager.getAddress());
    await reputationEngine.setAuthorizedCaller(owner.address, true);

    const Registry = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
    registry = await Registry.connect(owner).deploy(
      await stakeManager.getAddress(),
      await reputationEngine.getAddress(),
      STAKE
    );
  });

  it('requires minimum stake for non-owner registration', async () => {
    await expect(registry.connect(platform).register())
      .to.emit(registry, 'Registered')
      .withArgs(platform.address);
    expect(await registry.registered(platform.address)).to.equal(true);
    await expect(registry.connect(sybil).register()).to.be.revertedWith(
      'stake'
    );
  });

  it('acknowledgeAndRegister requires prior acknowledgement', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
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
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await stakeManager
      .connect(platform)
      .setJobRegistry(await jobRegistry.getAddress());
    await expect(registry.connect(platform).acknowledgeAndRegister())
      .to.emit(registry, 'Registered')
      .withArgs(platform.address);
  });

  it('stakeAndRegister stakes and registers caller', async () => {
    await stakeManager.connect(platform).withdrawStake(2, STAKE);
    await token
      .connect(platform)
      .approve(await stakeManager.getAddress(), STAKE);
    await expect(registry.connect(platform).stakeAndRegister(STAKE))
      .to.emit(registry, 'Activated')
      .withArgs(platform.address, STAKE);
    expect(await registry.registered(platform.address)).to.equal(true);
    expect(await stakeManager.stakeOf(platform.address, 2)).to.equal(STAKE);
  });

  it('acknowledgeAndRegisterFor works for registrars', async () => {
    await registry.setRegistrar(owner.address, true);
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
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
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await stakeManager
      .connect(platform)
      .setJobRegistry(await jobRegistry.getAddress());
    await expect(
      registry.connect(owner).acknowledgeAndRegisterFor(platform.address)
    )
      .to.emit(registry, 'Registered')
      .withArgs(platform.address);
  });

  it('acknowledgeStakeAndRegister stakes, acknowledges, and registers', async () => {
    await stakeManager.connect(platform).withdrawStake(2, STAKE);
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
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
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await stakeManager
      .connect(platform)
      .setJobRegistry(await jobRegistry.getAddress());
    await token
      .connect(platform)
      .approve(await stakeManager.getAddress(), STAKE);
    await expect(registry.connect(platform).acknowledgeStakeAndRegister(STAKE))
      .to.emit(registry, 'Activated')
      .withArgs(platform.address, STAKE);
  });

  it('acknowledgeStakeAndRegisterFor stakes, acknowledges, and registers', async () => {
    await registry.setRegistrar(owner.address, true);
    await stakeManager.connect(platform).withdrawStake(2, STAKE);
    await token
      .connect(platform)
      .approve(await stakeManager.getAddress(), STAKE);
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
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
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await stakeManager
      .connect(platform)
      .setJobRegistry(await jobRegistry.getAddress());
    await expect(
      registry
        .connect(owner)
        .acknowledgeStakeAndRegisterFor(platform.address, STAKE)
    )
      .to.emit(registry, 'Activated')
      .withArgs(platform.address, STAKE);
  });

  it('acknowledgeAndRegister records acknowledgement', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
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
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await stakeManager
      .connect(platform)
      .setJobRegistry(await jobRegistry.getAddress());

    await expect(registry.connect(platform).acknowledgeAndRegister())
      .to.emit(registry, 'Registered')
      .withArgs(platform.address);
  });

  it('registrar enforces operator stake', async () => {
    await registry.setRegistrar(owner.address, true);
    await expect(
      registry.connect(owner).registerFor(sybil.address)
    ).to.be.revertedWith('stake');
    await expect(registry.connect(owner).registerFor(platform.address))
      .to.emit(registry, 'Registered')
      .withArgs(platform.address);
  });

  it('computes score based on stake and reputation', async () => {
    await registry.connect(platform).register();
    expect(await registry.getScore(platform.address)).to.equal(STAKE);
    await reputationEngine.add(platform.address, 5);
    expect(await registry.getScore(platform.address)).to.equal(STAKE + 4n);
  });

  it('owner can update settings', async () => {
    await expect(registry.setMinPlatformStake(STAKE * 2n))
      .to.emit(registry, 'MinPlatformStakeUpdated')
      .withArgs(STAKE * 2n);
  });

  it('enforces owner-managed blacklist', async () => {
    await registry.setBlacklist(platform.address, true);
    await expect(registry.connect(platform).register()).to.be.revertedWith(
      'blacklisted'
    );
    expect(await registry.getScore(platform.address)).to.equal(0);
    await registry.setBlacklist(platform.address, false);
    await registry.connect(platform).register();
  });

  it('returns zero score when owner registers without stake', async () => {
    await expect(registry.connect(owner).register())
      .to.emit(registry, 'Registered')
      .withArgs(owner.address);
    expect(await registry.getScore(owner.address)).to.equal(0);
    await reputationEngine.add(owner.address, 10);
    // reputation alone should not give score without stake for owner
    expect(await registry.getScore(owner.address)).to.equal(0);
  });

  it('owner stakeAndActivate(0) registers with zero score and weight', async () => {
    const JobRouter = await ethers.getContractFactory(
      'contracts/v2/modules/JobRouter.sol:JobRouter'
    );
    const jobRouter = await JobRouter.connect(owner).deploy(
      await registry.getAddress()
    );

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    const feePool = await FeePool.connect(owner).deploy(
      await stakeManager.getAddress(),
      0,
      treasury.address,
      ethers.ZeroAddress
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
      incentives.connect(platform).stakeAndActivate(0)
    ).to.be.revertedWith('amount');
  });

  it('acknowledgeAndDeregister deregisters and records acknowledgement', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
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
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await stakeManager
      .connect(platform)
      .setJobRegistry(await jobRegistry.getAddress());

    await policy.connect(platform).acknowledge();
    await registry.connect(platform).register();
    await policy.connect(owner).bumpPolicyVersion();
    await expect(registry.connect(platform).acknowledgeAndDeregister())
      .to.emit(registry, 'Deregistered')
      .withArgs(platform.address);
    expect(await registry.registered(platform.address)).to.equal(false);
    expect(await policy.hasAcknowledged(platform.address)).to.equal(true);
  });

  it('allows operator to deregister', async () => {
    await registry.connect(platform).register();
    expect(await registry.registered(platform.address)).to.equal(true);
    await registry.connect(platform).deregister();
    expect(await registry.registered(platform.address)).to.equal(false);
  });
});
