const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("end-to-end job lifecycle", function () {
  let token, stakeManager, rep, validation, nft, registry, dispute, feePool, policy;
  let owner, employer, agent, platform;
  const reward = ethers.parseUnits("1000", 6);
  const stakeRequired = ethers.parseUnits("200", 6);
  const platformStake = ethers.parseUnits("500", 6);
  const feePct = 10;
  const appealFee = 0n;

  beforeEach(async () => {
    [owner, employer, agent, platform] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy();
    await token.mint(owner.address, 0);
    const mintAmount = ethers.parseUnits("10000", 6);
    await token.mint(employer.address, mintAmount);
    await token.mint(agent.address, mintAmount);
    await token.mint(platform.address, mintAmount);

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
      []
    );

    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress
    );
    await dispute.connect(owner).setAppealFee(appealFee);

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePool.deploy(
      await token.getAddress(),
      await stakeManager.getAddress(),
      2,
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
      []
    );
    await registry.setFeePool(await feePool.getAddress());
    await registry.setFeePct(feePct);
    await registry.setTaxPolicy(await policy.getAddress());
    await registry.setJobParameters(0, stakeRequired);
    await stakeManager.setJobRegistry(await registry.getAddress());
    await stakeManager.setDisputeModule(await dispute.getAddress());
    await stakeManager.setSlashingPercentages(100, 0);
    await nft.setJobRegistry(await registry.getAddress());
    await rep.setCaller(await registry.getAddress(), true);
    await rep.setThreshold(1);
    await nft.transferOwnership(await registry.getAddress());

    await registry.acknowledgeTaxPolicy();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.connect(platform).acknowledgeTaxPolicy();
  });

  it("distributes fees to staked operators", async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    // platform stakes
    await token.connect(platform).approve(await stakeManager.getAddress(), platformStake);
    await stakeManager.connect(platform).depositStake(2, platformStake);
    // agent stakes
    await token.connect(agent).approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    // employer funds job
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    await registry.connect(employer).createJob(reward, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId);
    await validation.connect(owner).setResult(true);
    await registry.connect(agent).completeJob(jobId);
    await registry.finalize(jobId);

    // fee moved to FeePool
    expect(await feePool.pendingFees()).to.equal(fee);
    await feePool.distributeFees();
    const before = await token.balanceOf(platform.address);
    await feePool.connect(platform).claimRewards();
    const after = await token.balanceOf(platform.address);
    expect(after - before).to.equal(fee);
  });

});
