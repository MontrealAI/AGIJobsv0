const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');

async function deploySystem(governanceAddress) {
  const Deployer = await ethers.getContractFactory(
    'contracts/v2/Deployer.sol:Deployer'
  );
  const deployer = await Deployer.deploy();
  const econ = {
    token: ethers.ZeroAddress,
    feePct: 0,
    burnPct: 0,
    employerSlashPct: 0,
    treasurySlashPct: 0,
    validatorSlashRewardPct: 0,
    commitWindow: 0,
    revealWindow: 0,
    minStake: 0,
    jobStake: 0,
  };
  const ids = {
    ens: ethers.ZeroAddress,
    nameWrapper: ethers.ZeroAddress,
    clubRootNode: ethers.ZeroHash,
    agentRootNode: ethers.ZeroHash,
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };
  const artifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  const tx = await deployer.deploy(econ, ids, governanceAddress);
  const receipt = await tx.wait();
  const deployerAddress = await deployer.getAddress();
  const log = receipt.logs.find((l) => l.address === deployerAddress);
  const decoded = deployer.interface.decodeEventLog(
    'Deployed',
    log.data,
    log.topics
  );
  const [
    stakeAddr,
    registryAddr,
    validationAddr,
    reputationAddr,
    disputeAddr,
    ,
    platformRegistryAddr,
    ,
    ,
    feePoolAddr,
    ,
    ,
    systemPauseAddr,
  ] = decoded;
  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const JobRegistry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const ValidationModule = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const DisputeModule = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const ReputationEngine = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const PlatformRegistry = await ethers.getContractFactory(
    'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
  );
  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const Committee = await ethers.getContractFactory(
    'contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee'
  );
  const SystemPause = await ethers.getContractFactory(
    'contracts/v2/SystemPause.sol:SystemPause'
  );

  const stake = StakeManager.attach(stakeAddr);
  const registry = JobRegistry.attach(registryAddr);
  const validation = ValidationModule.attach(validationAddr);
  const dispute = DisputeModule.attach(disputeAddr);
  const reputation = ReputationEngine.attach(reputationAddr);
  const platformRegistry = PlatformRegistry.attach(platformRegistryAddr);
  const feePool = FeePool.attach(feePoolAddr);
  const committeeAddr = await dispute.committee();
  const committee = Committee.attach(committeeAddr);
  const pause = SystemPause.attach(systemPauseAddr);

  return {
    pause,
    stake,
    registry,
    validation,
    dispute,
    reputation,
    platformRegistry,
    feePool,
    committee,
    addresses: {
      stake: stakeAddr,
      jobRegistry: registryAddr,
      validationModule: validationAddr,
      disputeModule: disputeAddr,
      platformRegistry: platformRegistryAddr,
      feePool: feePoolAddr,
      reputationEngine: reputationAddr,
      arbitratorCommittee: committeeAddr,
      systemPause: systemPauseAddr,
    },
  };
}

async function transferIfNeeded(contract, owner, pauseAddress) {
  if ((await contract.owner()) !== pauseAddress) {
    await contract.connect(owner).transferOwnership(pauseAddress);
  }
}

async function transferModulesToPause(owner, modules, pauseAddress) {
  await transferIfNeeded(modules.stake, owner, pauseAddress);
  await transferIfNeeded(modules.registry, owner, pauseAddress);
  await transferIfNeeded(modules.validation, owner, pauseAddress);
  await transferIfNeeded(modules.dispute, owner, pauseAddress);
  await transferIfNeeded(modules.platformRegistry, owner, pauseAddress);
  await transferIfNeeded(modules.feePool, owner, pauseAddress);
  await transferIfNeeded(modules.reputation, owner, pauseAddress);
  await transferIfNeeded(modules.committee, owner, pauseAddress);
}

describe('SystemPause', function () {
  it('pauses and unpauses all modules', async function () {
    const [owner, other] = await ethers.getSigners();
    const {
      pause,
      stake,
      registry,
      validation,
      dispute,
      reputation,
      platformRegistry,
      feePool,
      committee,
      addresses,
    } = await deploySystem(owner.address);

    const pauseAddress = await pause.getAddress();
    await transferModulesToPause(
      owner,
      {
        stake,
        registry,
        validation,
        dispute,
        platformRegistry,
        feePool,
        reputation,
        committee,
      },
      pauseAddress
    );

    await expect(
      pause
        .connect(owner)
        .setModules(
          addresses.jobRegistry,
          addresses.stake,
          addresses.validationModule,
          addresses.disputeModule,
          addresses.platformRegistry,
          addresses.feePool,
          addresses.reputationEngine,
          addresses.arbitratorCommittee
        )
    )
      .to.emit(pause, 'ModulesUpdated')
      .withArgs(
        addresses.jobRegistry,
        addresses.stake,
        addresses.validationModule,
        addresses.disputeModule,
        addresses.platformRegistry,
        addresses.feePool,
        addresses.reputationEngine,
        addresses.arbitratorCommittee
      );

    await pause.connect(owner).refreshPausers();

    await expect(pause.connect(other).pauseAll()).to.be.revertedWithCustomError(
      pause,
      'NotGovernance'
    );

    expect(await stake.paused()).to.equal(false);
    expect(await registry.paused()).to.equal(false);
    expect(await validation.paused()).to.equal(false);
    expect(await dispute.paused()).to.equal(false);
    expect(await platformRegistry.paused()).to.equal(false);
    expect(await feePool.paused()).to.equal(false);
    expect(await reputation.paused()).to.equal(false);
    expect(await committee.paused()).to.equal(false);

    await pause.connect(owner).pauseAll();

    expect(await stake.paused()).to.equal(true);
    expect(await registry.paused()).to.equal(true);
    expect(await validation.paused()).to.equal(true);
    expect(await dispute.paused()).to.equal(true);
    expect(await platformRegistry.paused()).to.equal(true);
    expect(await feePool.paused()).to.equal(true);
    expect(await reputation.paused()).to.equal(true);
    expect(await committee.paused()).to.equal(true);

    await expect(
      pause.connect(other).unpauseAll()
    ).to.be.revertedWithCustomError(pause, 'NotGovernance');

    await pause.connect(owner).unpauseAll();

    expect(await stake.paused()).to.equal(false);
    expect(await registry.paused()).to.equal(false);
    expect(await validation.paused()).to.equal(false);
    expect(await dispute.paused()).to.equal(false);
    expect(await platformRegistry.paused()).to.equal(false);
    expect(await feePool.paused()).to.equal(false);
    expect(await reputation.paused()).to.equal(false);
    expect(await committee.paused()).to.equal(false);
  });

  it('rejects module wiring when ownership is not transferred', async function () {
    const [owner, other] = await ethers.getSigners();
    const {
      pause,
      validation,
      addresses,
      stake,
      registry,
      dispute,
      platformRegistry,
      feePool,
      reputation,
      committee,
    } = await deploySystem(owner.address);

    const pauseAddress = await pause.getAddress();
    await transferModulesToPause(
      owner,
      {
        stake,
        registry,
        validation,
        dispute,
        platformRegistry,
        feePool,
        reputation,
        committee,
      },
      pauseAddress
    );

    expect(await validation.owner()).to.equal(pauseAddress);

    await pause
      .connect(owner)
      .setModules(
        addresses.jobRegistry,
        addresses.stake,
        addresses.validationModule,
        addresses.disputeModule,
        addresses.platformRegistry,
        addresses.feePool,
        addresses.reputationEngine,
        addresses.arbitratorCommittee
      );

    await network.provider.send('hardhat_impersonateAccount', [pauseAddress]);
    await network.provider.send('hardhat_setBalance', [
      pauseAddress,
      '0xde0b6b3a7640000',
    ]);
    const pauseSigner = await ethers.getSigner(pauseAddress);
    await validation.connect(pauseSigner).transferOwnership(other.address);
    await network.provider.send('hardhat_stopImpersonatingAccount', [
      pauseAddress,
    ]);

    expect(await validation.owner()).to.equal(other.address);

    await expect(
      pause
        .connect(owner)
        .setModules(
          addresses.jobRegistry,
          addresses.stake,
          addresses.validationModule,
          addresses.disputeModule,
          addresses.platformRegistry,
          addresses.feePool,
          addresses.reputationEngine,
          addresses.arbitratorCommittee
        )
    ).to.be.revertedWithCustomError(pause, 'ModuleNotOwned');
  });
});
