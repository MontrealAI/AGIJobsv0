const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry tax policy integration", function () {
  let owner, user, registry, policy;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(owner.address);
    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await Policy.deploy(owner.address, "ipfs://policy", "ack");
  });

  it("allows owner to set policy and expose acknowledgement", async () => {
    await expect(
      registry.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(registry, "TaxPolicyUpdated")
      .withArgs(await policy.getAddress(), 1);
    expect(await registry.taxAcknowledgement()).to.equal(
      await policy.acknowledge()
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
      .to.emit(registry, "TaxAcknowledged")
      .withArgs(user.address, 1);
    expect(await registry.taxAcknowledgedVersion(user.address)).to.equal(1);
  });

  it("requires re-acknowledgement after version bump", async () => {
    await registry.connect(owner).setJobParameters(1, 0);
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await registry.connect(user).acknowledgeTaxPolicy();
    await registry.connect(owner).bumpTaxPolicyVersion();
    await expect(
      registry.connect(user).createJob()
    ).to.be.revertedWith("acknowledge tax policy");
    await expect(registry.connect(user).acknowledgeTaxPolicy())
      .to.emit(registry, "TaxAcknowledged")
      .withArgs(user.address, 2);
    await expect(registry.connect(user).createJob())
      .to.emit(registry, "JobCreated")
      .withArgs(1, user.address, ethers.ZeroAddress, 1, 0);
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
