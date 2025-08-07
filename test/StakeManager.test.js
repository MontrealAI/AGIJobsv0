const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager", function () {
  let token, stakeManager, owner, employer, agent;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    await token.mint(agent.address, 1000);
    await token.mint(employer.address, 1000);
    const StakeManager = await ethers.getContractFactory("StakeManager");
    stakeManager = await StakeManager.deploy(await token.getAddress(), owner.address);
  });

  it("handles stake deposits and withdrawals", async () => {
    await token.connect(agent).approve(await stakeManager.getAddress(), 1000);
    await stakeManager.connect(agent).depositStake(500);
    expect(await stakeManager.stakes(agent.address)).to.equal(500);
    await stakeManager.connect(agent).withdrawStake(200);
    expect(await stakeManager.stakes(agent.address)).to.equal(300);
  });

  it("locks and pays rewards", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), 400);
    await stakeManager.connect(owner).lockReward(employer.address, 400);
    expect(await token.balanceOf(await stakeManager.getAddress())).to.equal(400);
    await stakeManager.connect(owner).payReward(agent.address, 400);
    expect(await token.balanceOf(agent.address)).to.equal(1400);
  });

  it("slashes stakes", async () => {
    await token.connect(agent).approve(await stakeManager.getAddress(), 500);
    await stakeManager.connect(agent).depositStake(500);
    await stakeManager.connect(owner).slash(agent.address, employer.address, 200);
    expect(await stakeManager.stakes(agent.address)).to.equal(300);
    expect(await token.balanceOf(employer.address)).to.equal(1200);
  });
});

