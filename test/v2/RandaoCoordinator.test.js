const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { AGIALPHA } = require('../../scripts/constants');

const DEPOSIT = 1n;

function tagFromNumber(n) {
  return ethers.zeroPadValue(ethers.toBeHex(n), 32);
}

describe('RandaoCoordinator', function () {
  it('aggregates revealed secrets', async () => {
    const [a, b, t] = await ethers.getSigners();
    const Randao = await ethers.getContractFactory(
      'contracts/v2/RandaoCoordinator.sol:RandaoCoordinator'
    );
    const randao = await Randao.deploy(10, 10, DEPOSIT, t.address);
    const token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );
    await token.mint(a.address, DEPOSIT);
    await token.mint(b.address, DEPOSIT);
    await token.connect(a).approve(await randao.getAddress(), DEPOSIT);
    await token.connect(b).approve(await randao.getAddress(), DEPOSIT);
    const tag = tagFromNumber(1);
    const s1 = 1n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'bytes32', 'uint256'],
        [a.address, tag, s1]
      )
    );
    await randao.connect(a).commit(tag, c1);
    const s2 = 2n;
    const c2 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'bytes32', 'uint256'],
        [b.address, tag, s2]
      )
    );
    await randao.connect(b).commit(tag, c2);
    await time.increase(11);
    await randao.connect(a).reveal(tag, s1);
    await randao.connect(b).reveal(tag, s2);
    await time.increase(11);
    const rand1 = '0x' + '01'.repeat(32);
    await network.provider.send('hardhat_setPrevRandao', [rand1]);
    await network.provider.send('evm_mine');
    const r1 = await randao.random(tag);
    const expected1 = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32'],
        [s1 ^ s2, rand1]
      )
    );
    expect(r1).to.equal(expected1);
    const rand2 = '0x' + '02'.repeat(32);
    await network.provider.send('hardhat_setPrevRandao', [rand2]);
    await network.provider.send('evm_mine');
    const r2 = await randao.random(tag);
    expect(r2).to.not.equal(r1);
    const bal = await token.balanceOf(await randao.getAddress());
    expect(bal).to.equal(0n);
  });

  it('penalizes missing reveals', async () => {
    const [a, b, t] = await ethers.getSigners();
    const Randao = await ethers.getContractFactory(
      'contracts/v2/RandaoCoordinator.sol:RandaoCoordinator'
    );
    const randao = await Randao.deploy(10, 10, DEPOSIT, t.address);
    const token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );
    await token.mint(a.address, DEPOSIT);
    await token.mint(b.address, DEPOSIT);
    await token.connect(a).approve(await randao.getAddress(), DEPOSIT);
    await token.connect(b).approve(await randao.getAddress(), DEPOSIT);
    const tag = tagFromNumber(2);
    const s1 = 3n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'bytes32', 'uint256'],
        [a.address, tag, s1]
      )
    );
    await randao.connect(a).commit(tag, c1);
    const s2 = 4n;
    const c2 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'bytes32', 'uint256'],
        [b.address, tag, s2]
      )
    );
    await randao.connect(b).commit(tag, c2);
    await time.increase(11);
    await randao.connect(a).reveal(tag, s1);
    // b does not reveal
    await time.increase(11);
    const rand1 = '0x' + 'aa'.repeat(32);
    await network.provider.send('hardhat_setPrevRandao', [rand1]);
    await network.provider.send('evm_mine');
    const r1 = await randao.random(tag);
    const expected1 = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32'],
        [s1, rand1]
      )
    );
    expect(r1).to.equal(expected1);
    const rand2 = '0x' + 'bb'.repeat(32);
    await network.provider.send('hardhat_setPrevRandao', [rand2]);
    await network.provider.send('evm_mine');
    const r2 = await randao.random(tag);
    expect(r2).to.not.equal(r1);
    const before = await token.balanceOf(t.address);
    await randao.forfeit(tag, b.address);
    const after = await token.balanceOf(t.address);
    expect(after - before).to.equal(DEPOSIT);
    const bal = await token.balanceOf(await randao.getAddress());
    expect(bal).to.equal(0n);
  });

  it('allows the owner to retune windows, deposit, and treasury', async () => {
    const [owner, participant, initialTreasury, newTreasury] =
      await ethers.getSigners();
    const Randao = await ethers.getContractFactory(
      'contracts/v2/RandaoCoordinator.sol:RandaoCoordinator'
    );
    const randao = await Randao.deploy(10, 20, 1n, initialTreasury.address);

    await expect(randao.connect(participant).setCommitWindow(15)).to.be.revertedWithCustomError(
      randao,
      'OwnableUnauthorizedAccount'
    );

    await expect(randao.setCommitWindow(15))
      .to.emit(randao, 'CommitWindowUpdated')
      .withArgs(10, 15);
    await expect(randao.setRevealWindow(25))
      .to.emit(randao, 'RevealWindowUpdated')
      .withArgs(20, 25);
    await expect(randao.setDeposit(2n))
      .to.emit(randao, 'DepositUpdated')
      .withArgs(1n, 2n);
    await expect(randao.setTreasury(newTreasury.address))
      .to.emit(randao, 'TreasuryUpdated')
      .withArgs(initialTreasury.address, newTreasury.address);

    expect(await randao.commitWindow()).to.equal(15n);
    expect(await randao.revealWindow()).to.equal(25n);
    expect(await randao.deposit()).to.equal(2n);
    expect(await randao.treasury()).to.equal(newTreasury.address);

    const token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );
    const randaoAddress = await randao.getAddress();
    await token.mint(participant.address, 2n);
    await token.connect(participant).approve(randaoAddress, 2n);

    const tag = tagFromNumber(99);
    const secret = 7n;
    const commitment = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'bytes32', 'uint256'],
        [participant.address, tag, secret]
      )
    );
    await randao.connect(participant).commit(tag, commitment);

    expect(await token.balanceOf(randaoAddress)).to.equal(2n);

    await time.increase(16); // enter reveal window
    await time.increase(26); // allow reveal window to expire

    await expect(randao.forfeit(tag, participant.address))
      .to.emit(randao, 'DepositForfeited')
      .withArgs(tag, participant.address, 2n);

    expect(await token.balanceOf(randaoAddress)).to.equal(0n);
    expect(await token.balanceOf(newTreasury.address)).to.equal(2n);
  });
});

describe('ValidationModule fairness', function () {
  it('uses Randao randomness for validator selection', async () => {
    const [owner, v1, v2, v3, t] = await ethers.getSigners();
    const Tax = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const tax = await Tax.deploy('', '');
    const Job = await ethers.getContractFactory(
      'contracts/v2/mocks/JobRegistryAckStub.sol:JobRegistryAckStub'
    );
    const job = await Job.deploy(await tax.getAddress());

    const Stake = await ethers.getContractFactory(
      'contracts/v2/mocks/ReentrantStakeManager.sol:ReentrantStakeManager'
    );
    const stake = await Stake.deploy();
    await stake.setJobRegistry(await job.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    const identity = await Identity.deploy();

    const Randao = await ethers.getContractFactory(
      'contracts/v2/RandaoCoordinator.sol:RandaoCoordinator'
    );
    const randao = await Randao.deploy(10, 10, DEPOSIT, t.address);
    const token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );
    await token.mint(owner.address, DEPOSIT * 2n);
    await token.connect(owner).approve(await randao.getAddress(), DEPOSIT * 2n);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const validation = await Validation.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      1,
      1,
      3,
      3,
      []
    );

    await validation.setIdentityRegistry(await identity.getAddress());
    await validation.setValidatorPool([v1.address, v2.address, v3.address]);
    await validation.setRandaoCoordinator(await randao.getAddress());
    await validation.setParameters(3, 1, 1, 50, 50);
    await validation.setJobRegistry(await job.getAddress());
    await stake.setValidationModule(await validation.getAddress());

    const stakeAmt = ethers.parseEther('1');
    await stake.setStake(v1.address, 1, stakeAmt);
    await stake.setStake(v2.address, 1, stakeAmt);
    await stake.setStake(v3.address, 1, stakeAmt);

    // First selection -> choose v1
    const tag1 = tagFromNumber(1);
    const secret1 = 1n;
    const commit1 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'bytes32', 'uint256'],
        [owner.address, tag1, secret1]
      )
    );
    await randao.commit(tag1, commit1);
    await time.increase(11);
    await randao.reveal(tag1, secret1);
    await time.increase(11);
    await validation.selectValidators(1n, 0);
    await ethers.provider.send('evm_mine', []);
    await validation.connect(v1).selectValidators(1n, 0);
    let selected1 = Array.from(await validation.validators(1n));

    // Second selection
    const tag2 = tagFromNumber(2);
    const secret2 = stakeAmt + 1n;
    const commit2 = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'bytes32', 'uint256'],
        [owner.address, tag2, secret2]
      )
    );
    await randao.commit(tag2, commit2);
    await time.increase(11);
    await randao.reveal(tag2, secret2);
    await time.increase(11);
    await validation.selectValidators(2n, 0);
    await ethers.provider.send('evm_mine', []);
    await validation.connect(v1).selectValidators(2n, 0);
    let selected2 = Array.from(await validation.validators(2n));
    expect(new Set(selected1).size).to.equal(3);
    expect(new Set(selected2).size).to.equal(3);
    expect(selected1).to.have.members([v1.address, v2.address, v3.address]);
    expect(selected2).to.have.members([v1.address, v2.address, v3.address]);
  });
});
