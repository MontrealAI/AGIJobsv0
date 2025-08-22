const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("JobRegistry tax policy integration", function () {
  let owner, user, registry, policy;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
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
      []
    );
    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await Policy.deploy("ipfs://policy", "ack");
  });

  it("allows owner to set policy and expose acknowledgement", async () => {
    await expect(
      registry.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(registry, "TaxPolicyUpdated")
      .withArgs(await policy.getAddress(), 1);
    expect(await registry.taxAcknowledgement()).to.equal(
      await policy.acknowledgement()
    );
    expect(await registry.taxPolicyURI()).to.equal("ipfs://policy");
    let details = await registry.taxPolicyDetails();
    expect(details[0]).to.equal("ack");
    expect(details[1]).to.equal("ipfs://policy");
    await policy.connect(owner).setAcknowledgement("new ack");
    details = await registry.taxPolicyDetails();
    expect(details[0]).to.equal("new ack");
    expect(await policy.isTaxExempt()).to.equal(true);
  });

  it("tracks user acknowledgement", async () => {
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await expect(registry.connect(user).acknowledgeTaxPolicy())
      .to.emit(policy, "PolicyAcknowledged")
      .withArgs(user.address)
      .and.to.emit(registry, "TaxAcknowledged")
      .withArgs(user.address, 1, "ack");
    expect(await registry.taxAcknowledgedVersion(user.address)).to.equal(1);
    expect(await policy.acknowledged(user.address)).to.equal(true);
  });

  it("requires re-acknowledgement after version bump", async () => {
    await registry.connect(owner).setJobParameters(0, 0);
    await registry.connect(owner).setMaxJobReward(10);
    await registry.connect(owner).setJobDurationLimit(86400);
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await registry.connect(user).acknowledgeTaxPolicy();
    await registry.connect(owner).bumpTaxPolicyVersion();
    const deadline = (await time.latest()) + 1000;
    await expect(
      registry.connect(user).createJob(1, deadline, "uri")
    ).to.be.revertedWith("acknowledge tax policy");
    await expect(registry.connect(user).acknowledgeTaxPolicy())
      .to.emit(registry, "TaxAcknowledged")
      .withArgs(user.address, 2, "ack");
    await expect(registry.connect(user).createJob(1, deadline, "uri"))
      .to.emit(registry, "JobCreated")
      .withArgs(1, user.address, ethers.ZeroAddress, 1, 0, 0);
  });

  it("blocks non-owner from setting policy", async () => {
    await expect(
      registry.connect(user).setTaxPolicy(await policy.getAddress())
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
  });

  it("blocks non-owner from bumping version", async () => {
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await expect(
      registry.connect(user).bumpTaxPolicyVersion()
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
  });
});
