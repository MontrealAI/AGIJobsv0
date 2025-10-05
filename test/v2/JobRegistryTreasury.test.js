const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('JobRegistry Treasury', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let registry, stakeManager, token;
  let owner, treasury;

  beforeEach(async function () {
    [owner, treasury] = await ethers.getSigners();

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
  });

  afterEach(async function () {
    const mock = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      mock.deployedBytecode,
    ]);
    const ownerSlot = '0x' + (5).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      ownerSlot,
      '0x' + '00'.repeat(32),
    ]);
  });

  it('rejects owner treasury address', async function () {
    await expect(
      registry.connect(owner).setTreasury(owner.address)
    ).to.be.revertedWithCustomError(registry, 'InvalidTreasury');
  });

  it('allows zero treasury address', async function () {
    await registry.connect(owner).setTreasury(ethers.ZeroAddress);
    expect(await registry.treasury()).to.equal(ethers.ZeroAddress);
  });

  it('sets a valid treasury address', async function () {
    await registry.connect(owner).setTreasury(treasury.address);
    expect(await registry.treasury()).to.equal(treasury.address);
  });

  it('mints rewards and forwards shares to treasury', async function () {
    const Thermostat = await ethers.getContractFactory(
      'contracts/v2/Thermostat.sol:Thermostat'
    );
    const thermostat = await Thermostat.deploy(
      ethers.parseUnits('1', 18),
      1,
      ethers.parseUnits('2', 18),
      owner.address
    );

    const MockFeePool = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockFeePool'
    );
    const feePool = await MockFeePool.deploy();

    const MockReputation = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockReputation'
    );
    const rep = await MockReputation.deploy();

    const MockEnergyOracle = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockEnergyOracle'
    );
    const oracle = await MockEnergyOracle.deploy();

    const RewardEngine = await ethers.getContractFactory(
      'contracts/v2/RewardEngineMB.sol:RewardEngineMB'
    );
    const engine = await RewardEngine.deploy(
      thermostat,
      feePool,
      rep,
      oracle,
      owner.address
    );

    await engine.setSettler(owner.address, true);
    await engine.setTreasury(treasury.address);

    const ownerSlot = '0x' + (5).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      ownerSlot,
      ethers.zeroPadValue(await engine.getAddress(), 32),
    ]);

    const att = {
      jobId: 1,
      user: owner.address,
      energy: ethers.parseUnits('1', 18),
      degeneracy: 1,
      epochId: 1,
      role: 0,
      nonce: 1,
      deadline: 0,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0,
      value: 0,
    };

    const data = {
      agents: [{ att, sig: '0x' }],
      validators: [],
      operators: [],
      employers: [],
      paidCosts: ethers.parseUnits('1', 18),
    };

    await engine.settleEpoch(1, data);

    const feePoolAddress = await feePool.getAddress();
    const poolBal = await token.balanceOf(feePoolAddress);
    const agentReward = await token.balanceOf(owner.address);
    const treasuryReward = await token.balanceOf(treasury.address);
    const recordedAgent = await feePool.rewards(owner.address);
    const recordedTreasury = await feePool.rewards(treasury.address);

    expect(poolBal).to.equal(0n);
    expect(agentReward).to.equal(recordedAgent);
    expect(treasuryReward).to.equal(recordedTreasury);
    expect(agentReward).to.be.gt(0n);
    expect(treasuryReward).to.be.gt(0n);

    const totalSupply = await token.totalSupply();
    expect(agentReward + treasuryReward).to.equal(totalSupply);
  });

  it('reverts when treasury is unset', async function () {
    const Thermostat = await ethers.getContractFactory(
      'contracts/v2/Thermostat.sol:Thermostat'
    );
    const thermostat = await Thermostat.deploy(
      ethers.parseUnits('1', 18),
      1,
      ethers.parseUnits('2', 18),
      owner.address
    );

    const MockFeePool = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockFeePool'
    );
    const feePool = await MockFeePool.deploy();

    const MockReputation = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockReputation'
    );
    const rep = await MockReputation.deploy();

    const MockEnergyOracle = await ethers.getContractFactory(
      'contracts/v2/mocks/RewardEngineMBMocks.sol:MockEnergyOracle'
    );
    const oracle = await MockEnergyOracle.deploy();

    const RewardEngine = await ethers.getContractFactory(
      'contracts/v2/RewardEngineMB.sol:RewardEngineMB'
    );
    const engine = await RewardEngine.deploy(
      thermostat,
      feePool,
      rep,
      oracle,
      owner.address
    );

    await engine.setSettler(owner.address, true);

    const ownerSlot = '0x' + (5).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      ownerSlot,
      ethers.zeroPadValue(await engine.getAddress(), 32),
    ]);

    const att = {
      jobId: 1,
      user: owner.address,
      energy: ethers.parseUnits('1', 18),
      degeneracy: 1,
      epochId: 1,
      role: 0,
      nonce: 1,
      deadline: 0,
      uPre: ethers.parseUnits('1', 18),
      uPost: 0,
      value: 0,
    };

    const data = {
      agents: [{ att, sig: '0x' }],
      validators: [],
      operators: [],
      employers: [],
      paidCosts: ethers.parseUnits('1', 18),
    };

    await expect(engine.settleEpoch(1, data)).to.be.revertedWithCustomError(
      engine,
      'TreasuryNotSet'
    );
  });
});
