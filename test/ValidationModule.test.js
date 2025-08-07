const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ValidationModule", function () {
  let validation, owner;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const ValidationModule = await ethers.getContractFactory("ValidationModule");
    validation = await ValidationModule.deploy(owner.address);
  });

  it("returns preset outcomes", async () => {
    await validation.connect(owner).setOutcome(1, true);
    expect(await validation.validate(1)).to.equal(true);
    await validation.connect(owner).setOutcome(2, false);
    expect(await validation.validate(2)).to.equal(false);
  });
});

