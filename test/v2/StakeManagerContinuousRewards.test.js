const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');

async function increase(seconds) {
  await ethers.provider.send('evm_increaseTime', [seconds]);
  await ethers.provider.send('evm_mine');
}

describe('StakeManager continuous operator rewards', function () {
  let owner, op1, op2, stakeManager, jobRegistry, token;
  beforeEach(async () => {
    [owner, op1, op2] = await ethers.getSigners();
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
    await taxPolicy.connect(op1).acknowledge();
    await taxPolicy.connect(op2).acknowledge();

    await token.mint(op1.address, ethers.parseEther('1000'));
    await token.mint(op2.address, ethers.parseEther('1000'));
    await token
      .connect(op1)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));
    await token
      .connect(op2)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));

    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(op1.address);

    await stakeManager
      .connect(op1)
      .depositStake(2, ethers.parseEther('100'));
    await stakeManager
      .connect(op2)
      .depositStake(2, ethers.parseEther('100'));

    await token.mint(owner.address, ethers.parseEther('1000'));
    await token
      .connect(owner)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));
    await stakeManager
      .connect(owner)
      .fundOperatorRewardPool(ethers.parseEther('1000'));

    await stakeManager
      .connect(owner)
      .setOperatorRewardRate(ethers.parseEther('1'));
  });

  it('accrues and allows claiming of continuous rewards', async () => {
    await increase(100);
    const initialPool = await stakeManager.operatorRewardPool();
    const b1 = await token.balanceOf(op1.address);
    const tx1 = await stakeManager.connect(op1).claimContinuousRewards();
    const rc1 = await tx1.wait();
    const a1 = await token.balanceOf(op1.address);
    const start = await stakeManager.operatorRewardsStart();
    const t1 = (await ethers.provider.getBlock(rc1.blockNumber)).timestamp;
    const elapsed1 = BigInt(t1) - start;
    const pct1 = await stakeManager.getTotalPayoutPct(op1.address);
    const boosted1 = (await stakeManager.stakes(op1.address, 2n)) * BigInt(pct1) / 100n;
    const totalBoosted = await stakeManager.totalBoostedStake(2n);
    const expected1 = elapsed1 * ethers.parseEther('1') * boosted1 / totalBoosted;
    expect(a1 - b1).to.equal(expected1);
    expect(await stakeManager.accruedOperatorRewards(op1.address)).to.equal(0n);

    await increase(100);
    const b2 = await token.balanceOf(op2.address);
    const tx2 = await stakeManager.connect(op2).claimContinuousRewards();
    const rc2 = await tx2.wait();
    const a2 = await token.balanceOf(op2.address);
    const t2 = (await ethers.provider.getBlock(rc2.blockNumber)).timestamp;
    const elapsed2 = BigInt(t2) - start;
    const pct2 = await stakeManager.getTotalPayoutPct(op2.address);
    const boosted2 = (await stakeManager.stakes(op2.address, 2n)) * BigInt(pct2) / 100n;
    const expected2 = elapsed2 * ethers.parseEther('1') * boosted2 / totalBoosted;
    expect(a2 - b2).to.equal(expected2);
    expect(await stakeManager.accruedOperatorRewards(op2.address)).to.equal(0n);

    const b1b = await token.balanceOf(op1.address);
    const last1 = await stakeManager.lastOperatorClaim(op1.address);
    const tx3 = await stakeManager.connect(op1).claimContinuousRewards();
    const rc3 = await tx3.wait();
    const a1b = await token.balanceOf(op1.address);
    const t3 = (await ethers.provider.getBlock(rc3.blockNumber)).timestamp;
    const elapsed3 = BigInt(t3) - last1;
    const expected3 = elapsed3 * ethers.parseEther('1') * boosted1 / totalBoosted;
    expect(a1b - b1b).to.equal(expected3);
    const r1 = a1 - b1;
    const r2 = a2 - b2;
    const r3 = a1b - b1b;
    expect(await stakeManager.operatorRewardPool()).to.equal(
      initialPool - r1 - r2 - r3
    );
  });
});

