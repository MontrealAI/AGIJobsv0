const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule", function () {
  let owner, other, registry, dispute, newRegistry;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    registry = await JobMock.deploy();
    await registry.waitForDeployment();
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress
    );
    await dispute.waitForDeployment();
    newRegistry = await JobMock.deploy();
    await newRegistry.waitForDeployment();
  });

  it("allows owner to update job registry", async () => {
    await expect(
      dispute.connect(owner).setJobRegistry(await newRegistry.getAddress())
    )
      .to.emit(dispute, "JobRegistryUpdated")
      .withArgs(await newRegistry.getAddress());
    expect(await dispute.jobRegistry()).to.equal(
      await newRegistry.getAddress()
    );
  });

  it("restricts job registry update to owner", async () => {
    await expect(
      dispute.connect(other).setJobRegistry(await newRegistry.getAddress())
    )
      .to.be.revertedWithCustomError(dispute, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
  });
});

