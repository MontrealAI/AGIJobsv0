const { stageProtocol } = require('../../scripts/deploy/stage-protocol.cjs');
const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');

describe('Deployer', function () {
  it('binds recovery parameters and hands every managed module to governance while paused', async function () {
    const [owner, governance, stranger] = await ethers.getSigners();
    const artifact = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const deployer = await (
      await ethers.getContractFactory('contracts/v2/Deployer.sol:Deployer')
    ).deploy();
    const digest = ethers.id('reviewed deployment');
    await expect(
      deployer.connect(stranger).commitConfiguration(digest)
    ).to.be.revertedWithCustomError(deployer, 'OwnableUnauthorizedAccount');
    await expect(
      deployer.commitConfiguration(ethers.ZeroHash)
    ).to.be.revertedWith('configuration hash');
    await deployer.commitConfiguration(digest);
    await expect(
      deployer.commitConfiguration(ethers.id('changed'))
    ).to.be.revertedWith('configuration changed');
    const econ = {
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
    const staged = await stageProtocol(deployer, ids, governance.address, {
      tax: { uri: 'ipfs://reviewed-policy', description: 'Reviewed terms' },
    });
    await expect(
      deployer.deployPaused(econ, ids, governance.address, false)
    ).to.be.revertedWith('tax policy mode');
    await expect(
      deployer
        .connect(stranger)
        .deployPaused(econ, ids, governance.address, true)
    ).to.be.revertedWithCustomError(deployer, 'OwnableUnauthorizedAccount');
    const receipt = await (
      await deployer.deployPaused(econ, ids, governance.address, true)
    ).wait();
    expect(receipt.gasUsed).to.be.lessThan(16777216n);
    const managed = [0, 1, 2, 3, 4, 6, 9, 13];
    for (const index of managed) {
      const module = await ethers.getContractAt(
        [
          'function paused() view returns (bool)',
          'function owner() view returns (address)',
        ],
        staged[index]
      );
      expect(await module.paused()).to.equal(true);
      expect(await module.owner()).to.equal(staged[12]);
    }
    const policy = await ethers.getContractAt('TaxPolicy', staged[10]);
    expect(await policy.policyURI()).to.equal('ipfs://reviewed-policy');
    expect(await policy.acknowledgement()).to.equal('Reviewed terms');
    expect(await policy.pendingOwner()).to.equal(governance.address);
    const pause = await ethers.getContractAt('SystemPause', staged[12]);
    await expect(pause.connect(stranger).unpauseAll()).to.be.reverted;
    const {
      applySecureDefaults,
    } = require('../../scripts/v2/apply-secure-defaults.ts');
    const book = {
      chainId: 31337,
      contracts: {
        JobRegistry: staged[1],
        StakeManager: staged[0],
        ValidationModule: staged[2],
        SystemPause: staged[12],
      },
    };
    const config = {
      econ: { commitWindow: '3600' },
      secureDefaults: {
        pauseOnLaunch: true,
        maxJobRewardAgia: '3000',
        maxJobDurationSeconds: 86400,
      },
    };
    const registry = await ethers.getContractAt('JobRegistry', staged[1]);
    const existingStake = await registry.jobStake();
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const calls = await applySecureDefaults(config, book, { dryRun: true });
    expect(calls).to.have.lengthOf(3);
    expect(
      calls.every(
        (call) =>
          call.to === staged[12] && call.requiredCaller === governance.address
      )
    ).to.equal(true);
    expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
      nonce
    );
    await expect(
      applySecureDefaults(config, book, { signer: owner })
    ).to.be.rejectedWith('requires governance');
    await expect(
      applySecureDefaults(
        { secureDefaults: { maxJobDurationSeconds: -1 } },
        book,
        { signer: governance }
      )
    ).to.be.rejectedWith('safe integer seconds');
    await expect(
      applySecureDefaults(config, { ...book, chainId: 1 }, { dryRun: true })
    ).to.be.rejectedWith('chain ID');
    await applySecureDefaults(config, book, { signer: governance });
    expect(await registry.jobStake()).to.equal(existingStake);
    expect(await registry.maxJobReward()).to.equal(ethers.parseEther('3000'));
    expect(
      await (
        await ethers.getContractAt(
          'contracts/v2/ValidationModule.sol:ValidationModule',
          staged[2]
        )
      ).commitWindow()
    ).to.equal(3600);
    // A mixed pause state must be recoverable without pauseAll reverting.
    await pause
      .connect(governance)
      .executeGovernanceCall(
        staged[1],
        registry.interface.encodeFunctionData('unpause')
      );
    const pauseOnly = { secureDefaults: { pauseOnLaunch: true } };
    expect(
      await applySecureDefaults(pauseOnly, book, { dryRun: true })
    ).to.have.lengthOf(1);
    await applySecureDefaults(pauseOnly, book, { signer: governance });
    expect(await registry.paused()).to.equal(true);
    await pause.connect(governance).unpauseAll();
    for (const index of managed) {
      const module = await ethers.getContractAt(
        ['function paused() view returns (bool)'],
        staged[index]
      );
      expect(await module.paused()).to.equal(false);
    }
    expect(await deployer.configurationHash()).to.equal(digest);
    await expect(
      deployer.deployPaused(econ, ids, governance.address, true)
    ).to.be.revertedWith('deployed');
    expect(await deployer.owner()).to.equal(owner.address);
  });
  it('deploys and wires modules, transferring ownership', async function () {
    const [, governance] = await ethers.getSigners();
    const artifact = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
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

    await stageProtocol(deployer, ids, governance.address, { econ });
    const tx = await deployer.deploy(econ, ids, governance.address);
    const receipt = await tx.wait();
    const deployerAddress = await deployer.getAddress();
    const log = receipt.logs.find((l) => l.address === deployerAddress);
    const decoded = deployer.interface.decodeEventLog(
      'Deployed',
      log.data,
      log.topics
    );

    const [
      stake,
      registry,
      validation,
      reputation,
      dispute,
      certificate,
      platformRegistry,
      router,
      incentives,
      feePool,
      taxPolicy,
      identityRegistryAddr,
      systemPause,
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
    const ReputationEngine = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const DisputeModule = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    const CertificateNFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    const PlatformRegistry = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
    const JobRouter = await ethers.getContractFactory(
      'contracts/v2/modules/JobRouter.sol:JobRouter'
    );
    const PlatformIncentives = await ethers.getContractFactory(
      'contracts/v2/PlatformIncentives.sol:PlatformIncentives'
    );
    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const IdentityRegistry = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const Committee = await ethers.getContractFactory(
      'contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee'
    );
    const SystemPause = await ethers.getContractFactory(
      'contracts/v2/SystemPause.sol:SystemPause'
    );

    const stakeC = StakeManager.attach(stake);
    const registryC = JobRegistry.attach(registry);
    const validationC = ValidationModule.attach(validation);
    const reputationC = ReputationEngine.attach(reputation);
    const disputeC = DisputeModule.attach(dispute);
    const certificateC = CertificateNFT.attach(certificate);
    const platformRegistryC = PlatformRegistry.attach(platformRegistry);
    const routerC = JobRouter.attach(router);
    const incentivesC = PlatformIncentives.attach(incentives);
    const feePoolC = FeePool.attach(feePool);
    const taxPolicyC = TaxPolicy.attach(taxPolicy);
    const identityRegistryC = IdentityRegistry.attach(identityRegistryAddr);
    const committee = await disputeC.committee();
    const committeeC = Committee.attach(committee);
    const systemPauseC = SystemPause.attach(systemPause);

    // ownership
    await identityRegistryC.connect(governance).acceptOwnership();
    await taxPolicyC.connect(governance).acceptOwnership();
    expect(await stakeC.owner()).to.equal(systemPause);
    expect(await registryC.owner()).to.equal(systemPause);
    expect(await validationC.owner()).to.equal(systemPause);
    expect(await reputationC.owner()).to.equal(systemPause);
    expect(await disputeC.owner()).to.equal(systemPause);
    expect(await committeeC.owner()).to.equal(systemPause);
    expect(await certificateC.owner()).to.equal(governance.address);
    expect(await platformRegistryC.owner()).to.equal(systemPause);
    expect(await routerC.owner()).to.equal(governance.address);
    expect(await incentivesC.owner()).to.equal(governance.address);
    expect(await feePoolC.owner()).to.equal(systemPause);
    expect(await taxPolicyC.owner()).to.equal(governance.address);
    expect(await identityRegistryC.owner()).to.equal(governance.address);
    expect(await systemPauseC.owner()).to.equal(governance.address);

    expect(await systemPauseC.jobRegistry()).to.equal(registry);
    expect(await systemPauseC.stakeManager()).to.equal(stake);
    expect(await systemPauseC.validationModule()).to.equal(validation);
    expect(await systemPauseC.disputeModule()).to.equal(dispute);
    expect(await systemPauseC.platformRegistry()).to.equal(platformRegistry);
    expect(await systemPauseC.feePool()).to.equal(feePool);
    expect(await systemPauseC.reputationEngine()).to.equal(reputation);
    expect(await systemPauseC.arbitratorCommittee()).to.equal(committee);

    // wiring
    expect(await stakeC.jobRegistry()).to.equal(registry);
    expect(await stakeC.disputeModule()).to.equal(dispute);
    expect(await stakeC.validationModule()).to.equal(validation);
    expect(await stakeC.feePool()).to.equal(feePool);
    expect(await registryC.stakeManager()).to.equal(stake);
    expect(await registryC.validationModule()).to.equal(validation);
    expect(await registryC.reputationEngine()).to.equal(reputation);
    expect(await registryC.disputeModule()).to.equal(dispute);
    expect(await registryC.certificateNFT()).to.equal(certificate);
    expect(await registryC.feePool()).to.equal(feePool);
    expect(await stakeC.validatorSlashRewardPct()).to.equal(0);
    expect(await registryC.taxPolicy()).to.equal(taxPolicy);
    expect(await disputeC.stakeManager()).to.equal(stake);
    expect(await disputeC.taxPolicy()).to.equal(taxPolicy);
    await registryC.connect(governance).acknowledgeTaxPolicy();
    expect(await taxPolicyC.hasAcknowledged(governance.address)).to.equal(true);
    expect(await registryC.identityRegistry()).to.equal(identityRegistryAddr);
    expect(await validationC.jobRegistry()).to.equal(registry);
    expect(await validationC.stakeManager()).to.equal(stake);
    expect(await validationC.reputationEngine()).to.equal(reputation);
    expect(await validationC.identityRegistry()).to.equal(identityRegistryAddr);
    expect(await reputationC.callers(registry)).to.equal(true);
    expect(await reputationC.callers(validation)).to.equal(true);
    expect(await certificateC.jobRegistry()).to.equal(registry);
    expect(await certificateC.stakeManager()).to.equal(stake);
    expect(await incentivesC.stakeManager()).to.equal(stake);
    expect(await incentivesC.platformRegistry()).to.equal(platformRegistry);
    expect(await incentivesC.jobRouter()).to.equal(router);
    expect(await platformRegistryC.registrars(incentives)).to.equal(true);
    expect(await routerC.registrars(incentives)).to.equal(true);
  });

  it('can skip tax policy', async function () {
    const [, governance] = await ethers.getSigners();
    const artifact = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
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
    await stageProtocol(deployer, ids, governance.address, {
      withTaxPolicy: false,
      econ,
    });
    await expect(
      deployer.deploy(econ, ids, governance.address)
    ).to.be.revertedWith('tax policy mode');
    expect(await deployer.deployed()).to.equal(false);
    const tx2 = await deployer.deployWithoutTaxPolicy(
      econ,
      ids,
      governance.address
    );
    const receipt2 = await tx2.wait();
    const deployerAddress2 = await deployer.getAddress();
    const log2 = receipt2.logs.find((l) => l.address === deployerAddress2);
    const decoded = deployer.interface.decodeEventLog(
      'Deployed',
      log2.data,
      log2.topics
    );
    const registry = decoded[1];
    const taxPolicy = decoded[10];
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const registryC = JobRegistry.attach(registry);
    expect(taxPolicy).to.equal(ethers.ZeroAddress);
    expect(await registryC.taxPolicy()).to.equal(ethers.ZeroAddress);
    const disputeC = await ethers.getContractAt(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule',
      decoded[4]
    );
    const stakeC = await ethers.getContractAt(
      'contracts/v2/StakeManager.sol:StakeManager',
      decoded[0]
    );
    const certificateC = await ethers.getContractAt(
      'contracts/v2/CertificateNFT.sol:CertificateNFT',
      decoded[5]
    );
    expect(await disputeC.taxPolicy()).to.equal(ethers.ZeroAddress);
    expect(await disputeC.stakeManager()).to.equal(decoded[0]);
    expect(await stakeC.feePool()).to.equal(decoded[9]);
    expect(await certificateC.stakeManager()).to.equal(decoded[0]);
  });
});
