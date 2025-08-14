const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry tax policy integration", function () {
  let owner, other, registry, policy;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const TaxPolicyFactory = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await TaxPolicyFactory.deploy(
      "ipfs://policy",
      "ack"
    );
    await policy.waitForDeployment();

    const RegistryFactory = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await RegistryFactory.deploy(
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
    await registry.waitForDeployment();
  });

  it("owner can set policy and expose details", async () => {
    await registry
      .connect(owner)
      .setTaxPolicy(await policy.getAddress());
    expect(await registry.taxAcknowledgement()).to.equal("ack");
    expect(await registry.taxPolicyURI()).to.equal("ipfs://policy");
    const [ack, uri] = await registry.taxPolicyDetails();
    expect(ack).to.equal("ack");
    expect(uri).to.equal("ipfs://policy");
  });

  it("policy contract exposes combined details", async () => {
    const [ack, uri] = await policy.policyDetails();
    expect(ack).to.equal("ack");
    expect(uri).to.equal("ipfs://policy");
  });

  it("registry confirms tax exemption", async () => {
    expect(await registry.isTaxExempt()).to.equal(true);
  });

  it("non-owner cannot set policy", async () => {
    await expect(
      registry.connect(other).setTaxPolicy(await policy.getAddress())
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
  });

  it("rejects policies that do not confirm tax exemption", async () => {
    const Bad = await ethers.getContractFactory(
      "contracts/mocks/BadTaxPolicy.sol:BadTaxPolicy"
    );
    const bad = await Bad.deploy();
    await bad.waitForDeployment();
    await expect(
      registry.connect(owner).setTaxPolicy(await bad.getAddress())
    ).to.be.revertedWith("not tax exempt");
  });
});
