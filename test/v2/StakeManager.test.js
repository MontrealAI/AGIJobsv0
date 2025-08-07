const { expect } = require("chai");
const { ethers } = require("hardhat");

const Role = { Agent: 0, Validator: 1 };

describe("StakeManager", function () {
  let token, stakeManager, owner, treasury, employer, agent, validator;

  beforeEach(async () => {
    [owner, treasury, employer, agent, validator] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    await token.mint(agent.address, 1000);
    await token.mint(validator.address, 1000);
    await token.mint(employer.address, 1000);
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      treasury.address,
      owner.address
    );
  });

  it("tracks stakes per role and supports locking and slashing", async () => {
    await token.connect(agent).approve(await stakeManager.getAddress(), 500);
    await stakeManager.connect(agent).depositStake(Role.Agent, 500);
    await token.connect(validator).approve(await stakeManager.getAddress(), 400);
    await stakeManager.connect(validator).depositStake(Role.Validator, 400);

    expect(await stakeManager.stakeOf(agent.address, Role.Agent)).to.equal(500n);
    expect(await stakeManager.stakeOf(validator.address, Role.Validator)).to.equal(
      400n
    );

    await stakeManager
      .connect(owner)
      .lockStake(agent.address, Role.Agent, 1000);
    await stakeManager
      .connect(owner)
      .lockStake(validator.address, Role.Validator, 1000);

    expect(await stakeManager.lockedStakeOf(agent.address, Role.Agent)).to.equal(
      200n
    );
    expect(
      await stakeManager.lockedStakeOf(validator.address, Role.Validator)
    ).to.equal(100n);

    await expect(
      stakeManager.connect(agent).withdrawStake(Role.Agent, 400)
    ).to.be.revertedWith("insufficient stake");
    await stakeManager.connect(agent).withdrawStake(Role.Agent, 300);
    expect(await stakeManager.stakeOf(agent.address, Role.Agent)).to.equal(200n);

    await stakeManager
      .connect(owner)
      .slash(agent.address, Role.Agent, 1000, employer.address);
    expect(await stakeManager.stakeOf(agent.address, Role.Agent)).to.equal(100n);
    expect(await stakeManager.lockedStakeOf(agent.address, Role.Agent)).to.equal(
      0n
    );
    expect(await token.balanceOf(employer.address)).to.equal(1050n);
    expect(await token.balanceOf(treasury.address)).to.equal(50n);
  });

  it("restricts parameter updates to owner", async () => {
    await expect(
      stakeManager.connect(agent).setStakeParameters(30, 20, 60, 40)
    ).to.be.revertedWithCustomError(
      stakeManager,
      "OwnableUnauthorizedAccount"
    );
    await stakeManager.connect(owner).setStakeParameters(30, 20, 60, 40);
    expect(await stakeManager.agentStakePercentage()).to.equal(30n);
    expect(await stakeManager.validatorStakePercentage()).to.equal(20n);
    expect(await stakeManager.agentSlashingPercentage()).to.equal(60n);
    expect(await stakeManager.validatorSlashingPercentage()).to.equal(40n);

    const Token2 = await ethers.getContractFactory("MockERC20");
    const token2 = await Token2.deploy();
    await expect(
      stakeManager.connect(agent).setToken(await token2.getAddress())
    ).to.be.revertedWithCustomError(
      stakeManager,
      "OwnableUnauthorizedAccount"
    );
    await stakeManager.connect(owner).setToken(await token2.getAddress());
    expect(await stakeManager.token()).to.equal(await token2.getAddress());
  });
});


