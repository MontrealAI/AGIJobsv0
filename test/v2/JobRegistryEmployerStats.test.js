const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');

describe('JobRegistry employer stats', function () {
  let registry;
  let stakeManager;
  let owner, employer;

  beforeEach(async function () {
    [owner, employer] = await ethers.getSigners();
    const { address: AGIALPHA } = require('../../config/agialpha.json');
    const artifact = await artifacts.readArtifact('contracts/test/MockERC20.sol:MockERC20');
    await network.provider.send('hardhat_setCode', [AGIALPHA, artifact.deployedBytecode]);
    const StakeManager = await ethers.getContractFactory('contracts/v2/StakeManager.sol:StakeManager');
    stakeManager = await StakeManager.deploy(0, 100, 0, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, owner.address);
    const Registry = await ethers.getContractFactory('contracts/v2/JobRegistry.sol:JobRegistry');
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
    await stakeManager.connect(owner).setJobRegistry(await registry.getAddress());
  });

  it('tracks total jobs created by employer', async function () {
    const specHash = ethers.keccak256(ethers.toUtf8Bytes('spec'));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await registry.connect(employer).createJob(0, deadline, specHash, 'ipfs://job');
    const stats = await registry.getEmployerStats(employer.address);
    expect(stats.total).to.equal(1n);
    expect(stats.success).to.equal(0n);
    expect(stats.disputed).to.equal(0n);
  });
});
