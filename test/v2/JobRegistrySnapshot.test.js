const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { enrichJob } = require('../utils/jobMetadata');

describe('JobRegistry payout snapshot', function () {
  let owner, employer, agent, other;

  let token, stakeManager, validation, registry, identity, nft;

  beforeEach(async () => {
    [owner, employer, agent, other] = await ethers.getSigners();

    const { address: AGIALPHA } = require('../../config/agialpha.json');
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
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

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    validation = await Validation.deploy();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      await validation.getAddress(),
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

    await validation.setJobRegistry(await registry.getAddress());
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).setValidatorRewardPct(0);
    await registry.connect(owner).setJobParameters(0, 0);

    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);

    await token.mint(owner.address, ethers.parseEther('1000'));
    await token
      .connect(owner)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));
    await stakeManager
      .connect(owner)
      .fundOperatorRewardPool(ethers.parseEther('1000'));

    await token.mint(employer.address, ethers.parseEther('1000'));
  });

  async function createJob() {
    const reward = ethers.parseEther('100');
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    return { reward, jobId: 1n };
  }

  it('uses snapshot when NFT transferred after assignment', async () => {
    await nft.mint(agent.address);
    const { reward, jobId } = await createJob();
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    let job = enrichJob(await registry.jobs(jobId));
    expect(job.agentPct).to.equal(150n);
    await nft.connect(agent).transferFrom(agent.address, other.address, 0n);

    await registry
      .connect(agent)
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);
    await validation.setResult(true);
    await validation.finalize(jobId);

    await registry.connect(employer).finalize(jobId);

    expect(await token.balanceOf(agent.address)).to.equal(
      (reward * 150n) / 100n
    );
  });

  it('ignores NFTs gained after assignment', async () => {
    const { reward, jobId } = await createJob();
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    let job = enrichJob(await registry.jobs(jobId));
    expect(job.agentPct).to.equal(100n);
    await nft.mint(agent.address);

    await registry
      .connect(agent)
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);
    await validation.setResult(true);
    await validation.finalize(jobId);

    await registry.connect(employer).finalize(jobId);

    expect(await token.balanceOf(agent.address)).to.equal(reward);
  });
});
