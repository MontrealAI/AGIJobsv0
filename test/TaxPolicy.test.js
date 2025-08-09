const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TaxPolicy", function () {
  let owner, user, tax;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    tax = await Factory.deploy(
      owner.address,
      "ipfs://initial",
      "initial ack"
    );
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

  it("allows owner to update acknowledgement", async () => {
    await tax.connect(owner).setAcknowledgement("updated ack");
    expect(await tax.acknowledge()).to.equal("updated ack");
  });

  it("blocks non-owner acknowledgement updates", async () => {
    await expect(
      tax.connect(user).setAcknowledgement("x")
    )
      .to.be.revertedWithCustomError(tax, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
  });

  it("returns acknowledgement string", async () => {
    const msg = await tax.acknowledge();
    expect(msg).to.equal("initial ack");
  });

  it("returns policy details tuple", async () => {
    const [ack, uri] = await tax.policyDetails();
    expect(ack).to.equal("initial ack");
    expect(uri).to.equal("ipfs://initial");
  });

  it("allows owner to update URI and acknowledgement atomically", async () => {
    await tax.connect(owner).setPolicy("ipfs://u", "msg");
    expect(await tax.policyURI()).to.equal("ipfs://u");
    expect(await tax.acknowledge()).to.equal("msg");
  });

  it("rejects non-owner setPolicy calls", async () => {
    await expect(
      tax.connect(user).setPolicy("x", "y")
    )
      .to.be.revertedWithCustomError(tax, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
  });

  it("reverts on direct ether transfers", async () => {
    await expect(
      owner.sendTransaction({ to: await tax.getAddress(), value: 1 })
    ).to.be.revertedWith("TaxPolicy: no ether");
  });
});

