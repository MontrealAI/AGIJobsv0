const { expect } = require("chai");
const { ethers } = require("hardhat");

async function setup() {
  const [owner, mod1, mod2, employer, agent, outsider] = await ethers.getSigners();
  const JobMock = await ethers.getContractFactory("MockJobRegistry");
  const registry = await JobMock.deploy();
  const StakeMock = await ethers.getContractFactory("MockStakeManager");
  const stake = await StakeMock.deploy();
  const Dispute = await ethers.getContractFactory("contracts/v2/DisputeModule.sol:DisputeModule");
  const dispute = await Dispute.deploy(await registry.getAddress(), await stake.getAddress(), owner.address, 0);
  await registry.setDisputeModule(await dispute.getAddress());
  await dispute.addModerator(mod1.address);
  await dispute.addModerator(mod2.address);
  return { owner, mod1, mod2, employer, agent, outsider, registry, dispute };
}

describe("Dispute flow fuzz", function () {
  it("rejects multiple appeals", async function () {
    const { agent, employer, registry } = await setup();
    const attempts = 2 + Math.floor(Math.random() * 4);
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
    await registry.connect(agent).dispute(1, "first");
    for (let i = 1; i < attempts; i++) {
      await expect(registry.connect(agent).dispute(1, "again")).to.be.revertedWith(
        "disputed"
      );
    }
  });

  it("prevents invalid resolutions", async function () {
    const { agent, employer, registry, dispute, outsider } = await setup();
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
    await registry.connect(agent).dispute(1, "evidence");
    await expect(dispute.connect(outsider).resolve(1, true)).to.be.revertedWith(
      "not moderator"
    );
  });
});
