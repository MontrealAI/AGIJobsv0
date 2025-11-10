const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA } = require('../../scripts/constants');

describe('StakeManager slashing configuration', function () {
  let owner, stakeManager;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const artifact = await readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
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
      50,
      50,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
  });

  it('rejects percentages that exceed 100 total', async () => {
    await expect(
      stakeManager.setSlashingPercentages(60, 50)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('rejects validator slash reward percentage above 100', async () => {
    await expect(
      stakeManager.setValidatorSlashRewardPct(101)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('rejects distributions whose sum exceeds 100', async () => {
    await expect(
      stakeManager.setSlashingDistribution(40, 30, 40)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('updates operator slash percentage via governance', async () => {
    await expect(
      stakeManager.connect(owner).setSlashingPercentages(40, 40)
    )
      .to.emit(stakeManager, 'SlashingPercentagesUpdated')
      .withArgs(40, 40);

    await expect(
      stakeManager.connect(owner).setOperatorSlashPct(10)
    )
      .to.emit(stakeManager, 'OperatorSlashPctUpdated')
      .withArgs(10);

    expect(await stakeManager.operatorSlashPct()).to.equal(10);

    await expect(
      stakeManager.connect(owner).setOperatorSlashPct(101)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('supports updating the full slash distribution in one call', async () => {
    await expect(
      stakeManager
        .connect(owner)
        .setSlashDistribution(25, 25, 20, 30)
    )
      .to.emit(stakeManager, 'SlashDistributionUpdated')
      .withArgs(25, 25, 20, 30);

    expect(await stakeManager.employerSlashPct()).to.equal(25);
    expect(await stakeManager.treasurySlashPct()).to.equal(25);
    expect(await stakeManager.operatorSlashPct()).to.equal(20);
    expect(await stakeManager.validatorSlashRewardPct()).to.equal(30);
  });
});

describe('StakeManager multi-validator slashing', function () {
  const Role = { Agent: 0, Validator: 1, Platform: 2 };
  const ONE = 10n ** 18n;
  let owner, treasury, agent, val1, val2, employer;
  let token, stakeManager, registrySigner, engine;

  beforeEach(async () => {
    [owner, treasury, agent, val1, val2, employer] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const addresses = [agent.address, val1.address, val2.address, employer.address];
    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(3000n * ONE, 32),
    ]);
    for (const addr of addresses) {
      const balSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 0]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balSlot,
        ethers.toBeHex(1000n * ONE, 32),
      ]);
      const ackSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 6]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }
    const tBalSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [treasury.address, 0]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      tBalSlot,
      ethers.toBeHex(0, 32),
    ]);
    const tAckSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [treasury.address, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      tAckSlot,
      ethers.toBeHex(1n, 32),
    ]);

    const JobReg = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const jobRegistry = await JobReg.deploy(ethers.ZeroAddress);
    const regAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      regAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(regAddr);

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      0,
      0,
      treasury.address,
      regAddr,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setValidatorRewardPct(20);
    await stakeManager
      .connect(owner)
      .setTreasuryAllowlist(treasury.address, true);

    const stakeAddr = await stakeManager.getAddress();
    const stakeAck = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [stakeAddr, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAck,
      ethers.toBeHex(1n, 32),
    ]);

    await token.connect(agent).approve(stakeAddr, 1000n * ONE);
    await token.connect(val1).approve(stakeAddr, 1000n * ONE);
    await token.connect(val2).approve(stakeAddr, 1000n * ONE);

    await stakeManager.connect(agent).depositStake(Role.Agent, 100n * ONE);
    await stakeManager.connect(val1).depositStake(Role.Validator, 100n * ONE);
    await stakeManager.connect(val2).depositStake(Role.Validator, 300n * ONE);

    const Engine = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    engine = await Engine.deploy(await stakeManager.getAddress());
    await engine.connect(owner).setCaller(regAddr, true);
  });

  it('slashes and rewards validators based on stake and reputation', async () => {
    const amount = 40n * ONE;
    await stakeManager.connect(owner).setSlashingDistribution(0, 80, 20);
    const validatorReward = (amount * 20n) / 100n;
    const baseAmount = amount - validatorReward;
    const expectedTreasuryShare = (baseAmount * 80n) / 100n;

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address,address[])'](
          agent.address,
          Role.Agent,
          amount,
          employer.address,
          [val1.address, val2.address]
        )
    )
      .to.emit(stakeManager, 'RewardValidator')
      .withArgs(val1.address, 2n * ONE, ethers.ZeroHash)
      .and.to.emit(stakeManager, 'RewardValidator')
      .withArgs(val2.address, 6n * ONE, ethers.ZeroHash)
      .and.to.emit(stakeManager, 'Slash')
      .withArgs(agent.address, 40n * ONE, val1.address);

    expect(await token.balanceOf(val1.address)).to.equal(902n * ONE);
    expect(await token.balanceOf(val2.address)).to.equal(706n * ONE);
    expect(await token.balanceOf(treasury.address)).to.equal(expectedTreasuryShare);

    const agentGain = 100n;
    await engine
      .connect(registrySigner)
      .rewardValidator(val1.address, agentGain);
    await engine
      .connect(registrySigner)
      .rewardValidator(val2.address, agentGain);

    expect(await engine.reputationOf(val1.address)).to.be.gt(0n);
    expect(await engine.reputationOf(val2.address)).to.be.gt(0n);
  });

  it('refunds employer share when an agent is slashed', async () => {
    await stakeManager.connect(owner).setValidatorRewardPct(0);
    await stakeManager.connect(owner).setSlashingPercentages(60, 40);

    const employerStart = await token.balanceOf(employer.address);
    const treasuryStart = await token.balanceOf(treasury.address);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address,address[])'](
          agent.address,
          Role.Agent,
          40n * ONE,
          employer.address,
          []
        )
    )
      .to.emit(stakeManager, 'StakeSlashed')
      .withArgs(
        agent.address,
        Role.Agent,
        employer.address,
        treasury.address,
        24n * ONE,
        16n * ONE,
        0n,
        0n,
        0n
      );

    const employerEnd = await token.balanceOf(employer.address);
    const treasuryEnd = await token.balanceOf(treasury.address);

    expect(employerEnd - employerStart).to.equal(24n * ONE);
    expect(treasuryEnd - treasuryStart).to.equal(16n * ONE);
  });

  it('routes operator slash share into the reward pool', async () => {
    await stakeManager.connect(owner).setValidatorRewardPct(0);
    await stakeManager
      .connect(owner)
      .setSlashDistribution(30, 30, 40, 0);

    const amount = 50n * ONE;
    const operatorShare = (amount * 40n) / 100n;

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address,address[])'](
          agent.address,
          Role.Agent,
          amount,
          employer.address,
          []
        )
    )
      .to.emit(stakeManager, 'OperatorSlashShareAllocated')
      .withArgs(agent.address, Role.Agent, operatorShare)
      .and.to.emit(stakeManager, 'RewardPoolUpdated')
      .withArgs(operatorShare);

    expect(await stakeManager.operatorRewardPool()).to.equal(operatorShare);
  });

  it('redistributes escrow according to slash distribution', async () => {
    await stakeManager
      .connect(owner)
      .setSlashDistribution(60, 20, 10, 10);

    const jobId = ethers.encodeBytes32String('escrow-slash');
    const amount = 100n * ONE;

    await token.connect(employer).approve(await stakeManager.getAddress(), amount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, amount);

    const employerStart = await token.balanceOf(employer.address);
    const treasuryStart = await token.balanceOf(treasury.address);
    const val1Start = await token.balanceOf(val1.address);
    const val2Start = await token.balanceOf(val2.address);

    const validatorTarget = (amount * 10n) / 100n;
    const baseAmount = amount - validatorTarget;
    const expectedEmployer = (baseAmount * 60n) / 100n;
    const expectedTreasury = (baseAmount * 20n) / 100n;
    const expectedOperator = (baseAmount * 10n) / 100n;

    const val1Stake = await stakeManager.stakes(val1.address, Role.Validator);
    const val2Stake = await stakeManager.stakes(val2.address, Role.Validator);
    const totalStake = val1Stake + val2Stake;
    const val1Reward = (validatorTarget * val1Stake) / totalStake;
    const val2Reward = (validatorTarget * val2Stake) / totalStake;
    const validatorDistributed = val1Reward + val2Reward;
    const burnRemainder = validatorTarget - validatorDistributed;
    const expectedBurn =
      baseAmount - expectedEmployer - expectedTreasury - expectedOperator + burnRemainder;

    await expect(
      stakeManager
        .connect(registrySigner)
        ['redistributeEscrow(bytes32,address,uint256,address[])'](
          jobId,
          employer.address,
          amount,
          [val1.address, val2.address]
        )
    )
      .to.emit(stakeManager, 'EscrowPenaltyApplied')
      .withArgs(
        jobId,
        employer.address,
        amount,
        expectedEmployer,
        expectedTreasury,
        expectedOperator,
        validatorDistributed,
        expectedBurn
      )
      .and.to.emit(stakeManager, 'OperatorSlashShareAllocated')
      .withArgs(ethers.ZeroAddress, Role.Platform, expectedOperator)
      .and.to.emit(stakeManager, 'RewardPoolUpdated')
      .withArgs(expectedOperator);

    expect(await token.balanceOf(employer.address)).to.equal(
      employerStart + expectedEmployer
    );
    expect(await token.balanceOf(treasury.address)).to.equal(
      treasuryStart + expectedTreasury
    );
    expect(await stakeManager.operatorRewardPool()).to.equal(expectedOperator);
    expect(await token.balanceOf(val1.address)).to.equal(val1Start + val1Reward);
    expect(await token.balanceOf(val2.address)).to.equal(val2Start + val2Reward);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0);
  });
});

describe('StakeManager validator slashing via validation module', function () {
  const Role = { Validator: 1 };
  const ONE = 10n ** 18n;
  let owner, treasury, badValidator, goodValidator1, goodValidator2, employer;
  let token, stakeManager, validationSigner;

  beforeEach(async () => {
    [owner, treasury, badValidator, goodValidator1, goodValidator2, employer] =
      await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const addresses = [
      badValidator.address,
      goodValidator1.address,
      goodValidator2.address,
      treasury.address,
      employer.address,
    ];
    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(5000n * ONE, 32),
    ]);
    for (const addr of addresses) {
      const balSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 0]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balSlot,
        ethers.toBeHex(1000n * ONE, 32),
      ]);
      const ackSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 6]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }

    const JobReg = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const jobRegistry = await JobReg.deploy(ethers.ZeroAddress);
    const regAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      regAddr,
      '0x56BC75E2D63100000',
    ]);
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      60,
      40,
      treasury.address,
      regAddr,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setTreasuryAllowlist(treasury.address, true);
    await stakeManager.connect(owner).setSlashingDistribution(40, 40, 20);

    const stakeAddr = await stakeManager.getAddress();
    const stakeAck = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [stakeAddr, 6])
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAck,
      ethers.toBeHex(1n, 32),
    ]);

    await token.connect(badValidator).approve(stakeAddr, 1000n * ONE);
    await token.connect(goodValidator1).approve(stakeAddr, 1000n * ONE);
    await token.connect(goodValidator2).approve(stakeAddr, 1000n * ONE);

    await stakeManager.connect(badValidator).depositStake(Role.Validator, 100n * ONE);
    await stakeManager
      .connect(goodValidator1)
      .depositStake(Role.Validator, 30n * ONE);
    await stakeManager
      .connect(goodValidator2)
      .depositStake(Role.Validator, 10n * ONE);

    const ValidationModule = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const validationModule = await ValidationModule.deploy();
    await validationModule.setJobRegistry(regAddr);
    await validationModule.setValidators([
      goodValidator1.address,
      goodValidator2.address,
    ]);
    const validationAddr = await validationModule.getAddress();
    await stakeManager.connect(owner).setValidationModule(validationAddr);
    validationSigner = await ethers.getImpersonatedSigner(validationAddr);
    await ethers.provider.send('hardhat_setBalance', [
      validationAddr,
      '0x56BC75E2D63100000',
    ]);
  });

  it('allows the validation module to slash validators and distribute rewards', async () => {
    const amount = 40n * ONE;
    const expectedValidatorReward = (amount * 20n) / 100n;
    const baseAmount = amount - expectedValidatorReward;
    const expectedEmployerShare = (baseAmount * 40n) / 100n;
    const expectedTreasuryShare = (baseAmount * 40n) / 100n;
    const expectedBurnShare = baseAmount - expectedEmployerShare - expectedTreasuryShare;

    const validatorStakeBefore = await stakeManager.stakeOf(
      badValidator.address,
      Role.Validator
    );
    const val1Before = await token.balanceOf(goodValidator1.address);
    const val2Before = await token.balanceOf(goodValidator2.address);
    const treasuryBefore = await token.balanceOf(treasury.address);
    const employerBefore = await token.balanceOf(employer.address);

    await expect(
      stakeManager
        .connect(validationSigner)
        ['slash(address,uint256,address,address[])'](
          badValidator.address,
          amount,
          employer.address,
          [goodValidator1.address, goodValidator2.address]
        )
    )
      .to.emit(stakeManager, 'RewardValidator')
      .withArgs(goodValidator1.address, 6n * ONE, ethers.ZeroHash)
      .and.to.emit(stakeManager, 'RewardValidator')
      .withArgs(goodValidator2.address, 2n * ONE, ethers.ZeroHash)
      .and.to.emit(stakeManager, 'StakeSlashed')
      .withArgs(
        badValidator.address,
        Role.Validator,
        employer.address,
        treasury.address,
        expectedEmployerShare,
        expectedTreasuryShare,
        0n,
        expectedValidatorReward,
        expectedBurnShare
      );

    const remainingStake = await stakeManager.stakeOf(
      badValidator.address,
      Role.Validator
    );
    expect(remainingStake).to.equal(validatorStakeBefore - amount);

    const val1Balance = await token.balanceOf(goodValidator1.address);
    const val2Balance = await token.balanceOf(goodValidator2.address);
    expect(val1Balance - val1Before).to.equal(6n * ONE);
    expect(val2Balance - val2Before).to.equal(2n * ONE);

    const treasuryBalance = await token.balanceOf(treasury.address);
    const employerBalance = await token.balanceOf(employer.address);
    expect(treasuryBalance - treasuryBefore).to.equal(expectedTreasuryShare);
    expect(employerBalance - employerBefore).to.equal(expectedEmployerShare);

    const validatorRewardPaid = val1Balance - val1Before + (val2Balance - val2Before);
    expect(validatorRewardPaid).to.equal(expectedValidatorReward);
  });
});

describe('StakeManager deployer integration', function () {
  const Role = { Agent: 0, Validator: 1 };
  const ONE = 10n ** 18n;
  let owner, governance, agent, employer;
  let token, stakeManager, registrySigner, taxPolicy;

  beforeEach(async () => {
    [owner, governance, agent, employer] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(3000n * ONE, 32),
    ]);

    for (const addr of [agent.address, governance.address]) {
      const balSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 0]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balSlot,
        ethers.toBeHex(1000n * ONE, 32),
      ]);
      const ackSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint256'],
          [addr, 6]
        )
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }

    const Deployer = await ethers.getContractFactory(
      'contracts/v2/Deployer.sol:Deployer'
    );
    const deployer = await Deployer.connect(owner).deploy();
    await deployer.waitForDeployment();

    const ids = {
      ens: ethers.ZeroAddress,
      nameWrapper: ethers.ZeroAddress,
      clubRootNode: ethers.ZeroHash,
      agentRootNode: ethers.ZeroHash,
      validatorMerkleRoot: ethers.ZeroHash,
      agentMerkleRoot: ethers.ZeroHash,
    };

    const deployment = await deployer.deployDefaults.staticCall(
      ids,
      governance.address
    );
    await deployer.deployDefaults(ids, governance.address);

    const stakeAddr = deployment[0];
    const jobRegistryAddr = deployment[1];
    const taxPolicyAddr = deployment[10];

    stakeManager = await ethers.getContractAt(
      'contracts/v2/StakeManager.sol:StakeManager',
      stakeAddr
    );
    registrySigner = await ethers.getImpersonatedSigner(jobRegistryAddr);
    taxPolicy = await ethers.getContractAt(
      'contracts/v2/TaxPolicy.sol:TaxPolicy',
      taxPolicyAddr
    );

    await ethers.provider.send('hardhat_setBalance', [
      jobRegistryAddr,
      '0x56BC75E2D63100000',
    ]);

    const stakeAck = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [stakeAddr, 6]
      )
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAck,
      ethers.toBeHex(1n, 32),
    ]);

    if (taxPolicyAddr !== ethers.ZeroAddress) {
      await taxPolicy.connect(agent).acknowledge();
    }

    await token.connect(agent).approve(stakeAddr, 1000n * ONE);
    await stakeManager.connect(agent).depositStake(Role.Agent, 100n * ONE);
  });

  it('allowlists the treasury during deployment', async () => {
    expect(await stakeManager.treasury()).to.equal(governance.address);
    expect(
      await stakeManager.treasuryAllowlist(governance.address)
    ).to.equal(true);

    const slashAmount = 40n * ONE;
    const beforeBalance = await token.balanceOf(governance.address);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address,address[])'](
          agent.address,
          Role.Agent,
          slashAmount,
          employer.address,
          []
        )
    ).not.to.be.reverted;

    const afterBalance = await token.balanceOf(governance.address);
    expect(afterBalance - beforeBalance).to.equal(slashAmount);
  });
});

describe('StakeManager governance emergency slash', function () {
  const Role = { Agent: 0, Validator: 1, Platform: 2 };
  const ONE = 10n ** 18n;
  let owner;
  let treasury;
  let validator;
  let beneficiary;
  let stakeManager;
  let token;

  beforeEach(async () => {
    [owner, treasury, validator, beneficiary] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);

    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const addresses = [
      owner.address,
      treasury.address,
      validator.address,
      beneficiary.address,
    ];
    for (const addr of addresses) {
      const balSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [addr, 0])
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balSlot,
        ethers.toBeHex(1_000n * ONE, 32),
      ]);
      const ackSlot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [addr, 6])
      );
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      0,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );

    const JobMock = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const jobRegistry = await JobMock.deploy();
    await stakeManager.connect(owner).setJobRegistry(await jobRegistry.getAddress());

    await stakeManager.connect(owner).setTreasuryAllowlist(treasury.address, true);
    await stakeManager.connect(owner).setSlashingPercentages(60, 40);
    await stakeManager.connect(owner).setValidatorRewardPct(0);
    await stakeManager.connect(owner).setOperatorSlashPct(0);

    const stakeAddr = await stakeManager.getAddress();
    const stakeAckSlot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [stakeAddr, 6])
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAckSlot,
      ethers.toBeHex(1n, 32),
    ]);

    await token.connect(validator).approve(stakeAddr, 1_000n * ONE);
    await stakeManager.connect(validator).depositStake(Role.Validator, 200n * ONE);
  });

  it('slashes a validator stake and routes funds to the beneficiary', async () => {
    const pct = 2_500; // 25%
    const slashAmount = (200n * ONE * BigInt(pct)) / 10_000n;
    const beneficiaryStart = await token.balanceOf(beneficiary.address);
    const treasuryStart = await token.balanceOf(treasury.address);

    await expect(
      stakeManager
        .connect(owner)
        .governanceSlash(validator.address, Role.Validator, pct, beneficiary.address)
    )
      .to.emit(stakeManager, 'GovernanceSlash')
      .withArgs(
        validator.address,
        Role.Validator,
        beneficiary.address,
        slashAmount,
        pct,
        owner.address
      );

    const finalStake = await stakeManager.stakes(validator.address, Role.Validator);
    expect(finalStake).to.equal(200n * ONE - slashAmount);

    const totalStake = await stakeManager.totalStake(Role.Validator);
    expect(totalStake).to.equal(200n * ONE - slashAmount);

    const beneficiaryEnd = await token.balanceOf(beneficiary.address);
    const employerShare = (slashAmount * 60n) / 100n;
    expect(beneficiaryEnd - beneficiaryStart).to.equal(employerShare);

    const treasuryEnd = await token.balanceOf(treasury.address);
    const treasuryShare = (slashAmount * 40n) / 100n;
    expect(treasuryEnd - treasuryStart).to.equal(treasuryShare);
  });

  it('reverts when governance slash parameters are invalid', async () => {
    await expect(
      stakeManager
        .connect(owner)
        .governanceSlash(validator.address, Role.Validator, 0, beneficiary.address)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');

    await expect(
      stakeManager
        .connect(owner)
        .governanceSlash(validator.address, Role.Validator, 100, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidRecipient');

    await expect(
      stakeManager
        .connect(owner)
        .governanceSlash(owner.address, Role.Validator, 1_000, beneficiary.address)
    ).to.be.revertedWithCustomError(stakeManager, 'InsufficientStake');
  });
});
