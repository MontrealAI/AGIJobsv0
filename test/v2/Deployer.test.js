const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA } = require('../../scripts/constants');

describe('Deployer', function () {
  it('deploys and wires modules, transferring ownership', async function () {
    const [, governance] = await ethers.getSigners();
    const artifact = await readArtifact(
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
    expect(await registryC.stakeManager()).to.equal(stake);
    expect(await registryC.validationModule()).to.equal(validation);
    expect(await registryC.reputationEngine()).to.equal(reputation);
    expect(await registryC.disputeModule()).to.equal(dispute);
    expect(await registryC.certificateNFT()).to.equal(certificate);
    expect(await registryC.feePool()).to.equal(feePool);
    expect(await stakeC.validatorSlashRewardPct()).to.equal(0);
    expect(await registryC.taxPolicy()).to.equal(taxPolicy);
    expect(await registryC.identityRegistry()).to.equal(identityRegistryAddr);
    expect(await validationC.jobRegistry()).to.equal(registry);
    expect(await validationC.stakeManager()).to.equal(stake);
    expect(await validationC.reputationEngine()).to.equal(reputation);
    expect(await validationC.identityRegistry()).to.equal(identityRegistryAddr);
    expect(await reputationC.callers(registry)).to.equal(true);
    expect(await reputationC.callers(validation)).to.equal(true);
    expect(await certificateC.jobRegistry()).to.equal(registry);
    expect(await incentivesC.stakeManager()).to.equal(stake);
    expect(await incentivesC.platformRegistry()).to.equal(platformRegistry);
    expect(await incentivesC.jobRouter()).to.equal(router);
    expect(await platformRegistryC.registrars(incentives)).to.equal(true);
    expect(await routerC.registrars(incentives)).to.equal(true);
  });

  it('can skip tax policy', async function () {
    const [, governance] = await ethers.getSigners();
    const artifact = await readArtifact(
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
  });
});
