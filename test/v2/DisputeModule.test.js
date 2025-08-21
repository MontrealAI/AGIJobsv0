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

    it("allows owner to add and remove moderators", async () => {
      await expect(dispute.connect(owner).addModerator(other.address))
        .to.emit(dispute, "ModeratorUpdated")
        .withArgs(other.address, true);
      expect(await dispute.moderators(other.address)).to.equal(true);
      await expect(dispute.connect(owner).removeModerator(other.address))
        .to.emit(dispute, "ModeratorUpdated")
        .withArgs(other.address, false);
      expect(await dispute.moderators(other.address)).to.equal(false);
    });
  });

  describe("dispute resolution", function () {
    let owner, employer, agent, outsider;
    let token, stakeManager, registry, dispute;
    const fee = 100n;
    const stakeAmount = 500n;

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
      await registry.acknowledge(agent.address);

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

      // mint tokens and approve for dispute fee and stake
      await token.mint(agent.address, fee + stakeAmount);
      await token.mint(employer.address, fee);
      await token
        .connect(agent)
        .approve(await stakeManager.getAddress(), fee + stakeAmount);
      await token
        .connect(employer)
        .approve(await stakeManager.getAddress(), fee);
      await stakeManager
        .connect(agent)
        .depositStake(0, stakeAmount);

      // initialise job in completed state
      await registry.setJob(1, {
        employer: employer.address,
        agent: agent.address,
        reward: 0,
        stake: stakeAmount,
        success: false,
        status: 4, // Completed
        uri: "",
        result: "",
      });
    });

    it("stores evidence and slashes stake when employer wins", async () => {
      await registry.connect(agent).dispute(1, "evidence");
      const stored = await dispute.disputes(1);
      expect(stored.evidence).to.equal("evidence");
      const employerStart = await token.balanceOf(employer.address);
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(fee);
      await time.increase(1);
      await expect(dispute.connect(owner).resolve(1, true))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, owner.address, true);
      expect(await token.balanceOf(employer.address)).to.equal(
        employerStart + fee
      );
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(0);
      expect(
        await stakeManager.stakeOf(agent.address, 0)
      ).to.equal(0);
    });

    it("refunds fee to agent when employer loses", async () => {
      const agentStart = await token.balanceOf(agent.address);
      await registry.connect(agent).dispute(1, "evidence");
      await time.increase(1);
      await expect(dispute.connect(owner).resolve(1, false))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, owner.address, false);
      expect(await token.balanceOf(agent.address)).to.equal(agentStart);
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(0);
      expect(
        await stakeManager.stakeOf(agent.address, 0)
      ).to.equal(stakeAmount);
    });

    it("rejects unauthorized resolve attempts", async () => {
      await registry.connect(agent).dispute(1, "evidence");
      await time.increase(1);
      await expect(
        dispute.connect(outsider).resolve(1, true)
      ).to.be.revertedWith("not authorized");
    });
  });
});

