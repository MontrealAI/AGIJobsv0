const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('QuadraticVoting', function () {
  let token, qv, owner, voter1, voter2, executor;

  beforeEach(async () => {
    [owner, voter1, voter2, executor] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    token = await MockToken.deploy();
    await token.mint(voter1.address, 1000);
    await token.mint(voter2.address, 1000);
    const QuadraticVoting = await ethers.getContractFactory(
      'contracts/v2/QuadraticVoting.sol:QuadraticVoting'
    );
    qv = await QuadraticVoting.deploy(
      await token.getAddress(),
      executor.address
    );
    await qv.connect(owner).setTreasury(owner.address);
    await token.connect(voter1).approve(await qv.getAddress(), 1000);
    await token.connect(voter2).approve(await qv.getAddress(), 1000);
  });

  it('charges quadratic cost and sends to treasury', async () => {
    const block = await ethers.provider.getBlock('latest');
    const treasuryBefore = await token.balanceOf(owner.address);
    await qv.connect(voter1).castVote(1, 3, block.timestamp + 100); // cost 9
    expect(await token.balanceOf(voter1.address)).to.equal(991n);
    expect(await token.balanceOf(owner.address)).to.equal(treasuryBefore + 9n);
    expect(await qv.votes(1, voter1.address)).to.equal(3n);
    expect(await qv.costs(1, voter1.address)).to.equal(9n);
  });

  it('distributes rewards proportional to sqrt(cost)', async () => {
    const block = await ethers.provider.getBlock('latest');
    const treasuryBefore = await token.balanceOf(owner.address);
    await qv.connect(voter1).castVote(1, 4, block.timestamp + 100); // cost 16, sqrt 4
    await qv.connect(voter2).castVote(1, 1, block.timestamp + 100); // cost 1, sqrt 1
    await qv.connect(executor).execute(1);
    await token.connect(owner).approve(await qv.getAddress(), 1000);

    await expect(qv.connect(voter1).claimReward(1))
      .to.emit(qv, 'RewardClaimed')
      .withArgs(1, voter1.address, 13n);
    await expect(qv.connect(voter2).claimReward(1))
      .to.emit(qv, 'RewardClaimed')
      .withArgs(1, voter2.address, 3n);

    expect(await token.balanceOf(owner.address)).to.equal(treasuryBefore + 1n);
    expect(await token.balanceOf(voter1.address)).to.equal(997n);
    expect(await token.balanceOf(voter2.address)).to.equal(1002n);
  });

  it('records voters in governance reward', async () => {
    const Mock = await ethers.getContractFactory(
      'contracts/test/GovernanceRewardMock.sol:GovernanceRewardMock'
    );
    const reward = await Mock.deploy();
    await qv.connect(owner).setGovernanceReward(await reward.getAddress());
    const block = await ethers.provider.getBlock('latest');
    await qv.connect(voter1).castVote(1, 2, block.timestamp + 100);
    await expect(qv.connect(executor).execute(1)).to.emit(reward, 'Recorded');
    const recorded = await reward.getLastVoters();
    expect(recorded[0]).to.equal(voter1.address);
  });

  it('reverts reward claim before execution', async () => {
    const block = await ethers.provider.getBlock('latest');
    await qv.connect(voter1).castVote(1, 2, block.timestamp + 100);
    await expect(qv.connect(voter1).claimReward(1)).to.be.revertedWith(
      'inactive'
    );
  });
});
