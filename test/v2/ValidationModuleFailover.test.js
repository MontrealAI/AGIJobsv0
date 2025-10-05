const { expect } = require('chai');
const { ethers } = require('hardhat');

const FailoverAction = {
  None: 0,
  ExtendReveal: 1,
  EscalateDispute: 2,
};

describe('ValidationModule failover controls', function () {
  let owner;
  let harness;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const Harness = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationModuleFailoverHarness.sol:ValidationModuleFailoverHarness'
    );
    harness = await Harness.deploy();
  });

  it('extends the reveal window and records state', async () => {
    const jobId = 1;
    const block = await ethers.provider.getBlock('latest');
    const commitDeadline = block.timestamp + 100;
    const revealDeadline = block.timestamp + 200;
    await harness.seedRound(jobId, commitDeadline, revealDeadline);

    const extension = 120;
    await expect(
      harness
        .connect(owner)
        .triggerFailover(jobId, FailoverAction.ExtendReveal, extension, 'network outage')
    )
      .to.emit(harness, 'ValidationFailover')
      .withArgs(
        jobId,
        FailoverAction.ExtendReveal,
        revealDeadline + extension,
        'network outage'
      );

    const round = await harness.rounds(jobId);
    expect(round.revealDeadline).to.equal(revealDeadline + extension);

    const state = await harness.failoverStates(jobId);
    expect(state.lastAction).to.equal(FailoverAction.ExtendReveal);
    expect(state.extensions).to.equal(1n);
    expect(state.lastExtendedTo).to.equal(BigInt(revealDeadline + extension));
    expect(state.escalated).to.equal(false);
    expect(state.lastTriggeredAt).to.be.greaterThan(0);
  });

  it('rejects extensions without an active round or zero duration', async () => {
    await expect(
      harness
        .connect(owner)
        .triggerFailover(77, FailoverAction.ExtendReveal, 10, 'noop')
    ).to.be.revertedWithCustomError(harness, 'NoActiveRound');

    await harness.seedRound(3, 100, 200);
    await expect(
      harness
        .connect(owner)
        .triggerFailover(3, FailoverAction.ExtendReveal, 0, 'invalid')
    ).to.be.revertedWithCustomError(harness, 'RevealExtensionRequired');
  });

  it('prevents failover once the round is tallied', async () => {
    await harness.seedRound(9, 100, 200);
    await harness.setTallied(9, true);

    await expect(
      harness
        .connect(owner)
        .triggerFailover(9, FailoverAction.ExtendReveal, 60, 'late')
    ).to.be.revertedWithCustomError(harness, 'AlreadyTallied');
  });

  it('escalates to dispute exactly once', async () => {
    const Harness = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationModuleFailoverHarness.sol:ValidationModuleFailoverHarness'
    );
    const RegistryMock = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationModuleFailoverHarness.sol:FailoverJobRegistryMock'
    );

    harness = await Harness.deploy();
    const registry = await RegistryMock.deploy();
    await harness.seedRound(11, 100, 200);
    await harness.forceJobRegistry(await registry.getAddress());

    await expect(
      harness
        .connect(owner)
        .triggerFailover(11, FailoverAction.EscalateDispute, 0, 'escalate')
    )
      .to.emit(harness, 'ValidationFailover')
      .withArgs(
        11,
        FailoverAction.EscalateDispute,
        200,
        'escalate'
      );

    expect(await registry.lastJobId()).to.equal(11);
    expect(await registry.lastReason()).to.equal('escalate');
    expect(await registry.callCount()).to.equal(1n);

    const state = await harness.failoverStates(11);
    expect(state.escalated).to.equal(false);
    expect(state.lastAction).to.equal(FailoverAction.None);

    await expect(
      harness
        .connect(owner)
        .triggerFailover(11, FailoverAction.EscalateDispute, 0, 'again')
    ).to.be.revertedWithCustomError(harness, 'NoActiveRound');
  });
});
