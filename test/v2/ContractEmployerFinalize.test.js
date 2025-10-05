const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { AGIALPHA } = require('../../scripts/constants');

describe('Job finalization with contract employer', function () {
  let token, stakeManager, registry, employerContract;
  let owner, agent, treasury, identity;
  const reward = 100n;
  const stake = 200n;
  const feePct = 5n; // default fee percentage

  beforeEach(async () => {
    await network.provider.send('hardhat_reset');
    [owner, , agent, treasury] = await ethers.getSigners();

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

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);

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
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await registry.connect(owner).setJobParameters(0, 0);

    const Employer = await ethers.getContractFactory(
      'contracts/test/EmployerContract.sol:EmployerContract'
    );
    employerContract = await Employer.deploy();

    const fee = (reward * feePct) / 100n;
    await token.mint(await employerContract.getAddress(), reward + fee);
    await token.mint(agent.address, stake);

    await employerContract.approveToken(
      await token.getAddress(),
      await stakeManager.getAddress(),
      reward + fee
    );
    await token.connect(agent).approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(agent).depositStake(0, stake);
  });

  async function setJobState(jobId, success) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const base = BigInt(
      ethers.keccak256(
        coder.encode(['uint256', 'uint256'], [BigInt(jobId), 4n])
      )
    );
    const slot = base + 7n;
    const prev = BigInt(
      await ethers.provider.getStorage(await registry.getAddress(), slot)
    );
    const stateMask = 0x7n;
    const successMask = 0x1n << 3n;
    const cleared = prev & ~(stateMask | successMask);
    const value = cleared | (4n << 0n) | (BigInt(success ? 1 : 0) << 3n);
    await ethers.provider.send('hardhat_setStorageAt', [
      await registry.getAddress(),
      ethers.toBeHex(slot),
      ethers.toBeHex(value, 32),
    ]);
  }

  it('allows a contract employer to finalize job', async () => {
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await employerContract.createJob(
      await registry.getAddress(),
      reward,
      deadline,
      specHash,
      'uri'
    );
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);

    await setJobState(jobId, true);
    const burnTxHash = ethers.ZeroHash;
    const fee = (reward * feePct) / 100n;
    await employerContract.submitBurnReceipt(
      await registry.getAddress(),
      jobId,
      burnTxHash,
      fee,
      0
    );
    await employerContract.confirmBurn(
      await registry.getAddress(),
      jobId,
      burnTxHash
    );
    await employerContract.finalizeJob(await registry.getAddress(), jobId);

    expect(await token.balanceOf(agent.address)).to.equal(reward);
  });

  it('allows governance to finalize job for contract employer', async () => {
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await employerContract.createJob(
      await registry.getAddress(),
      reward,
      deadline,
      specHash,
      'uri'
    );
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);

    await setJobState(jobId, true);
    await registry.connect(owner).finalize(jobId);

    expect(await token.balanceOf(agent.address)).to.equal(reward);
  });
});
