const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("JobRegistry deadline enforcement", function () {
  let owner, employer, agent;
  let token, stakeManager, validation, registry;
  const reward = 100;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC206Decimals");
    token = await Token.deploy();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      0,
      100,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stakeManager.connect(owner).setMinStake(0);

    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    validation = await Validation.deploy();

    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(
      await validation.getAddress(),
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      []
    );

    await validation.setJobRegistry(await registry.getAddress());
    await registry.connect(owner).setJobParameters(reward, 0);
    await registry.connect(owner).setMaxJobReward(1000);
    await registry.connect(owner).setMaxJobDuration(1000);
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).acknowledgeTaxPolicy();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();

    await token.mint(employer.address, 1000);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
  });

  it("rejects applications after the deadline", async () => {
    const deadline = (await time.latest()) + 1;
    await registry.connect(employer).createJob(reward, deadline, "uri");
    await time.increase(2);
    await expect(
      registry.connect(agent).applyForJob(1, "", [])
    ).to.be.revertedWith("deadline");
  });

  it("rejects submissions after the deadline", async () => {
    const deadline = (await time.latest()) + 100;
    await registry.connect(employer).createJob(reward, deadline, "uri");
    await registry.connect(agent).applyForJob(1, "", []);
    await time.increaseTo(deadline + 1);
    await expect(
      registry.connect(agent).submit(1, "res")
    ).to.be.revertedWith("deadline");
  });
});
