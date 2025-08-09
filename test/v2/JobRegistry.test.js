const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry integration", function () {
  let token, stakeManager, rep, validation, nft, registry, dispute;
  let owner, employer, agent, policy;

  const reward = 100;
  const stake = 200;
  const appealFee = 10;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    const StakeManager = await ethers.getContractFactory(
      "contracts/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(await token.getAddress(), owner.address);
    const Validation = await ethers.getContractFactory(
      "contracts/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(owner.address);
    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    rep = await Rep.deploy(owner.address);
    const NFT = await ethers.getContractFactory(
      "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
    );
    nft = await NFT.deploy("Cert", "CERT", owner.address);
    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(owner.address);
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(await registry.getAddress(), owner.address);
    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await Policy.deploy(owner.address, "ipfs://policy", "ack");

    await registry
      .connect(owner)
      .setModules(
        await validation.getAddress(),
        await stakeManager.getAddress(),
        await rep.getAddress(),
        await dispute.getAddress(),
        await nft.getAddress()
      );
    await registry
      .connect(owner)
      .setJobParameters(reward, stake);
    await dispute.connect(owner).setAppealFee(appealFee);
    await nft.connect(owner).setJobRegistry(await registry.getAddress());
    await rep.connect(owner).setCaller(await registry.getAddress(), true);
    await rep.connect(owner).setThreshold(1);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await stakeManager.connect(owner).transferOwnership(await registry.getAddress());
    await nft.connect(owner).transferOwnership(await registry.getAddress());
    await registry
      .connect(owner)
      .setTaxPolicy(await policy.getAddress());
    await registry.connect(owner).acknowledgeTaxPolicy();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();

    await token.mint(employer.address, 1000);
    await token.mint(agent.address, 1000);

    await token.connect(agent).approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(agent).depositStake(stake);
  });

  it("runs successful job lifecycle", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await expect(registry.connect(employer).createJob())
      .to.emit(registry, "JobCreated")
      .withArgs(1, employer.address, ethers.ZeroAddress, reward, stake);
    const jobId = 1;
    await expect(registry.connect(agent).applyForJob(jobId))
      .to.emit(registry, "AgentApplied")
      .withArgs(jobId, agent.address);
    await validation.connect(owner).setOutcome(jobId, true);
    await expect(registry.connect(agent).completeJob(jobId))
      .to.emit(registry, "JobCompleted")
      .withArgs(jobId, true);
    await expect(registry.connect(employer).finalize(jobId))
      .to.emit(registry, "JobFinalized")
      .withArgs(jobId, true);

    expect(await token.balanceOf(agent.address)).to.equal(1100);
    expect(await rep.reputation(agent.address)).to.equal(1);
    expect(await rep.isBlacklisted(agent.address)).to.equal(false);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("handles collusion resolved by dispute", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob();
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setOutcome(jobId, false); // colluding validator
    await registry.connect(agent).completeJob(jobId);
    await expect(
      registry.connect(agent).dispute(jobId, { value: appealFee })
    )
      .to.emit(registry, "DisputeRaised")
      .withArgs(jobId, agent.address);
    await expect(dispute.connect(owner).resolve(jobId, false))
      .to.emit(registry, "JobFinalized")
      .withArgs(jobId, true);

    expect(await token.balanceOf(agent.address)).to.equal(1100);
    expect(await rep.reputation(agent.address)).to.equal(1);
    expect(await rep.isBlacklisted(agent.address)).to.equal(false);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("slashes stake when dispute fails", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob();
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setOutcome(jobId, false);
    await registry.connect(agent).completeJob(jobId);
    await expect(
      registry.connect(agent).dispute(jobId, { value: appealFee })
    )
      .to.emit(registry, "DisputeRaised")
      .withArgs(jobId, agent.address);
    await expect(dispute.connect(owner).resolve(jobId, true))
      .to.emit(registry, "JobFinalized")
      .withArgs(jobId, false);

    expect(await token.balanceOf(agent.address)).to.equal(800);
    expect(await token.balanceOf(employer.address)).to.equal(1200);
    expect(await rep.reputation(agent.address)).to.equal(0);
    expect(await rep.isBlacklisted(agent.address)).to.equal(true);
    expect(await nft.balanceOf(agent.address)).to.equal(0);
  });

  it("allows employer to cancel before completion", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob();
    const jobId = 1;
    await expect(registry.connect(employer).cancelJob(jobId))
      .to.emit(registry, "JobCancelled")
      .withArgs(jobId);
    const job = await registry.jobs(jobId);
    expect(job.state).to.equal(6); // Cancelled enum value
    expect(await token.balanceOf(employer.address)).to.equal(1000);
  });

  it("enforces owner-only controls", async () => {
    await expect(
      registry
        .connect(employer)
        .setModules(
          await validation.getAddress(),
          await stakeManager.getAddress(),
          await rep.getAddress(),
          await dispute.getAddress(),
          await nft.getAddress()
        )
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

    await expect(
      registry.connect(agent).setJobParameters(1, 1)
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

    await expect(
      dispute.connect(agent).setAppealFee(1)
    ).to.be.revertedWithCustomError(dispute, "OwnableUnauthorizedAccount");
  });

  it("emits events when setting modules", async () => {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await validation.getAddress(),
          await stakeManager.getAddress(),
          await rep.getAddress(),
          await dispute.getAddress(),
          await nft.getAddress()
        )
    )
      .to.emit(registry, "ValidationModuleUpdated")
      .withArgs(await validation.getAddress())
      .and.to.emit(registry, "StakeManagerUpdated")
      .withArgs(await stakeManager.getAddress())
      .and.to.emit(registry, "ReputationEngineUpdated")
      .withArgs(await rep.getAddress())
      .and.to.emit(registry, "DisputeModuleUpdated")
      .withArgs(await dispute.getAddress())
      .and.to.emit(registry, "CertificateNFTUpdated")
      .withArgs(await nft.getAddress());
  });
});

