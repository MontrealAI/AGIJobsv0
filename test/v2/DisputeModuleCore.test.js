const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule core", function () {
  let owner, other, employer, agent;
  let registry, stakeManager, dispute;

  beforeEach(async function () {
    [owner, other, employer, agent] = await ethers.getSigners();

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
  });

  it("allows owner to add and remove moderators", async function () {
    await expect(dispute.addModerator(other.address))
      .to.emit(dispute, "ModeratorUpdated")
      .withArgs(other.address, true);
    expect(await dispute.moderators(other.address)).to.equal(true);
    await expect(dispute.removeModerator(other.address))
      .to.emit(dispute, "ModeratorUpdated")
      .withArgs(other.address, false);
    expect(await dispute.moderators(other.address)).to.equal(false);
  });

  it("requires quorum signatures to resolve", async function () {
    await dispute.addModerator(other.address);
    await registry.setJob(1, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 5,
      uri: "",
      result: "",
    });
    await dispute.connect(agent).raiseDispute(1);

    const hash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bool"],
      [await dispute.getAddress(), 1, true]
    );
    const sigOwner = await owner.signMessage(ethers.getBytes(hash));
    const sigOther = await other.signMessage(ethers.getBytes(hash));

    await expect(
      dispute.connect(owner).resolve(1, true, [sigOwner])
    ).to.be.revertedWith("insufficient approvals");

    await expect(
      dispute.connect(owner).resolve(1, true, [sigOwner, sigOther])
    )
      .to.emit(dispute, "DisputeResolved")
      .withArgs(1, owner.address, true);
  });
});
