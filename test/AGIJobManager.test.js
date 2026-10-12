const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('AGIJobManager corrective release', function () {
  async function fixture() {
    const [owner, employer, agent] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockBurnableAGI');
    const token = await Token.deploy();
    const Manager = await ethers.getContractFactory('AGIJobManager');
    const manager = await Manager.deploy(token.target, 500, owner.address);
    const Helper = await ethers.getContractFactory('EmployerBurnReadHelper');
    const helper = await Helper.deploy();

    const mintAmt = ethers.parseEther('1000');
    await token.mint(employer.address, mintAmt);
    await token.connect(employer).approve(manager.target, mintAmt);

    return { owner, employer, agent, token, manager, helper };
  }

  it('burns exactly once at createJob and snapshots burn bps', async function () {
    const { employer, manager, token } = await fixture();
    const payout = ethers.parseEther('10');
    const burn = ethers.parseEther('0.5');
    const deadline = BigInt((await ethers.provider.getBlock('latest')).timestamp + 3600);

    await expect(manager.connect(employer).createJob(payout, deadline, 'ipfs://job'))
      .to.emit(manager, 'EmployerBurnChargedAtJobCreation').withArgs(1n, employer.address, burn);

    expect(await token.balanceOf(manager.target)).to.eq(payout);
    expect(await manager.getJobBurnAmountSnapshot(1n)).to.eq(burn);

    await manager.connect(employer).refundEmployer(1n);
    expect(await token.balanceOf(manager.target)).to.eq(0n);
  });

  it('requires allowance for payout + burn and reverts atomically on transfer/burn failure', async function () {
    const { employer, manager, token } = await fixture();
    const payout = ethers.parseEther('10');
    const deadline = BigInt((await ethers.provider.getBlock('latest')).timestamp + 3600);

    await token.connect(employer).approve(manager.target, payout); // insufficient for burn
    await expect(manager.connect(employer).createJob(payout, deadline, 'ipfs://job')).to.be.reverted;

    await token.connect(employer).approve(manager.target, ethers.parseEther('1000'));
    await token.setFailTransferFrom(true);
    await expect(manager.connect(employer).createJob(payout, deadline, 'ipfs://job')).to.be.revertedWith('PAYOUT_TRANSFER_FAILED');
    expect(await manager.nextJobId()).to.eq(0n);

    await token.setFailTransferFrom(false);
    await token.setFailBurnFrom(true);
    await expect(manager.connect(employer).createJob(payout, deadline, 'ipfs://job')).to.be.revertedWith('BURN_FAILED');
    expect(await manager.nextJobId()).to.eq(0n);
  });

  it('does not burn in completion, cancellation, delisting, expiry, or dispute paths', async function () {
    const { owner, employer, manager, token, agent } = await fixture();
    const payout = ethers.parseEther('10');
    const deadline = BigInt((await ethers.provider.getBlock('latest')).timestamp + 20);

    await manager.connect(employer).createJob(payout, deadline, 'ipfs://a');
    const employerBalAfterCreate = await token.balanceOf(employer.address);
    await manager.connect(employer).completeJob(1n, agent.address);
    expect(await token.balanceOf(manager.target)).to.eq(0n);

    await manager.connect(employer).createJob(payout, deadline + 1000n, 'ipfs://b');
    await manager.connect(employer).cancelJob(2n);

    await manager.connect(employer).createJob(payout, deadline + 2000n, 'ipfs://c');
    await manager.connect(owner).delistJob(3n);

    await manager.connect(employer).createJob(payout, deadline, 'ipfs://d');
    await ethers.provider.send('evm_increaseTime', [40]);
    await ethers.provider.send('evm_mine');
    await manager.expireJob(4n);

    await manager.connect(employer).createJob(payout, deadline + 3000n, 'ipfs://e');
    await manager.connect(employer).assignAgent(5n, agent.address);
    await manager.markDisputed(5n);
    await manager.resolveDispute(5n, false);

    const employerBalFinal = await token.balanceOf(employer.address);
    expect(employerBalFinal).to.be.lt(employerBalAfterCreate); // only create-time burns reduced funds
  });

  it('supports read helper quotes and withdrawAGI surplus without pause while protecting escrow', async function () {
    const { owner, employer, manager, token, helper } = await fixture();
    const payout = ethers.parseEther('10');
    const burn = ethers.parseEther('0.5');

    expect(await helper.quoteCreateJobBurn(manager.target, payout)).to.eq(burn);
    expect(await helper.getCreateJobFundingRequirement(manager.target, payout)).to.eq(payout + burn);

    const deadline = BigInt((await ethers.provider.getBlock('latest')).timestamp + 3600);
    await manager.connect(employer).createJob(payout, deadline, 'ipfs://job');

    await token.mint(manager.target, ethers.parseEther('2')); // surplus
    expect(await manager.withdrawableAGI()).to.eq(ethers.parseEther('2'));

    await expect(manager.withdrawAGI(ethers.parseEther('3'))).to.be.reverted;
    await manager.withdrawAGI(ethers.parseEther('1'));
    expect(await token.balanceOf(owner.address)).to.eq(ethers.parseEther('1'));

    await expect(manager.rescueERC20('0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA', 1)).to.be.revertedWithCustomError(manager, 'UseWithdrawAGIForSurplus');
  });

  it('token mutability is disabled', async function () {
    const { manager } = await fixture();
    await expect(manager.updateAGITokenAddress(ethers.ZeroAddress)).to.be.revertedWithCustomError(manager, 'AGIALPHATokenPinned');
  });

  it('restricts dispute initiation and requires an assigned agent for employer-loss payout', async function () {
    const { employer, agent, manager } = await fixture();
    const [, , , stranger] = await ethers.getSigners();
    const payout = ethers.parseEther('1');
    const deadline = BigInt((await ethers.provider.getBlock('latest')).timestamp + 3600);

    await manager.connect(employer).createJob(payout, deadline, 'ipfs://job');
    await expect(manager.connect(stranger).markDisputed(1n)).to.be.revertedWithCustomError(manager, 'UnauthorizedDisputeCaller');

    await manager.connect(employer).markDisputed(1n);
    await expect(manager.resolveDispute(1n, false)).to.be.revertedWithCustomError(manager, 'AgentNotAssigned');

    await manager.connect(employer).createJob(payout, deadline + 1n, 'ipfs://job2');
    await manager.connect(employer).assignAgent(2n, agent.address);
    await manager.connect(agent).markDisputed(2n);
    await expect(manager.resolveDispute(2n, false)).to.not.be.reverted;
  });
});
