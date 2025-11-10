const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('PlatformRegistry', function () {
  let owner, platform, sybil, treasury, pauser, registrar;
  let token, stakeManager, reputationEngine, registry;

  const STAKE = 10n ** 18n; // 1 token with 18 decimals

  beforeEach(async () => {
    [owner, platform, sybil, treasury, pauser, registrar] =
      await ethers.getSigners();

    const { AGIALPHA } = require('../../scripts/constants');
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const balanceSlot = (address) =>
      ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [ethers.zeroPadValue(address, 32), ethers.ZeroHash]
      );
    for (const addr of [owner.address, platform.address, treasury.address]) {
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balanceSlot(addr),
        ethers.ZeroHash,
      ]);
    }
    const totalSupplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      totalSupplySlot,
      ethers.ZeroHash,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    await token.mint(platform.address, STAKE);
    await token.mint(owner.address, STAKE);

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await Stake.connect(owner).deploy(
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(STAKE);
    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockRegistry = await MockRegistry.deploy();
    await stakeManager
      .connect(owner)
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
      .connect(owner)
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
      .connect(owner)
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
      .connect(owner)
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
      .connect(owner)
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
      .connect(owner)
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

  it('allows owner to batch apply configuration changes', async () => {
    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    const stakeManager2 = await Stake.connect(owner).deploy(
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );

    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockRegistry = await MockRegistry.deploy();
    await stakeManager2
      .connect(owner)
      .setJobRegistry(await mockRegistry.getAddress());

    await token.mint(platform.address, STAKE * 3n);
    await token
      .connect(platform)
      .approve(await stakeManager2.getAddress(), STAKE * 2n);
    await stakeManager2
      .connect(platform)
      .depositStakeFor(platform.address, 2, STAKE * 2n);

    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const reputationEngine2 = await Rep.connect(owner).deploy(
      await stakeManager2.getAddress()
    );
    await reputationEngine2.setStakeManager(await stakeManager2.getAddress());
    await reputationEngine2.setAuthorizedCaller(owner.address, true);

    await registry.setBlacklist(platform.address, true);

    const newStakeManager = await stakeManager2.getAddress();
    const newReputationEngine = await reputationEngine2.getAddress();
    const registrarUpdates = [{ registrar: registrar.address, allowed: true }];
    const blacklistUpdates = [
      { operator: platform.address, status: false },
      { operator: sybil.address, status: true },
    ];
    const newMinStake = STAKE * 2n;

    await expect(
      registry.applyConfiguration(
        {
          setStakeManager: true,
          stakeManager: newStakeManager,
          setReputationEngine: true,
          reputationEngine: newReputationEngine,
          setMinPlatformStake: true,
          minPlatformStake: newMinStake,
          setPauser: true,
          pauser: pauser.address,
          setPauserManager: true,
          pauserManager: owner.address,
        },
        registrarUpdates,
        blacklistUpdates
      )
    )
      .to.emit(registry, 'StakeManagerUpdated')
      .withArgs(newStakeManager)
      .and.to.emit(registry, 'ReputationEngineUpdated')
      .withArgs(newReputationEngine)
      .and.to.emit(registry, 'MinPlatformStakeUpdated')
      .withArgs(newMinStake)
      .and.to.emit(registry, 'PauserUpdated')
      .withArgs(pauser.address)
      .and.to.emit(registry, 'RegistrarUpdated')
      .withArgs(registrar.address, true)
      .and.to.emit(registry, 'Blacklisted')
      .withArgs(platform.address, false)
      .and.to.emit(registry, 'Blacklisted')
      .withArgs(sybil.address, true)
      .and.to.emit(registry, 'ModulesUpdated')
      .withArgs(newStakeManager, newReputationEngine)
      .and.to.emit(registry, 'ConfigurationApplied')
      .withArgs(owner.address, true, true, true, true, true, 1, 2);

    expect(await registry.stakeManager()).to.equal(newStakeManager);
    expect(await registry.reputationEngine()).to.equal(newReputationEngine);
    expect(await registry.minPlatformStake()).to.equal(newMinStake);
    expect(await registry.pauser()).to.equal(pauser.address);
    expect(await registry.pauserManager()).to.equal(owner.address);
    expect(await registry.registrars(registrar.address)).to.equal(true);
    expect(await registry.blacklist(platform.address)).to.equal(false);
    expect(await registry.blacklist(sybil.address)).to.equal(true);

    await expect(registry.connect(pauser).pause())
      .to.emit(registry, 'Paused')
      .withArgs(pauser.address);
    await expect(registry.connect(owner).unpause())
      .to.emit(registry, 'Unpaused')
      .withArgs(owner.address);

    await expect(registry.connect(registrar).registerFor(platform.address))
      .to.emit(registry, 'Registered')
      .withArgs(platform.address);
    await expect(registry.connect(sybil).register()).to.be.revertedWith(
      'blacklisted'
    );
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
      ethers.ZeroAddress,
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
      .connect(owner)
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
