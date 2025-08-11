const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RoutingModule", function () {
  let stakeManager, engine, router, owner, op1, op2;

  beforeEach(async () => {
    [owner, op1, op2] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await Stake.deploy();
    const Engine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    engine = await Engine.deploy(owner.address);
    await engine.connect(owner).setStakeManager(await stakeManager.getAddress());
    await engine.connect(owner).setCaller(owner.address, true);
    const Router = await ethers.getContractFactory(
      "contracts/v2/modules/RoutingModule.sol:RoutingModule"
    );
    router = await Router.deploy(
      await stakeManager.getAddress(),
      await engine.getAddress(),
      owner.address
    );
    await router.connect(owner).setReputationEnabled(true);

    await stakeManager.setStake(op1.address, 2, 100);
    await stakeManager.setStake(op2.address, 2, 300);
    await engine.connect(owner).recordCompletion(op1.address);
    await engine.connect(owner).recordCompletion(op2.address);
    await engine.connect(owner).recordCompletion(op2.address);
    await engine.connect(owner).recordCompletion(op2.address);

    await router.connect(op1).register();
    await router.connect(op2).register();
  });

  it("routes based on stake and reputation", async () => {
    const jobId = ethers.encodeBytes32String("job");
    const trials = 500;
    const routerAddr = await router.getAddress();
    let c1 = 0;
    let c2 = 0;
    for (let i = 0; i < trials; i++) {
      const tx = await router.connect(owner).selectOperator(jobId);
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
    expect(r1).to.be.closeTo(0.1, 0.05);
    expect(r2).to.be.closeTo(0.9, 0.05);
  });
});

