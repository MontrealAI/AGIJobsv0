const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('StakeManager pause', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, user, token, stakeManager;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockReg = await MockRegistry.deploy();
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      ethers.ZeroAddress,
      await mockReg.getAddress(),
      owner.address,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);
    await token.mint(user.address, ethers.parseEther('1000'));
    await token
      .connect(user)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));
  });

  it('restricts pause and unpause to governance or pauser', async () => {
    await expect(
      stakeManager.connect(user).pause()
    ).to.be.revertedWithCustomError(stakeManager, 'Unauthorized');

    await expect(
      stakeManager.connect(user).unpause()
    ).to.be.revertedWithCustomError(stakeManager, 'Unauthorized');
  });

  it('pauses deposits and withdrawals', async () => {
    await stakeManager.connect(owner).pause();
    await expect(
      stakeManager.connect(user).depositStake(0, ethers.parseEther('100'))
    ).to.be.revertedWithCustomError(stakeManager, 'EnforcedPause');

    await stakeManager.connect(owner).unpause();
    await stakeManager.connect(user).depositStake(0, ethers.parseEther('100'));

    await stakeManager.connect(owner).pause();
    await expect(
      stakeManager.connect(user).withdrawStake(0, ethers.parseEther('100'))
    ).to.be.revertedWithCustomError(stakeManager, 'EnforcedPause');

    await stakeManager.connect(owner).unpause();
    await stakeManager.connect(user).withdrawStake(0, ethers.parseEther('100'));
  });

  it('pauses dispute recording and checkpointing', async () => {
    await stakeManager.connect(owner).autoTuneStakes(true);
    await stakeManager.connect(owner).pause();
    await expect(
      stakeManager.connect(owner).recordDispute()
    ).to.be.revertedWithCustomError(stakeManager, 'EnforcedPause');
    await expect(
      stakeManager.connect(owner).checkpointStake()
    ).to.be.revertedWithCustomError(stakeManager, 'EnforcedPause');
  });
});
