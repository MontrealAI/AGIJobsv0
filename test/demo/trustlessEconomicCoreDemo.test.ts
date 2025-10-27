import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

const { parseUnits } = ethers;

async function deployFixture() {
  const [owner, employer, agent, v1, v2, v3, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory('DemoAGIALPHAToken');
  const token = await Token.connect(owner).deploy();

  const participants = [owner, employer, agent, v1, v2, v3, treasury];
  for (const signer of participants) {
    await token.connect(owner).mint(signer.address, parseUnits('1000'));
  }

  const Demo = await ethers.getContractFactory('TrustlessEconomicCoreDemo');

  const validatorRewardPct = 1000; // 10%
  const protocolFeePct = 500; // 5%
  const burnPct = 200; // 2%
  const minStake = parseUnits('150');
  const jobStakeLockPct = 2000; // 20%

  const demo = await Demo.connect(owner).deploy(
    await token.getAddress(),
    treasury.address,
    validatorRewardPct,
    protocolFeePct,
    burnPct,
    minStake,
    jobStakeLockPct
  );

  const agentNode = ethers.id('alpha.agent.agi.eth');
  const validatorNodes = [
    ethers.id('validator1.club.agi.eth'),
    ethers.id('validator2.club.agi.eth'),
    ethers.id('validator3.club.agi.eth'),
  ];

  await demo.connect(owner).registerAgentIdentity(agent.address, agentNode);
  await demo.connect(owner).registerValidatorIdentity(v1.address, validatorNodes[0]);
  await demo.connect(owner).registerValidatorIdentity(v2.address, validatorNodes[1]);
  await demo.connect(owner).registerValidatorIdentity(v3.address, validatorNodes[2]);

  const stakeAmount = parseUnits('200');
  await token.connect(agent).approve(await demo.getAddress(), stakeAmount);
  await demo.connect(agent).depositStake(stakeAmount);

  const milestoneAmounts = [parseUnits('100'), parseUnits('100'), parseUnits('100')];
  const committee = [v1.address, v2.address, v3.address];
  const threshold = 2;

  await token.connect(employer).approve(await demo.getAddress(), parseUnits('300'));
  const tx = await demo
    .connect(employer)
    .createJob(agent.address, milestoneAmounts, committee, threshold);
  const receipt = await tx.wait();
  const event = receipt!.logs
    .map((log) => demo.interface.parseLog(log))
    .find((parsed) => parsed?.name === 'JobCreated');

  const jobId = event?.args?.jobId ?? 1n;

  return {
    owner,
    employer,
    agent,
    v1,
    v2,
    v3,
    treasury,
    token,
    demo,
    jobId: Number(jobId),
    milestoneAmounts,
    committee,
    stakeAmount,
  };
}

describe('TrustlessEconomicCoreDemo', function () {
  it('runs the Kardashev-II milestone, slashing, and pause flow', async () => {
    const { owner, employer, agent, v1, v2, v3, treasury, token, demo, jobId, stakeAmount } =
      await loadFixture(deployFixture);

    const agentInitialBalance = await token.balanceOf(agent.address);
    const treasuryInitialBalance = await token.balanceOf(treasury.address);

    // Job-level pause and resume before approvals
    await expect(demo.connect(owner).pauseJob(jobId)).to.emit(demo, 'JobPaused');
    await expect(demo.connect(v1).approveMilestone(jobId, 0)).to.be.revertedWithCustomError(
      demo,
      'JobPausedOrCancelled'
    );
    await expect(demo.connect(owner).resumeJob(jobId)).to.emit(demo, 'JobResumed');

    // Milestone 1 approvals and release
    await expect(demo.connect(v1).approveMilestone(jobId, 0)).to.emit(
      demo,
      'MilestoneApproved'
    );
    await expect(demo.connect(v2).approveMilestone(jobId, 0))
      .to.emit(demo, 'MilestoneReleased')
      .withArgs(jobId, 0, parseUnits('83'), parseUnits('10'), parseUnits('5'), parseUnits('2'));

    expect(await token.balanceOf(agent.address)).to.equal(
      agentInitialBalance + parseUnits('83')
    );
    expect(await token.balanceOf(v1.address)).to.equal(parseUnits('1000') + parseUnits('5'));
    expect(await token.balanceOf(v2.address)).to.equal(parseUnits('1000') + parseUnits('5'));

    // Pause before milestone 2
    await demo.connect(owner).pauseAll();
    await expect(demo.connect(v1).approveMilestone(jobId, 1)).to.be.revertedWithCustomError(
      demo,
      'EnforcedPause'
    );
    await demo.connect(owner).unpauseAll();

    // Milestone 2 approvals and release (validators 2 & 3)
    await demo.connect(v2).approveMilestone(jobId, 1);
    await expect(demo.connect(v3).approveMilestone(jobId, 1))
      .to.emit(demo, 'MilestoneReleased')
      .withArgs(jobId, 1, parseUnits('83'), parseUnits('10'), parseUnits('5'), parseUnits('2'));

    expect(await token.balanceOf(v3.address)).to.equal(parseUnits('1000') + parseUnits('5'));

    // Slash agent after fraudulent milestone 3 attempt
    const agentStakeBeforeSlash = await demo.agentStake(agent.address);
    await expect(demo.connect(owner).slashAgent(jobId, parseUnits('60')))
      .to.emit(demo, 'AgentSlashed')
      .withArgs(
        jobId,
        agent.address,
        parseUnits('60'),
        parseUnits('30'),
        parseUnits('12'),
        parseUnits('12'),
        parseUnits('6')
      );

    expect(await demo.agentLockedStake(agent.address)).to.equal(0);
    expect(await demo.agentStake(agent.address)).to.equal(agentStakeBeforeSlash - parseUnits('60'));
    expect(await token.balanceOf(employer.address)).to.equal(parseUnits('1000') - parseUnits('300') + parseUnits('30'));
    expect(await token.balanceOf(treasury.address)).to.equal(
      treasuryInitialBalance + parseUnits('5') + parseUnits('5') + parseUnits('12')
    );

    // Employer cancels job and retrieves final milestone escrow
    await expect(demo.connect(employer).cancelJob(jobId)).to.emit(demo, 'JobCancelled');
    expect(await token.balanceOf(employer.address)).to.equal(
      parseUnits('1000') - parseUnits('300') + parseUnits('30') + parseUnits('100')
    );

    const remainingStake = await demo.agentStake(agent.address);
    expect(remainingStake).to.equal(stakeAmount - parseUnits('60'));
    await expect(demo.connect(agent).withdrawStake(remainingStake))
      .to.emit(demo, 'StakeWithdrawn')
      .withArgs(agent.address, remainingStake);
    expect(await demo.agentStake(agent.address)).to.equal(0);
    expect(await token.balanceOf(agent.address)).to.equal(
      agentInitialBalance + parseUnits('83') * 2n + remainingStake
    );

    const mintedPerParticipant = parseUnits('1000');
    const totalParticipants = 7n;
    const expectedSupply = mintedPerParticipant * totalParticipants - parseUnits('10');
    expect(await token.totalSupply()).to.equal(expectedSupply);
    expect(await token.balanceOf(await demo.getAddress())).to.equal(0);
  });

  it('enforces identity registration and minimum stake requirements', async () => {
    const { demo, employer, agent, v1, jobId } = await loadFixture(deployFixture);
    const [, , , , , , , outsider] = await ethers.getSigners();

    const impostor = v1;
    await expect(demo.connect(impostor).depositStake(parseUnits('10'))).to.be.revertedWithCustomError(
      demo,
      'NotRegisteredAgent'
    );

    await expect(demo.connect(outsider).approveMilestone(jobId, 0)).to.be.revertedWithCustomError(
      demo,
      'NotValidator'
    );

    await expect(demo.connect(agent).withdrawStake(parseUnits('150'))).to.be.revertedWithCustomError(
      demo,
      'StakeLocked'
    );
  });

  it('guards configuration and slashing controls behind governance', async () => {
    const { demo, owner, employer, agent, v1, treasury, token, jobId, stakeAmount } = await loadFixture(deployFixture);

    await expect(demo.connect(employer).setTreasury(employer.address)).to.be.revertedWithCustomError(
      demo,
      'OwnableUnauthorizedAccount'
    );

    await expect(demo.connect(owner).setPercentages(1000, 500, 200)).to.emit(demo, 'PercentagesUpdated');
    await expect(demo.connect(owner).setStakeParameters(parseUnits('200'), 1000)).to.emit(
      demo,
      'StakeParametersUpdated'
    );
    await expect(demo.connect(owner).setSlashPolicy(5000, 2000, 2000, 1000)).to.emit(demo, 'SlashPolicyUpdated');

    await expect(demo.connect(owner).setPercentages(9000, 1000, 1000)).to.be.revertedWithCustomError(
      demo,
      'InvalidPercentages'
    );
    await expect(demo.connect(owner).setStakeParameters(parseUnits('200'), 20_000)).to.be.revertedWithCustomError(
      demo,
      'InvalidPercentages'
    );
    await expect(demo.connect(owner).setSlashPolicy(6000, 2000, 2000, 1000)).to.be.revertedWithCustomError(
      demo,
      'InvalidPercentages'
    );

    await expect(demo.connect(owner).slashAgent(jobId, stakeAmount + 1n)).to.be.revertedWithCustomError(
      demo,
      'SlashTooHigh'
    );

    const treasuryInitial = await token.balanceOf(treasury.address);

    await expect(demo.connect(owner).slashAgent(jobId, parseUnits('10')))
      .to.emit(demo, 'AgentSlashed')
      .withArgs(jobId, agent.address, parseUnits('10'), parseUnits('5'), parseUnits('2'), parseUnits('2'), parseUnits('1'));

    await expect(demo.connect(owner).pauseAll()).to.emit(demo, 'Paused').withArgs(owner.address);
    await expect(demo.connect(owner).unpauseAll()).to.emit(demo, 'Unpaused').withArgs(owner.address);

    // validators receive pro-rata shares, treasury collects remainder + treasury share
    const committeeLength = BigInt((await demo.getCommittee(jobId)).length);
    const validatorShare = parseUnits('10') * 2000n / 10_000n;
    const perValidator = validatorShare / committeeLength;
    const remainder = validatorShare - perValidator * committeeLength;

    expect(await token.balanceOf(v1.address)).to.equal(parseUnits('1000') + perValidator);
    const treasuryAfter = await token.balanceOf(treasury.address);
    const expectedTreasuryDelta = parseUnits('2') + remainder;
    expect(treasuryAfter - treasuryInitial).to.equal(expectedTreasuryDelta);
  });
});
