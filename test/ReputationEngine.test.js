const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine", function () {
  let engine, owner, agentCaller, validatorCaller, user;

  beforeEach(async () => {
    [owner, agentCaller, validatorCaller, user] = await ethers.getSigners();
      const Engine = await ethers.getContractFactory(
        "contracts/ReputationEngine.sol:ReputationEngine"
      );
    engine = await Engine.deploy(owner.address);
    await engine.waitForDeployment();

    // Role enum: 1 = Agent, 2 = Validator
    await engine.connect(owner).setCaller(agentCaller.address, 1);
    await engine.connect(owner).setCaller(validatorCaller.address, 2);
    await engine.connect(owner).setAgentThreshold(5);
    await engine.connect(owner).setValidatorThreshold(5);
  });

  it("tracks agent reputation and blacklists below threshold", async () => {
    await engine.connect(agentCaller).addReputation(user.address, 10);
    expect(await engine.reputationOf(user.address, 1)).to.equal(10);

    await engine.connect(agentCaller).subtractReputation(user.address, 6);
    expect(await engine.reputationOf(user.address, 1)).to.equal(4);
    expect(await engine.isBlacklisted(user.address, 1)).to.equal(true);
  });

  it("tracks validator reputation separately", async () => {
    await engine.connect(validatorCaller).addReputation(user.address, 3);
    expect(await engine.reputationOf(user.address, 2)).to.equal(3);

    await engine.connect(validatorCaller).subtractReputation(user.address, 4);
    expect(await engine.reputationOf(user.address, 2)).to.equal(0);
    expect(await engine.isBlacklisted(user.address, 2)).to.equal(true);
  });

  it("reverts for unauthorized callers", async () => {
    await expect(
      engine.connect(user).addReputation(user.address, 1)
    ).to.be.revertedWith("not authorized");
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
});

