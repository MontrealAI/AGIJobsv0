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
      await expect(dispute.connect(owner).addModerator(other.address, 1))
        .to.emit(dispute, "ModeratorUpdated")
        .withArgs(other.address, 1);
      expect(await dispute.moderatorWeights(other.address)).to.equal(1n);
      await expect(dispute.connect(owner).removeModerator(other.address))
        .to.emit(dispute, "ModeratorUpdated")
        .withArgs(other.address, 0);
      expect(await dispute.moderatorWeights(other.address)).to.equal(0n);
    });
  });

  describe("dispute resolution", function () {
    let owner, employer, agent, outsider;
    let token, stakeManager, registry, dispute;
    const fee = 100n;
    const window = 10n;

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
        ethers.ZeroAddress,
        owner.address
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
        window,
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
        uriHash: ethers.ZeroHash,
        resultHash: ethers.ZeroHash,
      });
    });

    it("emits dispute raised and rejects second dispute", async () => {
      await expect(
        registry.connect(agent).dispute(1, "evidence")
      )
        .to.emit(dispute, "DisputeRaised")
        .withArgs(1, agent.address);
      await expect(
        registry.connect(agent).dispute(1, "more")
      ).to.be.revertedWith("disputed");
    });

    it("reverts when raiseDispute is called directly", async () => {
      await expect(
        dispute.connect(agent).raiseDispute(1, agent.address, "evidence")
      ).to.be.revertedWith("not registry");
    });

    it("reverts resolution attempted before window", async () => {
      await registry.connect(agent).dispute(1, "evidence");
      const hash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool"],
        [await dispute.getAddress(), 1, true]
      );
      const sig = await owner.signMessage(ethers.getBytes(hash));
      await expect(
        dispute.connect(owner).resolve(1, true, [sig])
      ).to.be.revertedWith("window");
    });

    it("transfers fee to employer when employer wins", async () => {
      const employerStart = await token.balanceOf(employer.address);
      await registry.connect(agent).dispute(1, "evidence");
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(fee);
      await time.increase(window);
      const hash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool"],
        [await dispute.getAddress(), 1, true]
      );
      const sig = await owner.signMessage(ethers.getBytes(hash));
      await expect(dispute.connect(owner).resolve(1, true, [sig]))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, owner.address, true);
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
      await time.increase(window);
      const hash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool"],
        [await dispute.getAddress(), 1, false]
      );
      const sig = await owner.signMessage(ethers.getBytes(hash));
      await expect(dispute.connect(owner).resolve(1, false, [sig]))
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, owner.address, false);
      expect(await token.balanceOf(agent.address)).to.equal(agentStart);
      expect(
        await token.balanceOf(await stakeManager.getAddress())
      ).to.equal(0);
    });

    it("prevents owner resolution without moderator approval", async () => {
      await dispute.connect(owner).addModerator(outsider.address, 1);
      await registry.connect(agent).dispute(1, "evidence");
      await time.increase(window);
      const hash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool"],
        [await dispute.getAddress(), 1, true]
      );
      const sig = await owner.signMessage(ethers.getBytes(hash));
      await expect(
        dispute.connect(owner).resolve(1, true, [sig])
      ).to.be.revertedWith("insufficient weight");
    });

    it("requires majority signatures for non-owner resolution", async () => {
      await registry.connect(agent).dispute(1, "evidence");
      await time.increase(window);
      await expect(
        dispute.connect(outsider).resolve(1, true, [])
      ).to.be.revertedWith("insufficient weight");

      const hash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "bool"],
        [await dispute.getAddress(), 1, true]
      );
      const sig = await owner.signMessage(ethers.getBytes(hash));
      await expect(
        dispute.connect(outsider).resolve(1, true, [sig])
      )
        .to.emit(dispute, "DisputeResolved")
        .withArgs(1, outsider.address, true);
    });
  });
});

