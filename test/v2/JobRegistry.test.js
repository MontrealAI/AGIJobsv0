const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry integration", function () {
  let token, stakeManager, rep, validation, nft, registry, dispute, policy;
  let owner, employer, agent, treasury;

  const reward = 100;
  const stake = 200;
  const appealFee = 10;

  beforeEach(async () => {
    [owner, employer, agent, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      0,
      100,
      0,
      treasury.address
    );
    await stakeManager.connect(owner).setSlashingPercentages(100, 0);
    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    validation = await Validation.deploy();
    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    rep = await Rep.deploy();
    const NFT = await ethers.getContractFactory(
      "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
    );
    nft = await NFT.deploy("Cert", "CERT");
    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0
    );
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      appealFee,
      owner.address,
      owner.address
    );
    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await Policy.deploy("ipfs://policy", "ack");

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
    await nft.connect(owner).setJobRegistry(await registry.getAddress());
    await rep.connect(owner).setCaller(await registry.getAddress(), true);
    await rep.connect(owner).setThreshold(1);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
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
    await stakeManager.connect(agent).depositStake(0, stake);
  });

  it("runs successful job lifecycle", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await expect(registry.connect(employer).createJob(reward, "uri"))
      .to.emit(registry, "JobCreated")
      .withArgs(1, employer.address, ethers.ZeroAddress, reward, stake);
    const jobId = 1;
    await expect(registry.connect(agent).applyForJob(jobId))
      .to.emit(registry, "AgentApplied")
      .withArgs(jobId, agent.address);
    await validation.connect(owner).setResult(true);
    await expect(registry.connect(agent).completeJob(jobId))
      .to.emit(registry, "JobCompleted")
      .withArgs(jobId, true);
    await expect(registry.connect(employer).finalize(jobId))
      .to.emit(registry, "JobFinalized")
      .withArgs(jobId, true);

    expect(await token.balanceOf(agent.address)).to.equal(900);
    expect(await rep.reputation(agent.address)).to.equal(1);
    expect(await rep.isBlacklisted(agent.address)).to.equal(false);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("distributes platform fee to stakers", async () => {
    // set up fee pool rewarding platform stakers
    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    const feePool = await FeePool.deploy(
      await token.getAddress(),
      await stakeManager.getAddress(),
      2,
      0,
      treasury.address
    );
    await registry.connect(owner).setFeePool(await feePool.getAddress());
    await registry.connect(owner).setFeePct(10); // 10%
    await token.mint(owner.address, reward);
    await token
      .connect(owner)
      .approve(await stakeManager.getAddress(), reward);
    await stakeManager
      .connect(owner)
      .depositStake(2, reward); // owner is platform operator

    // employer locks reward + fee
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + reward / 10);
    await registry.connect(employer).createJob(reward, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setResult(true);
    await registry.connect(agent).completeJob(jobId);
    await registry.connect(employer).finalize(jobId);

    // platform operator should be able to claim fee
    const before = await token.balanceOf(owner.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(owner).claimRewards();
    const after = await token.balanceOf(owner.address);
    expect(after - before).to.equal(BigInt(reward / 10));
  });

  it("handles collusion resolved by dispute", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob(reward, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setResult(false); // colluding validator
    await registry.connect(agent).completeJob(jobId);
    await expect(
      registry.connect(agent).dispute(jobId, { value: appealFee })
    )
      .to.emit(registry, "JobDisputed")
      .withArgs(jobId, agent.address);
    await expect(dispute.connect(owner).resolve(jobId, false))
      .to.emit(registry, "JobFinalized")
      .withArgs(jobId, true);

    expect(await token.balanceOf(agent.address)).to.equal(900);
    expect(await rep.reputation(agent.address)).to.equal(1);
    expect(await rep.isBlacklisted(agent.address)).to.equal(false);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("slashes stake when dispute fails", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob(reward, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setResult(false);
    await registry.connect(agent).completeJob(jobId);
    await expect(
      registry.connect(agent).dispute(jobId, { value: appealFee })
    )
      .to.emit(registry, "JobDisputed")
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
    await registry.connect(employer).createJob(reward, "uri");
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

