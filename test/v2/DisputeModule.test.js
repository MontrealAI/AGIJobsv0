const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule", function () {
  let token, stakeManager, dispute, jobRegistry, owner, employer, agent;
  const appealFee = 10n;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    await token.mint(agent.address, 1000);
    await token.mint(employer.address, 1000);

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    jobRegistry = await JobMock.deploy();
    await jobRegistry.waitForDeployment();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      0,
      0,
      0,
      owner.address,
      await jobRegistry.getAddress(),
      ethers.ZeroAddress
    );
    await jobRegistry.setStakeManager(await stakeManager.getAddress());

    const Dispute = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(await jobRegistry.getAddress());
    await dispute.setAppealFee(appealFee);
    await stakeManager.setDisputeModule(await dispute.getAddress());
  });

  async function raise(jobId) {
    await jobRegistry.setJob(jobId, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 0,
      uri: ""
    });
    await jobRegistry.connect(agent).acknowledgeTaxPolicy();
    await token.connect(agent).approve(
      await stakeManager.getAddress(),
      appealFee
    );
    await dispute.connect(agent).raiseDispute(jobId, "evidence");
  }

  async function ensureOutcome(jobId, employerWinsDesired) {
    while (true) {
      const block = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      const employerWins =
        (BigInt(block.hash) ^ BigInt(jobId)) % 2n === 0n;
      if (employerWins === employerWinsDesired) break;
      await ethers.provider.send("evm_mine", []);
    }
  }

  it("pays bond to employer when moderator rules for them", async () => {
    const jobId = 1;
    await raise(jobId);
    await ensureOutcome(jobId, true);
    expect(await dispute.bonds(jobId)).to.equal(appealFee);
    const before = await token.balanceOf(employer.address);
    await dispute.connect(owner).resolveDispute(jobId);
    const after = await token.balanceOf(employer.address);
    expect(after - before).to.equal(appealFee);
  });

  it("returns bond to agent when jury rejects employer claim", async () => {
    const jobId = 2;
    await raise(jobId);
    await ensureOutcome(jobId, false);
    expect(await dispute.bonds(jobId)).to.equal(appealFee);
    const before = await token.balanceOf(agent.address);
    await dispute.connect(owner).resolveDispute(jobId);
    const after = await token.balanceOf(agent.address);
    expect(after - before).to.equal(appealFee);
  });

  it("reverts when appellant has not acknowledged", async () => {
    const jobId = 3;
    await jobRegistry.setTaxPolicyVersion(1);
    await jobRegistry.setJob(jobId, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 0,
      uri: "",
    });
    await token.connect(agent).approve(
      await stakeManager.getAddress(),
      appealFee
    );
    await expect(
      dispute.connect(agent).raiseDispute(jobId, "evidence")
    ).to.be.revertedWith("acknowledge tax policy");
  });

  it("restricts parameter updates to the owner", async () => {
    await expect(dispute.connect(owner).setAppealFee(20n))
      .to.emit(dispute, "AppealFeeUpdated")
      .withArgs(20n);
    await expect(dispute.connect(owner).setModerator(employer.address))
      .to.emit(dispute, "ModeratorUpdated")
      .withArgs(employer.address);
    await expect(dispute.connect(employer).setAppealFee(30n))
      .to.be.revertedWithCustomError(dispute, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);
  });
});
