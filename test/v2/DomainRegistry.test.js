const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DomainRegistry', function () {
  let owner;
  let registry;

  const baseInit = (overrides = {}) => ({
    name: 'Finance',
    slug: 'finance',
    metadataURI: 'ipfs://finance-domain',
    credentialSchema: ethers.id('finance.schema'),
    l2Network: ethers.encodeBytes32String('base-mainnet'),
    dispatcher: owner.address,
    oracle: ethers.ZeroAddress,
    bridge: ethers.ZeroAddress,
    l2Gateway: ethers.ZeroAddress,
    minStake: 0,
    resilienceFloor: 80,
    maxConcurrentJobs: 120,
    requiresHumanReview: false,
    active: true,
    ...overrides,
  });

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const DomainRegistry = await ethers.getContractFactory(
      'contracts/v2/DomainRegistry.sol:DomainRegistry'
    );
    registry = await DomainRegistry.deploy(owner.address);
  });

  it('registers a domain with metadata', async function () {
    const init = baseInit();
    await expect(registry.connect(owner).registerDomain(init))
      .to.emit(registry, 'DomainRegistered')
      .withArgs(1, init.name, init.slug);

    const domain = await registry.getDomain(1);
    expect(domain.name).to.equal(init.name);
    expect(domain.slug).to.equal(init.slug);
    expect(domain.metadataURI).to.equal(init.metadataURI);
    expect(domain.dispatcher).to.equal(init.dispatcher);
    expect(domain.oracle).to.equal(ethers.ZeroAddress);
    expect(domain.active).to.equal(true);
    expect(domain.paused).to.equal(false);

    await expect(
      registry
        .connect(owner)
        .registerDomain(baseInit({ slug: 'finance', name: 'Duplicate' }))
    ).to.be.revertedWithCustomError(registry, 'DuplicateSlug');
  });

  it('updates runtime configuration and caps', async function () {
    await registry.connect(owner).registerDomain(baseInit());

    const newRuntime = {
      dispatcher: ethers.Wallet.createRandom().address,
      oracle: ethers.Wallet.createRandom().address,
      bridge: ethers.Wallet.createRandom().address,
      l2Gateway: ethers.Wallet.createRandom().address,
      l2Network: ethers.encodeBytes32String('zkSync-era'),
    };

    await expect(
      registry
        .connect(owner)
        .setDomainRuntime(
          1,
          newRuntime.dispatcher,
          newRuntime.oracle,
          newRuntime.bridge,
          newRuntime.l2Gateway,
          newRuntime.l2Network
        )
    )
      .to.emit(registry, 'DomainRuntimeUpdated')
      .withArgs(
        1,
        newRuntime.dispatcher,
        newRuntime.oracle,
        newRuntime.bridge,
        newRuntime.l2Gateway,
        newRuntime.l2Network
      );

    await expect(
      registry
        .connect(owner)
        .setDomainCaps(1, 1000, 92, 256, true)
    )
      .to.emit(registry, 'DomainCapsUpdated')
      .withArgs(1, 1000, 92, 256, true);

    const domain = await registry.getDomain(1);
    expect(domain.dispatcher).to.equal(newRuntime.dispatcher);
    expect(domain.oracle).to.equal(newRuntime.oracle);
    expect(domain.bridge).to.equal(newRuntime.bridge);
    expect(domain.l2Gateway).to.equal(newRuntime.l2Gateway);
    expect(domain.l2Network).to.equal(newRuntime.l2Network);
    expect(domain.minStake).to.equal(1000n);
    expect(domain.resilienceFloor).to.equal(92);
    expect(domain.maxConcurrentJobs).to.equal(256);
    expect(domain.requiresHumanReview).to.equal(true);
  });

  it('supports pausing individual domains and the registry', async function () {
    await registry.connect(owner).registerDomain(baseInit());

    await expect(registry.connect(owner).pauseDomain(1))
      .to.emit(registry, 'DomainPaused')
      .withArgs(1);

    let domain = await registry.getDomain(1);
    expect(domain.paused).to.equal(true);

    await expect(registry.connect(owner).resumeDomain(1))
      .to.emit(registry, 'DomainResumed')
      .withArgs(1);

    domain = await registry.getDomain(1);
    expect(domain.paused).to.equal(false);

    await expect(registry.connect(owner).pause())
      .to.emit(registry, 'Paused')
      .withArgs(owner.address);

    await expect(registry.connect(owner).registerDomain(baseInit({ slug: 'ops' })))
      .to.be.revertedWith('Pausable: paused');

    await expect(registry.connect(owner).unpause())
      .to.emit(registry, 'Unpaused')
      .withArgs(owner.address);
  });
});
