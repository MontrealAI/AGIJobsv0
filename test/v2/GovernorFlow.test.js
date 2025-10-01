const { expect } = require('chai');
const { ethers } = require('hardhat');

async function mineBlocks(count) {
  for (let i = 0; i < count; i += 1) {
    await ethers.provider.send('evm_mine', []);
  }
}

describe('AGIGovernor + Timelock integration', function () {
  it('executes a queued proposal that updates a governable module', async function () {
    const [deployer, voter] = await ethers.getSigners();

    const VotesToken = await ethers.getContractFactory(
      'contracts/test/MockVotesToken.sol:MockVotesToken'
    );
    const votesToken = await VotesToken.deploy();

    const mintAmount = ethers.parseEther('100');
    await votesToken.mint(await voter.getAddress(), mintAmount);
    await votesToken.connect(voter).delegate(await voter.getAddress());

    const Timelock = await ethers.getContractFactory(
      'contracts/v2/governance/AGITimelock.sol:AGITimelock'
    );
    const minDelay = 2; // seconds
    const timelock = await Timelock.deploy(minDelay, [], [], await deployer.getAddress());

    const Governor = await ethers.getContractFactory(
      'contracts/v2/governance/AGIGovernor.sol:AGIGovernor'
    );
    const votingDelay = 1; // blocks
    const votingPeriod = 5; // blocks
    const proposalThreshold = 0;
    const quorumFraction = 4; // 4%
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

    const Target = await ethers.getContractFactory(
      'contracts/test/GovernanceTarget.sol:GovernanceTarget'
    );
    const target = await Target.deploy(await timelock.getAddress());

    const newValue = 42;
    const encodedCall = target.interface.encodeFunctionData('setValue', [newValue]);
    const description = 'Update stored value via governance';

    const proposeTx = await governor
      .connect(voter)
      .propose([await target.getAddress()], [0], [encodedCall], description);
    const proposalReceipt = await proposeTx.wait();
    const proposalEvent = proposalReceipt.logs
      .map((log) => {
        try {
          return governor.interface.parseLog(log);
        } catch (err) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === 'ProposalCreated');
    expect(proposalEvent, 'proposal creation log found').to.not.equal(null);
    const proposalId = proposalEvent.args.proposalId;

    await mineBlocks(votingDelay + 1);

    await governor.connect(voter).castVote(proposalId, 1); // 1 = For

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

    expect(await target.value()).to.equal(newValue);
  });
});
