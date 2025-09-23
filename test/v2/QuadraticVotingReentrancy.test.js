const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('QuadraticVoting reentrancy', function () {
  it('guards castVote against reentrancy', async () => {
    const [deployer, executor] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      'contracts/test/ReentrantERC20.sol:ReentrantERC20'
    );
    const token = await Token.deploy();

    const QuadraticVoting = await ethers.getContractFactory(
      'contracts/v2/QuadraticVoting.sol:QuadraticVoting'
    );
    const qv = await QuadraticVoting.deploy(
      await token.getAddress(),
      executor.address
    );
    await qv.connect(deployer).setTreasury(deployer.address);

    const block = await ethers.provider.getBlock('latest');
    const deadline = block.timestamp + 100;

    const Attack = await ethers.getContractFactory(
      'contracts/test/QuadraticVotingAttack.sol:QuadraticVotingAttack'
    );
    const attack = await Attack.deploy(
      await qv.getAddress(),
      await token.getAddress(),
      1,
      deadline
    );

    await token.mint(await attack.getAddress(), 10n);

    await expect(attack.attackCast()).to.be.revertedWithCustomError(
      qv,
      'ReentrancyGuardReentrantCall'
    );
  });

  it('guards claimReward against reentrancy', async () => {
    const [deployer, executor] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      'contracts/test/ReentrantERC20.sol:ReentrantERC20'
    );
    const token = await Token.deploy();
    const QuadraticVoting = await ethers.getContractFactory(
      'contracts/v2/QuadraticVoting.sol:QuadraticVoting'
    );
    const qv = await QuadraticVoting.deploy(
      await token.getAddress(),
      executor.address
    );
    await qv.connect(deployer).setTreasury(deployer.address);

    const block = await ethers.provider.getBlock('latest');
    const deadline = block.timestamp + 100;

    const Attack = await ethers.getContractFactory(
      'contracts/test/QuadraticVotingAttack.sol:QuadraticVotingAttack'
    );
    const attack = await Attack.deploy(
      await qv.getAddress(),
      await token.getAddress(),
      1,
      deadline
    );

    await token.mint(await attack.getAddress(), 10n);
    // perform normal vote to accrue cost
    await attack.vote();
    await qv.connect(executor).execute(1);
    await expect(attack.attackReward()).to.be.revertedWithCustomError(
      qv,
      'ReentrancyGuardReentrantCall'
    );
  });
});
