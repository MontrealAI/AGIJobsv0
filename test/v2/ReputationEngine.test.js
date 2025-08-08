const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine", function () {
  let engine, owner, caller, user;

  beforeEach(async () => {
    [owner, caller, user] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy(owner.address);
    await engine.connect(owner).setModule(caller.address, true);
    await engine.connect(owner).setThresholds(2, 1);
    await engine.connect(owner).setRole(user.address, 0); // agent role
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

  it("allows owner to manually set blacklist status", async () => {
    await engine.connect(owner).setBlacklist(user.address, true);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
    await engine.connect(owner).setBlacklist(user.address, false);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });
});
