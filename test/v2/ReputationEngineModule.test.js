const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationEngine module", function () {
  let owner, caller, user, engine;

  beforeEach(async () => {
    [owner, caller, user] = await ethers.getSigners();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/modules/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy(owner.address);
    await engine.waitForDeployment();
  });

  it("allows authorised caller to update reputation with weights", async () => {
    await engine.setCaller(caller.address, true);
    await engine.setWeights(
      ethers.parseUnits("2", 18),
      ethers.parseUnits("3", 18)
    );
    await engine.connect(caller).updateReputation(0, user.address, 1);
    expect(await engine.getReputation(0, user.address)).to.equal(2);
    await engine.connect(caller).updateReputation(0, user.address, -1);
    expect(await engine.getReputation(0, user.address)).to.equal(0);
  });

  it("reverts for unauthorised caller", async () => {
    await expect(
      engine.updateReputation(0, user.address, 1)
    ).to.be.revertedWith("not authorized");
  });

  it("exposes getters for routing and governance", async () => {
    await engine.setCaller(caller.address, true);
    await engine.connect(caller).updateReputation(0, user.address, 1);
    expect(await engine.getRoutingScore(0, user.address)).to.equal(1);
    expect(await engine.getGovernancePower(0, user.address)).to.equal(1);
  });
});

