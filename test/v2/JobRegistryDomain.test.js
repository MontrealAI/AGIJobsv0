const { expect } = require('chai');
const { ethers, network, artifacts } = require('hardhat');

const { address: AGIALPHA } = require('../../config/agialpha.json');

describe('JobRegistry domain integration', function () {
  let owner;
  let employer;
  let agent;
  let registry;
  let stakeManager;
  let validation;
  let rep;
  let nft;
  let dispute;
  let feePool;
  let domainRegistry;

  const specHash = ethers.id('spec.v1');

  const domainInit = (overrides = {}) => ({
    name: 'Logistics',
    slug: 'logistics',
    metadataURI: 'ipfs://logistics-domain',
    credentialSchema: ethers.id('logistics.schema'),
    l2Network: ethers.encodeBytes32String('arbitrum-one'),
    dispatcher: owner.address,
    oracle: ethers.ZeroAddress,
    bridge: ethers.ZeroAddress,
    l2Gateway: ethers.ZeroAddress,
    minStake: 0,
    resilienceFloor: 88,
    maxConcurrentJobs: 512,
    requiresHumanReview: false,
    active: true,
    ...overrides,
  });

  beforeEach(async function () {
    [owner, employer, agent] = await ethers.getSigners();

    const artifact = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);

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
      ethers.ZeroAddress,
      ethers.ZeroAddress
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
      ethers.ZeroAddress,
      owner.address
    );

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
    await registry.connect(owner).setJobParameters(0, 1);
    await registry.connect(owner).setJobDurationLimit(7 * 24 * 60 * 60);
    await registry.connect(owner).setFeePct(0);

    const DomainRegistry = await ethers.getContractFactory(
      'contracts/v2/DomainRegistry.sol:DomainRegistry'
    );
    domainRegistry = await DomainRegistry.deploy(owner.address);
    await registry
      .connect(owner)
      .setDomainRegistry(await domainRegistry.getAddress());
  });

  async function futureDeadline() {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp + 3600;
  }

  it('emits tagging events and stores domain metadata for jobs', async function () {
    await domainRegistry.connect(owner).registerDomain(domainInit());

    const tx = await registry
      .connect(employer)
      .createDomainJob(
        0,
        await futureDeadline(),
        specHash,
        'ipfs://logistics-job',
        1
      );

    const slugHash = ethers.keccak256(ethers.toUtf8Bytes('logistics'));
    await expect(tx)
      .to.emit(registry, 'JobDomainTagged')
      .withArgs(
        1,
        1,
        slugHash,
        'ipfs://logistics-domain',
        owner.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.id('logistics.schema'),
        0,
        512,
        false
      );

    expect(await registry.jobDomain(1)).to.equal(1);

    const details = await registry.jobDomainDetails(1);
    expect(details.name).to.equal('Logistics');
    expect(details.slug).to.equal('logistics');
  });

  it('allows governance to retag and clear domains', async function () {
    await domainRegistry.connect(owner).registerDomain(domainInit());
    await domainRegistry
      .connect(owner)
      .registerDomain(
        domainInit({
          slug: 'finance',
          name: 'Finance',
          metadataURI: 'ipfs://finance',
          credentialSchema: ethers.id('finance.schema'),
          requiresHumanReview: true,
        })
      );

    await registry
      .connect(employer)
      .createDomainJob(
        0,
        await futureDeadline(),
        specHash,
        'ipfs://logistics-job',
        1
      );

    await expect(registry.connect(owner).overrideJobDomain(1, 2))
      .to.emit(registry, 'JobDomainTagged')
      .withArgs(
        1,
        2,
        ethers.keccak256(ethers.toUtf8Bytes('finance')),
        'ipfs://finance',
        owner.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.id('finance.schema'),
        0,
        512,
        true
      );

    expect(await registry.jobDomain(1)).to.equal(2);

    await expect(registry.connect(owner).overrideJobDomain(1, 0))
      .to.emit(registry, 'JobDomainCleared')
      .withArgs(1);

    expect(await registry.jobDomain(1)).to.equal(0);
  });

  it('blocks domain usage when paused', async function () {
    await domainRegistry.connect(owner).registerDomain(domainInit());
    await domainRegistry.connect(owner).pauseDomain(1);

    await expect(
      registry
        .connect(employer)
        .createDomainJob(
          0,
          await futureDeadline(),
          specHash,
          'ipfs://logistics-job',
          1
        )
    )
      .to.be.revertedWithCustomError(registry, 'DomainPaused')
      .withArgs(1);

    await domainRegistry.connect(owner).resumeDomain(1);
    await domainRegistry.connect(owner).pause();

    await expect(
      registry
        .connect(employer)
        .createDomainJob(
          0,
          await futureDeadline(),
          specHash,
          'ipfs://logistics-job',
          1
        )
    ).to.be.revertedWithCustomError(registry, 'DomainRegistryPaused');
  });
});
