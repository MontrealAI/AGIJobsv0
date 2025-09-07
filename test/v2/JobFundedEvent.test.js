const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('JobFunded event', function () {
  it('emits when job is created with reward', async () => {
    const [owner, employer] = await ethers.getSigners();
    const StakeMock = await ethers.getContractFactory('contracts/legacy/MockV2.sol:MockStakeManager');
    const stakeManager = await StakeMock.deploy();

    const Registry = await ethers.getContractFactory('contracts/v2/JobRegistry.sol:JobRegistry');
    const registry = await Registry.deploy(
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
    await registry.connect(owner).setFeePct(0);

    const reward = 100;
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await expect(
      registry.connect(employer).createJob(reward, deadline, specHash, 'uri')
    )
      .to.emit(registry, 'JobFunded')
      .withArgs(1, employer.address, reward, 0);
  });
});
