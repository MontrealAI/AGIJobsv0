const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PlatformRegistry", function () {
  let owner, platform, sybil, treasury;
  let token, stakeManager, reputationEngine, registry;

  const STAKE = 1e6; // 1 token with 6 decimals

  beforeEach(async () => {
    [owner, platform, sybil, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.connect(owner).deploy();
    await token.mint(platform.address, STAKE);

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await Stake.connect(platform).deploy(
      await token.getAddress(),
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stakeManager.connect(platform).setMinStake(STAKE);
    await token.connect(platform).approve(await stakeManager.getAddress(), STAKE);
    await stakeManager.connect(platform).depositStake(2, STAKE); // Role.Platform = 2

    const Rep = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    reputationEngine = await Rep.connect(owner).deploy();
    await reputationEngine.setStakeManager(await stakeManager.getAddress());
    await reputationEngine.setCaller(owner.address, true);

    const Registry = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    registry = await Registry.connect(owner).deploy(
      await stakeManager.getAddress(),
      await reputationEngine.getAddress(),
      STAKE
    );
  });

  it("requires minimum stake for non-owner registration", async () => {
    await expect(registry.connect(platform).register())
      .to.emit(registry, "Registered")
      .withArgs(platform.address);
    expect(await registry.registered(platform.address)).to.equal(true);
    await expect(registry.connect(sybil).register()).to.be.revertedWith(
      "stake"
    );
  });

  it("acknowledgeAndRegister registers caller", async () => {
    await expect(registry.connect(platform).acknowledgeAndRegister())
      .to.emit(registry, "Registered")
      .withArgs(platform.address);
  });

  it("acknowledgeAndRegisterFor works for registrars", async () => {
    await registry.setRegistrar(owner.address, true);
    await expect(
      registry.connect(owner).acknowledgeAndRegisterFor(platform.address)
    )
      .to.emit(registry, "Registered")
      .withArgs(platform.address);
  });

  it("registrar enforces operator stake", async () => {
    await registry.setRegistrar(owner.address, true);
    await expect(
      registry.connect(owner).registerFor(sybil.address)
    ).to.be.revertedWith("stake");
    await expect(registry.connect(owner).registerFor(platform.address))
      .to.emit(registry, "Registered")
      .withArgs(platform.address);
  });

  it("computes score based on stake and reputation", async () => {
    await registry.connect(platform).register();
    expect(await registry.getScore(platform.address)).to.equal(STAKE);
    await reputationEngine.add(platform.address, 5);
    expect(await registry.getScore(platform.address)).to.equal(STAKE + 5);
  });

  it("owner can update settings", async () => {
    await expect(registry.setMinPlatformStake(STAKE * 2))
      .to.emit(registry, "MinPlatformStakeUpdated")
      .withArgs(STAKE * 2);
  });

  it("enforces owner-managed blacklist", async () => {
    await registry.setBlacklist(platform.address, true);
    await expect(registry.connect(platform).register()).to.be.revertedWith(
      "blacklisted"
    );
    expect(await registry.getScore(platform.address)).to.equal(0);
    await registry.setBlacklist(platform.address, false);
    await registry.connect(platform).register();
  });

  it("returns zero score when owner registers without stake", async () => {
    await expect(registry.connect(owner).register())
      .to.emit(registry, "Registered")
      .withArgs(owner.address);
    expect(await registry.getScore(owner.address)).to.equal(0);
    await reputationEngine.add(owner.address, 10);
    // reputation alone should not give score without stake for owner
    expect(await registry.getScore(owner.address)).to.equal(0);
  });

  it("owner stakeAndActivate(0) registers with zero score and weight", async () => {
    const JobRouter = await ethers.getContractFactory(
      "contracts/v2/modules/JobRouter.sol:JobRouter"
    );
    const jobRouter = await JobRouter.connect(owner).deploy(
      await registry.getAddress()
    );

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    const feePool = await FeePool.connect(owner).deploy(
      await token.getAddress(),
      await stakeManager.getAddress(),
      2,
      0,
      treasury.address
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
      incentives.connect(platform).stakeAndActivate(0)
    ).to.be.revertedWith("amount");
  });

  it("allows operator to deregister", async () => {
    await registry.connect(platform).register();
    expect(await registry.registered(platform.address)).to.equal(true);
    await registry.connect(platform).deregister();
    expect(await registry.registered(platform.address)).to.equal(false);
  });
});

