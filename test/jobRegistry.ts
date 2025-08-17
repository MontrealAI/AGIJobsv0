const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

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
    const MockRep = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockReputationEngine"
    );
    const mockRep = await MockRep.deploy();
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await mockRep.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      []
    );

    const Policy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    policy = await Policy.deploy("ipfs://policy", "ack");

    await registry.connect(owner).setJobParameters(0, 0);
    await registry.connect(owner).setMaxJobReward(1000);
    await registry.connect(owner).setMaxJobDuration(86400);

    const Verifier = await ethers.getContractFactory(
      "contracts/v2/mocks/ENSOwnershipVerifierMock.sol:ENSOwnershipVerifierMock"
    );
    const verifier = await Verifier.deploy();
    await registry.setENSOwnershipVerifier(await verifier.getAddress());
  });

  it("requires acknowledgement before job actions", async () => {
    const deadline1 = (await time.latest()) + 1000;
    await expect(
      registry.connect(employer).createJob(1, deadline1, "uri")
    ).to.be.revertedWith("acknowledge tax policy");

    await expect(
      registry.connect(owner).setTaxPolicy(await policy.getAddress())
    )
      .to.emit(registry, "TaxPolicyUpdated")
      .withArgs(await policy.getAddress(), 1);

    const deadline2 = (await time.latest()) + 1000;
    await expect(
      registry.connect(employer).createJob(1, deadline2, "uri")
    ).to.be.revertedWith("acknowledge tax policy");

    await expect(
      registry.connect(employer).acknowledgeTaxPolicy()
    )
      .to.emit(registry, "TaxAcknowledged")
      .withArgs(employer.address, 1, "ack");

    const deadline3 = (await time.latest()) + 1000;
    await expect(
      registry.connect(employer).createJob(1, deadline3, "uri")
    )
      .to.emit(registry, "JobCreated")
      .withArgs(1, employer.address, ethers.ZeroAddress, 1, 0, 0);

    await expect(
      registry.connect(agent).applyForJob(1, "", [])
    ).to.be.revertedWith("acknowledge tax policy");

    await expect(
      registry.connect(agent).acknowledgeTaxPolicy()
    )
      .to.emit(registry, "TaxAcknowledged")
      .withArgs(agent.address, 1, "ack");

    await expect(
      registry.connect(agent).applyForJob(1, "", [])
    ).to.emit(registry, "JobApplied").withArgs(1, agent.address);
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
