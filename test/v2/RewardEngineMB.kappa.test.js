const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('RewardEngineMB setKappa', function () {
  it('accepts valid kappa and rejects zero/overflow', async function () {
    const [admin] = await ethers.getSigners();
    const Reward = await ethers.getContractFactory(
      'contracts/v2/RewardEngineMB.sol:RewardEngineMB'
    );
    const reward = await Reward.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      admin.address
    );
    await reward.waitForDeployment();

    await expect(reward.setKappa(0)).to.be.revertedWith('kappa');
    const max = await reward.MAX_KAPPA();
    await expect(reward.setKappa(max + 1n)).to.be.revertedWith(
      'kappa overflow'
    );

    await reward.setKappa(2n);
    expect(await reward.kappa()).to.equal(2n);
  });
});
