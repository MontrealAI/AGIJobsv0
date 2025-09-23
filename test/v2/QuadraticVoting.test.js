const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('QuadraticVoting', function () {
  let token, qv, owner, voter1, voter2, executor, qvAddress;

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
    qvAddress = await qv.getAddress();
    await qv.connect(owner).setTreasury(owner.address);
    await token.connect(voter1).approve(qvAddress, 1000);
    await token.connect(voter2).approve(qvAddress, 1000);
  });

  it('charges quadratic cost and holds funds', async () => {
    const block = await ethers.provider.getBlock('latest');
    const contractBefore = await token.balanceOf(qvAddress);
    const ownerBefore = await token.balanceOf(owner.address);
    await qv.connect(voter1).castVote(1, 3, block.timestamp + 100); // cost 9
    expect(await token.balanceOf(voter1.address)).to.equal(991n);
    expect(await token.balanceOf(qvAddress)).to.equal(contractBefore + 9n);
    expect(await token.balanceOf(owner.address)).to.equal(ownerBefore);
    expect(await qv.votes(1, voter1.address)).to.equal(3n);
    expect(await qv.costs(1, voter1.address)).to.equal(9n);
  });

  it('distributes rewards proportional to sqrt(cost) without treasury approvals', async () => {
    const block = await ethers.provider.getBlock('latest');
    await qv.connect(voter1).castVote(1, 4, block.timestamp + 100); // cost 16, sqrt 4
    await qv.connect(voter2).castVote(1, 1, block.timestamp + 100); // cost 1, sqrt 1
    await qv.connect(executor).execute(1);

    await expect(qv.connect(voter1).claimReward(1))
      .to.emit(qv, 'RewardClaimed')
      .withArgs(1, voter1.address, 13n);
    await expect(qv.connect(voter2).claimReward(1))
      .to.emit(qv, 'RewardClaimed')
      .withArgs(1, voter2.address, 3n);

    expect(await token.balanceOf(voter1.address)).to.equal(997n);
    expect(await token.balanceOf(voter2.address)).to.equal(1002n);
    expect(await token.balanceOf(qvAddress)).to.equal(1n);
  });

  it('allows the owner to sweep residual rewards to the treasury', async () => {
    const block = await ethers.provider.getBlock('latest');
    await qv.connect(voter1).castVote(1, 4, block.timestamp + 100); // cost 16
    await qv.connect(voter2).castVote(1, 1, block.timestamp + 100); // cost 1
    await qv.connect(executor).execute(1);
    await qv.connect(voter1).claimReward(1);
    await qv.connect(voter2).claimReward(1);

    const ownerBefore = await token.balanceOf(owner.address);
    await qv.connect(owner).sweepTreasury();

    expect(await token.balanceOf(owner.address)).to.equal(ownerBefore + 1n);
    expect(await token.balanceOf(qvAddress)).to.equal(0n);
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
