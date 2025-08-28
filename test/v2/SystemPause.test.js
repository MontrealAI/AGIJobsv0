const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SystemPause", function () {
  let owner,
    stake,
    registry,
    validation,
    dispute,
    reputation,
    platformRegistry,
    feePool,
    pause;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Deployer = await ethers.getContractFactory(
      "contracts/v2/Deployer.sol:Deployer"
    );
    const deployer = await Deployer.deploy();
    const econ = {
      token: ethers.ZeroAddress,
      feePct: 0,
      burnPct: 0,
      employerSlashPct: 0,
      treasurySlashPct: 0,
      commitWindow: 0,
      revealWindow: 0,
      minStake: 0,
      jobStake: 0,
    };
    const ids = {
      ens: ethers.ZeroAddress,
      nameWrapper: ethers.ZeroAddress,
      clubRootNode: ethers.ZeroHash,
      agentRootNode: ethers.ZeroHash,
      validatorMerkleRoot: ethers.ZeroHash,
      agentMerkleRoot: ethers.ZeroHash,
    };
    const addresses = await deployer.deploy.staticCall(econ, ids);
    await deployer.deploy(econ, ids);
    const [
      stakeAddr,
      registryAddr,
      validationAddr,
      reputationAddr,
      disputeAddr,
      ,
      platformRegistryAddr,
      ,
      ,
      feePoolAddr,
      ,
      ,
      systemPauseAddr,
    ] = addresses;
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const ValidationModule = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    const DisputeModule = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    const ReputationEngine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const PlatformRegistry = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    const SystemPause = await ethers.getContractFactory(
      "contracts/v2/SystemPause.sol:SystemPause"
    );
    stake = StakeManager.attach(stakeAddr);
    registry = JobRegistry.attach(registryAddr);
    validation = ValidationModule.attach(validationAddr);
    dispute = DisputeModule.attach(disputeAddr);
    reputation = ReputationEngine.attach(reputationAddr);
    platformRegistry = PlatformRegistry.attach(platformRegistryAddr);
    feePool = FeePool.attach(feePoolAddr);
    pause = SystemPause.attach(systemPauseAddr);

    await pause
      .connect(owner)
      .setModules(
        registryAddr,
        stakeAddr,
        validationAddr,
        disputeAddr,
        platformRegistryAddr,
        feePoolAddr,
        reputationAddr
      );
  });

  it("pauses and unpauses all modules", async function () {
    expect(await stake.paused()).to.equal(false);
    expect(await registry.paused()).to.equal(false);
    expect(await validation.paused()).to.equal(false);
    expect(await dispute.paused()).to.equal(false);
    expect(await platformRegistry.paused()).to.equal(false);
    expect(await feePool.paused()).to.equal(false);
    expect(await reputation.paused()).to.equal(false);

    await pause.connect(owner).pauseAll();

    expect(await stake.paused()).to.equal(true);
    expect(await registry.paused()).to.equal(true);
    expect(await validation.paused()).to.equal(true);
    expect(await dispute.paused()).to.equal(true);
    expect(await platformRegistry.paused()).to.equal(true);
    expect(await feePool.paused()).to.equal(true);
    expect(await reputation.paused()).to.equal(true);

    await pause.connect(owner).unpauseAll();

    expect(await stake.paused()).to.equal(false);
    expect(await registry.paused()).to.equal(false);
    expect(await validation.paused()).to.equal(false);
    expect(await dispute.paused()).to.equal(false);
    expect(await platformRegistry.paused()).to.equal(false);
    expect(await feePool.paused()).to.equal(false);
    expect(await reputation.paused()).to.equal(false);
  });

  it("allows repeated pauseAll and unpauseAll calls", async function () {
    await pause.connect(owner).pauseAll();
    await expect(pause.connect(owner).pauseAll()).to.not.be.reverted;
    await pause.connect(owner).unpauseAll();
    await expect(pause.connect(owner).unpauseAll()).to.not.be.reverted;
  });
});

