const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Deployer", function () {
  it("deploys and wires modules, transferring ownership", async function () {
    const [owner] = await ethers.getSigners();
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
    await expect(deployer.deploy(econ, ids))
      .to.emit(deployer, "Deployed")
      .withArgs(...addresses);

    const [
      stake,
      registry,
      validation,
      reputation,
      dispute,
      certificate,
      platformRegistry,
      router,
      incentives,
      feePool,
      taxPolicy,
      identityRegistryAddr,
      systemPause,
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
    const ReputationEngine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const DisputeModule = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    const CertificateNFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    const PlatformRegistry = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    const JobRouter = await ethers.getContractFactory(
      "contracts/v2/modules/JobRouter.sol:JobRouter"
    );
    const PlatformIncentives = await ethers.getContractFactory(
      "contracts/v2/PlatformIncentives.sol:PlatformIncentives"
    );
    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const IdentityRegistry = await ethers.getContractFactory(
      "contracts/v2/IdentityRegistry.sol:IdentityRegistry"
    );
    const SystemPause = await ethers.getContractFactory(
      "contracts/v2/SystemPause.sol:SystemPause"
    );

    const stakeC = StakeManager.attach(stake);
    const registryC = JobRegistry.attach(registry);
    const validationC = ValidationModule.attach(validation);
    const reputationC = ReputationEngine.attach(reputation);
    const disputeC = DisputeModule.attach(dispute);
    const certificateC = CertificateNFT.attach(certificate);
    const platformRegistryC = PlatformRegistry.attach(platformRegistry);
    const routerC = JobRouter.attach(router);
    const incentivesC = PlatformIncentives.attach(incentives);
    const feePoolC = FeePool.attach(feePool);
    const taxPolicyC = TaxPolicy.attach(taxPolicy);
    const identityRegistryC = IdentityRegistry.attach(identityRegistryAddr);
    const systemPauseC = SystemPause.attach(systemPause);

    // ownership
    expect(await stakeC.owner()).to.equal(systemPause);
    expect(await registryC.owner()).to.equal(systemPause);
    expect(await validationC.owner()).to.equal(systemPause);
    expect(await reputationC.owner()).to.equal(systemPause);
    expect(await disputeC.owner()).to.equal(systemPause);
    expect(await certificateC.owner()).to.equal(owner.address);
    expect(await platformRegistryC.owner()).to.equal(systemPause);
    expect(await routerC.owner()).to.equal(owner.address);
    expect(await incentivesC.owner()).to.equal(owner.address);
    expect(await feePoolC.owner()).to.equal(systemPause);
    expect(await taxPolicyC.owner()).to.equal(owner.address);
    expect(await identityRegistryC.owner()).to.equal(owner.address);
    expect(await systemPauseC.owner()).to.equal(owner.address);

    expect(await systemPauseC.jobRegistry()).to.equal(registry);
    expect(await systemPauseC.stakeManager()).to.equal(stake);
    expect(await systemPauseC.validationModule()).to.equal(validation);
    expect(await systemPauseC.disputeModule()).to.equal(dispute);
    expect(await systemPauseC.platformRegistry()).to.equal(platformRegistry);
    expect(await systemPauseC.feePool()).to.equal(feePool);
    expect(await systemPauseC.reputationEngine()).to.equal(reputation);

    // wiring
    expect(await stakeC.jobRegistry()).to.equal(registry);
    expect(await stakeC.disputeModule()).to.equal(dispute);
    expect(await registryC.stakeManager()).to.equal(stake);
    expect(await registryC.validationModule()).to.equal(validation);
    expect(await registryC.reputationEngine()).to.equal(reputation);
    expect(await registryC.disputeModule()).to.equal(dispute);
    expect(await registryC.certificateNFT()).to.equal(certificate);
    expect(await registryC.feePool()).to.equal(feePool);
    expect(await registryC.taxPolicy()).to.equal(taxPolicy);
    expect(await registryC.identityRegistry()).to.equal(
      identityRegistryAddr
    );
    expect(await validationC.jobRegistry()).to.equal(registry);
    expect(await validationC.stakeManager()).to.equal(stake);
    expect(await validationC.reputationEngine()).to.equal(reputation);
    expect(await validationC.identityRegistry()).to.equal(
      identityRegistryAddr
    );
    expect(await reputationC.callers(registry)).to.equal(true);
    expect(await reputationC.callers(validation)).to.equal(true);
    expect(await certificateC.jobRegistry()).to.equal(registry);
    expect(await incentivesC.stakeManager()).to.equal(stake);
    expect(await incentivesC.platformRegistry()).to.equal(platformRegistry);
    expect(await incentivesC.jobRouter()).to.equal(router);
    expect(await platformRegistryC.registrars(incentives)).to.equal(true);
    expect(await routerC.registrars(incentives)).to.equal(true);
  });

  it("can skip tax policy", async function () {
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
    const addresses = await deployer.deployWithoutTaxPolicy.staticCall(
      econ,
      ids
    );
    await expect(deployer.deployWithoutTaxPolicy(econ, ids))
      .to.emit(deployer, "Deployed")
      .withArgs(...addresses);
    const registry = addresses[1];
    const taxPolicy = addresses[10];
    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const registryC = JobRegistry.attach(registry);
    expect(taxPolicy).to.equal(ethers.ZeroAddress);
    expect(await registryC.taxPolicy()).to.equal(ethers.ZeroAddress);
  });
});

