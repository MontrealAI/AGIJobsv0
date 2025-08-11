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
    await engine.connect(owner).setCaller(caller.address, true);
    await engine
      .connect(owner)
      .setThreshold(ethers.parseEther("2"));
  });

  it("tracks metrics, applies decay and blacklists", async () => {
    await engine.connect(caller).recordCompletion(user.address);
    expect(await engine.reputation(user.address)).to.equal(
      ethers.parseEther("1")
    );

    // advance time to trigger decay
    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);
    const decayed = await engine.reputation(user.address);
    expect(decayed).to.equal(ethers.parseEther("0.9"));

    await engine.connect(caller).recordDispute(user.address);
    expect(await engine.reputation(user.address)).to.equal(0n);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);

    const metrics = await engine.getMetrics(user.address);
    expect(metrics.completed).to.equal(1n);
    expect(metrics.disputes).to.equal(1n);

    await engine.connect(caller).recordCompletion(user.address);
    await engine.connect(caller).recordCompletion(user.address);
    expect(await engine.reputation(user.address)).to.equal(
      ethers.parseEther("2")
    );
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });

  it("records slashes", async () => {
    await engine.connect(caller).recordCompletion(user.address);
    await engine
      .connect(caller)
      .recordSlash(user.address, ethers.parseEther("1"));
    const metrics = await engine.getMetrics(user.address);
    expect(metrics.slashes).to.equal(ethers.parseEther("1"));
    expect(await engine.reputation(user.address)).to.equal(0n);
  });

  it("rejects unauthorized callers", async () => {
    await expect(
      engine.connect(user).recordCompletion(user.address)
    ).to.be.revertedWith("not authorized");
  });

  it("allows authorized caller to manually set blacklist status", async () => {
    await engine.connect(caller).blacklist(user.address, true);
    expect(await engine.isBlacklisted(user.address)).to.equal(true);
    await engine.connect(caller).blacklist(user.address, false);
    expect(await engine.isBlacklisted(user.address)).to.equal(false);
  });
});
