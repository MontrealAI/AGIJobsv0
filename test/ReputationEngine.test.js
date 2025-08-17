const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ReputationEngine", function () {
  let engine, owner, agentCaller, validatorCaller, user;

  beforeEach(async () => {
    [owner, agentCaller, validatorCaller, user] = await ethers.getSigners();
      const Engine = await ethers.getContractFactory(
        "contracts/ReputationEngine.sol:ReputationEngine"
      );
    engine = await Engine.deploy();
    await engine.waitForDeployment();

    // Role enum: 1 = Agent, 2 = Validator
    await engine.connect(owner).setCaller(agentCaller.address, 1);
    await engine.connect(owner).setCaller(validatorCaller.address, 2);
    await engine.connect(owner).setAgentThreshold(5);
    await engine.connect(owner).setValidatorThreshold(5);
  });

  it("blacklists agent below threshold and clears on recovery", async () => {
    await engine.connect(agentCaller).add(user.address, 10);
    expect(await engine.reputationOf(user.address, 1)).to.equal(10);

    await engine.connect(agentCaller).subtract(user.address, 6);
    expect(await engine.reputationOf(user.address, 1)).to.equal(4);
    expect(await engine.isBlacklisted(user.address, 1)).to.equal(true);

    await engine.connect(agentCaller).add(user.address, 10);
    expect(await engine.isBlacklisted(user.address, 1)).to.equal(false);
  });

  it("blacklists validator below threshold", async () => {
    await engine.connect(validatorCaller).add(user.address, 3);
    expect(await engine.reputationOf(user.address, 2)).to.equal(3);

    await engine.connect(validatorCaller).subtract(user.address, 4);
    expect(await engine.reputationOf(user.address, 2)).to.equal(0);
    expect(await engine.isBlacklisted(user.address, 2)).to.equal(true);
  });

  it("reverts for unauthorized callers", async () => {
    await expect(engine.connect(user).add(user.address, 1)).to.be.revertedWith(
      "not authorized"
    );
  });

  it("allows only owner to configure", async () => {
    await expect(
      engine.connect(agentCaller).setCaller(user.address, 1)
    )
      .to.be.revertedWithCustomError(
        engine,
        "OwnableUnauthorizedAccount"
      )
      .withArgs(agentCaller.address);

    await expect(engine.connect(agentCaller).setAgentThreshold(1))
      .to.be.revertedWithCustomError(engine, "OwnableUnauthorizedAccount")
      .withArgs(agentCaller.address);

    await expect(engine.connect(agentCaller).setValidatorThreshold(1))
      .to.be.revertedWithCustomError(engine, "OwnableUnauthorizedAccount")
      .withArgs(agentCaller.address);
  });

  it("applies exponential decay over time", async () => {
    const LN2 = 693147180559945309n; // ln(2) scaled by 1e18
    await engine.connect(owner).setDecayConstant(LN2);
    await engine.connect(agentCaller).add(user.address, 100n);
    await time.increase(1);
    const rep = await engine.reputationOf(user.address, 1);
    const expected = 50n;
    const diff = rep > expected ? rep - expected : expected - rep;
    expect(diff).to.be.lte(1n);
  });

  it("enforces diminishing returns on reputation growth", async () => {
    await engine.connect(agentCaller).add(user.address, 1000);
    const first = await engine.reputationOf(user.address, 1);
    await engine.connect(agentCaller).add(user.address, 1000);
    const second = await engine.reputationOf(user.address, 1);
    const delta1 = first; // since starting from 0
    const delta2 = second - first;
    expect(delta2).to.be.lt(delta1);
  });
});

