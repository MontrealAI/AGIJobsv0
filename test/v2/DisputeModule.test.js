const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DisputeModule", function () {
  let dispute, jobRegistry, owner, employer, agent, moderator, jury;
  const appealFee = 10n;

  beforeEach(async () => {
    [owner, employer, agent, moderator, jury] = await ethers.getSigners();
    const RegistryStub = await ethers.getContractFactory(
      "contracts/mocks/DisputeRegistryStub.sol:DisputeRegistryStub"
    );
    jobRegistry = await RegistryStub.deploy();
    const Dispute = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    dispute = await Dispute.deploy(
      await jobRegistry.getAddress(),
      appealFee,
      moderator.address,
      jury.address
    );
  });

  async function raise(jobId, agentSigner) {
    await jobRegistry.acknowledge(agentSigner.address);
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

  it("pays bond to employer when moderator rules for them", async () => {
    await raise(1, agent);
    expect(await dispute.bonds(1)).to.equal(appealFee);
    const before = await ethers.provider.getBalance(employer.address);
    await dispute.connect(moderator).resolve(1, true);
    const after = await ethers.provider.getBalance(employer.address);
    expect(after - before).to.equal(appealFee);
  });

  it("returns bond to agent when jury rejects employer claim", async () => {
    await raise(2, agent);
    expect(await dispute.bonds(2)).to.equal(appealFee);
    const before = await ethers.provider.getBalance(agent.address);
    await dispute.connect(jury).resolve(2, false);
    const after = await ethers.provider.getBalance(agent.address);
    expect(after - before).to.equal(appealFee);
  });

  it("reverts when appellant has not acknowledged", async () => {
    const jobId = 3;
    await jobRegistry.setJob(jobId, {
      agent: agent.address,
      employer: employer.address,
      reward: 0,
      stake: 0,
      state: 0,
    });
    await expect(
      dispute.connect(agent).appeal(jobId, { value: appealFee })
    ).to.be.revertedWith("acknowledge tax policy");
  });

  it("only allows owner to update registry", async () => {
    const RegistryStub = await ethers.getContractFactory(
      "contracts/mocks/DisputeRegistryStub.sol:DisputeRegistryStub"
    );
    const newReg = await RegistryStub.deploy();
    await expect(
      dispute.connect(owner).setJobRegistry(await newReg.getAddress())
    )
      .to.emit(dispute, "JobRegistryUpdated")
      .withArgs(await newReg.getAddress());
    await expect(
      dispute.connect(agent).setJobRegistry(await newReg.getAddress())
    ).to.be.revertedWithCustomError(dispute, "OwnableUnauthorizedAccount").withArgs(
      agent.address
    );
  });

  it("restricts parameter updates to the owner", async () => {
    await expect(dispute.connect(owner).setAppealFee(20n))
      .to.emit(dispute, "AppealFeeUpdated")
      .withArgs(20n);
    await expect(dispute.connect(owner).setModerator(employer.address))
      .to.emit(dispute, "ModeratorUpdated")
      .withArgs(employer.address);
    await expect(dispute.connect(owner).setAppealJury(agent.address))
      .to.emit(dispute, "AppealJuryUpdated")
      .withArgs(agent.address);
    await expect(dispute.connect(employer).setAppealFee(30n))
      .to.be.revertedWithCustomError(dispute, "OwnableUnauthorizedAccount")
      .withArgs(employer.address);
  });
});
