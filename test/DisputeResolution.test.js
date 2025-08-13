const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeResolution", function () {
  let owner, challenger, stakeManager, reputation, validation, dispute;

  beforeEach(async () => {
    [owner, challenger] = await ethers.getSigners();

    const StakeManager = await ethers.getContractFactory(
      "contracts/mocks/StubStakeManager.sol:StubStakeManager"
    );
    stakeManager = await StakeManager.deploy();
    const stakeAddr = await stakeManager.getAddress();

    const Reputation = await ethers.getContractFactory(
      "contracts/mocks/StubReputationEngine.sol:StubReputationEngine"
    );
    reputation = await Reputation.deploy();
    const repAddr = await reputation.getAddress();

    const Validation = await ethers.getContractFactory(
      "contracts/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy();
    const valAddr = await validation.getAddress();
    await validation.connect(owner).setStakeManager(stakeAddr);
    await validation.connect(owner).setChallengeWindow(1000);
    await validation.connect(owner).setDisputeBond(50);

    const Dispute = await ethers.getContractFactory(
      "contracts/DisputeResolution.sol:DisputeResolution"
    );
    dispute = await Dispute.deploy();
    const disputeAddr = await dispute.getAddress();
    await dispute.setStakeManager(stakeAddr);
    await dispute.setReputationEngine(repAddr);
    await dispute.setValidationModule(valAddr);
    await validation.connect(owner).setDisputeResolution(disputeAddr);
  });

  it("slashes challenger and rewards validator when validator wins", async () => {
    await validation.connect(owner).setOutcome(1, true);
    await validation.connect(challenger).challenge(1);

    await dispute.connect(owner).resolve(1, true);

    expect(
      await stakeManager.slashed(challenger.address, owner.address)
    ).to.equal(50n);
    expect(await reputation.reputation(owner.address)).to.equal(1n);
    expect(await reputation.reputation(challenger.address)).to.equal(0n);
    expect(await validation.challenger(1)).to.equal(ethers.ZeroAddress);
  });

  it("slashes validator and rewards challenger when challenger wins", async () => {
    await validation.connect(owner).setOutcome(1, true);
    await validation.connect(challenger).challenge(1);

    await dispute.connect(owner).resolve(1, false);

    expect(
      await stakeManager.slashed(owner.address, challenger.address)
    ).to.equal(50n);
    expect(await reputation.reputation(challenger.address)).to.equal(1n);
    expect(await reputation.reputation(owner.address)).to.equal(0n);
  });
});
