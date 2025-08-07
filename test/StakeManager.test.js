const { expect } = require("chai");
const { ethers } = require("hardhat");

const Role = { Agent: 0, Validator: 1 };

describe("StakeManager", function () {
  let token, stakeManager, owner, employer, agent, validator;

  beforeEach(async () => {
    [owner, employer, agent, validator] = await ethers.getSigners();
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
      owner.address
    );
    await stakeManager.connect(owner).setCaller(owner.address, true);
  });

  it("tracks stakes per role and supports locking and slashing", async () => {
    await token.connect(agent).approve(await stakeManager.getAddress(), 500);
    await stakeManager.connect(agent).depositStake(Role.Agent, 500);
    await token.connect(validator).approve(await stakeManager.getAddress(), 400);
    await stakeManager.connect(validator).depositStake(Role.Validator, 400);

    expect(await stakeManager.agentStakes(agent.address)).to.equal(500);
    expect(await stakeManager.validatorStakes(validator.address)).to.equal(400);

    await stakeManager
      .connect(owner)
      .lockStake(agent.address, Role.Agent, 200);
    await stakeManager
      .connect(owner)
      .lockStake(validator.address, Role.Validator, 100);

    expect(await stakeManager.lockedAgentStakes(agent.address)).to.equal(200);
    expect(await stakeManager.lockedValidatorStakes(validator.address)).to.equal(100);

    await expect(
      stakeManager.connect(agent).withdrawStake(Role.Agent, 400)
    ).to.be.revertedWith("insufficient stake");
    await stakeManager.connect(agent).withdrawStake(Role.Agent, 300);
    expect(await stakeManager.agentStakes(agent.address)).to.equal(200);

    await stakeManager
      .connect(owner)
      .slashStake(agent.address, Role.Agent, 100, employer.address);
    expect(await stakeManager.agentStakes(agent.address)).to.equal(100);
    expect(await stakeManager.lockedAgentStakes(agent.address)).to.equal(100);
    expect(await token.balanceOf(employer.address)).to.equal(1100);
  });

  it("restricts stake operations to authorized callers", async () => {
    await token.connect(agent).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(agent).depositStake(Role.Agent, 100);
    await expect(
      stakeManager.connect(agent).lockStake(agent.address, Role.Agent, 50)
    ).to.be.revertedWith("not authorized");
  });
});

