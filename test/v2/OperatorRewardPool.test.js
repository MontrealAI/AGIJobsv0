const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('Operator reward pool', function () {
  let owner, employer, agent, stakeManager, jobRegistry, registrySigner, token;
  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const { AGIALPHA } = require('../../scripts/constants');
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

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    jobRegistry = await JobRegistry.deploy(
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
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(agent).acknowledge();

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await token.mint(employer.address, ethers.parseEther('1000'));
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));

    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(agent.address);
  });

  it('pays bonus from pool and adds leftover escrow to pool', async () => {
    await token.mint(owner.address, ethers.parseEther('50'));
    await token
      .connect(owner)
      .approve(await stakeManager.getAddress(), ethers.parseEther('50'));
    await stakeManager
      .connect(owner)
      .fundOperatorRewardPool(ethers.parseEther('50'));

    const jobId = ethers.encodeBytes32String('bonus');
    const reward = ethers.parseEther('100');
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, reward + ethers.parseEther('20'));

    const before = await token.balanceOf(agent.address);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        employer.address,
        agent.address,
        reward,
        0,
        0,
        ethers.ZeroAddress,
        false
      );

    expect(await token.balanceOf(agent.address)).to.equal(
      before + ethers.parseEther('150')
    );
    expect(await stakeManager.operatorRewardPool()).to.equal(
      ethers.parseEther('20')
    );
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('reverts when pool lacks funds for bonus', async () => {
    const jobId = ethers.encodeBytes32String('insufficient');
    const reward = ethers.parseEther('100');
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, reward);

    await expect(
      stakeManager
        .connect(registrySigner)
        .finalizeJobFunds(
          jobId,
          employer.address,
          agent.address,
          reward,
          0,
          0,
          ethers.ZeroAddress,
          false
        )
    ).to.be.revertedWithCustomError(stakeManager, 'InsufficientRewardPool');

    expect(await stakeManager.operatorRewardPool()).to.equal(0n);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(reward);
  });
});
