const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { AGIALPHA } = require('../../scripts/constants');

async function deployMockAgialpha() {
  const artifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
}

async function feePoolFixture() {
  await deployMockAgialpha();
  const [owner, pauser, treasury, newTreasury, rewarder] = await ethers.getSigners();

  const Timelock = await ethers.getContractFactory(
    '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController'
  );
  const timelock = await Timelock.deploy(0, [owner.address], [owner.address], owner.address);

  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const initialStake = await StakeManager.deploy(
    0,
    60,
    40,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );
  const replacementStake = await StakeManager.deploy(
    0,
    70,
    30,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );

  const TaxPolicy = await ethers.getContractFactory('contracts/v2/TaxPolicy.sol:TaxPolicy');
  const policy = await TaxPolicy.deploy('ipfs://policy-v1', 'ack');
  const newPolicy = await TaxPolicy.deploy('ipfs://policy-v2', 'ack-2');

  const FeePool = await ethers.getContractFactory('contracts/v2/FeePool.sol:FeePool');
  const pool = await FeePool.deploy(
    await initialStake.getAddress(),
    0,
    ethers.ZeroAddress,
    await policy.getAddress()
  );

  return {
    owner,
    pauser,
    treasury,
    newTreasury,
    rewarder,
    timelock,
    pool,
    initialStake,
    replacementStake,
    policy,
    newPolicy,
  };
}

async function stakeManagerFixture() {
  await deployMockAgialpha();
  const [owner, pauser, treasury, newTreasury] = await ethers.getSigners();

  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await StakeManager.deploy(
    ethers.parseUnits('1', 18),
    60,
    40,
    treasury.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );

  const FeePool = await ethers.getContractFactory('contracts/v2/FeePool.sol:FeePool');
  const pool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );

  const ValidationStub = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const validation = await ValidationStub.deploy();

  const DisputeModule = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await DisputeModule.deploy(
    ethers.ZeroAddress,
    0,
    0,
    ethers.ZeroAddress,
    owner.address
  );

  return {
    owner,
    pauser,
    treasury,
    newTreasury,
    stake,
    pool,
    validation,
    dispute,
  };
}

async function jobRegistryFixture() {
  await deployMockAgialpha();
  const [owner, pauser, treasury, newTreasury, ackDelegate] = await ethers.getSigners();

  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const initialStake = await StakeManager.deploy(
    0,
    60,
    40,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );
  await initialStake.connect(owner).setMinStake(1);

  const ValidationStub = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const initialValidation = await ValidationStub.deploy();

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const initialReputation = await Reputation.deploy(await initialStake.getAddress());

  const DisputeModule = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const initialDispute = await DisputeModule.deploy(
    ethers.ZeroAddress,
    0,
    0,
    ethers.ZeroAddress,
    owner.address
  );

  const Certificate = await ethers.getContractFactory(
    'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
  );
  const initialCertificate = await Certificate.deploy('Cert', 'CERT');

  const TaxPolicy = await ethers.getContractFactory('contracts/v2/TaxPolicy.sol:TaxPolicy');
  const initialPolicy = await TaxPolicy.deploy('ipfs://policy-v1', 'ack');

  const FeePool = await ethers.getContractFactory('contracts/v2/FeePool.sol:FeePool');
  const initialFeePool = await FeePool.deploy(
    await initialStake.getAddress(),
    0,
    ethers.ZeroAddress,
    await initialPolicy.getAddress()
  );

  const JobRegistry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await JobRegistry.deploy(
    await initialValidation.getAddress(),
    await initialStake.getAddress(),
    await initialReputation.getAddress(),
    await initialDispute.getAddress(),
    await initialCertificate.getAddress(),
    await initialFeePool.getAddress(),
    await initialPolicy.getAddress(),
    0,
    0,
    [],
    owner.address
  );

  return {
    owner,
    pauser,
    treasury,
    newTreasury,
    ackDelegate,
    registry,
    initialStake,
    initialValidation,
    initialReputation,
    initialDispute,
    initialCertificate,
    initialFeePool,
    initialPolicy,
  };
}

describe('Governance configuration surfaces', function () {
  describe('FeePool.applyConfiguration', function () {
    it('allows the owner to orchestrate multi-parameter updates', async function () {
      const {
        owner,
        pauser,
        treasury,
        newTreasury,
        rewarder,
        timelock,
        pool,
        replacementStake,
        newPolicy,
      } = await loadFixture(feePoolFixture);

      const allowlistUpdates = [
        { treasury: treasury.address, allowed: true },
        { treasury: newTreasury.address, allowed: true },
      ];
      const rewarderUpdates = [
        { rewarder: rewarder.address, allowed: true },
      ];

      const config = {
        setStakeManager: true,
        stakeManager: await replacementStake.getAddress(),
        setRewardRole: true,
        rewardRole: 2,
        setBurnPct: true,
        burnPct: 6,
        setTreasury: true,
        treasury: newTreasury.address,
        setGovernance: true,
        governance: await timelock.getAddress(),
        setTaxPolicy: true,
        taxPolicy: await newPolicy.getAddress(),
        setPauser: true,
        pauser: pauser.address,
        setPauserManager: true,
        pauserManager: owner.address,
      };

      await expect(
        pool
          .connect(owner)
          .applyConfiguration(config, allowlistUpdates, rewarderUpdates)
      ).to.emit(pool, 'ConfigurationApplied');

      expect(await pool.stakeManager()).to.equal(await replacementStake.getAddress());
      expect(await pool.rewardRole()).to.equal(2n);
      expect(await pool.burnPct()).to.equal(6n);
      expect(await pool.treasury()).to.equal(newTreasury.address);
      expect(await pool.governance()).to.equal(await timelock.getAddress());
      expect(await pool.taxPolicy()).to.equal(await newPolicy.getAddress());
      expect(await pool.pauser()).to.equal(pauser.address);
      expect(await pool.pauserManager()).to.equal(owner.address);
      expect(await pool.treasuryAllowlist(treasury.address)).to.equal(true);
      expect(await pool.treasuryAllowlist(newTreasury.address)).to.equal(true);
      expect(await pool.rewarders(rewarder.address)).to.equal(true);
    });
  });

  describe('StakeManager.applyConfiguration', function () {
    it('gives governance batched control over critical parameters', async function () {
      const { owner, pauser, newTreasury, stake, pool, validation, dispute } =
        await loadFixture(stakeManagerFixture);

      const allowlistUpdates = [{ treasury: newTreasury.address, allowed: true }];

      const autoStakeSettings = {
        threshold: 3,
        increasePct: 12,
        decreasePct: 7,
        window: 3600,
        floor: ethers.parseUnits('1', 18),
        ceil: ethers.parseUnits('50', 18),
        temperatureThreshold: 1,
        hamiltonianThreshold: 2,
        disputeWeight: 5,
        temperatureWeight: 3,
        hamiltonianWeight: 4,
      };

      const config = {
        setPauser: true,
        pauser: pauser.address,
        setPauserManager: true,
        pauserManager: owner.address,
        setThermostat: true,
        thermostat: ethers.ZeroAddress,
        setHamiltonianFeed: true,
        hamiltonianFeed: ethers.ZeroAddress,
        setAutoStakeTuning: true,
        autoStakeEnabled: true,
        setAutoStakeSettings: true,
        autoStakeSettings,
        setMinStake: false,
        minStake: 0,
        setRoleMinimums: true,
        agentMinStake: ethers.parseUnits('3', 18),
        validatorMinStake: ethers.parseUnits('4', 18),
        platformMinStake: ethers.parseUnits('5', 18),
        setSlashingPercentages: true,
        employerSlashPct: 60,
        treasurySlashPct: 20,
        setOperatorSlashPct: true,
        operatorSlashPct: 5,
        setValidatorSlashRewardPct: true,
        validatorSlashRewardPct: 10,
        setSlashBurnPct: true,
        slashBurnPct: 5,
        setTreasury: true,
        treasury: newTreasury.address,
        setJobRegistry: false,
        jobRegistry: ethers.ZeroAddress,
        setDisputeModule: true,
        disputeModule: await dispute.getAddress(),
        setValidationModule: true,
        validationModule: await validation.getAddress(),
        setModules: false,
        modulesJobRegistry: ethers.ZeroAddress,
        modulesDisputeModule: ethers.ZeroAddress,
        setFeePct: true,
        feePct: 3,
        setFeePool: true,
        feePool: await pool.getAddress(),
        setBurnPct: true,
        burnPct: 4,
        setValidatorRewardPct: true,
        validatorRewardPct: 6,
        setUnbondingPeriod: true,
        unbondingPeriod: 14 * 24 * 3600,
        setMaxStakePerAddress: true,
        maxStakePerAddress: ethers.parseUnits('100', 18),
        setStakeRecommendations: true,
        recommendedMinStake: ethers.parseUnits('3', 18),
        recommendedMaxStake: ethers.parseUnits('90', 18),
        setMaxAGITypes: true,
        maxAGITypes: 25,
        setMaxTotalPayoutPct: true,
        maxTotalPayoutPct: 150,
        pause: true,
        unpause: false,
      };

      await expect(
        stake.connect(owner).applyConfiguration(config, allowlistUpdates)
      ).to.emit(stake, 'ConfigurationApplied');

      expect(await stake.pauser()).to.equal(pauser.address);
      expect(await stake.autoStakeTuning()).to.equal(true);
      expect(await stake.stakeDisputeThreshold()).to.equal(3n);
      expect(await stake.stakeIncreasePct()).to.equal(12n);
      expect(await stake.stakeDecreasePct()).to.equal(7n);
      expect(await stake.stakeTuneWindow()).to.equal(3600n);
      expect(await stake.minStakeFloor()).to.equal(ethers.parseUnits('1', 18));
      expect(await stake.maxMinStake()).to.equal(ethers.parseUnits('50', 18));
      expect(await stake.stakeTempThreshold()).to.equal(1n);
      expect(await stake.stakeHamiltonianThreshold()).to.equal(2n);
      expect(await stake.disputeWeight()).to.equal(5n);
      expect(await stake.temperatureWeight()).to.equal(3n);
      expect(await stake.hamiltonianWeight()).to.equal(4n);
      expect(await stake.minStake()).to.equal(ethers.parseUnits('3', 18));
      expect(await stake.roleMinimumStake(0)).to.equal(ethers.parseUnits('3', 18));
      expect(await stake.roleMinimumStake(1)).to.equal(ethers.parseUnits('4', 18));
      expect(await stake.roleMinimumStake(2)).to.equal(ethers.parseUnits('5', 18));
      expect(await stake.employerSlashPct()).to.equal(60n);
      expect(await stake.treasurySlashPct()).to.equal(20n);
      expect(await stake.operatorSlashPct()).to.equal(5n);
      expect(await stake.validatorSlashRewardPct()).to.equal(10n);
      expect(await stake.burnSlashPct()).to.equal(5n);
      expect(await stake.treasury()).to.equal(newTreasury.address);
      expect(await stake.treasuryAllowlist(newTreasury.address)).to.equal(true);
      expect(await stake.disputeModule()).to.equal(await dispute.getAddress());
      expect(await stake.validationModule()).to.equal(await validation.getAddress());
      expect(await stake.feePct()).to.equal(3n);
      expect(await stake.feePool()).to.equal(await pool.getAddress());
      expect(await stake.burnPct()).to.equal(4n);
      expect(await stake.validatorRewardPct()).to.equal(6n);
      expect(await stake.unbondingPeriod()).to.equal(BigInt(14 * 24 * 3600));
      expect(await stake.maxStakePerAddress()).to.equal(ethers.parseUnits('100', 18));
      expect(await stake.maxAGITypes()).to.equal(25n);
      expect(await stake.maxTotalPayoutPct()).to.equal(150n);
      expect(await stake.paused()).to.equal(true);
      expect(await stake.pauserManager()).to.equal(owner.address);
    });
  });

  describe('JobRegistry.applyConfiguration', function () {
    it('lets governance rewire modules and operational parameters atomically', async function () {
      const {
        owner,
        pauser,
        treasury,
        newTreasury,
        ackDelegate,
        registry,
        initialStake,
      } = await loadFixture(jobRegistryFixture);

      const StakeManager = await ethers.getContractFactory(
        'contracts/v2/StakeManager.sol:StakeManager'
      );
      const replacementStake = await StakeManager.deploy(
        0,
        70,
        30,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        owner.address
      );
      await replacementStake.connect(owner).setMinStake(1);

      const ValidationStub = await ethers.getContractFactory(
        'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
      );
      const replacementValidation = await ValidationStub.deploy();

      const Reputation = await ethers.getContractFactory(
        'contracts/v2/ReputationEngine.sol:ReputationEngine'
      );
      const replacementReputation = await Reputation.deploy(
        await replacementStake.getAddress()
      );

      const DisputeModule = await ethers.getContractFactory(
        'contracts/v2/modules/DisputeModule.sol:DisputeModule'
      );
      const replacementDispute = await DisputeModule.deploy(
        ethers.ZeroAddress,
        0,
        0,
        ethers.ZeroAddress,
        owner.address
      );

      const Certificate = await ethers.getContractFactory(
        'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
      );
      const replacementCertificate = await Certificate.deploy('Cert2', 'CRT2');

      const TaxPolicy = await ethers.getContractFactory('contracts/v2/TaxPolicy.sol:TaxPolicy');
      const replacementPolicy = await TaxPolicy.deploy('ipfs://policy-v2', 'ack v2');

      const FeePool = await ethers.getContractFactory('contracts/v2/FeePool.sol:FeePool');
      const replacementFeePool = await FeePool.deploy(
        await replacementStake.getAddress(),
        0,
        ethers.ZeroAddress,
        await replacementPolicy.getAddress()
      );

      const IdentityRegistry = await ethers.getContractFactory(
        'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
      );
      const identity = await IdentityRegistry.deploy();

      const AuditModule = await ethers.getContractFactory(
        'contracts/v2/AuditModule.sol:AuditModule'
      );
      const auditModule = await AuditModule.deploy(
        ethers.ZeroAddress,
        await replacementReputation.getAddress()
      );

      const AckStub = await ethers.getContractFactory(
        'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
      );
      const ackModule = await AckStub.deploy(await replacementPolicy.getAddress());

      const acknowledgerUpdates = [
        { acknowledger: ackDelegate.address, allowed: true },
      ];
      const ackModules = [await ackModule.getAddress()];

      const config = {
        setPauser: true,
        pauser: pauser.address,
        setPauserManager: true,
        pauserManager: owner.address,
        setModuleBundle: true,
        modules: {
          validation: await replacementValidation.getAddress(),
          stakeManager: await replacementStake.getAddress(),
          reputation: await replacementReputation.getAddress(),
          dispute: await replacementDispute.getAddress(),
          certificateNFT: await replacementCertificate.getAddress(),
          feePool: await replacementFeePool.getAddress(),
        },
        setIdentityRegistry: true,
        identityRegistry: await identity.getAddress(),
        setDisputeModule: true,
        disputeModule: await replacementDispute.getAddress(),
        setValidationModule: true,
        validationModule: await replacementValidation.getAddress(),
        setAuditModule: true,
        auditModule: await auditModule.getAddress(),
        setStakeManager: true,
        stakeManager: await replacementStake.getAddress(),
        setReputationModule: true,
        reputationModule: await replacementReputation.getAddress(),
        setCertificateNFT: true,
        certificateNFT: await replacementCertificate.getAddress(),
        setFeePool: true,
        feePool: await replacementFeePool.getAddress(),
        setTaxPolicy: true,
        taxPolicy: await replacementPolicy.getAddress(),
        setTreasury: true,
        treasury: newTreasury.address,
        setJobStake: true,
        jobStake: 2n * 10n ** 18n,
        setMinAgentStake: true,
        minAgentStake: 5n * 10n ** 17n,
        setFeePct: true,
        feePct: 4,
        setValidatorRewardPct: true,
        validatorRewardPct: 6,
        setMaxJobReward: true,
        maxJobReward: 1_000_000,
        setJobDurationLimit: true,
        jobDurationLimit: 7 * 24 * 3600,
        setMaxActiveJobsPerAgent: true,
        maxActiveJobsPerAgent: 12,
        setExpirationGracePeriod: true,
        expirationGracePeriod: 3600,
        setAgentRootNode: true,
        agentRootNode: ethers.keccak256(ethers.toUtf8Bytes('agent.root')),
        setAgentMerkleRoot: true,
        agentMerkleRoot: ethers.keccak256(ethers.toUtf8Bytes('agent.merkle')),
        setValidatorRootNode: true,
        validatorRootNode: ethers.keccak256(ethers.toUtf8Bytes('validator.root')),
        setValidatorMerkleRoot: true,
        validatorMerkleRoot: ethers.keccak256(ethers.toUtf8Bytes('validator.merkle')),
        setAgentAuthCacheDuration: true,
        agentAuthCacheDuration: 86_400,
        bumpAgentAuthCacheVersion: true,
      };

      await expect(
        registry
          .connect(owner)
          .applyConfiguration(config, acknowledgerUpdates, ackModules)
      ).to.emit(registry, 'ConfigurationApplied');

      expect(await registry.pauser()).to.equal(pauser.address);
      expect(await registry.pauserManager()).to.equal(owner.address);
      expect(await registry.identityRegistry()).to.equal(await identity.getAddress());
      expect(await registry.disputeModule()).to.equal(
        await replacementDispute.getAddress()
      );
      expect(await registry.validationModule()).to.equal(
        await replacementValidation.getAddress()
      );
      expect(await registry.stakeManager()).to.equal(
        await replacementStake.getAddress()
      );
      expect(await registry.reputationEngine()).to.equal(
        await replacementReputation.getAddress()
      );
      expect(await registry.certificateNFT()).to.equal(
        await replacementCertificate.getAddress()
      );
      expect(await registry.feePool()).to.equal(
        await replacementFeePool.getAddress()
      );
      expect(await registry.taxPolicy()).to.equal(
        await replacementPolicy.getAddress()
      );
      expect(await registry.treasury()).to.equal(newTreasury.address);
      expect(await registry.jobStake()).to.equal(2n * 10n ** 18n);
      expect(await registry.minAgentStake()).to.equal(5n * 10n ** 17n);
      expect(await registry.feePct()).to.equal(4n);
      expect(await registry.validatorRewardPct()).to.equal(6n);
      expect(await registry.maxJobReward()).to.equal(1_000_000n);
      expect(await registry.maxJobDuration()).to.equal(BigInt(7 * 24 * 3600));
      expect(await registry.maxActiveJobsPerAgent()).to.equal(12n);
      expect(await registry.expirationGracePeriod()).to.equal(3600n);
      expect(await registry.agentAuthCacheDuration()).to.equal(86_400n);
      expect(await registry.agentAuthCacheVersion()).to.be.greaterThan(0n);
      expect(await registry.acknowledgers(ackDelegate.address)).to.equal(true);
      expect(await registry.acknowledgers(await ackModule.getAddress())).to.equal(true);
      expect(await identity.agentRootNode()).to.equal(config.agentRootNode);
      expect(await identity.agentMerkleRoot()).to.equal(config.agentMerkleRoot);
      expect(await identity.clubRootNode()).to.equal(config.validatorRootNode);
      expect(await replacementStake.version()).to.equal(2n);
      expect(await initialStake.version()).to.equal(2n);
    });
  });
});
