const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA } = require('../../scripts/constants');

describe('Timelock ownership', function () {
  it('only timelock can call privileged setters after transfer', async function () {
    const [owner, proposer] = await ethers.getSigners();
    const Deployer = await ethers.getContractFactory(
      'contracts/v2/Deployer.sol:Deployer'
    );
    const deployer = await Deployer.deploy();
    const econ = {
      token: ethers.ZeroAddress,
      feePct: 0,
      burnPct: 0,
      employerSlashPct: 0,
      treasurySlashPct: 0,
      validatorSlashRewardPct: 0,
      commitWindow: 0,
      revealWindow: 0,
      minStake: 0,
      jobStake: 0,
    };
    const ids = {
      ens: ethers.ZeroAddress,
      nameWrapper: ethers.ZeroAddress,
      clubRootNode: ethers.ZeroHash,
      agentRootNode: ethers.ZeroHash,
      validatorMerkleRoot: ethers.ZeroHash,
      agentMerkleRoot: ethers.ZeroHash,
    };
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const tx = await deployer.deploy(econ, ids, owner.address);
    const receipt = await tx.wait();
    const deployerAddress = await deployer.getAddress();
    const log = receipt.logs.find((l) => l.address === deployerAddress);
    const decoded = deployer.interface.decodeEventLog(
      'Deployed',
      log.data,
      log.topics
    );
    const [stakeAddr, registryAddr, , , , , , , , , , , systemPauseAddr] =
      decoded;

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const stake = StakeManager.attach(stakeAddr);
    const registry = JobRegistry.attach(registryAddr);

    const Timelock = await ethers.getContractFactory(
      'contracts/legacy/TimelockMock.sol:TimelockMock'
    );
    const timelock = await Timelock.deploy(proposer.address);

    await network.provider.send('hardhat_setBalance', [
      systemPauseAddr,
      '0x56BC75E2D63100000',
    ]);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [systemPauseAddr],
    });
    const systemPauseSigner = await ethers.getSigner(systemPauseAddr);

    await stake
      .connect(systemPauseSigner)
      .setGovernance(await timelock.getAddress());
    await registry
      .connect(systemPauseSigner)
      .setGovernance(await timelock.getAddress());

    await expect(stake.setFeePct(1)).to.be.revertedWithCustomError(
      stake,
      'NotGovernance'
    );
    await expect(registry.setFeePct(1)).to.be.revertedWithCustomError(
      registry,
      'NotGovernance'
    );

    const stakeData = stake.interface.encodeFunctionData('setFeePct', [1]);
    const registryData = registry.interface.encodeFunctionData('setFeePct', [
      1,
    ]);

    await timelock.connect(proposer).execute(stake.target, stakeData);
    expect(await stake.feePct()).to.equal(1);

    await timelock.connect(proposer).execute(registry.target, registryData);
    expect(await registry.feePct()).to.equal(1);

    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [systemPauseAddr],
    });
  });
});
