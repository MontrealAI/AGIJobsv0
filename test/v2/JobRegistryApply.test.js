const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("JobRegistry agent gating", function () {
  let owner, employer, agent;
  let registry, rep, verifier;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();

    const Stake = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockStakeManager"
    );
    const stakeManager = await Stake.deploy();

    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    rep = await Rep.deploy(await stakeManager.getAddress());

    const Verifier = await ethers.getContractFactory(
      "contracts/v2/mocks/ENSOwnershipVerifierToggle.sol:ENSOwnershipVerifierToggle"
    );
    verifier = await Verifier.deploy();

    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      await rep.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      []
    );
    await registry.connect(owner).setENSOwnershipVerifier(await verifier.getAddress());

    await rep
      .connect(owner)
      .setAuthorizedCaller(await registry.getAddress(), true);
    await rep.connect(owner).setAuthorizedCaller(owner.address, true);

    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const policy = await Policy.deploy("uri", "ack");
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();

    await registry.connect(owner).setMaxJobReward(1000);
    await registry.connect(owner).setMaxJobDuration(1000);
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).setJobParameters(0, 0);
    await registry.connect(owner).setAgentRootNode(ethers.id("agi"));
    await verifier.setResult(false);
  });

  async function createJob() {
    const deadline = (await time.latest()) + 100;
    await registry.connect(employer).createJob(1, deadline, "uri");
    return 1;
  }

  it("syncs ENS roots and merkle updates to verifier", async () => {
    const newRoot = ethers.id("root");
    await expect(
      registry.connect(agent).setAgentRootNode(newRoot)
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    await expect(registry.setAgentRootNode(newRoot))
      .to.emit(registry, "RootNodeUpdated")
      .withArgs("agent", newRoot);
    expect(await verifier.agentRootNode()).to.equal(newRoot);

    const merkle = ethers.id("merkle");
    await expect(registry.setAgentMerkleRoot(merkle))
      .to.emit(registry, "MerkleRootUpdated")
      .withArgs("agent", merkle);
    expect(await verifier.agentMerkleRoot()).to.equal(merkle);
  });

  it("rejects unverified agents", async () => {
    const jobId = await createJob();
    await expect(
      registry.connect(agent).applyForJob(jobId, "a", [])
    ).to.be.revertedWith("Not authorized agent");
  });

  it("allows manual allowlisted agents", async () => {
    await registry
      .connect(owner)
      .setAdditionalAgents([agent.address], [true]);
    const jobId = await createJob();
    await expect(registry.connect(agent).applyForJob(jobId, "a", []))
      .to.emit(registry, "JobApplied")
      .withArgs(jobId, agent.address);
  });

  it("rejects blacklisted agents", async () => {
    await verifier.setResult(true);
    await rep.connect(owner).blacklist(agent.address, true);
    const jobId = await createJob();
    await expect(
      registry.connect(agent).applyForJob(jobId, "a", [])
    ).to.be.revertedWith("Blacklisted agent");
  });
});
