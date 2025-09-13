const { expect } = require('chai');
const { ethers, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('StakeManager auto stake tuning', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let stakeManager, owner, dispute;

  beforeEach(async () => {
    [owner, dispute] = await ethers.getSigners();
    const mock = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await ethers.provider.send('hardhat_setCode', [
      AGIALPHA,
      mock.deployedBytecode,
    ]);
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
      .configureAutoStake(2, 50, 50, 1000, 10, 0);

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
      .configureAutoStake(1, 50, 50, 1000, 10, 0);

    await time.increase(1000);

    await expect(stakeManager.checkpointStake())
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(50n);
    expect(await stakeManager.minStake()).to.equal(50n);
  });

  it('respects floor and ceiling bounds', async () => {
    await stakeManager
      .connect(owner)
      .configureAutoStake(2, 50, 50, 1000, 80, 120);

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
});

