const { expect } = require('chai');
const { ethers } = require('hardhat');

const TOKEN = 10n ** 18n; // 1 token with 18 decimals

describe('Governance reward lifecycle', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner,
    voter1,
    voter2,
    voter3,
    token,
    stakeManager,
    feePool,
    reward,
    treasury;

  beforeEach(async () => {
    [owner, voter1, voter2, voter3, treasury] = await ethers.getSigners();

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
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );

    await stakeManager
      .connect(owner)
      .setTreasuryAllowlist(treasury.address, true);
    await stakeManager.connect(owner).setMinStake(1);

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
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
    await taxPolicy.connect(voter1).acknowledge();
    await taxPolicy.connect(voter2).acknowledge();
    await taxPolicy.connect(voter3).acknowledge();

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await feePool.setBurnPct(0);
    await feePool.setGovernance(owner.address);

    const Reward = await ethers.getContractFactory(
      'contracts/v2/GovernanceReward.sol:GovernanceReward'
    );
    reward = await Reward.deploy(
      await feePool.getAddress(),
      await stakeManager.getAddress(),
      2,
      1,
      50
    );
    await feePool.setTreasuryAllowlist(await reward.getAddress(), true);
    await feePool.setTreasury(await reward.getAddress());

    // stake setup
    await token.mint(voter1.address, 100n * TOKEN);
    await token.mint(voter2.address, 100n * TOKEN);
    await token.mint(voter3.address, 100n * TOKEN);

    await token
      .connect(voter1)
      .approve(await stakeManager.getAddress(), 100n * TOKEN);
    await token
      .connect(voter2)
      .approve(await stakeManager.getAddress(), 100n * TOKEN);
    await token
      .connect(voter3)
      .approve(await stakeManager.getAddress(), 100n * TOKEN);
    await stakeManager.connect(voter1).depositStake(2, 100n * TOKEN);
    await stakeManager.connect(voter2).depositStake(2, 100n * TOKEN);
    await stakeManager.connect(voter3).depositStake(2, 100n * TOKEN);

    // fund pool with 200 tokens
    await token.mint(await feePool.getAddress(), 200n * TOKEN);
  });

  it('distributes rewards across epochs and allows claims', async () => {
    // epoch 0 with two voters
    await reward.recordVoters([voter1.address, voter2.address]);
    await ethers.provider.send('evm_increaseTime', [1]);
    await ethers.provider.send('evm_mine', []);
    await feePool
      .connect(owner)
      .governanceWithdraw(await reward.getAddress(), 100n * TOKEN);
    await reward.finalizeEpoch(100n * TOKEN);

    await reward.connect(voter1).claim(0);
    await reward.connect(voter2).claim(0);

    expect(await token.balanceOf(voter1.address)).to.equal(50n * TOKEN);
    expect(await token.balanceOf(voter2.address)).to.equal(50n * TOKEN);
    await expect(reward.connect(voter1).claim(0)).to.be.revertedWith('claimed');
    await expect(reward.connect(voter3).claim(0)).to.be.revertedWith(
      'not voter'
    );

    // fund pool with remaining 100 tokens for next epoch already there
    await reward.recordVoters([voter3.address]);
    await ethers.provider.send('evm_increaseTime', [1]);
    await ethers.provider.send('evm_mine', []);
    await feePool
      .connect(owner)
      .governanceWithdraw(await reward.getAddress(), 50n * TOKEN);
    await reward.finalizeEpoch(50n * TOKEN);

    await reward.connect(voter3).claim(1);
    expect(await token.balanceOf(voter3.address)).to.equal(50n * TOKEN);
  });
});
