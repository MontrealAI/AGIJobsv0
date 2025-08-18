const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DisputeModule", function () {
  describe("owner controls", function () {
    let owner, other, registry, dispute, newRegistry;

    beforeEach(async () => {
      [owner, other] = await ethers.getSigners();
      const JobMock = await ethers.getContractFactory("MockJobRegistry");
      registry = await JobMock.deploy();
      await registry.waitForDeployment();
      const Dispute = await ethers.getContractFactory(
        "contracts/v2/modules/DisputeModule.sol:DisputeModule"
      );
      dispute = await Dispute.deploy(
        await registry.getAddress(),
        0,
        0,
        ethers.ZeroAddress
      );
      await dispute.waitForDeployment();
      newRegistry = await JobMock.deploy();
      await newRegistry.waitForDeployment();
    });

    it("allows owner to update job registry", async () => {
      await expect(
        dispute.connect(owner).setJobRegistry(await newRegistry.getAddress())
      )
        .to.emit(dispute, "JobRegistryUpdated")
        .withArgs(await newRegistry.getAddress());
      expect(await dispute.jobRegistry()).to.equal(
        await newRegistry.getAddress()
      );
    });

    it("restricts job registry update to owner", async () => {
      await expect(
        dispute.connect(other).setJobRegistry(await newRegistry.getAddress())
      )
        .to.be.revertedWithCustomError(dispute, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });
  });

  describe("dispute resolution", function () {
    let owner, employer, agent, outsider;
    let token, stakeManager, registry, dispute;
    const fee = 100n;

    beforeEach(async () => {
      [owner, employer, agent, outsider] = await ethers.getSigners();

      // deploy token and stake manager
      const Token = await ethers.getContractFactory("MockERC206Decimals");
      token = await Token.deploy();
      await token.waitForDeployment();

      const StakeManager = await ethers.getContractFactory(
        "contracts/v2/StakeManager.sol:StakeManager"
      );
      stakeManager = await StakeManager.deploy(
        await token.getAddress(),
        0,
        0,
        0,
        owner.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      await stakeManager.waitForDeployment();

      const JobMock = await ethers.getContractFactory("MockJobRegistry");
      registry = await JobMock.deploy();
      await registry.waitForDeployment();
      await registry.setStakeManager(await stakeManager.getAddress());
      await stakeManager
        .connect(owner)
        .setJobRegistry(await registry.getAddress());

      const Dispute = await ethers.getContractFactory(
        "contracts/v2/modules/DisputeModule.sol:DisputeModule"
      );
      dispute = await Dispute.deploy(
        await registry.getAddress(),
        fee,
        1,
        ethers.ZeroAddress
      );
      await dispute.waitForDeployment();

      await registry.setDisputeModule(await dispute.getAddress());
      await stakeManager
        .connect(owner)
        .setDisputeModule(await dispute.getAddress());

      // mint tokens and approve for dispute fee
      await token.mint(agent.address, fee);
      await token.mint(employer.address, fee);
      await token
        .connect(agent)
        .approve(await stakeManager.getAddress(), fee);
      await token
        .connect(employer)
        .approve(await stakeManager.getAddress(), fee);

      // initialise job in completed state
      await registry.setJob(1, {
        employer: employer.address,
        agent: agent.address,
        reward: 0,
        stake: 0,
        success: false,
        status: 4, // Completed
        uri: "",
        result: "",
      });
    });

    it("transfers fee to employer when employer wins", async () => {
      const employerStart = await token.balanceOf(employer.address);
      await registry.connect(agent).dispute(1, "evidence");
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(fee);
      await time.increase(1);
      await expect(dispute.connect(owner).resolveDispute(1, true))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, true);
      expect(await token.balanceOf(employer.address)).to.equal(
        employerStart + fee
      );
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(0);
    });

    it("refunds fee to agent when employer loses", async () => {
      const agentStart = await token.balanceOf(agent.address);
      await registry.connect(agent).dispute(1, "evidence");
      await time.increase(1);
      await expect(dispute.connect(owner).resolveDispute(1, false))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, false);
      expect(await token.balanceOf(agent.address)).to.equal(agentStart);
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(0);
    });

    it("rejects unauthorized resolve attempts", async () => {
      await registry.connect(agent).dispute(1, "evidence");
      await time.increase(1);
      await expect(
        dispute.connect(outsider).resolveDispute(1, true)
      ).to.be.revertedWith("not authorized");
    });
  });
});

