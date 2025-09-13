const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');

describe('QuadraticVoting', function () {
  let token;
  beforeEach(async function () {
    const mock = await artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [AGIALPHA, mock.deployedBytecode]);
    token = await ethers.getContractAt('contracts/test/MockERC20.sol:MockERC20', AGIALPHA);
  });

  it('charges squared cost for votes and tracks tallies', async function () {
    const [owner, voter1, voter2, treasury] = await ethers.getSigners();
    const Voting = await ethers.getContractFactory(
      'contracts/v2/QuadraticVoting.sol:QuadraticVoting'
    );
    const voting = await Voting.deploy(treasury.address);
    await voting.waitForDeployment();

    // prepare tokens
    await token.mint(voter1.address, 1000n);
    await token.mint(voter2.address, 1000n);
    await token.connect(voter1).approve(voting.target, ethers.MaxUint256);
    await token.connect(voter2).approve(voting.target, ethers.MaxUint256);

    const prop = ethers.id('prop1');
    await voting.connect(owner).createProposal(prop);

    // voter1 casts 3 votes -> cost 9
    await expect(voting.connect(voter1).vote(prop, true, 3))
      .to.emit(voting, 'VoteCast')
      .withArgs(prop, voter1.address, true, 3, 9);
    expect(await token.balanceOf(treasury.address)).to.equal(9n);
    expect(await token.balanceOf(voter1.address)).to.equal(1000n - 9n);

    // voter1 adds 2 more votes -> additional cost 16 (total 25)
    await voting.connect(voter1).vote(prop, true, 2);
    expect(await token.balanceOf(treasury.address)).to.equal(25n);
    expect(await token.balanceOf(voter1.address)).to.equal(1000n - 25n);

    // voter2 votes against with 4 votes -> cost 16
    await voting.connect(voter2).vote(prop, false, 4);
    expect(await token.balanceOf(treasury.address)).to.equal(41n);
    const votes = await voting.proposalVotes(prop);
    expect(votes.forVotes).to.equal(5n);
    expect(votes.againstVotes).to.equal(4n);
  });
});

