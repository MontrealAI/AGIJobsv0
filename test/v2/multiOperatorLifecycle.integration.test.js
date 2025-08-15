const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("multi-operator job lifecycle", function () {
  let token, stakeManager, rep, validation, nft, registry, dispute, feePool, policy;
  let platformRegistry, jobRouter;
  let owner, employer, agent, platform1, platform2;
  const reward = ethers.parseUnits("1000", 6);
  const stakeRequired = ethers.parseUnits("200", 6);
  const platformStake1 = ethers.parseUnits("100", 6);
  const platformStake2 = ethers.parseUnits("300", 6);
  const feePct = 10;

  beforeEach(async () => {
    [owner, employer, agent, platform1, platform2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy();
    const mintAmount = ethers.parseUnits("10000", 6);
    await token.mint(employer.address, mintAmount);
    await token.mint(agent.address, mintAmount);
    await token.mint(platform1.address, mintAmount);
    await token.mint(platform2.address, mintAmount);

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
      ethers.ZeroAddress,
      0,
      0,
      []
    );

    const Dispute = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress
    );

    const FeePoolF = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePoolF.deploy(
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
      "ack"
    );

    const PlatformRegistryF = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    platformRegistry = await PlatformRegistryF.deploy(
      await stakeManager.getAddress(),
      await rep.getAddress(),
      0
    );

    const JobRouterF = await ethers.getContractFactory(
      "contracts/v2/modules/JobRouter.sol:JobRouter"
    );
    jobRouter = await JobRouterF.deploy(
      await platformRegistry.getAddress()
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
    await nft.setJobRegistry(await registry.getAddress());
    await rep.setCaller(await registry.getAddress(), true);
    await rep.setThreshold(1);
    await nft.transferOwnership(await registry.getAddress());

    await registry.acknowledgeTaxPolicy();
    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.connect(platform1).acknowledgeTaxPolicy();
    await registry.connect(platform2).acknowledgeTaxPolicy();

    const Verifier = await ethers.getContractFactory(
      "contracts/v2/mocks/ENSOwnershipVerifierMock.sol:ENSOwnershipVerifierMock"
    );
    const verifier = await Verifier.deploy();
    await registry.setENSOwnershipVerifier(await verifier.getAddress());
  });

  it("runs job lifecycle and handles multiple staked operators", async () => {
    const fee = (reward * BigInt(feePct)) / 100n;

    await token
      .connect(platform1)
      .approve(await stakeManager.getAddress(), platformStake1);
    await stakeManager.connect(platform1).depositStake(2, platformStake1);
    await platformRegistry.connect(platform1).register();
    await jobRouter.connect(platform1).register();

    await token
      .connect(platform2)
      .approve(await stakeManager.getAddress(), platformStake2);
    await stakeManager.connect(platform2).depositStake(2, platformStake2);
    await platformRegistry.connect(platform2).register();
    await jobRouter.connect(platform2).register();

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    await registry.connect(employer).createJob(reward, "uri");
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, "", []);
    await validation.connect(owner).setResult(true);
    await registry.connect(agent).completeJob(jobId);
    await registry.finalize(jobId);

    expect(await feePool.pendingFees()).to.equal(fee);
    await feePool.distributeFees();
    const before1 = await token.balanceOf(platform1.address);
    const before2 = await token.balanceOf(platform2.address);
    await feePool.connect(platform1).claimRewards();
    await feePool.connect(platform2).claimRewards();
    const after1 = await token.balanceOf(platform1.address);
    const after2 = await token.balanceOf(platform2.address);
    const total = platformStake1 + platformStake2;
    expect(after1 - before1).to.equal((fee * platformStake1) / total);
    expect(after2 - before2).to.equal((fee * platformStake2) / total);

    await jobRouter.connect(platform1).deregister();
    expect(await jobRouter.registered(platform1.address)).to.equal(false);

    const cumulative = await feePool.cumulativePerToken();
    await expect(feePool.distributeFees()).to.not.be.reverted;
    expect(await feePool.cumulativePerToken()).to.equal(cumulative);
  });
});

