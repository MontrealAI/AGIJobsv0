const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('StakeManager', function () {
  const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');
  let token, stakeManager, owner, user, employer, treasury;

  beforeEach(async () => {
    [owner, user, employer, treasury] = await ethers.getSigners();
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
    const balanceSlot = (address) =>
      ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [ethers.zeroPadValue(address, 32), ethers.ZeroHash]
      );
    for (const addr of [
      owner.address,
      user.address,
      employer.address,
      treasury.address,
    ]) {
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balanceSlot(addr),
        ethers.ZeroHash,
      ]);
    }
    const totalSupplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      totalSupplySlot,
      ethers.ZeroHash,
    ]);
    await token.mint(owner.address, 1000);
    await token.mint(user.address, 1000);
    await token.mint(employer.address, 1000);
    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      50,
      50,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager
      .connect(owner)
      .setTreasuryAllowlist(treasury.address, true);
    await stakeManager.connect(owner).setMinStake(1);
  });

  it('reverts when staking without job registry', async () => {
    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await expect(
      stakeManager.connect(user).depositStake(0, 100)
    ).to.be.revertedWithCustomError(stakeManager, 'JobRegistryNotSet');
  });

  it('handles staking, job escrow and slashing', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await expect(stakeManager.connect(user).depositStake(0, 200))
      .to.emit(stakeManager, 'StakeDeposited')
      .withArgs(user.address, 0, 200);

    expect(await stakeManager.stakes(user.address, 0)).to.equal(200n);
    expect(await stakeManager.totalStake(0)).to.equal(200n);

    await stakeManager.connect(user).withdrawStake(0, 50);
    expect(await stakeManager.stakes(user.address, 0)).to.equal(150n);
    expect(await stakeManager.totalStake(0)).to.equal(150n);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const jobId = ethers.encodeBytes32String('job1');
    await token.connect(employer).approve(await stakeManager.getAddress(), 300);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 300);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, employer.address, user.address, 200, true)
    )
      .to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, user.address, 200);
    expect(await token.balanceOf(user.address)).to.equal(1050n);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          0,
          100,
          employer.address
        )
    )
      .to.emit(stakeManager, 'StakeSlashed')
      .withArgs(user.address, 0, employer.address, treasury.address, 50, 50, 0, 0, 0);
    expect(await stakeManager.stakes(user.address, 0)).to.equal(50n);
    expect(await stakeManager.totalStake(0)).to.equal(50n);
    expect(await token.balanceOf(employer.address)).to.equal(750n);
    expect(await token.balanceOf(treasury.address)).to.equal(50n);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          0,
          10,
          ethers.ZeroAddress
        )
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidRecipient');
  });

  it('rejects unauthorized slashing and excessive amounts', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).depositStake(0, 100);

    await expect(
      stakeManager
        .connect(user)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          0,
          10,
          employer.address
        )
    ).to.be.revertedWithCustomError(stakeManager, 'OnlyJobRegistry');

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          0,
          200,
          employer.address
        )
    ).to.be.revertedWithCustomError(stakeManager, 'InsufficientStake');
  });

  it('reverts when treasury is zero during slashing', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).depositStake(0, 100);

    // treasury storage slot accounting for inherited and packed variables
    // slot incremented after introducing `unbondingPeriod`
    const treasurySlot = '0x' + (8).toString(16).padStart(64, '0');
    await ethers.provider.send('hardhat_setStorageAt', [
      await stakeManager.getAddress(),
      treasurySlot,
      ethers.ZeroHash,
    ]);
    expect(await stakeManager.treasury()).to.equal(ethers.ZeroAddress);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const supplyBefore = await token.totalSupply();
    const employerBefore = await token.balanceOf(employer.address);
    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address)'](
        user.address,
        0,
        100,
        employer.address
      );
    const supplyAfter = await token.totalSupply();
    const employerAfter = await token.balanceOf(employer.address);
    expect(supplyBefore - supplyAfter).to.equal(50n);
    expect(employerAfter - employerBefore).to.equal(50n);
    expect(await token.balanceOf(await stakeManager.getAddress())).to.equal(0n);
  });

  it('supports staking and slashing for all roles', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 600);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    for (const role of [0, 1, 2]) {
      await stakeManager.connect(user).depositStake(role, 100);
      expect(await stakeManager.stakes(user.address, role)).to.equal(100n);
      await stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          role,
          50,
          employer.address
        );
      expect(await stakeManager.stakes(user.address, role)).to.equal(50n);
    }
  });

  it('enforces the unbonding delay before releasing stake', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const tx = await stakeManager.connect(user).requestWithdraw(0, 100);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === 'WithdrawRequested'
    );
    expect(event.args.user).to.equal(user.address);
    expect(event.args.amount).to.equal(100n);

    await expect(
      stakeManager.connect(user).finalizeWithdraw(0)
    ).to.be.revertedWithCustomError(stakeManager, 'UnbondLocked');

    const unlockAt = event.args.unlockAt;
    await time.increaseTo(Number(unlockAt));

    const before = await token.balanceOf(user.address);
    await expect(stakeManager.connect(user).finalizeWithdraw(0))
      .to.emit(stakeManager, 'StakeWithdrawn')
      .withArgs(user.address, 0, 100);
    const after = await token.balanceOf(user.address);
    expect(after - before).to.equal(100n);

    const [pending, , jailed] = await stakeManager.unbonds(user.address);
    expect(pending).to.equal(0n);
    expect(jailed).to.equal(false);
  });

  it('reverts for invalid role', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await expect(
      stakeManager.connect(user).depositStake(3, 100)
    ).to.be.revertedWithoutReason();
    await expect(
      stakeManager.connect(user).withdrawStake(3, 1)
    ).to.be.revertedWithoutReason();

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);
    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          3,
          1,
          employer.address
        )
    ).to.be.revertedWithoutReason();
  });

  it('enforces tax acknowledgement for staking operations', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await token.connect(user).approve(await stakeManager.getAddress(), 200);

    await expect(stakeManager.connect(user).depositStake(0, 100))
      .to.be.revertedWithCustomError(stakeManager, 'TaxPolicyNotAcknowledged')
      .withArgs(user.address);

    await taxPolicy.connect(user).acknowledge();
    await expect(stakeManager.connect(user).depositStake(0, 100)).to.emit(
      stakeManager,
      'StakeDeposited'
    );

    await taxPolicy.connect(owner).bumpPolicyVersion();
    await expect(stakeManager.connect(user).withdrawStake(0, 50))
      .to.be.revertedWithCustomError(stakeManager, 'TaxPolicyNotAcknowledged')
      .withArgs(user.address);

    await taxPolicy.connect(user).acknowledge();
    await expect(stakeManager.connect(user).withdrawStake(0, 50))
      .to.emit(stakeManager, 'StakeWithdrawn')
      .withArgs(user.address, 0, 50);
  });

  it('restricts min stake updates to owner', async () => {
    await expect(
      stakeManager.connect(user).setMinStake(1)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
    await expect(stakeManager.connect(owner).setMinStake(2))
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(2n);
    expect(await stakeManager.minStake()).to.equal(2n);
  });

  it('reverts when setting min stake to zero', async () => {
    await expect(
      stakeManager.connect(owner).setMinStake(0)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidMinStake');
  });

  it('enforces min stake on deposits and withdrawals for agent and validator', async () => {
    // set min stake to 100
    await stakeManager.connect(owner).setMinStake(100);

    // wire job registry so user can stake
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 400);

    // deposits below min stake revert for both roles
    await expect(
      stakeManager.connect(user).depositStake(0, 50)
    ).to.be.revertedWithCustomError(stakeManager, 'BelowMinimumStake');
    await expect(
      stakeManager.connect(user).depositStake(1, 50)
    ).to.be.revertedWithCustomError(stakeManager, 'BelowMinimumStake');

    // deposits meeting min stake succeed
    await stakeManager.connect(user).depositStake(0, 100);
    await stakeManager.connect(user).depositStake(1, 100);

    // partial withdrawals leaving below min stake revert
    await expect(
      stakeManager.connect(user).withdrawStake(0, 10)
    ).to.be.revertedWithCustomError(stakeManager, 'BelowMinimumStake');
    await expect(
      stakeManager.connect(user).withdrawStake(1, 10)
    ).to.be.revertedWithCustomError(stakeManager, 'BelowMinimumStake');

    // full withdrawals succeed
    await stakeManager.connect(user).withdrawStake(0, 100);
    await stakeManager.connect(user).withdrawStake(1, 100);
  });

  it('supports role-specific minimum stake overrides', async () => {
    await stakeManager.connect(owner).setMinStake(100);

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await expect(
      stakeManager.connect(owner).setRoleMinimums(100, 1000, 0)
    )
      .to.emit(stakeManager, 'RoleMinimumUpdated')
      .withArgs(0, 100n)
      .and.to.emit(stakeManager, 'RoleMinimumUpdated')
      .withArgs(1, 1000n)
      .and.to.emit(stakeManager, 'RoleMinimumUpdated')
      .withArgs(2, 0n);

    expect(await stakeManager.roleMinimumStake(0)).to.equal(100n);
    expect(await stakeManager.roleMinimumStake(1)).to.equal(1000n);
    expect(await stakeManager.roleMinimumStake(2)).to.equal(0n);

    await token.mint(user.address, 200);
    await token
      .connect(user)
      .approve(await stakeManager.getAddress(), 2000);

    await stakeManager.connect(user).depositStake(0, 100);
    await expect(
      stakeManager.connect(user).depositStake(1, 100)
    ).to.be.revertedWithCustomError(stakeManager, 'BelowMinimumStake');
    await stakeManager.connect(user).depositStake(1, 1000);

    await expect(
      stakeManager.connect(user).withdrawStake(0, 1)
    ).to.be.revertedWithCustomError(stakeManager, 'BelowMinimumStake');
    await expect(
      stakeManager.connect(user).withdrawStake(1, 10)
    ).to.be.revertedWithCustomError(stakeManager, 'BelowMinimumStake');

    await stakeManager.connect(user).withdrawStake(0, 100);
    await stakeManager.connect(user).withdrawStake(1, 1000);
  });

  it('restricts slashing percentage updates to owner', async () => {
    await expect(
      stakeManager.connect(user).setSlashingPercentages(60, 40)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
    await expect(stakeManager.connect(owner).setSlashingPercentages(60, 40))
      .to.emit(stakeManager, 'SlashingPercentagesUpdated')
      .withArgs(60, 40);
    expect(await stakeManager.employerSlashPct()).to.equal(60);
    expect(await stakeManager.treasurySlashPct()).to.equal(40);
  });

  it('allows governance to configure validator slash rewards', async () => {
    await expect(
      stakeManager.connect(user).setValidatorSlashRewardPct(15)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
    await stakeManager.connect(owner).setSlashingPercentages(60, 20);
    await expect(
      stakeManager.connect(owner).setValidatorSlashRewardPct(15)
    )
      .to.emit(stakeManager, 'ValidatorSlashRewardPctUpdated')
      .withArgs(15);
    expect(await stakeManager.validatorSlashRewardPct()).to.equal(15);
  });

  it('allows slashing percentages that sum under 100', async () => {
    await expect(stakeManager.connect(owner).setSlashingPercentages(60, 20))
      .to.emit(stakeManager, 'SlashingPercentagesUpdated')
      .withArgs(60, 20);
    expect(await stakeManager.employerSlashPct()).to.equal(60);
    expect(await stakeManager.treasurySlashPct()).to.equal(20);
  });

  it('slashes full amount when percentages sum to 100', async () => {
    await stakeManager.connect(owner).setSlashingPercentages(70, 30);
    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockRegistry = await MockRegistry.deploy();
    await stakeManager
      .connect(owner)
      .setJobRegistry(await mockRegistry.getAddress());
    await token.connect(owner).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(owner).depositStake(0, 100);
    const registryAddr = await mockRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);
    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address)'](
        owner.address,
        0,
        100,
        employer.address
      );
    expect(await stakeManager.stakes(owner.address, 0)).to.equal(0n);
    expect(await token.balanceOf(employer.address)).to.equal(1070n);
    expect(await token.balanceOf(treasury.address)).to.equal(30n);
    expect(await token.balanceOf(await stakeManager.getAddress())).to.equal(0n);
  });

  it('reverts when slashing percentages sum over 100', async () => {
    await expect(
      stakeManager.connect(owner).setSlashingPercentages(60, 50)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('burns remainder when slashing percentages sum under 100', async () => {
    await stakeManager.connect(owner).setSlashingPercentages(40, 50);
    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockRegistry = await MockRegistry.deploy();
    await stakeManager
      .connect(owner)
      .setJobRegistry(await mockRegistry.getAddress());
    await token.connect(owner).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(owner).depositStake(0, 100);
    const registryAddr = await mockRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);
    const supplyBefore = await token.totalSupply();
    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address)'](
        owner.address,
        0,
        100,
        employer.address
      );
    const supplyAfter = await token.totalSupply();
    expect(supplyBefore - supplyAfter).to.equal(10n);
    expect(await token.balanceOf(employer.address)).to.equal(1040n);
    expect(await token.balanceOf(treasury.address)).to.equal(50n);
    expect(await token.balanceOf(await stakeManager.getAddress())).to.equal(0n);
  });

  it('reverts when individual slashing percentage exceeds 100', async () => {
    await expect(
      stakeManager.connect(owner).setSlashingPercentages(101, 0)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('routes full slashing to treasury when employer share is zero', async () => {
    await stakeManager.connect(owner).setSlashingPercentages(0, 100);
    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockRegistry = await MockRegistry.deploy();
    await stakeManager
      .connect(owner)
      .setJobRegistry(await mockRegistry.getAddress());
    await token.connect(owner).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(owner).depositStake(0, 100);
    const registryAddr = await mockRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);
    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address)'](
        owner.address,
        0,
        40,
        employer.address
      );
    expect(await token.balanceOf(treasury.address)).to.equal(40n);
    expect(await token.balanceOf(employer.address)).to.equal(1000n);
  });

  it('burns remainder when slashing with rounding', async () => {
    await stakeManager.connect(owner).setSlashingPercentages(60, 40);
    const MockRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    const mockRegistry = await MockRegistry.deploy();
    await stakeManager
      .connect(owner)
      .setJobRegistry(await mockRegistry.getAddress());
    await token.connect(owner).approve(await stakeManager.getAddress(), 101);
    await stakeManager.connect(owner).depositStake(0, 101);
    const supplyBefore = await token.totalSupply();
    const treasuryBefore = await token.balanceOf(treasury.address);
    const employerBefore = await token.balanceOf(employer.address);
    const registryAddr = await mockRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);
    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address)'](
        owner.address,
        0,
        101,
        employer.address
      );
    const supplyAfter = await token.totalSupply();
    const treasuryAfter = await token.balanceOf(treasury.address);
    const employerAfter = await token.balanceOf(employer.address);
    expect(supplyBefore - supplyAfter).to.equal(1n);
    expect(treasuryAfter - treasuryBefore).to.equal(40n);
    expect(employerAfter - employerBefore).to.equal(60n);
  });

  it('restricts treasury updates to owner and allowlist', async () => {
    await expect(
      stakeManager.connect(user).setTreasury(user.address)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
    await expect(
      stakeManager.connect(owner).setTreasury(user.address)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidTreasury');
    await stakeManager.connect(owner).setTreasuryAllowlist(user.address, true);
    await expect(stakeManager.connect(owner).setTreasury(user.address))
      .to.emit(stakeManager, 'TreasuryUpdated')
      .withArgs(user.address);
    expect(await stakeManager.treasury()).to.equal(user.address);
  });

  it('allows setting treasury to zero address for burning', async () => {
    await expect(stakeManager.connect(owner).setTreasury(ethers.ZeroAddress))
      .to.emit(stakeManager, 'TreasuryUpdated')
      .withArgs(ethers.ZeroAddress);
  });

  it('rejects owner address as treasury', async () => {
    await expect(
      stakeManager.connect(owner).setTreasury(owner.address)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidTreasury');
  });

  it('emits ModulesUpdated when updating modules individually', async () => {
    const VersionMock = await ethers.getContractFactory(
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    const jobRegistryMock = await VersionMock.deploy(2);
    const disputeModuleMock = await VersionMock.deploy(2);
    const jobRegistryAddress = await jobRegistryMock.getAddress();
    const disputeModuleAddress = await disputeModuleMock.getAddress();

    await expect(stakeManager.connect(owner).setJobRegistry(jobRegistryAddress))
      .to.emit(stakeManager, 'JobRegistryUpdated')
      .withArgs(jobRegistryAddress)
      .and.to.emit(stakeManager, 'ModulesUpdated')
      .withArgs(jobRegistryAddress, ethers.ZeroAddress);

    await expect(
      stakeManager.connect(owner).setDisputeModule(disputeModuleAddress)
    )
      .to.emit(stakeManager, 'DisputeModuleUpdated')
      .withArgs(disputeModuleAddress)
      .and.to.emit(stakeManager, 'ModulesUpdated')
      .withArgs(jobRegistryAddress, disputeModuleAddress);
  });

  it('reverts slashing when treasury removed from allowlist', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();
    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).depositStake(0, 100);

    // Remove treasury from allowlist
    await stakeManager
      .connect(owner)
      .setTreasuryAllowlist(treasury.address, false);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          0,
          10,
          employer.address
        )
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidTreasury');
  });

  it('enforces stake locks and unlocks after expiry', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const lockDuration = 3600n;
    const current = BigInt(await time.latest());
    const expectedUnlock = current + 1n + lockDuration;
    await expect(
      stakeManager
        .connect(registrySigner)
        .lockStake(user.address, 200, Number(lockDuration))
    )
      .to.emit(stakeManager, 'StakeTimeLocked(address,uint256,uint64)')
      .withArgs(user.address, 200n, expectedUnlock);

    await expect(
      stakeManager.connect(user).withdrawStake(0, 1)
    ).to.be.revertedWithCustomError(stakeManager, 'InsufficientLocked');

    await time.increase(lockDuration);

    await expect(stakeManager.connect(user).withdrawStake(0, 50))
      .to.emit(stakeManager, 'StakeUnlocked')
      .withArgs(user.address, 200n)
      .and.to.emit(stakeManager, 'StakeWithdrawn')
      .withArgs(user.address, 0, 50n);
  });

  it('allows early stake release by JobRegistry', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await stakeManager
      .connect(registrySigner)
      .lockStake(user.address, 100, 3600);

    await expect(
      stakeManager.connect(registrySigner).releaseStake(user.address, 100)
    )
      .to.emit(stakeManager, 'StakeUnlocked')
      .withArgs(user.address, 100n);

    await expect(stakeManager.connect(user).withdrawStake(0, 100))
      .to.emit(stakeManager, 'StakeWithdrawn')
      .withArgs(user.address, 0, 100n);
  });

  it('allows slashing during active lock', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await stakeManager
      .connect(registrySigner)
      .lockStake(user.address, 100, 3600);

    await expect(
      stakeManager
        .connect(registrySigner)
        ['slash(address,uint8,uint256,address)'](
          user.address,
          0,
          100,
          employer.address
        )
    )
      .to.emit(stakeManager, 'StakeSlashed')
      .withArgs(user.address, 0, employer.address, treasury.address, 50, 50, 0, 0, 0)
      .and.to.emit(stakeManager, 'StakeUnlocked')
      .withArgs(user.address, 100);

    expect(await stakeManager.lockedStakes(user.address)).to.equal(0n);
  });

  it('rejects zero stake deposits', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await expect(
      stakeManager.connect(user).depositStake(0, 0)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidAmount');
  });

  it('allows withdrawal after slashing', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address)'](
        user.address,
        0,
        100,
        employer.address
      );
    await stakeManager.connect(user).withdrawStake(0, 100);

    expect(await stakeManager.stakes(user.address, 0)).to.equal(0n);
    expect(await token.balanceOf(user.address)).to.equal(900n);
  });

  it('matches 18-decimal slashing math', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(user).acknowledge();

    const initial = ethers.parseUnits('1000000', AGIALPHA_DECIMALS);
    await token.mint(user.address, initial);
    await token.connect(user).approve(await stakeManager.getAddress(), initial);
    await stakeManager.connect(user).depositStake(0, initial);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const amount = ethers.parseUnits('123456', AGIALPHA_DECIMALS);
    const employerBefore = await token.balanceOf(employer.address);
    const treasuryBefore = await token.balanceOf(treasury.address);

    await stakeManager
      .connect(registrySigner)
      ['slash(address,uint8,uint256,address)'](
        user.address,
        0,
        amount,
        employer.address
      );

    const employerAfter = await token.balanceOf(employer.address);
    const treasuryAfter = await token.balanceOf(treasury.address);
    const share = (amount * 50n) / 100n;

    expect(employerAfter - employerBefore).to.equal(share);
    expect(treasuryAfter - treasuryBefore).to.equal(share);

    expect(await stakeManager.stakes(user.address, 0)).to.equal(
      initial - amount
    );
  });

  it('enforces owner-only parameter updates', async () => {
    await expect(stakeManager.connect(owner).setMinStake(10))
      .to.emit(stakeManager, 'MinStakeUpdated')
      .withArgs(10n);
    await expect(
      stakeManager.connect(user).setMinStake(1)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');
    await expect(stakeManager.connect(owner).setSlashingPercentages(40, 60))
      .to.emit(stakeManager, 'SlashingPercentagesUpdated')
      .withArgs(40n, 60n);
  });

  it('acknowledgeAndDeposit records acknowledgement and restricts callers', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await policy
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await stakeManager.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).acknowledgeAndDeposit(0, 100);
    expect(await policy.hasAcknowledged(user.address)).to.equal(true);
    expect(
      await policy.hasAcknowledged(await jobRegistry.getAddress())
    ).to.equal(false);
    await expect(
      jobRegistry.connect(user).acknowledgeFor(user.address)
    ).to.be.revertedWithCustomError(jobRegistry, 'NotAcknowledger');
  });

  it('acknowledgeAndWithdraw re-acknowledges and withdraws', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy1 = await TaxPolicy.deploy('ipfs://policy1', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy1.getAddress());
    await policy1
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await stakeManager.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).acknowledgeAndDeposit(0, 100);

    const policy2 = await TaxPolicy.deploy('ipfs://policy2', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy2.getAddress());
    await policy2
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await policy2
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await policy2
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await policy2
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await policy2
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);

    await stakeManager.connect(user).acknowledgeAndWithdraw(0, 50);
    expect(await stakeManager.stakes(user.address, 0)).to.equal(50n);
    expect(await policy2.hasAcknowledged(user.address)).to.equal(true);
  });

  it('acknowledgeAndWithdrawFor requires authorization and re-acknowledges', async () => {
    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const policy1 = await TaxPolicy.deploy('ipfs://policy1', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy1.getAddress());
    await policy1
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await stakeManager.getAddress(), true);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).acknowledgeAndDeposit(0, 100);

    const policy2 = await TaxPolicy.deploy('ipfs://policy2', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await policy2.getAddress());
    await policy2
      .connect(owner)
      .setAcknowledger(await jobRegistry.getAddress(), true);

    await expect(
      stakeManager.connect(user).acknowledgeAndWithdrawFor(user.address, 0, 50)
    ).to.be.revertedWithCustomError(stakeManager, 'NotGovernance');

    await stakeManager
      .connect(owner)
      .acknowledgeAndWithdrawFor(user.address, 0, 50);
    expect(await stakeManager.stakes(user.address, 0)).to.equal(50n);
    expect(await policy2.hasAcknowledged(user.address)).to.equal(true);
  });
});
