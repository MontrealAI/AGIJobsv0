const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('StakeManager release', function () {
  let token,
    stakeManager,
    jobRegistry,
    feePool,
    owner,
    user1,
    user2,
    treasury,
    registrySigner;

  beforeEach(async () => {
    [owner, user1, user2, treasury] = await ethers.getSigners();
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
    await taxPolicy.connect(user1).acknowledge();
    await taxPolicy.connect(user2).acknowledge();

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await feePool.connect(owner).setBurnPct(0);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await token.mint(user1.address, ethers.parseEther('1000'));
    await token.mint(user2.address, ethers.parseEther('1000'));
    await token
      .connect(user1)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));
    await token
      .connect(user2)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));
    await stakeManager.connect(user1).depositStake(2, ethers.parseEther('100'));
    await stakeManager.connect(user2).depositStake(2, ethers.parseEther('300'));

    await stakeManager.connect(owner).setFeePool(await feePool.getAddress());
    await stakeManager.connect(owner).setFeePct(20);
    await stakeManager.connect(owner).setBurnPct(10);

    await token.mint(await stakeManager.getAddress(), ethers.parseEther('100'));
  });

  it('diverts fee and burn on release', async () => {
    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    const supplyBefore = await token.totalSupply();

    await expect(
      stakeManager
        .connect(registrySigner)
        .release(
          user2.address,
          user1.address,
          ethers.parseEther('100'),
          true
        )
    )
      .to.emit(stakeManager, 'StakeReleased')
      .withArgs(
        ethers.ZeroHash,
        await feePool.getAddress(),
        ethers.parseEther('20')
      )
      .and.to.emit(stakeManager, 'RewardPaid')
      .withArgs(ethers.ZeroHash, user1.address, ethers.parseEther('70'))
      .and.to.emit(stakeManager, 'TokensBurned')
      .withArgs(ethers.ZeroHash, ethers.parseEther('10'));

    expect((await token.balanceOf(user1.address)) - before1).to.equal(
      ethers.parseEther('70')
    );
    expect((await token.balanceOf(user2.address)) - before2).to.equal(0n);
    const supplyAfter = await token.totalSupply();
    expect(supplyAfter).to.equal(supplyBefore - ethers.parseEther('10'));
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(
      ethers.parseEther('20')
    );

    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();

    expect(
      (await token.balanceOf(user1.address)) -
        (before1 + ethers.parseEther('70'))
    ).to.equal(ethers.parseEther('5'));
    expect((await token.balanceOf(user2.address)) - before2).to.equal(
      ethers.parseEther('15')
    );
  });

  it('splits job fund release with fee and burn', async () => {
    const jobId = ethers.encodeBytes32String('jobA');
    const before1 = await token.balanceOf(user1.address);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, user2.address, ethers.parseEther('100'));
    const before2 = await token.balanceOf(user2.address);
    const supplyBefore = await token.totalSupply();

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(
          jobId,
          user2.address,
          user1.address,
          ethers.parseEther('100'),
          true
        )
    )
      .to.emit(stakeManager, 'StakeReleased')
      .withArgs(jobId, await feePool.getAddress(), ethers.parseEther('20'))
      .and.to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, user1.address, ethers.parseEther('70'))
      .and.to.emit(stakeManager, 'TokensBurned')
      .withArgs(jobId, ethers.parseEther('10'));

    expect((await token.balanceOf(user1.address)) - before1).to.equal(
      ethers.parseEther('70')
    );
    expect((await token.balanceOf(user2.address)) - before2).to.equal(0n);
    const supplyAfter = await token.totalSupply();
    expect(supplyAfter).to.equal(supplyBefore - ethers.parseEther('10'));
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(
      ethers.parseEther('20')
    );

    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();

    expect(
      (await token.balanceOf(user1.address)) -
        (before1 + ethers.parseEther('70'))
    ).to.equal(ethers.parseEther('5'));
    expect((await token.balanceOf(user2.address)) - before2).to.equal(
      ethers.parseEther('15')
    );
  });

  it('allows refunds to bypass AGI payout boosts', async () => {
    const jobId = ethers.encodeBytes32String('refund');
    const MockNFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await MockNFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(user2.address);

    await stakeManager.connect(owner).setFeePct(0);
    await stakeManager.connect(owner).setBurnPct(0);

    const balanceBeforeLock = await token.balanceOf(user2.address);

    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, user2.address, ethers.parseEther('100'));

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(
          jobId,
          user2.address,
          user2.address,
          ethers.parseEther('100'),
          true
        )
    ).to.be.revertedWithCustomError(stakeManager, 'InsufficientEscrow');

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(
          jobId,
          user2.address,
          user2.address,
          ethers.parseEther('100'),
          false
        )
    )
      .to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, user2.address, ethers.parseEther('100'));

    expect(await token.balanceOf(user2.address)).to.equal(
      balanceBeforeLock
    );
  });

  it('reverts when setting fee pool to zero', async () => {
    await expect(
      stakeManager.connect(owner).setFeePool(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidFeePool');
  });

  it('restricts fee configuration to owner', async () => {
    await expect(
      stakeManager.connect(user1).setFeePct(1)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
    await expect(
      stakeManager.connect(user1).setFeePool(await feePool.getAddress())
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
    await expect(
      stakeManager.connect(user1).setBurnPct(1)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
  });
});
