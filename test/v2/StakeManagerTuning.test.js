const { expect } = require('chai');
const { ethers, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { AGIALPHA } = require('../../scripts/constants');

describe('StakeManager tuning regression', function () {
  let stakeManager, owner, dispute, thermostat;

  beforeEach(async () => {
    [owner, dispute] = await ethers.getSigners();
    const mock = await artifacts.readArtifact(
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
    await stakeManager.autoTuneStakes(true);
    await stakeManager.setThermostat(await thermostat.getAddress());
  });

  it('responds to high and low entropy periods', async () => {
    await stakeManager
      .connect(owner)
      .configureAutoStake(1, 50, 50, 1000, 50, 0, 150, 0, 1, 0, 0);

    // high temperature -> increase min stake
    await thermostat.connect(owner).setSystemTemperature(200);
    await time.increase(1000);
    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(150n);

    // low temperature with no disputes -> decrease
    await thermostat.connect(owner).setSystemTemperature(100);
    await time.increase(1000);
    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(75n);

    // dispute spike despite low temperature -> increase again
    await time.increase(1000);
    await expect(stakeManager.connect(dispute).recordDispute())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(112n);
  });
});

