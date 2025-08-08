const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry modules wiring", function () {
  it("wires modules and emits parameter change events", async function () {
    const [owner, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stakeMgr = await StakeManager.deploy(token.target, owner.address);
    await stakeMgr.waitForDeployment();

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const registry = await JobRegistry.deploy(owner.address);
    await registry.waitForDeployment();

    const ReputationEngine = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const rep = await ReputationEngine.deploy(owner.address);
    await rep.waitForDeployment();

    const CertificateNFT = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    const cert = await CertificateNFT.deploy("Cert", "CERT", owner.address);
    await cert.waitForDeployment();
    await expect(cert.setJobRegistry(registry.target))
      .to.emit(cert, "JobRegistryUpdated")
      .withArgs(registry.target);

    const DisputeModule = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    const dispute = await DisputeModule.deploy(registry.target, owner.address);
    await dispute.waitForDeployment();

    const ValidationModule = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    const validation = await ValidationModule.deploy(
      registry.target,
      stakeMgr.target,
      owner.address
    );
    await validation.waitForDeployment();

    await expect(
      registry.setModules(
        validation.target,
        stakeMgr.target,
        rep.target,
        dispute.target,
        cert.target
      )
    ).to.emit(registry, "ValidationModuleUpdated").withArgs(validation.target);

    await expect(stakeMgr.setToken(token.target))
      .to.emit(stakeMgr, "TokenUpdated")
      .withArgs(token.target);

    await expect(rep.setThreshold(5))
      .to.emit(rep, "ThresholdUpdated")
      .withArgs(5);
  });
});
