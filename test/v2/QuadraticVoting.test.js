const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('QuadraticVoting', function () {
  it('charges votes squared in tokens and records tallies', async function () {
    const [governance, treasury, voter] = await ethers.getSigners();

    // deploy mock token and mint to voter
    const Token = await ethers.getContractFactory('contracts/v2/mocks/MockERC20.sol:MockERC20');
    const token = await Token.deploy('Mock', 'MOCK');
    const supply = ethers.parseUnits('100', 18);
    await token.mint(voter.address, supply);

    // deploy quadratic voting contract
    const Voting = await ethers.getContractFactory('contracts/v2/QuadraticVoting.sol:QuadraticVoting');
    const voting = await Voting.deploy(token, treasury.address, governance.address);

    const votes = 3n;
    const cost = votes * votes; // 9 tokens

    await token.connect(voter).approve(voting, cost);
    await voting.connect(voter).vote(1, true, votes);

    expect(await token.balanceOf(treasury.address)).to.equal(cost);
    const [forVotes, againstVotes] = await voting.proposalVotes(1);
    expect(forVotes).to.equal(votes);
    expect(againstVotes).to.equal(0n);
  });

  it('reports cost for votes', async function () {
    const [governance, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('contracts/v2/mocks/MockERC20.sol:MockERC20');
    const token = await Token.deploy('Mock', 'MOCK');
    const Voting = await ethers.getContractFactory('contracts/v2/QuadraticVoting.sol:QuadraticVoting');
    const voting = await Voting.deploy(token, treasury.address, governance.address);
    expect(await voting.costForVotes(5)).to.equal(25n);
  });
});

