const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry integration", function () {
  let token, stakeManager, rep, validation, nft, registry, dispute;
  let owner, employer, agent;

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
    const Rep = await ethers.getContractFactory("ReputationEngine");
    rep = await Rep.deploy(owner.address);
    const NFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
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

    await registry
      .connect(owner)
      .setModules(
        await validation.getAddress(),
        await stakeManager.getAddress(),
        await rep.getAddress(),
        await dispute.getAddress(),
        await nft.getAddress()
      );
    await dispute.connect(owner).setAppealParameters(appealFee, 0);
    await nft.connect(owner).setJobRegistry(await registry.getAddress());
    await rep.connect(owner).setCaller(await registry.getAddress(), true);
    await rep.connect(owner).setPenaltyThreshold(1);
    await stakeManager.connect(owner).transferOwnership(await registry.getAddress());
    await nft.connect(owner).transferOwnership(await registry.getAddress());

    await token.mint(employer.address, 1000);
    await token.mint(agent.address, 1000);

    await token.connect(agent).approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(agent).depositStake(stake);
  });

  it("runs successful job lifecycle", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob(reward);
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setOutcome(jobId, true);
    await registry.connect(agent).completeJob(jobId);
    await registry.finalize(jobId);

    expect(await token.balanceOf(agent.address)).to.equal(1100);
    expect(await rep.reputationOf(agent.address)).to.equal(1);
    expect(await rep.penaltyCount(agent.address)).to.equal(0);
    expect(await rep.isBlacklisted(agent.address)).to.equal(false);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("handles collusion resolved by dispute", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob(reward);
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setOutcome(jobId, false); // colluding validator
    await registry.connect(agent).completeJob(jobId);
    await registry.connect(agent).dispute(jobId, { value: appealFee });
    await dispute.connect(owner).resolve(jobId, false);
    await registry.finalize(jobId);

    expect(await token.balanceOf(agent.address)).to.equal(1100);
    expect(await rep.reputationOf(agent.address)).to.equal(1);
    expect(await rep.penaltyCount(agent.address)).to.equal(0);
    expect(await rep.isBlacklisted(agent.address)).to.equal(false);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("slashes stake when dispute fails", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await registry.connect(employer).createJob(reward);
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setOutcome(jobId, false);
    await registry.connect(agent).completeJob(jobId);
    await registry.connect(agent).dispute(jobId, { value: appealFee });
    await dispute.connect(owner).resolve(jobId, true);
    await registry.finalize(jobId);

    expect(await token.balanceOf(agent.address)).to.equal(800);
    expect(await token.balanceOf(employer.address)).to.equal(1100);
    expect(await rep.reputationOf(agent.address)).to.equal(0);
    expect(await rep.penaltyCount(agent.address)).to.equal(1);
    expect(await rep.isBlacklisted(agent.address)).to.equal(true);
    expect(await nft.balanceOf(agent.address)).to.equal(0);
  });
});

