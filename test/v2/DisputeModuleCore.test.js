const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule core", function () {
  let owner, mod1, mod2, employer, agent, outsider;
  let registry, stakeManager, dispute;

  beforeEach(async function () {
    [owner, mod1, mod2, employer, agent, outsider] = await ethers.getSigners();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    registry = await JobMock.deploy();
    await registry.waitForDeployment();

    const StakeMock = await ethers.getContractFactory("MockStakeManager");
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();

    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      await stakeManager.getAddress(),
      owner.address,
      0
    );
    await dispute.waitForDeployment();
    await registry.setDisputeModule(await dispute.getAddress());
  });

  describe("moderator management", function () {
    it("allows owner to add and remove moderators", async function () {
      await expect(dispute.addModerator(mod1.address))
        .to.emit(dispute, "ModeratorAdded")
        .withArgs(mod1.address);
      expect(await dispute.moderators(mod1.address)).to.equal(true);
      await expect(dispute.removeModerator(mod1.address))
        .to.emit(dispute, "ModeratorRemoved")
        .withArgs(mod1.address);
      expect(await dispute.moderators(mod1.address)).to.equal(false);
    });

    it("reverts on zero address moderator", async function () {
      await expect(dispute.addModerator(ethers.ZeroAddress)).to.be.revertedWith(
        "moderator"
      );
    });
  });

  describe("voting resolution", function () {
    beforeEach(async function () {
      await dispute.addModerator(mod1.address);
      await dispute.addModerator(mod2.address);
      await registry.setJob(1, {
        employer: employer.address,
        agent: agent.address,
        reward: 0,
        stake: 0,
        success: false,
        status: 4,
        uriHash: ethers.ZeroHash,
        resultHash: ethers.ZeroHash,
      });
    });

    it("finalises after majority vote", async function () {
      await registry.connect(agent).dispute(1, "evidence");
      await dispute.connect(mod1).resolve(1, true);
      let info = await dispute.disputes(1);
      expect(info.resolved).to.equal(false);
      await expect(dispute.connect(mod2).resolve(1, true))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, true);
      info = await dispute.disputes(1);
      expect(info.claimant).to.equal(ethers.ZeroAddress);
    });

    it("prevents non-moderators from voting", async function () {
      await registry.connect(agent).dispute(1, "evidence");
      await expect(
        dispute.connect(outsider).resolve(1, true)
      ).to.be.revertedWith("not moderator");
    });

    it("prevents double voting", async function () {
      await registry.connect(agent).dispute(1, "evidence");
      await dispute.connect(mod1).resolve(1, true);
      await expect(dispute.connect(mod1).resolve(1, true)).to.be.revertedWith(
        "voted"
      );
    });

    it("allows arbitrator to resolve directly", async function () {
      await dispute.setArbitrator(outsider.address);
      await registry.connect(agent).dispute(1, "evidence");
      await expect(dispute.connect(outsider).resolve(1, true))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, true);
    });
  });
});

