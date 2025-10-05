const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');
const { readArtifact } = require('../utils/artifacts');

describe('Timelock access control', function () {
  it('reverts direct calls and executes after timelock delay', async function () {
    const [admin] = await ethers.getSigners();
    const delay = 7 * 24 * 60 * 60; // 7 days

    const Timelock = await ethers.getContractFactory(
      '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController'
    );
    const timelock = await Timelock.deploy(delay, [], [], admin.address);
    await timelock.waitForDeployment();
    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    await timelock.grantRole(proposerRole, admin.address);
    await timelock.grantRole(executorRole, admin.address);

    // mock staking token at AGIALPHA address
    const mock = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      mock.deployedBytecode,
    ]);

    const Reward = await ethers.getContractFactory(
      'contracts/v2/RewardEngineMB.sol:RewardEngineMB'
    );
    const reward = await Reward.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await timelock.getAddress()
    );
    await reward.waitForDeployment();

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    const stake = await Stake.deploy(
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await timelock.getAddress()
    );
    await stake.waitForDeployment();

    const Thermo = await ethers.getContractFactory(
      'contracts/v2/Thermostat.sol:Thermostat'
    );
    const thermo = await Thermo.deploy(
      100,
      1,
      1000,
      await timelock.getAddress()
    );
    await thermo.waitForDeployment();

    // direct calls revert
    await expect(reward.setKappa(2)).to.be.revertedWithCustomError(
      reward,
      'NotGovernance'
    );
    await expect(stake.setFeePct(1)).to.be.revertedWithCustomError(
      stake,
      'NotGovernance'
    );
    await expect(thermo.setPID(1, 2, 3)).to.be.revertedWithCustomError(
      thermo,
      'NotGovernance'
    );

    // queue operations
    const rewardData = reward.interface.encodeFunctionData('setKappa', [2]);
    const stakeData = stake.interface.encodeFunctionData('setFeePct', [1]);
    const thermoData = thermo.interface.encodeFunctionData('setPID', [1, 2, 3]);

    const salt1 = ethers.id('reward');
    const salt2 = ethers.id('stake');
    const salt3 = ethers.id('thermo');

    await timelock.schedule(
      reward.target,
      0,
      rewardData,
      ethers.ZeroHash,
      salt1,
      delay
    );
    await timelock.schedule(
      stake.target,
      0,
      stakeData,
      ethers.ZeroHash,
      salt2,
      delay
    );
    await timelock.schedule(
      thermo.target,
      0,
      thermoData,
      ethers.ZeroHash,
      salt3,
      delay
    );

    // cannot execute before delay
    await expect(
      timelock.execute(reward.target, 0, rewardData, ethers.ZeroHash, salt1)
    ).to.be.reverted;
    await expect(
      timelock.execute(stake.target, 0, stakeData, ethers.ZeroHash, salt2)
    ).to.be.reverted;
    await expect(
      timelock.execute(thermo.target, 0, thermoData, ethers.ZeroHash, salt3)
    ).to.be.reverted;

    await network.provider.send('evm_increaseTime', [delay]);
    await network.provider.send('evm_mine');

    await timelock.execute(
      reward.target,
      0,
      rewardData,
      ethers.ZeroHash,
      salt1
    );
    await timelock.execute(stake.target, 0, stakeData, ethers.ZeroHash, salt2);
    await timelock.execute(
      thermo.target,
      0,
      thermoData,
      ethers.ZeroHash,
      salt3
    );

    expect(await reward.kappa()).to.equal(2);
    expect(await stake.feePct()).to.equal(1);
    expect(await thermo.kp()).to.equal(1n);
    expect(await thermo.ki()).to.equal(2n);
    expect(await thermo.kd()).to.equal(3n);
  });
});
