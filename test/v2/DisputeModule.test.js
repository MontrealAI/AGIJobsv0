const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule", function () {
  let dispute, registry, stakeManager, owner, employer, agent;
  const appealFee = 5n;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockJobRegistry"
    );
    registry = await Registry.deploy();
    const Stake = await ethers.getContractFactory(
      "contracts/mocks/MockV2.sol:MockStakeManager"
    );
    stakeManager = await Stake.deploy();
    await registry.setStakeManager(stakeManager.target);
    await registry.setTaxPolicyVersion(1);
    await registry.connect(agent).acknowledgeTaxPolicy();
    await registry.setJob(1, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 0,
      uri: "",
    });
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(registry.target);
    await dispute.connect(owner).setAppealFee(appealFee);
    await dispute.connect(owner).setDisputeWindow(0);
  });

  it("raises and resolves disputes", async () => {
    await expect(dispute.connect(agent).raiseDispute(1, "evidence"))
      .to.emit(dispute, "DisputeRaised")
      .withArgs(1, agent.address, "evidence");

    const block = await ethers.provider.getBlock("latest");
    const expected = (BigInt(block.hash) ^ 1n) % 2n === 0n;
    await expect(dispute.connect(owner).resolveDispute(1))
      .to.emit(dispute, "DisputeResolved")
      .withArgs(1, expected);
    expect(await dispute.bonds(1)).to.equal(0n);
  });
});
