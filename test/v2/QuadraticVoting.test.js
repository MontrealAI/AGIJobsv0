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
    await qv.connect(executor).execute(1, []);
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

    const tx = await qv.connect(voter).castVote(1, 2);
    const receipt = await tx.wait();
    const voterList = receipt.logs
      .map((log) => {
        try {
          return qv.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((p) => p && p.name === 'VoteCast')
      .map((p) => p.args.voter);

    await expect(qv.connect(executor).execute(1, voterList)).to.emit(
      reward,
      'Recorded'
    );
    const recorded = await reward.getLastVoters();
    expect(recorded[0]).to.equal(voter.address);
  });

  it('reverts when voter cap exceeded', async () => {
    const max = Number(await qv.MAX_VOTERS());
    for (let i = 0; i < max; i++) {
      const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther('1'),
      });
      await token.mint(wallet.address, 10);
      await token
        .connect(wallet)
        .approve(await qv.getAddress(), 10);
      await qv.connect(wallet).castVote(1, 1);
    }
    const extra = ethers.Wallet.createRandom().connect(ethers.provider);
    await owner.sendTransaction({
      to: extra.address,
      value: ethers.parseEther('1'),
    });
    await token.mint(extra.address, 10);
    await token.connect(extra).approve(await qv.getAddress(), 10);
    await expect(qv.connect(extra).castVote(1, 1)).to.be.revertedWithCustomError(
      qv,
      'VoterCapReached'
    );
  });
});
