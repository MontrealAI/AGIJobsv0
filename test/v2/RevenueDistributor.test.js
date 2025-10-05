const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { AGIALPHA } = require('../../scripts/constants');

describe('RevenueDistributor', function () {
  let stakeManager, distributor, owner, op1, op2, op3, payer, token;

  beforeEach(async () => {
    [owner, op1, op2, op3, payer] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    await token.mint(payer.address, ethers.parseEther('100'));

    const Stake = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await Stake.deploy();

    const Distributor = await ethers.getContractFactory(
      'contracts/v2/modules/RevenueDistributor.sol:RevenueDistributor'
    );
    distributor = await Distributor.deploy(await stakeManager.getAddress());

    await stakeManager.setStake(op1.address, 2, 100);
    await stakeManager.setStake(op2.address, 2, 200);
    await stakeManager.setStake(op3.address, 2, 300);

    await distributor.connect(op1).register();
    await distributor.connect(op2).register();
    await distributor.connect(op3).register();
  });

  it('splits fees proportionally to stake', async () => {
    const amount = ethers.parseEther('6');
    await token.connect(payer).approve(await distributor.getAddress(), amount);

    const b1 = await token.balanceOf(op1.address);
    const b2 = await token.balanceOf(op2.address);
    const b3 = await token.balanceOf(op3.address);

    await distributor.connect(payer).distribute(amount);

    const a1 = await token.balanceOf(op1.address);
    const a2 = await token.balanceOf(op2.address);
    const a3 = await token.balanceOf(op3.address);

    expect(a1 - b1).to.equal(ethers.parseEther('1'));
    expect(a2 - b2).to.equal(ethers.parseEther('2'));
    expect(a3 - b3).to.equal(ethers.parseEther('3'));
  });

  it('skips owner even if registered and staked', async () => {
    await stakeManager.setStake(owner.address, 2, 400);
    await distributor.connect(owner).register();

    const amount = ethers.parseEther('6');
    await token.connect(payer).approve(await distributor.getAddress(), amount);

    const bOwner = await token.balanceOf(owner.address);
    const b1 = await token.balanceOf(op1.address);
    const b2 = await token.balanceOf(op2.address);
    const b3 = await token.balanceOf(op3.address);

    await distributor.connect(payer).distribute(amount);

    const aOwner = await token.balanceOf(owner.address);
    const a1 = await token.balanceOf(op1.address);
    const a2 = await token.balanceOf(op2.address);
    const a3 = await token.balanceOf(op3.address);

    expect(aOwner - bOwner).to.equal(0n);
    expect(a1 - b1).to.equal(ethers.parseEther('1'));
    expect(a2 - b2).to.equal(ethers.parseEther('2'));
    expect(a3 - b3).to.equal(ethers.parseEther('3'));
  });
});

describe('RevenueDistributor constructor', function () {
  it('deploys when $AGIALPHA has 18 decimals', async () => {
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stakeManager = await Stake.deploy();
    const Distributor = await ethers.getContractFactory(
      'contracts/v2/modules/RevenueDistributor.sol:RevenueDistributor'
    );
    await expect(Distributor.deploy(await stakeManager.getAddress())).to.not.be
      .reverted;
  });

  it('reverts when $AGIALPHA decimals are not 18', async () => {
    const artifact = await readArtifact(
      'contracts/test/MockERC206Decimals.sol:MockERC206Decimals'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const Stake = await ethers.getContractFactory('MockStakeManager');
    const stakeManager = await Stake.deploy();
    const Distributor = await ethers.getContractFactory(
      'contracts/v2/modules/RevenueDistributor.sol:RevenueDistributor'
    );
    await expect(
      Distributor.deploy(await stakeManager.getAddress())
    ).to.be.revertedWith('decimals');
  });
});
