const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Full system integration", function () {
  let token, stakeManager, rep, validation, nft, registry, dispute, policy;
  let owner, employer, agent, v1, v2;
  const reward = 100;
  const stake = 200;
  const appealFee = 10;

  beforeEach(async () => {
    [owner, employer, agent, v1, v2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      owner.address,
      owner.address
    );

    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    validation = await Validation.deploy();

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
    await registry.connect(owner).setJobParameters(reward, stake);
    await dispute.connect(owner).setAppealFee(appealFee);
    await nft.connect(owner).setJobRegistry(await registry.getAddress());
    await rep.connect(owner).setCaller(await registry.getAddress(), true);
    await rep.connect(owner).setThreshold(1);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await stakeManager.connect(owner).setSlashingPercentages(100, 0);
    await nft.connect(owner).transferOwnership(await registry.getAddress());
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await registry.connect(owner).acknowledgeTaxPolicy();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.connect(v1).acknowledgeTaxPolicy();
    await registry.connect(v2).acknowledgeTaxPolicy();

    await token.mint(employer.address, 1000);
    await token.mint(agent.address, 1000);
    await token.mint(v1.address, 1000);
    await token.mint(v2.address, 1000);

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(agent).depositStake(0, stake);
    await token
      .connect(v1)
      .approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(v1).depositStake(1, stake);
    await token
      .connect(v2)
      .approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(v2).depositStake(1, stake);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
  });

  async function startJob() {
    await registry.connect(employer).createJob(reward, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    return jobId;
  }

  it("rewards agent and mints certificate when dispute resolves in their favour", async () => {
    const jobId = await startJob();
    await validation.setResult(false);
    await registry.connect(agent).completeJob(jobId);
    await registry.connect(agent).dispute(jobId, { value: appealFee });
    await dispute.connect(owner).resolve(jobId, false);

    expect(await token.balanceOf(agent.address)).to.equal(900n);
    expect(await rep.reputation(agent.address)).to.equal(1);
    expect(await nft.balanceOf(agent.address)).to.equal(1n);
  });

  it("slashes agent and reduces reputation when dispute is lost", async () => {
    const jobId = await startJob();
    await validation.setResult(false);
    await registry.connect(agent).completeJob(jobId);
    await registry.connect(agent).dispute(jobId, { value: appealFee });
    await dispute.connect(owner).resolve(jobId, true);

    expect(await token.balanceOf(agent.address)).to.equal(800n);
    expect(await token.balanceOf(employer.address)).to.equal(1200n);
    expect(await rep.reputation(agent.address)).to.equal(0);
    expect(await rep.isBlacklisted(agent.address)).to.equal(true);
    expect(await nft.balanceOf(agent.address)).to.equal(0n);
  });
});
