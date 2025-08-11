const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OwnerControls", function () {
  let controls, owner, other, addr1;

  beforeEach(async () => {
    [owner, other, addr1] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("OwnerControls");
    controls = await Factory.deploy(owner.address);
    await controls.waitForDeployment();
  });

  it("allows owner to update parameters", async () => {
    await expect(controls.setMinStake(100))
      .to.emit(controls, "MinStakeUpdated")
      .withArgs(100);
    expect(await controls.minStake()).to.equal(100);

    await expect(controls.setFeePercent(5))
      .to.emit(controls, "FeePercentUpdated")
      .withArgs(5);
    expect(await controls.feePercent()).to.equal(5);

    await expect(controls.setRoutingAlgo("algo1"))
      .to.emit(controls, "RoutingAlgoUpdated")
      .withArgs("algo1");
    expect(await controls.routingAlgo()).to.equal("algo1");

    await expect(controls.setDisputeBond(50))
      .to.emit(controls, "DisputeBondUpdated")
      .withArgs(50);
    expect(await controls.disputeBond()).to.equal(50);

    await expect(controls.setStakeManager(addr1.address))
      .to.emit(controls, "StakeManagerUpdated")
      .withArgs(addr1.address);
    expect(await controls.stakeManager()).to.equal(addr1.address);

    await expect(controls.setValidationModule(addr1.address))
      .to.emit(controls, "ValidationModuleUpdated")
      .withArgs(addr1.address);
    expect(await controls.validationModule()).to.equal(addr1.address);

    await expect(controls.setReputationEngine(addr1.address))
      .to.emit(controls, "ReputationEngineUpdated")
      .withArgs(addr1.address);
    expect(await controls.reputationEngine()).to.equal(addr1.address);

    await expect(controls.setJobRegistry(addr1.address))
      .to.emit(controls, "JobRegistryUpdated")
      .withArgs(addr1.address);
    expect(await controls.jobRegistry()).to.equal(addr1.address);

    await expect(controls.setCertificateNFT(addr1.address))
      .to.emit(controls, "CertificateNFTUpdated")
      .withArgs(addr1.address);
    expect(await controls.certificateNFT()).to.equal(addr1.address);

    await expect(controls.setDisputeModule(addr1.address))
      .to.emit(controls, "DisputeModuleUpdated")
      .withArgs(addr1.address);
    expect(await controls.disputeModule()).to.equal(addr1.address);
  });

  it("restricts setters to owner", async () => {
    await expect(controls.connect(other).setMinStake(1))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setFeePercent(1))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setRoutingAlgo("a"))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setDisputeBond(1))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setStakeManager(other.address))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setValidationModule(other.address))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setReputationEngine(other.address))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setJobRegistry(other.address))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setCertificateNFT(other.address))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
    await expect(controls.connect(other).setDisputeModule(other.address))
      .to.be.revertedWithCustomError(controls, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
  });
});

