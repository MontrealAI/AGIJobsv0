const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("JobRegistry pause", function () {
  let owner, employer, agent, registry, identity;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const Identity = await ethers.getContractFactory(
      "contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock"
    );
    identity = await Identity.deploy();
    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
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
    await registry.connect(owner).setIdentityRegistry(await identity.getAddress());
    await registry.connect(owner).setJobParameters(0, 0);
  });

  it("pauses job creation and applications", async () => {
    const deadline = (await time.latest()) + 100;

    await registry.connect(owner).pause();
    await expect(
      registry.connect(employer).createJob(1, deadline, "uri")
    ).to.be.revertedWithCustomError(registry, "EnforcedPause");

    await registry.connect(owner).unpause();
    await registry.connect(employer).createJob(1, deadline, "uri");

    await registry.connect(owner).pause();
    await expect(
      registry.connect(agent).applyForJob(1, "", [])
    ).to.be.revertedWithCustomError(registry, "EnforcedPause");

    await registry.connect(owner).unpause();
    await expect(registry.connect(agent).applyForJob(1, "", []))
      .to.emit(registry, "JobApplied")
      .withArgs(1, agent.address);
  });
});
