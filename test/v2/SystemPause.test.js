const { expect } = require("chai");
const { ethers, artifacts, network } = require("hardhat");
const { AGIALPHA } = require("../../scripts/constants");

describe("SystemPause", function () {
    it("pauses and unpauses all modules", async function () {
      const [owner, other] = await ethers.getSigners();
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
    const artifact = await artifacts.readArtifact(
      "contracts/test/MockERC20.sol:MockERC20"
    );
    await network.provider.send("hardhat_setCode", [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    const tx = await deployer.deploy(econ, ids, owner.address);
    const receipt = await tx.wait();
    const deployerAddress = await deployer.getAddress();
    const log = receipt.logs.find((l) => l.address === deployerAddress);
    const decoded = deployer.interface.decodeEventLog(
      "Deployed",
      log.data,
      log.topics
    );
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
    ] = decoded;
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
    const Committee = await ethers.getContractFactory(
      "contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee"
    );
    const SystemPause = await ethers.getContractFactory(
      "contracts/v2/SystemPause.sol:SystemPause"
    );
    const stake = StakeManager.attach(stakeAddr);
    const registry = JobRegistry.attach(registryAddr);
    const validation = ValidationModule.attach(validationAddr);
    const dispute = DisputeModule.attach(disputeAddr);
    const reputation = ReputationEngine.attach(reputationAddr);
    const platformRegistry = PlatformRegistry.attach(platformRegistryAddr);
    const feePool = FeePool.attach(feePoolAddr);
    const committeeAddr = await dispute.committee();
    const committee = Committee.attach(committeeAddr);
    const pause = SystemPause.attach(systemPauseAddr);

      await expect(
        pause
          .connect(owner)
          .setModules(
            registryAddr,
            stakeAddr,
            validationAddr,
            disputeAddr,
            platformRegistryAddr,
            feePoolAddr,
            reputationAddr,
            committeeAddr
          )
      )
        .to.emit(pause, "ModulesUpdated")
        .withArgs(
          registryAddr,
          stakeAddr,
          validationAddr,
          disputeAddr,
          platformRegistryAddr,
          feePoolAddr,
          reputationAddr,
          committeeAddr
        );

      await expect(pause.connect(other).pauseAll()).to.be.revertedWith(
        "governance only"
      );

      expect(await stake.paused()).to.equal(false);
      expect(await registry.paused()).to.equal(false);
      expect(await validation.paused()).to.equal(false);
      expect(await dispute.paused()).to.equal(false);
      expect(await platformRegistry.paused()).to.equal(false);
      expect(await feePool.paused()).to.equal(false);
      expect(await reputation.paused()).to.equal(false);
      expect(await committee.paused()).to.equal(false);

    await pause.connect(owner).pauseAll();

    expect(await stake.paused()).to.equal(true);
    expect(await registry.paused()).to.equal(true);
    expect(await validation.paused()).to.equal(true);
    expect(await dispute.paused()).to.equal(true);
    expect(await platformRegistry.paused()).to.equal(true);
    expect(await feePool.paused()).to.equal(true);
    expect(await reputation.paused()).to.equal(true);
    expect(await committee.paused()).to.equal(true);

    await expect(pause.connect(other).unpauseAll()).to.be.revertedWith(
      "governance only"
    );

    await pause.connect(owner).unpauseAll();

    expect(await stake.paused()).to.equal(false);
    expect(await registry.paused()).to.equal(false);
    expect(await validation.paused()).to.equal(false);
    expect(await dispute.paused()).to.equal(false);
    expect(await platformRegistry.paused()).to.equal(false);
    expect(await feePool.paused()).to.equal(false);
    expect(await reputation.paused()).to.equal(false);
    expect(await committee.paused()).to.equal(false);
  });
});

