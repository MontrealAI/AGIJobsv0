const { expect } = require('chai');
const { ethers } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('StakeManager auto stake tuning', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let stakeManager, owner, dispute, thermostat, hamMonitor;

  beforeEach(async () => {
    [owner, dispute] = await ethers.getSigners();
    const mock = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await ethers.provider.send('hardhat_setCode', [
      AGIALPHA,
      mock.deployedBytecode,
    ]);
    const Thermostat = await ethers.getContractFactory(
      'contracts/v2/Thermostat.sol:Thermostat'
    );
    thermostat = await Thermostat.deploy(100, 1, 200, owner.address);
    const HamMonitor = await ethers.getContractFactory(
      'contracts/v2/HamiltonianMonitor.sol:HamiltonianMonitor'
    );
    hamMonitor = await HamMonitor.deploy(5, owner.address);
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      100,
      50,
      50,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      dispute.address,
      owner.address
    );
    await stakeManager.connect(owner).autoTuneStakes(true);
  });

  it('increases min stake when disputes exceed threshold', async () => {
    await stakeManager
      .connect(owner)
      .configureAutoStake(2, 50, 50, 1000, 10, 0, 0, 0, 1, 0, 0);

    await stakeManager.connect(dispute).recordDispute();
    await stakeManager.connect(dispute).recordDispute();
    await stakeManager.connect(dispute).recordDispute();

    await time.increase(1000);

    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(150n);
    expect(await stakeManager.minStake()).to.equal(150n);
  });

  it('decreases min stake when no disputes occur', async () => {
    await stakeManager
      .connect(owner)
      .configureAutoStake(1, 50, 50, 1000, 10, 0, 0, 0, 1, 0, 0);

    await time.increase(1000);

    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(50n);
    expect(await stakeManager.minStake()).to.equal(50n);
  });

  it('respects floor and ceiling bounds', async () => {
    await stakeManager
      .connect(owner)
      .configureAutoStake(2, 50, 50, 1000, 80, 120, 0, 0, 1, 0, 0);

    await stakeManager.connect(dispute).recordDispute();
    await stakeManager.connect(dispute).recordDispute();
    await stakeManager.connect(dispute).recordDispute();

    await time.increase(1000);

    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(120n);
    expect(await stakeManager.minStake()).to.equal(120n);

    await time.increase(1000);

    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(80n);
    expect(await stakeManager.minStake()).to.equal(80n);
  });

  it('increases min stake when temperature exceeds threshold', async () => {
    await stakeManager
      .connect(owner)
      .setThermostat(await thermostat.getAddress());
    await stakeManager
      .connect(owner)
      .configureAutoStake(0, 50, 50, 1000, 10, 0, 150, 0, 1, 1, 0);
    await thermostat.connect(owner).setSystemTemperature(200);
    await time.increase(1000);
    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(150n);
    expect(await stakeManager.minStake()).to.equal(150n);
  });

  it('increases min stake when Hamiltonian exceeds threshold', async () => {
    await stakeManager
      .connect(owner)
      .setHamiltonianFeed(await hamMonitor.getAddress());
    await stakeManager
      .connect(owner)
      .configureAutoStake(0, 50, 50, 1000, 10, 0, 0, 1, 1, 0, 1);
    await hamMonitor.connect(owner).record(5, 2);
    await time.increase(1000);
    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(150n);
    expect(await stakeManager.minStake()).to.equal(150n);
  });
});
