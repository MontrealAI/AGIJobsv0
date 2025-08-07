const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngineV2", function () {
  let engine, owner, caller, user;

  beforeEach(async () => {
    [owner, caller, user] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngineV2"
    );
    engine = await Engine.deploy(owner.address);
    await engine.connect(owner).setCaller(caller.address, true);
    await engine.connect(owner).setThresholds(2, 1);
    await engine.connect(owner).setRole(user.address, 0); // agent role
  });

  it("applies reputation gains and decay with blacklisting", async () => {
    await engine.connect(caller).addReputation(user.address, 3);
    expect(await engine.reputationOf(user.address)).to.equal(3);

    await engine.connect(caller).subtractReputation(user.address, 2);
    expect(await engine.reputationOf(user.address)).to.equal(1);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);

    await engine.connect(caller).addReputation(user.address, 2);
    expect(await engine.reputationOf(user.address)).to.equal(3);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });

  it("rejects unauthorized callers", async () => {
    await expect(
      engine.connect(user).addReputation(user.address, 1)
    ).to.be.revertedWith("not authorized");
  });
});
