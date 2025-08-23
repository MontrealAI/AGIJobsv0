const { expect } = require("chai");

describe("DisputeModule core", function () {
  let owner, other, registry, stakeManager, dispute;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

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

  it("emits ModeratorUpdated on setModerator", async function () {
    await expect(dispute.setModerator(other.address))
      .to.emit(dispute, "ModeratorUpdated")
      .withArgs(other.address);
    expect(await dispute.moderator()).to.equal(other.address);
  });

  it("reverts when moderator is zero address", async function () {
    await expect(dispute.setModerator(ethers.ZeroAddress)).to.be.revertedWith(
      "moderator"
    );
  });
});
