const { expect } = require('chai');
const { ethers } = require('hardhat');

const TOKEN = 10n ** 18n; // 1 token with 18 decimals

describe('GovernanceReward', function () {
  const { AGIALPHA } = require('../../scripts/constants');
  let owner, voter1, voter2, token, stakeManager, feePool, reward, treasury;

  beforeEach(async () => {
    [owner, voter1, voter2, treasury] = await ethers.getSigners();

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

    await token.mint(voter1.address, 100n * TOKEN);
    await token.mint(voter2.address, 300n * TOKEN);

    await token
      .connect(voter1)
      .approve(await stakeManager.getAddress(), 100n * TOKEN);
    await token
      .connect(voter2)
      .approve(await stakeManager.getAddress(), 300n * TOKEN);
    await stakeManager.connect(voter1).depositStake(2, 100n * TOKEN);
    await stakeManager.connect(voter2).depositStake(2, 300n * TOKEN);

    // fund fee pool
    await token.mint(await feePool.getAddress(), 100n * TOKEN);
  });

  it('rewards voters proportional to staked balance', async () => {
    await reward.recordVoters([voter1.address, voter2.address]);

    await ethers.provider.send('evm_increaseTime', [1]);
    await ethers.provider.send('evm_mine', []);

    await feePool
      .connect(owner)
      .governanceWithdraw(await reward.getAddress(), 50n * TOKEN);

    await expect(reward.finalizeEpoch(50n * TOKEN))
      .to.emit(reward, 'EpochFinalized')
      .withArgs(0, 50n * TOKEN);

    await expect(reward.connect(voter1).claim(0))
      .to.emit(reward, 'RewardClaimed')
      .withArgs(0, voter1.address, 12500000000000000000n);
    await expect(reward.connect(voter2).claim(0))
      .to.emit(reward, 'RewardClaimed')
      .withArgs(0, voter2.address, 37500000000000000000n);

    expect(await token.balanceOf(voter1.address)).to.equal(
      12500000000000000000n
    );
    expect(await token.balanceOf(voter2.address)).to.equal(
      37500000000000000000n
    );

    await expect(reward.connect(voter1).claim(0)).to.be.revertedWith('claimed');
  });
});
