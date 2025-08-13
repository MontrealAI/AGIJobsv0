const { expect } = require("chai");
const { ethers } = require("hardhat");

// This test covers JobRouter.selectPlatform even though the file name is
// RoutingModule.test.js for backward compatibility with the existing suite.
describe("JobRouter", function () {
  let stakeManager, reputation, registry, router, owner, op1, op2;

  beforeEach(async () => {
    [owner, op1, op2] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await Stake.deploy();

    const Reputation = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    reputation = await Reputation.deploy();

    const Registry = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    registry = await Registry.deploy(
      await stakeManager.getAddress(),
      await reputation.getAddress(),
      0
    );
    await registry.setMinPlatformStake(0);

    // set platform stakes
    await stakeManager.setStake(op1.address, 2, 100);
    await stakeManager.setStake(op2.address, 2, 300);

    // register platforms in registry and router
    await registry.connect(op1).register();
    await registry.connect(op2).register();

    const Router = await ethers.getContractFactory(
      "contracts/v2/modules/JobRouter.sol:JobRouter"
    );
    router = await Router.deploy(await registry.getAddress());
    await router.connect(op1).register();
    await router.connect(op2).register();
  });

  it("selectPlatform chooses larger staker more often", async () => {
    const routerAddr = await router.getAddress();
    const trials = 500;
    let c1 = 0;
    let c2 = 0;
    for (let i = 0; i < trials; i++) {
      const seed = ethers.encodeBytes32String(i.toString());
      const tx = await router.connect(owner).selectPlatform(seed);
      const rcpt = await tx.wait();
      const log = rcpt.logs.find((l) => l.address === routerAddr);
      const parsed = router.interface.parseLog(log);
      const selected = parsed.args.operator;
      if (selected === op1.address) c1++;
      if (selected === op2.address) c2++;
    }
    const r1 = c1 / trials;
    const r2 = c2 / trials;
    expect(r2).to.be.greaterThan(r1);
    expect(r1).to.be.closeTo(0.25, 0.05);
    expect(r2).to.be.closeTo(0.75, 0.05);
  });

  it("computes routing weight based on stake", async () => {
    const w1 = await router.routingWeight(op1.address);
    const w2 = await router.routingWeight(op2.address);
    const quarter = ethers.parseUnits("0.25", 18);
    const threeQuarter = ethers.parseUnits("0.75", 18);
    expect(w1).to.be.closeTo(quarter, ethers.parseUnits("0.05", 18));
    expect(w2).to.be.closeTo(threeQuarter, ethers.parseUnits("0.05", 18));
  });
});
