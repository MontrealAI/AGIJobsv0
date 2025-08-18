const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DiscoveryModule", function () {
  let stakeManager, engine, discovery, owner, p1, p2;

  beforeEach(async () => {
    [owner, p1, p2] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await Stake.deploy();

    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy(ethers.ZeroAddress);
    await engine
      .connect(owner)
      .setAuthorizedCaller(owner.address, true);
    await engine.connect(owner).setStakeManager(await stakeManager.getAddress());

    const Discovery = await ethers.getContractFactory(
      "contracts/v2/modules/DiscoveryModule.sol:DiscoveryModule"
    );
    discovery = await Discovery.deploy(
      await stakeManager.getAddress(),
      await engine.getAddress(),
      0
    );
    await discovery.connect(owner).setMinStake(0);
  });

  it("orders and paginates platforms by score", async () => {
    await stakeManager.setStake(p1.address, 2, 100);
    await stakeManager.setStake(p2.address, 2, 100);

    await discovery.registerPlatform(p1.address);
    await discovery.registerPlatform(p2.address);

    await engine.connect(owner).add(p1.address, 1);
    await engine.connect(owner).add(p2.address, 2);

    let list = await discovery.getPlatforms(0, 2);
    expect(list[0]).to.equal(p2.address);
    expect(list[1]).to.equal(p1.address);

    await stakeManager.setStake(p1.address, 2, 500);
    list = await discovery.getPlatforms(0, 2);
    expect(list[0]).to.equal(p1.address);

    await engine.connect(owner).add(p2.address, 1000);
    list = await discovery.getPlatforms(0, 2);
    expect(list[0]).to.equal(p2.address);

    // pagination
    let first = await discovery.getPlatforms(0, 1);
    let second = await discovery.getPlatforms(1, 1);
    expect(first[0]).to.equal(p2.address);
    expect(second[0]).to.equal(p1.address);
  });

  it("excludes blacklisted platforms", async () => {
    await stakeManager.setStake(p1.address, 2, 100);
    await discovery.registerPlatform(p1.address);
    await engine.connect(owner).setBlacklist(p1.address, true);
    const top = await discovery.getPlatforms(0, 1);
    expect(top.length).to.equal(0);
  });
});

