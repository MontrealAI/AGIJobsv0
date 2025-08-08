const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule", function () {
  let dispute, jobRegistry, owner, employer, agent, moderator;
  const appealFee = 10n;

  beforeEach(async () => {
    [owner, employer, agent, moderator] = await ethers.getSigners();
    const RegistryStub = await ethers.getContractFactory(
      "contracts/mocks/DisputeRegistryStub.sol:DisputeRegistryStub"
    );
    jobRegistry = await RegistryStub.deploy();
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(await jobRegistry.getAddress(), owner.address);
    await dispute.connect(owner).setAppealFee(appealFee);
    await dispute.connect(owner).setModerator(moderator.address);
  });

  async function raise(jobId, agentSigner) {
    await jobRegistry.setJob(jobId, {
      agent: agentSigner.address,
      employer: employer.address,
      reward: 0,
      stake: 0,
      state: 0,
    });
    await jobRegistry
      .connect(agentSigner)
      .appeal(await dispute.getAddress(), jobId, { value: appealFee });
  }

  it("pays bond to employer when they win", async () => {
    await raise(1, agent);
    expect(await dispute.bonds(1)).to.equal(appealFee);
    const before = await ethers.provider.getBalance(employer.address);
    await dispute.connect(moderator).resolve(1, true);
    const after = await ethers.provider.getBalance(employer.address);
    expect(after - before).to.equal(appealFee);
  });

  it("returns bond to agent when employer loses", async () => {
    await raise(2, agent);
    expect(await dispute.bonds(2)).to.equal(appealFee);
    const before = await ethers.provider.getBalance(agent.address);
    await dispute.connect(moderator).resolve(2, false);
    const after = await ethers.provider.getBalance(agent.address);
    expect(after - before).to.equal(appealFee);
  });
});
