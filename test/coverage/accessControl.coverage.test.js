const { expect } = require('chai');
const { ethers } = require('hardhat');

async function mineBlocks(count) {
  for (let i = 0; i < count; i += 1) {
    await ethers.provider.send('evm_mine', []);
  }
}

describe('OwnerConfigurator (coverage)', function () {
  it('forwards configuration calls and enforces zero-target guard', async function () {
    const [owner] = await ethers.getSigners();

    const Harness = await ethers.getContractFactory('OwnerConfiguratorHarness');
    const configurator = await Harness.deploy(await owner.getAddress());

    const Target = await ethers.getContractFactory('ConfiguratorTarget');
    const target = await Target.deploy();

    const moduleKey = ethers.id('MODULE_KEY');
    const parameterKey = ethers.id('PARAM_KEY');

    const callData = target.interface.encodeFunctionData('setValue', [
      123,
      moduleKey,
      parameterKey,
    ]);

    const receipt = await (
      await configurator.configure(
        await target.getAddress(),
        callData,
        moduleKey,
        parameterKey,
        '0x',
        '0x'
      )
    ).wait();

    expect(await target.value()).to.equal(123n);
    const event = receipt.logs
      .map((log) => {
        try {
          return configurator.interface.parseLog(log);
        } catch (err) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === 'ParameterUpdated');
    expect(event, 'ParameterUpdated emitted').to.not.equal(null);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const batchCalls = [
      {
        target: await target.getAddress(),
        callData: target.interface.encodeFunctionData('setValue', [
          456,
          moduleKey,
          parameterKey,
        ]),
        moduleKey,
        parameterKey,
        oldValue: abi.encode(['uint256'], [123]),
        newValue: abi.encode(['uint256'], [456]),
        value: 0,
      },
      {
        target: await target.getAddress(),
        callData: target.interface.encodeFunctionData('setValue', [
          789,
          moduleKey,
          parameterKey,
        ]),
        moduleKey,
        parameterKey,
        oldValue: abi.encode(['uint256'], [456]),
        newValue: abi.encode(['uint256'], [789]),
        value: 0,
      },
    ];

    await configurator.configureBatch(batchCalls);
    expect(await target.value()).to.equal(789n);

    await expect(
      configurator.configure(
        ethers.ZeroAddress,
        '0x',
        moduleKey,
        parameterKey,
        '0x',
        '0x'
      )
    ).to.be.revertedWithCustomError(configurator, 'OwnerConfigurator__ZeroTarget');

    await expect(
      configurator.applyConfiguration({
        target: ethers.ZeroAddress,
        callData: '0x',
        moduleKey,
        parameterKey,
        oldValue: '0x',
        newValue: '0x',
        value: 0,
      })
    ).to.be.revertedWithCustomError(configurator, 'OwnerConfigurator__ZeroTarget');
  });
});

describe('Governance access control (coverage)', function () {
  it('runs through propose, queue, execute, and cancel flows', async function () {
    const [deployer, voter, proposer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('CoverageVotesToken');
    const votesToken = await Token.deploy();

    const mintAmount = ethers.parseEther('1000');
    await votesToken.mint(await voter.getAddress(), mintAmount);
    await votesToken.mint(await proposer.getAddress(), mintAmount);
    await votesToken.connect(voter).delegate(await voter.getAddress());
    await votesToken.connect(proposer).delegate(await proposer.getAddress());

    const Timelock = await ethers.getContractFactory('TimelockHarness');
    const minDelay = 2;
    const timelock = await Timelock.deploy(minDelay, [], [], await deployer.getAddress());

    const Governor = await ethers.getContractFactory('GovernorHarness');
    const votingDelay = 1;
    const votingPeriod = 5;
    const proposalThreshold = 0;
    const quorumFraction = 4;
    const governor = await Governor.deploy(
      votesToken,
      timelock,
      votingDelay,
      votingPeriod,
      proposalThreshold,
      quorumFraction
    );

    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();

    await timelock.grantRole(proposerRole, await governor.getAddress());
    await timelock.grantRole(executorRole, ethers.ZeroAddress);
    await timelock.revokeRole(adminRole, await deployer.getAddress());

    const Target = await ethers.getContractFactory('CoverageGovernanceTarget');
    const target = await Target.deploy();

    const description = 'adjust governance parameter';
    const encodedCall = target.interface.encodeFunctionData('setValue', [42]);
    const targets = [await target.getAddress()];
    const values = [0];
    const calldatas = [encodedCall];

    const descriptionHash = ethers.id(description);
    await governor
      .connect(proposer)
      .propose(targets, values, calldatas, description);

    const proposalId = await governor.hashProposal(
      targets,
      values,
      calldatas,
      descriptionHash
    );

    expect(await governor.votingDelay()).to.equal(BigInt(votingDelay));
    expect(await governor.votingPeriod()).to.equal(BigInt(votingPeriod));
    expect(await governor.proposalThreshold()).to.equal(BigInt(proposalThreshold));
    const currentBlock = (await ethers.provider.getBlock('latest')).number;
    await governor.quorum(currentBlock > 0 ? currentBlock - 1 : 0);

    await mineBlocks(votingDelay + 1);
    await governor.connect(voter).castVote(proposalId, 1);
    await mineBlocks(votingPeriod + 1);

    expect(await governor.state(proposalId)).to.equal(ethers.toBigInt(4));
    expect(await governor.proposalNeedsQueuing(proposalId)).to.equal(true);

    await governor.queue(targets, values, calldatas, descriptionHash);
    await ethers.provider.send('evm_increaseTime', [minDelay + 1]);
    await ethers.provider.send('evm_mine', []);
    await governor.execute(targets, values, calldatas, descriptionHash);

    expect(await target.value()).to.equal(42n);
    expect(await governor.executorAddress()).to.equal(await timelock.getAddress());
    expect(await governor.supportsInterface('0x01ffc9a7')).to.equal(true);

    const cancelDescription = 'cancel proposal';
    const cancelCalldata = target.interface.encodeFunctionData('setValue', [99]);
    const cancelDescriptionHash = ethers.id(cancelDescription);
    await governor
      .connect(proposer)
      .propose(targets, values, [cancelCalldata], cancelDescription);
    const cancelProposalId = await governor.hashProposal(
      targets,
      values,
      [cancelCalldata],
      cancelDescriptionHash
    );

    await expect(
      governor
        .connect(proposer)
        .cancel(targets, values, [cancelCalldata], cancelDescriptionHash)
    ).to.emit(governor, 'ProposalCanceled');
    expect(await governor.state(cancelProposalId)).to.equal(ethers.toBigInt(2));
  });
});
