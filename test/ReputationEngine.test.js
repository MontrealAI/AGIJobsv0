const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine", function () {
  let engine, owner, caller, user;

  beforeEach(async () => {
    [owner, caller, user] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory("ReputationEngine");
    engine = await Engine.deploy(owner.address);
  });

  it("updates reputation by authorized caller", async () => {
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(caller).increaseReputation(user.address, 5);
    expect(await engine.reputation(user.address)).to.equal(5);
    await engine.connect(caller).decreaseReputation(user.address, 2);
    expect(await engine.reputation(user.address)).to.equal(3);
  });

  it("reverts for unauthorized callers", async () => {
    await expect(engine.connect(caller).increaseReputation(user.address, 1)).to.be.revertedWith("not authorized");
  });
});

