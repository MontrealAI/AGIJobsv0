const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const FEE = 10n ** 18n;

describe("ArbitratorCommittee", function () {
  it("handles commit-reveal voting and finalization", async () => {
    const [owner, employer, agent, v1, v2, v3] = await ethers.getSigners();

    const { AGIALPHA } = require("../../scripts/constants");
    const token = await ethers.getContractAt(
      "contracts/test/AGIALPHAToken.sol:AGIALPHAToken",
      AGIALPHA
    );

    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stake = await Stake.deploy(
      0,
      0,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stake.waitForDeployment();

    const JobMock = await ethers.getContractFactory("MockJobRegistry");
    const registry = await JobMock.deploy();
    await registry.waitForDeployment();
    await registry.setStakeManager(await stake.getAddress());
    await stake.setJobRegistry(await registry.getAddress());

    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    const validation = await Validation.deploy();
    await validation.setValidators([v1.address, v2.address, v3.address]);
    await registry.setValidationModule(await validation.getAddress());

    const Dispute = await ethers.getContractFactory(
      "contracts/v2/modules/DisputeModule.sol:DisputeModule"
    );
    const dispute = await Dispute.deploy(
      await registry.getAddress(),
      FEE,
      10n,
      ethers.ZeroAddress
    );
    await dispute.waitForDeployment();
    await registry.setDisputeModule(await dispute.getAddress());
    await stake.setDisputeModule(await dispute.getAddress());

    const Committee = await ethers.getContractFactory(
      "contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee"
    );
    const committee = await Committee.deploy(
      await registry.getAddress(),
      await dispute.getAddress()
    );
    await dispute.setCommittee(await committee.getAddress());

    await token.mint(agent.address, FEE);
    await token.connect(agent).approve(await stake.getAddress(), FEE);
    await token.mint(employer.address, FEE);
    await token.connect(employer).approve(await stake.getAddress(), FEE);

    await registry.setJob(1, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 4,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    });

    const evidence = ethers.id("evidence");
    await expect(registry.connect(agent).dispute(1, evidence))
      .to.emit(dispute, "DisputeRaised")
      .withArgs(1, agent.address, evidence);

    const s1 = 1n,
      s2 = 2n,
      s3 = 3n;
    const c1 = ethers.keccak256(
      ethers.solidityPacked(["address", "uint256", "bool", "uint256"], [
        v1.address,
        1,
        true,
        s1,
      ])
    );
    const c2 = ethers.keccak256(
      ethers.solidityPacked(["address", "uint256", "bool", "uint256"], [
        v2.address,
        1,
        true,
        s2,
      ])
    );
    const c3 = ethers.keccak256(
      ethers.solidityPacked(["address", "uint256", "bool", "uint256"], [
        v3.address,
        1,
        false,
        s3,
      ])
    );

    await committee.connect(v1).commit(1, c1);
    await committee.connect(v2).commit(1, c2);
    await committee.connect(v3).commit(1, c3);

    await committee.connect(v1).reveal(1, true, s1);
    await committee.connect(v2).reveal(1, true, s2);
    await committee.connect(v3).reveal(1, false, s3);

    await time.increase(10n);

    await expect(committee.finalize(1))
      .to.emit(dispute, "DisputeResolved")
      .withArgs(1, await committee.getAddress(), true);
  });
});

