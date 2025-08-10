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
    engine = await Engine.deploy(owner.address);
    await engine.connect(owner).setCaller(owner.address, true);
    await engine.connect(owner).setStakeManager(await stakeManager.getAddress());

    const Discovery = await ethers.getContractFactory(
      "contracts/v2/modules/DiscoveryModule.sol:DiscoveryModule"
    );
    discovery = await Discovery.deploy(
      await stakeManager.getAddress(),
      await engine.getAddress(),
      owner.address
    );
    await discovery.connect(owner).setMinStake(0);
  });

  it("updates rankings when stake or reputation changes", async () => {
    await stakeManager.setStake(p1.address, 2, 100); // platform stake
    await stakeManager.setStake(p2.address, 2, 100); // platform stake

    await discovery.registerPlatform(p1.address);
    await discovery.registerPlatform(p2.address);

    await engine.connect(owner).add(p1.address, 1);
    await engine.connect(owner).add(p2.address, 2);

    let top = await discovery.getTopPlatforms(2);
    expect(top).to.include.members([p1.address, p2.address]);

    await stakeManager.setStake(p1.address, 0, 500); // agent stake boosts score
    top = await discovery.getTopPlatforms(2);
    expect(top[0]).to.equal(p1.address);

    await engine.connect(owner).add(p2.address, 1000);
    top = await discovery.getTopPlatforms(2);
    expect(top[0]).to.equal(p2.address);
  });

  it("excludes blacklisted platforms", async () => {
    await stakeManager.setStake(p1.address, 2, 100);
    await discovery.registerPlatform(p1.address);
    await engine.connect(owner).blacklist(p1.address, true);
    const top = await discovery.getTopPlatforms(1);
    expect(top.length).to.equal(0);
  });
});

