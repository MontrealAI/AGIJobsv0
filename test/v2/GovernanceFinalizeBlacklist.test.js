const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
describe('JobRegistry governance finalization', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let token, stakeManager, rep, registry, identity;
  let owner, employer, agent, treasury;
  const reward = 100n;
  const stake = 200n;

  beforeEach(async () => {
    await network.provider.send('hardhat_reset');
    [owner, employer, agent, treasury] = await ethers.getSigners();

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
      100,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);
    await stakeManager.connect(owner).setSlashingPercentages(100, 0);

    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    rep = await Rep.deploy(await stakeManager.getAddress());

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      await rep.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    await registry.connect(owner).setTreasury(treasury.address);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await rep
      .connect(owner)
      .setAuthorizedCaller(await registry.getAddress(), true);
    await rep.connect(owner).setThreshold(0);

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());

    await registry.connect(owner).setJobParameters(reward, stake);
    await registry.connect(owner).setMaxJobReward(1000000);
    await registry.connect(owner).setJobDurationLimit(86400);
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).setValidatorRewardPct(0);

    await token.mint(employer.address, reward);
    await token.mint(agent.address, stake);

    await token.connect(agent).approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(agent).depositStake(0, stake);
  });

  afterEach(async () => {
    for (const acct of [employer, agent, treasury]) {
      const bal = await token.balanceOf(acct.address);
      if (bal > 0n) {
        await token.connect(acct).burn(bal);
      }
    }
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

  it('redirects reward and stake when agent blacklisted', async () => {
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);

    await rep.connect(owner).blacklist(agent.address, true);
    await setJobState(jobId, true);

    await expect(
      registry.connect(agent).finalize(jobId)
    ).to.be.revertedWithCustomError(registry, 'OnlyEmployer');

    await expect(registry.connect(owner).finalize(jobId))
      .to.emit(registry, 'GovernanceFinalized')
      .withArgs(jobId, owner.address, true)
      .and.to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);

    expect(await token.balanceOf(treasury.address)).to.equal(reward + stake);
  });

  it('redirects reward when employer blacklisted', async () => {
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);

    await rep.connect(owner).blacklist(employer.address, true);
    await setJobState(jobId, false);

    await expect(
      registry.connect(employer).finalize(jobId)
    ).to.be.revertedWithCustomError(registry, 'Blacklisted');

    await expect(registry.connect(owner).finalize(jobId))
      .to.emit(registry, 'GovernanceFinalized')
      .withArgs(jobId, owner.address, true)
      .and.to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);

    expect(await token.balanceOf(treasury.address)).to.equal(reward + stake);
  });
});
