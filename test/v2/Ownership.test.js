const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ownable modules", function () {
  it("enforces ownership and transfer across modules", async function () {
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
    const addresses = await deployer.deploy.staticCall(econ, ids);
    await deployer.deploy(econ, ids);

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
      ensVerifier,
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
    const ENSVerifier = await ethers.getContractFactory(
      "contracts/v2/modules/ENSOwnershipVerifier.sol:ENSOwnershipVerifier"
    );

    const modules = [
      [StakeManager.attach(stake), (inst, signer) => inst.connect(signer).setFeePct(1)],
      [JobRegistry.attach(registry), (inst, signer) => inst.connect(signer).setFeePct(1)],
      [ValidationModule.attach(validation), (inst, signer) => inst.connect(signer).setCommitWindow(1)],
      [
        ReputationEngine.attach(reputation),
        (inst, signer) => inst.connect(signer).setScoringWeights(0, 0),
      ],
      [DisputeModule.attach(dispute), (inst, signer) => inst.connect(signer).setDisputeFee(0)],
      [CertificateNFT.attach(certificate), (inst, signer) => inst.connect(signer).setBaseURI("ipfs://new")],
      [PlatformRegistry.attach(platformRegistry), (inst, signer) => inst.connect(signer).setMinPlatformStake(0)],
      [JobRouter.attach(router), (inst, signer) => inst.connect(signer).setRegistrar(ethers.ZeroAddress, false)],
      [PlatformIncentives.attach(incentives), (inst, signer) => inst.connect(signer).setModules(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)],
      [FeePool.attach(feePool), (inst, signer) => inst.connect(signer).setBurnPct(0)],
      [TaxPolicy.attach(taxPolicy), (inst, signer) => inst.connect(signer).setPolicyURI("ipfs://new")],
      [ENSVerifier.attach(ensVerifier), (inst, signer) => inst.connect(signer).setENS(ethers.ZeroAddress)],
    ];

    for (const [inst, call] of modules) {
      await expect(call(inst, other)).to.be.reverted;
      await inst.transferOwnership(other.address);
      await expect(call(inst, owner)).to.be.reverted;
      await call(inst, other);
      await inst.connect(other).transferOwnership(owner.address);
    }
  });
});
