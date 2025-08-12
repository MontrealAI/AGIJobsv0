const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry tax policy gating", function () {
  let owner;
  let employer;
  let agent;
  let registry;
  let policy;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
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
      0,
      0
    );

    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await Policy.deploy("ipfs://policy", "ack");

    await registry.connect(owner).setJobParameters(0, 0);
  });

  it("requires acknowledgement before job actions", async () => {
    await expect(
      registry.connect(employer).createJob(1, "uri")
    ).to.be.revertedWith("acknowledge tax policy");

    await expect(
      registry.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(registry, "TaxPolicyUpdated")
      .withArgs(await policy.getAddress(), 1);

    await expect(
      registry.connect(employer).createJob(1, "uri")
    ).to.be.revertedWith("acknowledge tax policy");

    await expect(
      registry.connect(employer).acknowledgeTaxPolicy()
    )
      .to.emit(registry, "TaxAcknowledged")
      .withArgs(employer.address, 1, "ack");

    await expect(
      registry.connect(employer).createJob(1, "uri")
    ).to.emit(registry, "JobCreated").withArgs(1, employer.address, ethers.ZeroAddress, 1, 0, 0);

    await expect(
      registry.connect(agent).applyForJob(1)
    ).to.be.revertedWith("acknowledge tax policy");

    await expect(
      registry.connect(agent).acknowledgeTaxPolicy()
    )
      .to.emit(registry, "TaxAcknowledged")
      .withArgs(agent.address, 1, "ack");

    await expect(
      registry.connect(agent).applyForJob(1)
    ).to.emit(registry, "AgentApplied").withArgs(1, agent.address);
  });

  it("only owner can set tax policy", async () => {
    await expect(
      registry.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(registry, "TaxPolicyUpdated")
      .withArgs(await policy.getAddress(), 1);

    await expect(
      registry.connect(employer).setTaxPolicy(await policy.getAddress())
    )
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);
  });
});
