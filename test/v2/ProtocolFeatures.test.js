const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Protocol core features", function () {
  let owner, user, operator1, operator2, payer, employer, agent;

  beforeEach(async () => {
    [owner, user, operator1, operator2, payer, employer, agent] =
      await ethers.getSigners();
  });

  it("allows staking and slashing via StakeManager", async () => {
    const Token = await ethers.getContractFactory(
      "contracts/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy(
      "AGI",
      "AGI",
      ethers.parseUnits("1000", 6)
    );
    const StakeManager = await ethers.getContractFactory(
      "contracts/StakeManager.sol:StakeManager"
    );
    const manager = await StakeManager.deploy();
    await manager.setToken(token.target);
    await manager.setSlashingPercentage(1, 100);
    await token.transfer(user.address, ethers.parseUnits("100", 6));
    await manager.connect(user).acknowledgeTaxPolicy();
    await token
      .connect(user)
      .approve(manager.target, ethers.parseUnits("50", 6));
    await manager.connect(user).depositStake(1, ethers.parseUnits("50", 6));
    expect(await manager.stakes(user.address, 1)).to.equal(
      ethers.parseUnits("50", 6)
    );
    const ownerBalBefore = await token.balanceOf(owner.address);
    await manager.connect(owner).slash(user.address, 1, 50);
    expect(await manager.stakes(user.address, 1)).to.equal(
      ethers.parseUnits("25", 6)
    );
    const ownerBalAfter = await token.balanceOf(owner.address);
    expect(ownerBalAfter - ownerBalBefore).to.equal(
      ethers.parseUnits("25", 6)
    );
  });

  it("prioritizes operators with higher stake and reputation", async () => {
    const Token = await ethers.getContractFactory(
      "contracts/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy(
      "AGI",
      "AGI",
      ethers.parseUnits("1000", 6)
    );
    const Registry = await ethers.getContractFactory("OperatorRegistry");
    const registry = await Registry.deploy();
    const Router = await ethers.getContractFactory("StakingRouter");
    const router = await Router.deploy(
      token.target,
      registry.target,
      0,
      owner.address
    );
    await registry.setStakingRouter(router.target);
    await token.transfer(operator1.address, ethers.parseUnits("100", 6));
    await token.transfer(operator2.address, ethers.parseUnits("100", 6));
    await registry.setOperatorReputation(operator1.address, 1);
    await registry.setOperatorReputation(operator2.address, 3);
    await token
      .connect(operator1)
      .approve(router.target, ethers.parseUnits("50", 6));
    await router.connect(operator1).stake(ethers.parseUnits("50", 6));
    await token
      .connect(operator2)
      .approve(router.target, ethers.parseUnits("100", 6));
    await router.connect(operator2).stake(ethers.parseUnits("100", 6));
    const w1 = await router.weightOf(operator1.address);
    const w2 = await router.weightOf(operator2.address);
    expect(w1).to.equal(ethers.parseUnits("50", 6) * 1n);
    expect(w2).to.equal(ethers.parseUnits("100", 6) * 3n);
    expect(w2).to.be.gt(w1);
  });

  it("distributes fees proportional to stake", async () => {
    const Stake = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockStakeManager"
    );
    const stakeManager = await Stake.deploy();
    const Distributor = await ethers.getContractFactory(
      "contracts/v2/modules/RevenueDistributor.sol:RevenueDistributor"
    );
    const distributor = await Distributor.deploy(
      stakeManager.target
    );
    await stakeManager.setStake(operator1.address, 2, 100);
    await stakeManager.setStake(operator2.address, 2, 300);
    await distributor.connect(operator1).register();
    await distributor.connect(operator2).register();
    const amount = ethers.parseEther("4");
    const b1 = await ethers.provider.getBalance(operator1.address);
    const b2 = await ethers.provider.getBalance(operator2.address);
    await distributor.connect(payer).distribute({ value: amount });
    const a1 = await ethers.provider.getBalance(operator1.address);
    const a2 = await ethers.provider.getBalance(operator2.address);
    expect(a1 - b1).to.equal(ethers.parseEther("1"));
    expect(a2 - b2).to.equal(ethers.parseEther("3"));
  });

  it("processes dispute appeals and clears bonds", async () => {
    const Stake = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockStakeManager"
    );
    const stakeManager = await Stake.deploy();
    const Registry = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockJobRegistry"
    );
    const registry = await Registry.deploy();
    await registry.setStakeManager(stakeManager.target);
    await registry.setTaxPolicyVersion(1);
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    const dispute = await Dispute.deploy(registry.target);
    await dispute.connect(owner).setAppealFee(5);
    await dispute.connect(owner).setDisputeWindow(0);
    const jobId = 1;
    await registry.setJob(jobId, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 0,
      uri: ""
    });
    const tx = await dispute
      .connect(employer)
      .raiseDispute(jobId, "evidence");
    const rcpt = await tx.wait();
    expect(await dispute.bonds(jobId)).to.equal(5);
    const block = await ethers.provider.getBlock(rcpt.blockNumber);
    const expected = (BigInt(block.hash) ^ BigInt(jobId)) % 2n === 0n;
    await expect(dispute.connect(owner).resolveDispute(jobId))
      .to.emit(dispute, "DisputeResolved")
      .withArgs(jobId, expected);
    expect(await dispute.bonds(jobId)).to.equal(0);
  });
});

