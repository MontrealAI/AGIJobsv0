const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TaxPolicy", function () {
  let owner, user, tax;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    tax = await Factory.deploy(owner.address, "ipfs://initial");
    await tax.waitForDeployment();
  });

  it("allows owner to update URI", async () => {
    await tax.connect(owner).setPolicyURI("ipfs://new");
    expect(await tax.policyURI()).to.equal("ipfs://new");
  });

  it("prevents non-owner updates", async () => {
    await expect(
      tax.connect(user).setPolicyURI("x")
    )
      .to.be.revertedWithCustomError(tax, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
  });

  it("returns acknowledgement string", async () => {
    const msg = await tax.acknowledge();
    expect(msg).to.equal(
      "Participants are solely responsible for taxes; contract owner is exempt."
    );
  });
});

