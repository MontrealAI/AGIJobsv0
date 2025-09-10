const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('StakeManager burn reduction', function () {
  let token, stakeManager, jobRegistry, feePool, registrySigner;
  let owner, employer, agent;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const { AGIALPHA } = require('../../scripts/constants');
    const artifact = await artifacts.readArtifact(
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

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );

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

    await token.mint(owner.address, ethers.parseEther('100'));
    await token
      .connect(owner)
      .approve(await stakeManager.getAddress(), ethers.parseEther('100'));

    await stakeManager.connect(owner).setFeePool(await feePool.getAddress());
    await stakeManager.connect(owner).setFeePct(20);
    await stakeManager.connect(owner).setBurnPct(10);
  });

  it('caps burn when escrow covers only reward plus fee', async () => {
    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(agent.address);

    const jobId = ethers.encodeBytes32String('burnReduce');
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, ethers.parseEther('120'));

    const beforeAgent = await token.balanceOf(agent.address);
    const afterLockEmployer = await token.balanceOf(employer.address);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(
          jobId,
          employer.address,
          agent.address,
          ethers.parseEther('100')
        )
    )
      .to.emit(stakeManager, 'StakeReleased')
      .withArgs(jobId, await feePool.getAddress(), ethers.parseEther('15'))
      .and.to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, agent.address, ethers.parseEther('105'));

    expect(await token.balanceOf(agent.address)).to.equal(
      beforeAgent + ethers.parseEther('105')
    );
    expect(await token.balanceOf(employer.address)).to.equal(afterLockEmployer);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('reduces burn then fee on finalizeJobFunds', async () => {
    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 130);
    await nft.mint(agent.address);

    const jobId = ethers.encodeBytes32String('finalReduce');
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, ethers.parseEther('110'));

    const beforeAgent = await token.balanceOf(agent.address);
    const afterLockEmployer = await token.balanceOf(employer.address);

    await stakeManager
      .connect(owner)
      .fundOperatorRewardPool(ethers.parseEther('100'));

    await expect(
      stakeManager
        .connect(registrySigner)
        .finalizeJobFunds(
          jobId,
          employer.address,
          agent.address,
          ethers.parseEther('100'),
          0,
          ethers.parseEther('20'),
          await feePool.getAddress(),
          false
        )
    )
      .to.emit(stakeManager, 'StakeReleased')
      .withArgs(jobId, await feePool.getAddress(), ethers.parseEther('10'))
      .and.to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, agent.address, ethers.parseEther('117'));

    expect(await token.balanceOf(agent.address)).to.equal(
      beforeAgent + ethers.parseEther('117')
    );
    expect(await token.balanceOf(employer.address)).to.equal(afterLockEmployer);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });
});
