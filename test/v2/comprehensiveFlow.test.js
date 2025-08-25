const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("comprehensive job flows", function () {
  const reward = ethers.parseUnits("1000", 6);
  const stakeRequired = ethers.parseUnits("200", 6);
  const feePct = 10;
  const disputeFee = 0n;

  let token, stakeManager, rep, validation, nft, registry, dispute, feePool, policy, identity;
  let owner, employer, agent, platform, buyer;

  beforeEach(async () => {
    [owner, employer, agent, platform, buyer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy();
    const mintAmount = ethers.parseUnits("10000", 6);
    await token.mint(employer.address, mintAmount);
    await token.mint(agent.address, mintAmount);
    await token.mint(platform.address, mintAmount);
    await token.mint(buyer.address, mintAmount);

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
      ethers.ZeroAddress,
      owner.address
    );

    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    validation = await Validation.deploy();

    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    rep = await Rep.deploy(await stakeManager.getAddress());

    const NFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
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
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );

    const Dispute = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      owner.address
    );
    await dispute.setDisputeFee(disputeFee);
    await dispute.setDisputeWindow(0);

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePool.deploy(
      await token.getAddress(),
      await stakeManager.getAddress(),
      0,
      owner.address
    );
    await feePool.setBurnPct(0);

    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await Policy.deploy(
      "ipfs://policy",
      "All taxes on participants; contract and owner exempt"
    );

    await registry.setModules(
      await validation.getAddress(),
      await stakeManager.getAddress(),
      await rep.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await feePool.getAddress(),
      []
    );
    await validation.setJobRegistry(await registry.getAddress());
    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    identity = await Identity.deploy();
    await registry.setIdentityRegistry(await identity.getAddress());
    await registry.setFeePct(feePct);
    await registry.setValidatorRewardPct(0);
    await registry.setTaxPolicy(await policy.getAddress());
    await registry.setJobParameters(0, stakeRequired);
    await registry.setMaxJobReward(reward);
    await registry.setJobDurationLimit(86400);
    await stakeManager.setJobRegistry(await registry.getAddress());
    await stakeManager.setValidationModule(await validation.getAddress());
    await stakeManager.setDisputeModule(await dispute.getAddress());
    await stakeManager.setSlashingPercentages(100, 0);
    await nft.setJobRegistry(await registry.getAddress());
    await nft.setStakeManager(await stakeManager.getAddress());
    await rep.setAuthorizedCaller(await registry.getAddress(), true);
    await rep.setThreshold(0);
    await nft.transferOwnership(await registry.getAddress());

    await registry.acknowledgeTaxPolicy();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.connect(platform).acknowledgeTaxPolicy();
    await registry.connect(buyer).acknowledgeTaxPolicy();
  });

  it("executes successful job flow with certificate trade", async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    await identity.addAdditionalAgent(agent.address);
    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    const deadline = (await time.latest()) + 1000;
    await registry.connect(employer).createJob(reward, deadline, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, "", []);
    await validation.setResult(true);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id("result"), "result", "", []);
    await validation.finalize(jobId);
    expect(await nft.ownerOf(jobId)).to.equal(agent.address);
    const price = ethers.parseUnits("10", 6);
    await nft.connect(agent).list(jobId, price);
    await token.connect(buyer).approve(await nft.getAddress(), price);
    await nft.connect(buyer).purchase(jobId);
    expect(await nft.ownerOf(jobId)).to.equal(buyer.address);
  });

  it("rejects unverified agent identities", async () => {
    const Verifier = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle"
    );
    const verifier = await Verifier.deploy();
    await verifier.setResult(false);
    await registry.setIdentityRegistry(await verifier.getAddress());
    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    const fee = (reward * BigInt(feePct)) / 100n;
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    const deadline = (await time.latest()) + 1000;
    await registry.connect(employer).createJob(reward, deadline, "uri");
    await expect(
      registry.connect(agent).applyForJob(1, "", [])
    ).to.be.revertedWith("Not authorized agent");
  });

  it("resolves disputes with stake slashing", async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    await identity.addAdditionalAgent(agent.address);
    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    const deadline = (await time.latest()) + 1000;
    await registry.connect(employer).createJob(reward, deadline, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, "", []);
    await validation.setResult(false);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id("bad"), "bad", "", []);
    await validation.finalize(jobId);
    // fund and impersonate dispute module to resolve
    await network.provider.send("hardhat_setBalance", [
      await dispute.getAddress(),
      "0x56BC75E2D63100000",
    ]);
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [await dispute.getAddress()],
    });
    const disputeSigner = await ethers.getSigner(await dispute.getAddress());
    await registry.connect(disputeSigner).resolveDispute(jobId, true);
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [await dispute.getAddress()],
    });
    expect(await stakeManager.stakeOf(agent.address, 0)).to.equal(0);
  });

  it("blocks blacklisted agents", async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    await identity.addAdditionalAgent(agent.address);
    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    const deadline = (await time.latest()) + 1000;
    await registry.connect(employer).createJob(reward, deadline, "uri");
    await rep.setBlacklist(agent.address, true);
    await expect(
      registry.connect(agent).applyForJob(1, "", [])
    ).to.be.revertedWith("Blacklisted agent");
  });

  it("enforces fresh tax policy acknowledgements", async () => {
    await policy.bumpPolicyVersion();
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    await expect(
      registry.connect(employer).createJob(reward, deadline, "uri")
    ).to.be.revertedWith("acknowledge tax policy");
  });
});

