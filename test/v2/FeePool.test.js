const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeePool", function () {
  let token, stakeManager, router, jobRegistry, feePool, owner, user1, user2, employer, treasury, registrySigner;

  const { AGIALPHA } = require("../../scripts/constants");
  beforeEach(async () => {
    [owner, user1, user2, employer, treasury] = await ethers.getSigners();
    token = await ethers.getContractAt("contracts/test/AGIALPHAToken.sol:AGIALPHAToken", AGIALPHA);

    const Router = await ethers.getContractFactory(
      "contracts/v2/PaymentRouter.sol:PaymentRouter"
    );
    router = await Router.deploy(owner.address);

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address,
      await router.getAddress()
    );
    await stakeManager.connect(owner).setMinStake(1);

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    jobRegistry = await JobRegistry.deploy(
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
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const policy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await stakeManager.connect(owner).setJobRegistry(await jobRegistry.getAddress());
    await policy.connect(user1).acknowledge();
    await policy.connect(user2).acknowledge();

    await token.mint(user1.address, 1000);
    await token.mint(user2.address, 1000);
    await token.mint(employer.address, 1000);

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      await router.getAddress(),
      0,
      treasury.address
    );
    await feePool.setBurnPct(0);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [
      registryAddr,
      "0x56BC75E2D63100000",
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await token.connect(user1).approve(await router.getAddress(), 1000);
    await token.connect(user2).approve(await router.getAddress(), 1000);
    await stakeManager.connect(user1).depositStake(2, 100);
    await stakeManager.connect(user2).depositStake(2, 300);
  });

  it("allows direct contributions", async () => {
    await token.connect(user1).approve(await router.getAddress(), 100);
    await expect(feePool.connect(user1).contribute(100))
      .to.emit(feePool, "RewardPoolContribution")
      .withArgs(user1.address, 100);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(100n);
    expect(await feePool.pendingFees()).to.equal(100n);
  });

  it("distributes rewards proportionally", async () => {
    const feeAmount = 100;
    const jobId = ethers.encodeBytes32String("job1");
    await token.connect(employer).approve(await router.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(25n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(75n);
  });

  it("distributes rewards to validators when configured", async () => {
    // additional validator stakes
    await token.connect(user1).approve(await router.getAddress(), 100);
    await token.connect(user2).approve(await router.getAddress(), 300);
    await stakeManager.connect(user1).depositStake(1, 100);
    await stakeManager.connect(user2).depositStake(1, 300);
    await feePool.connect(owner).setRewardRole(1);

    const feeAmount = 100;
    const jobId = ethers.encodeBytes32String("jobV");
    await token
      .connect(employer)
      .approve(await router.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(25n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(75n);
  });

  it("burns configured percentage of fees", async () => {
    await feePool.connect(owner).setBurnPct(25);
    const feeAmount = 80;
    const jobId = ethers.encodeBytes32String("job2");
    await token
      .connect(employer)
      .approve(await router.getAddress(), feeAmount);
    const supplyBefore = await token.totalSupply();
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(15n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(45n);
    const supplyAfter = await token.totalSupply();
    expect(supplyBefore - supplyAfter).to.equal(20n);
  });

  it("emits zero payout for owner without stake", async () => {
    const feeAmount = 50;
    const jobId = ethers.encodeBytes32String("job4");
    await token.connect(employer).approve(await router.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );
    await feePool.connect(owner).distributeFees();
    const before = await token.balanceOf(owner.address);
    await expect(feePool.connect(owner).claimRewards())
      .to.emit(feePool, "RewardsClaimed")
      .withArgs(owner.address, 0);
    expect(await token.balanceOf(owner.address)).to.equal(before);
  });

  it("owner stakeAndActivate(0) yields zero score, weight and payout", async () => {
    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const rep = await Rep.connect(owner).deploy(
      await stakeManager.getAddress()
    );
    await rep.setStakeManager(await stakeManager.getAddress());
    await rep.setAuthorizedCaller(owner.address, true);

    const Registry = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    const registry = await Registry.connect(owner).deploy(
      await stakeManager.getAddress(),
      await rep.getAddress(),
      1
    );

    const JobRouter = await ethers.getContractFactory(
      "contracts/v2/modules/JobRouter.sol:JobRouter"
    );
    const jobRouter = await JobRouter.connect(owner).deploy(
      await registry.getAddress()
    );

    const Incentives = await ethers.getContractFactory(
      "contracts/v2/PlatformIncentives.sol:PlatformIncentives"
    );
    const incentives = await Incentives.connect(owner).deploy(
      await stakeManager.getAddress(),
      await registry.getAddress(),
      await jobRouter.getAddress()
    );

    await registry.setRegistrar(await incentives.getAddress(), true);
    await jobRouter.setRegistrar(await incentives.getAddress(), true);

    await expect(incentives.connect(owner).stakeAndActivate(0))
      .to.emit(registry, "Registered")
      .withArgs(owner.address);
    expect(await registry.getScore(owner.address)).to.equal(0);
    expect(await jobRouter.routingWeight(owner.address)).to.equal(0);

    await expect(feePool.connect(owner).claimRewards())
      .to.emit(feePool, "RewardsClaimed")
      .withArgs(owner.address, 0);

    await expect(
      incentives.connect(user1).stakeAndActivate(0)
    ).to.be.revertedWith("amount");
  });

  it("returns immediately when distributing with zero fees", async () => {
    const cumulative = await feePool.cumulativePerToken();
    await expect(feePool.connect(owner).distributeFees()).to.not.be.reverted;
    expect(await feePool.pendingFees()).to.equal(0);
    expect(await feePool.cumulativePerToken()).to.equal(cumulative);
  });

  it("reverts when setting a zero stake manager", async () => {
    await expect(
      feePool.connect(owner).setStakeManager(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(feePool, "ZeroAddress");
  });

  it("reverts when stake manager has wrong version", async () => {
    const Mock = await ethers.getContractFactory(
      "contracts/v2/mocks/VersionMock.sol:VersionMock"
    );
    const bad = await Mock.deploy(1);
    await expect(
      feePool.connect(owner).setStakeManager(await bad.getAddress())
    ).to.be.revertedWithCustomError(
      feePool,
      "InvalidStakeManagerVersion"
    );
  });
});
