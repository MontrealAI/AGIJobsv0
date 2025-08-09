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
    policy = await Policy.deploy(owner.address, "ipfs://policy");
  });

  it("allows owner to set policy and expose acknowledgement", async () => {
    await expect(
      registry.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(registry, "TaxPolicyUpdated")
      .withArgs(await policy.getAddress());
    expect(await registry.taxAcknowledgement()).to.equal(
      await policy.acknowledge()
    );
    expect(await registry.taxPolicyURI()).to.equal("ipfs://policy");
  });

  it("blocks non-owner from setting policy", async () => {
    await expect(
      registry.connect(user).setTaxPolicy(await policy.getAddress())
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
  });
});
