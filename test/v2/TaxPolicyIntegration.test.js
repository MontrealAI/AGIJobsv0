const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('JobRegistry tax policy integration', function () {
  let owner, user, registry, policy;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
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
    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy('ipfs://policy', 'ack');
  });

  it('allows owner to set policy and expose acknowledgement', async () => {
    await expect(
      registry.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(registry, 'TaxPolicyUpdated')
      .withArgs(await policy.getAddress(), 1);
    expect(await registry.taxAcknowledgement()).to.equal(
      await policy.acknowledgement()
    );
    expect(await registry.taxPolicyURI()).to.equal('ipfs://policy');
    let details = await registry.taxPolicyDetails();
    expect(details[0]).to.equal('ack');
    expect(details[1]).to.equal('ipfs://policy');
    await policy.connect(owner).setAcknowledgement('new ack');
    details = await registry.taxPolicyDetails();
    expect(details[0]).to.equal('new ack');
    expect(await policy.isTaxExempt()).to.equal(true);
  });

  it('tracks user acknowledgement', async () => {
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await expect(policy.connect(user).acknowledge())
      .to.emit(policy, 'PolicyAcknowledged')
      .withArgs(user.address, 1);
    expect(await policy.hasAcknowledged(user.address)).to.equal(true);
    expect(await policy.acknowledgedVersion(user.address)).to.equal(1);
  });

  it('reverts acknowledgeFor when caller is not authorized', async () => {
    await expect(
      policy.connect(owner).acknowledgeFor(user.address)
    ).to.be.revertedWithCustomError(policy, 'NotAcknowledger');
  });

  it('allows authorized caller to acknowledge for another address', async () => {
    await policy.connect(owner).setAcknowledger(owner.address, true);
    await expect(policy.connect(owner).acknowledgeFor(user.address))
      .to.emit(policy, 'PolicyAcknowledged')
      .withArgs(user.address, 1);
    expect(await policy.hasAcknowledged(user.address)).to.equal(true);
  });

  it('exposes acknowledged version for users', async () => {
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    expect(await policy.acknowledgedVersion(user.address)).to.equal(0);
    await policy.connect(user).acknowledge();
    expect(await policy.acknowledgedVersion(user.address)).to.equal(1);
    await policy.connect(owner).bumpPolicyVersion();
    expect(await policy.acknowledgedVersion(user.address)).to.equal(1);
    await policy.connect(user).acknowledge();
    expect(await policy.acknowledgedVersion(user.address)).to.equal(2);
  });

  it('requires re-acknowledgement after version bump', async () => {
    await registry.connect(owner).setJobParameters(0, 0);
    await registry.connect(owner).setMaxJobReward(10);
    await registry.connect(owner).setJobDurationLimit(86400);
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy.connect(user).acknowledge();
    await policy.connect(owner).bumpPolicyVersion();
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await expect(registry.connect(user).createJob(1, deadline, specHash, 'uri'))
      .to.be.revertedWithCustomError(registry, 'TaxPolicyNotAcknowledged')
      .withArgs(user.address);
    await expect(policy.connect(user).acknowledge())
      .to.emit(policy, 'PolicyAcknowledged')
      .withArgs(user.address, 2);
    await expect(registry.connect(user).createJob(1, deadline, specHash, 'uri'))
      .to.emit(registry, 'JobCreated')
      .withArgs(1, user.address, ethers.ZeroAddress, 1, 0, 0, specHash, 'uri');
  });

  it('blocks non-owner from setting policy', async () => {
    await expect(
      registry.connect(user).setTaxPolicy(await policy.getAddress())
    ).to.be.revertedWithCustomError(registry, 'NotGovernance');
  });

  it('blocks non-owner from bumping version', async () => {
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await expect(policy.connect(user).bumpPolicyVersion())
      .to.be.revertedWithCustomError(policy, 'OwnableUnauthorizedAccount')
      .withArgs(user.address);
  });

  it('allows acknowledging for another address', async () => {
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await registry.connect(owner).setAcknowledger(owner.address, true);
    await registry.connect(owner).acknowledgeFor(user.address);
    expect(await policy.hasAcknowledged(user.address)).to.equal(true);
    expect(await policy.hasAcknowledged(await registry.getAddress())).to.equal(
      false
    );
  });
});
