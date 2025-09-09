const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('StakeManager reentrancy', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, employer, agent, validator, treasury;
  let token, stakeManager, jobRegistry;

  beforeEach(async () => {
    [owner, employer, agent, validator, treasury] = await ethers.getSigners();

    const artifact = await artifacts.readArtifact(
      'contracts/legacy/ReentrantERC206.sol:ReentrantERC206'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt('ReentrantERC206', AGIALPHA);
    await token.mint(employer.address, ethers.parseEther('1000'));

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      50,
      50,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/mocks/ReentrantJobRegistry.sol:ReentrantJobRegistry'
    );
    jobRegistry = await JobRegistry.deploy(
      await stakeManager.getAddress(),
      AGIALPHA
    );

    await token.setCaller(await jobRegistry.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
  });

  it('guards finalizeJobFunds against reentrancy', async () => {
    const jobId = ethers.encodeBytes32String('job1');
    const reward = ethers.parseEther('100');
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    await jobRegistry.lockReward(jobId, employer.address, reward);

    await expect(
      jobRegistry.attackFinalize(jobId, agent.address, reward)
    ).to.be.revertedWithCustomError(
      stakeManager,
      'ReentrancyGuardReentrantCall'
    );
  });

  it('guards distributeValidatorRewards against reentrancy', async () => {
    const jobId = ethers.encodeBytes32String('job2');
    const amount = ethers.parseEther('100');

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const validation = await Validation.deploy();
    await validation.setValidators([validator.address]);
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), amount);
    await jobRegistry.lockReward(jobId, employer.address, amount);

    await expect(
      jobRegistry.attackValidator(jobId, amount)
    ).to.be.revertedWithCustomError(
      stakeManager,
      'ReentrancyGuardReentrantCall'
    );
  });
});
