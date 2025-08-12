const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine", function () {
  let engine, owner, caller, user;

  beforeEach(async () => {
    [owner, caller, user] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy();
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(owner).setThreshold(2);
  });

  it("applies reputation gains and decay with blacklisting", async () => {
    await engine.connect(caller).add(user.address, 3);
    expect(await engine.reputation(user.address)).to.equal(3);

    await engine.connect(caller).subtract(user.address, 2);
    expect(await engine.reputation(user.address)).to.equal(1);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);

    await engine.connect(caller).add(user.address, 2);
    expect(await engine.reputation(user.address)).to.equal(3);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });

  it("rejects unauthorized callers", async () => {
    await expect(engine.connect(user).add(user.address, 1)).to.be.revertedWith(
      "not authorized"
    );
  });

  it("allows authorized caller to manually set blacklist status", async () => {
    await engine.connect(caller).blacklist(user.address, true);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
    await engine.connect(caller).blacklist(user.address, false);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });
});
