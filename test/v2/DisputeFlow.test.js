const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Dispute flow", function () {
  let owner, employer, agent, moderator;
  let token, stakeManager, registry, dispute;
  const disputeFee = 5;

  beforeEach(async () => {
    [owner, employer, agent, moderator] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC206Decimals");
    token = await Token.deploy();

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await Stake.deploy(
      await token.getAddress(),
      0,
      100,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stakeManager.connect(owner).setMinStake(0);
    await stakeManager.connect(owner).setSlashingPercentages(100, 0);

    const Registry = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockJobRegistry"
    );
    registry = await Registry.deploy();
    await registry.setStakeManager(await stakeManager.getAddress());
    await stakeManager.connect(owner).setJobRegistry(await registry.getAddress());

    const Dispute = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress
    );
    await dispute.connect(owner).setDisputeFee(disputeFee);
    await dispute.connect(owner).setModerator(moderator.address);
    await dispute.connect(owner).setDisputeWindow(0);
    await registry.setDisputeModule(dispute.target);
    await stakeManager.connect(owner).setDisputeModule(dispute.target);

    await registry.setTaxPolicyVersion(1);
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.setMaxJobReward(1_000_000);
    await registry.setMaxJobDuration(86_400);
    await registry.setJobParameters(0, 0);

    await token.mint(agent.address, 1000);
    await token.connect(agent).approve(await stakeManager.getAddress(), disputeFee);
  });

  async function startJob() {
    const deadline = (await time.latest()) + 1000;
    await registry.connect(employer).createJob(0, deadline, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, "", []);
    return jobId;
  }

  it("pays dispute fee to employer when employer wins", async () => {
    const jobId = await startJob();
    await expect(registry.connect(agent).raiseDispute(jobId, "evidence"))
      .to.emit(stakeManager, "DisputeFeeLocked")
      .withArgs(agent.address, disputeFee);
    await expect(dispute.connect(moderator).resolveDispute(jobId, true))
      .to.emit(stakeManager, "DisputeFeePaid")
      .withArgs(employer.address, disputeFee)
      .and.to.emit(dispute, "DisputeResolved")
      .withArgs(jobId, true);
  });

  it("returns dispute fee to agent when agent wins", async () => {
    const jobId = await startJob();
    await registry.connect(agent).raiseDispute(jobId, "evidence");
    await expect(dispute.connect(moderator).resolveDispute(jobId, false))
      .to.emit(stakeManager, "DisputeFeePaid")
      .withArgs(agent.address, disputeFee)
      .and.to.emit(dispute, "DisputeResolved")
      .withArgs(jobId, false);
  });
});

