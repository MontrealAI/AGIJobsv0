const { expect } = require('chai');
const { ethers } = require('hardhat');
describe('QuadraticVoting', function () {
  let token, qv, owner, voter, executor;

  beforeEach(async () => {
    [owner, voter, executor] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    token = await MockToken.deploy();
    await token.mint(voter.address, 1000);
    const QuadraticVoting = await ethers.getContractFactory(
      'contracts/v2/QuadraticVoting.sol:QuadraticVoting'
    );
    qv = await QuadraticVoting.deploy(
      await token.getAddress(),
      executor.address
    );
    await qv.connect(owner).setTreasury(owner.address);
    await qv.connect(owner).setRefundPct(50);
    await token.connect(voter).approve(await qv.getAddress(), 1000);
  });

  it('charges quadratic cost, locks deposit and sends fee', async () => {
    const treasuryBefore = await token.balanceOf(owner.address);
    await qv.connect(voter).castVote(1, 3); // cost 9 => deposit 4, fee 5
    expect(await token.balanceOf(voter.address)).to.equal(991n);
    expect(await token.balanceOf(await qv.getAddress())).to.equal(4n);
    expect(await qv.locked(1, voter.address)).to.equal(4n);
    expect(await qv.votes(1, voter.address)).to.equal(3n);
    expect(await token.balanceOf(owner.address)).to.equal(treasuryBefore + 5n);
  });

  it('refunds only the deposit after execution', async () => {
    const treasuryBefore = await token.balanceOf(owner.address);
    await qv.connect(voter).castVote(1, 4); // cost 16 => deposit 8, fee 8
    await qv.connect(executor).execute(1);
    await qv.connect(voter).claimRefund(1);
    expect(await token.balanceOf(voter.address)).to.equal(992n);
    expect(await token.balanceOf(await qv.getAddress())).to.equal(0n);
    expect(await token.balanceOf(owner.address)).to.equal(treasuryBefore + 8n);
  });

  it('records voters in governance reward', async () => {
    const Mock = await ethers.getContractFactory(
      'contracts/test/GovernanceRewardMock.sol:GovernanceRewardMock'
    );
    const reward = await Mock.deploy();
    await qv.connect(owner).setGovernanceReward(await reward.getAddress());
    await qv.connect(voter).castVote(1, 2);
    await expect(qv.connect(executor).execute(1)).to.emit(reward, 'Recorded');
    const recorded = await reward.getLastVoters();
    expect(recorded[0]).to.equal(voter.address);
  });
});
