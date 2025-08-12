const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingRouter", function () {
  let token, registry, router, owner, operator;
  const cooldown = 100; // seconds

  beforeEach(async () => {
    [owner, operator] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy("AGI", "AGI", ethers.parseUnits("1000", 6));
    await token.waitForDeployment();

    const Registry = await ethers.getContractFactory("OperatorRegistry");
    registry = await Registry.deploy(owner.address);
    await registry.waitForDeployment();

    const Router = await ethers.getContractFactory("StakingRouter");
    router = await Router.deploy(token.target, registry.target, cooldown, owner.address);
    await router.waitForDeployment();
    await registry.setStakingRouter(router.target);

    await token.transfer(operator.address, ethers.parseUnits("100", 6));
  });

  it("allows staking and weight calculation", async () => {
    const stakeAmount = ethers.parseUnits("10", 6);
    await registry.setOperatorReputation(operator.address, 2);

    await token.connect(operator).approve(router.target, stakeAmount);
    await router.connect(operator).stake(stakeAmount);

    expect(await router.stakes(operator.address)).to.equal(stakeAmount);
    const weight = await router.weightOf(operator.address);
    expect(weight).to.equal(stakeAmount * 2n);
  });

  it("allows owner to activate operator", async () => {
    await registry.setOperatorStatus(operator.address, true);
    const info = await registry.getOperator(operator.address);
    expect(info.active).to.equal(true);
  });

  it("reverts when owner stakes", async () => {
    const stakeAmount = ethers.parseUnits("1", 6);
    await token.approve(router.target, stakeAmount);
    await expect(router.stake(stakeAmount)).to.be.revertedWithCustomError(
      router,
      "OwnerCannotStake"
    );
  });
});

