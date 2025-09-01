const { expect } = require("chai");
const { ethers, network, artifacts } = require("hardhat");
const { AGIALPHA } = require("../../scripts/constants");

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

    const ModCertificateNFT = await ethers.getContractFactory(
      "contracts/v2/modules/CertificateNFT.sol:CertificateNFT"
    );
    const IdentityLib = await ethers.getContractFactory(
      "contracts/v2/modules/IdentityLib.sol:IdentityLib"
    );

    const modCert = await ModCertificateNFT.deploy("Cert", "CRT");
    await modCert.waitForDeployment();
    const identity = await IdentityLib.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await identity.waitForDeployment();

    const identityRegistry = IdentityRegistry.attach(identityRegistryAddr);
    await identityRegistry.connect(owner).acceptOwnership();

    const systemPauseSignerAddr = systemPause;
    await network.provider.send("hardhat_setBalance", [
      systemPauseSignerAddr,
      "0x56BC75E2D63100000",
    ]);
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [systemPauseSignerAddr],
    });
    const systemPauseSigner = await ethers.getSigner(systemPauseSignerAddr);

    const governable = [
      [StakeManager.attach(stake), (inst, signer) => inst.connect(signer).setFeePct(1)],
      [JobRegistry.attach(registry), (inst, signer) => inst.connect(signer).setFeePct(1)],
    ];

    for (const [inst, call] of governable) {
      await expect(call(inst, other)).to.be.revertedWith("governance only");
      await inst.connect(systemPauseSigner).setGovernance(other.address);
      await expect(call(inst, owner)).to.be.revertedWith("governance only");
      await call(inst, other);
      await inst.connect(other).setGovernance(systemPauseSignerAddr);
    }

    const modules = [
      [
        ValidationModule.attach(validation),
        systemPauseSigner,
        (inst, signer) => inst.connect(signer).setIdentityRegistry(ethers.ZeroAddress),
      ],
      [
        ReputationEngine.attach(reputation),
        systemPauseSigner,
        (inst, signer) => inst.connect(signer).setScoringWeights(0, 0),
      ],
      [
        DisputeModule.attach(dispute),
        systemPauseSigner,
        (inst, signer) => inst.connect(signer).setDisputeFee(0),
      ],
      [
        CertificateNFT.attach(certificate),
        owner,
        (inst, signer) => inst.connect(signer).setJobRegistry(other.address),
      ],
      [
        PlatformRegistry.attach(platformRegistry),
        systemPauseSigner,
        (inst, signer) => inst.connect(signer).setMinPlatformStake(0),
      ],
      [
        JobRouter.attach(router),
        owner,
        (inst, signer) => inst.connect(signer).setRegistrar(ethers.ZeroAddress, false),
      ],
      [
        PlatformIncentives.attach(incentives),
        owner,
        (inst, signer) =>
          inst
            .connect(signer)
            .setModules(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress),
      ],
      [
        FeePool.attach(feePool),
        systemPauseSigner,
        (inst, signer) => inst.connect(signer).setBurnPct(0),
      ],
      [
        TaxPolicy.attach(taxPolicy),
        owner,
        (inst, signer) => inst.connect(signer).setPolicyURI("ipfs://new"),
      ],
      [
        identityRegistry,
        owner,
        (inst, signer) => inst.connect(signer).setENS(ethers.ZeroAddress),
        true,
      ],
      [
        modCert,
        owner,
        (inst, signer) => inst.connect(signer).setJobRegistry(other.address),
      ],
      [
        identity,
        owner,
        (inst, signer) =>
          inst.connect(signer).setModules(ethers.ZeroAddress, ethers.ZeroAddress),
      ],
    ];

    for (const [inst, signer, call, twoStep] of modules) {
      await expect(call(inst, other)).to.be.reverted;
      await inst.connect(signer).transferOwnership(other.address);
      if (twoStep) {
        await inst.connect(other).acceptOwnership();
      }
      await expect(call(inst, signer)).to.be.reverted;
      await call(inst, other);
      await inst.connect(other).transferOwnership(await signer.getAddress());
      if (twoStep) {
        await inst.connect(signer).acceptOwnership();
      }
    }

    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [systemPauseSignerAddr],
    });
  });
});
