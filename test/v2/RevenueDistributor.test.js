const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RevenueDistributor", function () {
  let stakeManager, distributor, owner, op1, op2, op3, payer;

  beforeEach(async () => {
    [owner, op1, op2, op3, payer] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await Stake.deploy();

    const Distributor = await ethers.getContractFactory(
      "contracts/v2/modules/RevenueDistributor.sol:RevenueDistributor"
    );
    distributor = await Distributor.deploy(
      await stakeManager.getAddress()
    );

    await stakeManager.setStake(op1.address, 2, 100);
    await stakeManager.setStake(op2.address, 2, 200);
    await stakeManager.setStake(op3.address, 2, 300);

    await distributor.connect(op1).register();
    await distributor.connect(op2).register();
    await distributor.connect(op3).register();
  });

  it("splits fees proportionally to stake", async () => {
    const amount = ethers.parseEther("6");
    const b1 = await ethers.provider.getBalance(op1.address);
    const b2 = await ethers.provider.getBalance(op2.address);
    const b3 = await ethers.provider.getBalance(op3.address);

    await distributor.connect(payer).distribute({ value: amount });

    const a1 = await ethers.provider.getBalance(op1.address);
    const a2 = await ethers.provider.getBalance(op2.address);
    const a3 = await ethers.provider.getBalance(op3.address);

    expect(a1 - b1).to.equal(ethers.parseEther("1"));
    expect(a2 - b2).to.equal(ethers.parseEther("2"));
    expect(a3 - b3).to.equal(ethers.parseEther("3"));
  });

  it("skips owner even if registered and staked", async () => {
    await stakeManager.setStake(owner.address, 2, 400);
    await distributor.connect(owner).register();

    const amount = ethers.parseEther("6");
    const bOwner = await ethers.provider.getBalance(owner.address);
    const b1 = await ethers.provider.getBalance(op1.address);
    const b2 = await ethers.provider.getBalance(op2.address);
    const b3 = await ethers.provider.getBalance(op3.address);

    await distributor.connect(payer).distribute({ value: amount });

    const aOwner = await ethers.provider.getBalance(owner.address);
    const a1 = await ethers.provider.getBalance(op1.address);
    const a2 = await ethers.provider.getBalance(op2.address);
    const a3 = await ethers.provider.getBalance(op3.address);

    expect(aOwner - bOwner).to.equal(0n);
    expect(a1 - b1).to.equal(ethers.parseEther("1"));
    expect(a2 - b2).to.equal(ethers.parseEther("2"));
    expect(a3 - b3).to.equal(ethers.parseEther("3"));
  });
});

