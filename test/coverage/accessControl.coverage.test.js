const { expect } = require('chai');
const { ethers } = require('hardhat');

async function mineBlocks(count) {
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ethers.provider.send('evm_mine', []);
  }
}

describe('Access control coverage helpers', function () {
  it('exercises OwnerConfigurator flows', async function () {
    const [owner, operator] = await ethers.getSigners();
    const ModuleMock = await ethers.getContractFactory('ConfigurableModuleMock');
    const target = await ModuleMock.deploy();
    await target.waitForDeployment();

    const Configurator = await ethers.getContractFactory('OwnerConfigurator');
    const configurator = await Configurator.deploy(owner.address);
    await configurator.waitForDeployment();

    const moduleKey = ethers.keccak256(
      ethers.toUtf8Bytes('COVERAGE::MODULE')
    );
    const parameterKey = ethers.keccak256(
      ethers.toUtf8Bytes('COVERAGE::PARAM')
    );
    const callData = target.interface.encodeFunctionData('setValue', [77n]);

    await expect(
      configurator
        .connect(operator)
        .configure(
          await target.getAddress(),
          callData,
          moduleKey,
          parameterKey,
          '0x',
          '0x'
        )
    )
      .to.be.revertedWithCustomError(configurator, 'OwnableUnauthorizedAccount')
      .withArgs(operator.address);

    await configurator
      .connect(owner)
      .configure(
        await target.getAddress(),
        callData,
        moduleKey,
        parameterKey,
        '0x',
        '0x'
      );

    expect(await target.currentValue()).to.equal(77n);

    const firstCall = {
      target: await target.getAddress(),
      callData,
      moduleKey,
      parameterKey,
      oldValue: '0x',
      newValue: '0x',
    };

    const batchResult = await configurator
      .connect(owner)
      .configureBatch.staticCall([firstCall]);
    expect(batchResult).to.deep.equal(['0x']);
  });

  it('executes a minimal governance lifecycle', async function () {
    const [admin, voter] = await ethers.getSigners();

    const VotesToken = await ethers.getContractFactory(
      'contracts/test/MockVotesToken.sol:MockVotesToken'
    );
    const votesToken = await VotesToken.deploy();
    await votesToken.waitForDeployment();

    const mintAmount = ethers.parseEther('100');
    await votesToken.mint(await voter.getAddress(), mintAmount);
    await votesToken.connect(voter).delegate(await voter.getAddress());

    const Timelock = await ethers.getContractFactory(
      'contracts/v2/governance/AGITimelock.sol:AGITimelock'
    );
    const minDelay = 2;
    const timelock = await Timelock.deploy(minDelay, [], [], await admin.getAddress());
    await timelock.waitForDeployment();

    const Governor = await ethers.getContractFactory(
      'contracts/v2/governance/AGIGovernor.sol:AGIGovernor'
    );
    const votingDelay = 1;
    const votingPeriod = 5;
    const governor = await Governor.deploy(
      votesToken,
      timelock,
      votingDelay,
      votingPeriod,
      0,
      4
    );
    await governor.waitForDeployment();

    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();

    await timelock.grantRole(proposerRole, await governor.getAddress());
    await timelock.grantRole(executorRole, ethers.ZeroAddress);
    await timelock.revokeRole(adminRole, await admin.getAddress());

    expect(await governor.votingDelay()).to.equal(votingDelay);
    expect(await governor.votingPeriod()).to.equal(votingPeriod);
    expect(await governor.proposalThreshold()).to.equal(0);
    expect(await governor.quorum(0)).to.equal(ethers.parseEther('4'));

    const Target = await ethers.getContractFactory(
      'contracts/test/GovernanceTarget.sol:GovernanceTarget'
    );
    const target = await Target.deploy(await timelock.getAddress());
    await target.waitForDeployment();

    const encodedCall = target.interface.encodeFunctionData('setValue', [11]);
    const description = 'coverage proposal';

    const proposeTx = await governor
      .connect(voter)
      .propose([await target.getAddress()], [0], [encodedCall], description);
    const proposalReceipt = await proposeTx.wait();
    const proposalEvent = proposalReceipt.logs
      .map((log) => {
        try {
          return governor.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === 'ProposalCreated');
    expect(proposalEvent).to.not.equal(null);

    const proposalId = proposalEvent.args.proposalId;
    await mineBlocks(votingDelay + 1);
    await governor.connect(voter).castVote(proposalId, 1);
    await mineBlocks(votingPeriod + 1);

    const descriptionHash = ethers.id(description);
    await governor.queue(
      [await target.getAddress()],
      [0],
      [encodedCall],
      descriptionHash
    );

    await ethers.provider.send('evm_increaseTime', [minDelay + 1]);
    await ethers.provider.send('evm_mine', []);

    await governor.execute(
      [await target.getAddress()],
      [0],
      [encodedCall],
      descriptionHash
    );

    expect(await target.value()).to.equal(11);
    expect(await governor.state(proposalId)).to.equal(7); // Executed
  });
});
