const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("JobEscrow", function () {
  let token, routing, escrow, owner, employer, operator;
  const seed = ethers.ZeroHash;

  beforeEach(async () => {
    [owner, employer, operator] = await ethers.getSigners();

    const { AGIALPHA } = require("../../scripts/constants");
    token = await ethers.getContractAt("MockERC20", AGIALPHA);
    await token.mint(employer.address, 1000000);

    // Mock RoutingModule that always returns operator
    const Routing = await ethers.getContractFactory("MockRoutingModule");
    routing = await Routing.deploy(operator.address);

    const Escrow = await ethers.getContractFactory(
      "contracts/v2/modules/JobEscrow.sol:JobEscrow"
    );
    escrow = await Escrow.deploy(await routing.getAddress());
  });

  it("runs normal job flow", async () => {
    const reward = 1000;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "ipfs://job", seed);
    const rcpt = await tx.wait();
    const jobId = rcpt.logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;

    await escrow.connect(operator).submitResult(jobId, "ipfs://result");
    await escrow.connect(employer).acceptResult(jobId);

    expect(await token.balanceOf(operator.address)).to.equal(reward);
  });

  it("allows cancellation before submission", async () => {
    const reward = 500;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "job", seed);
    const jobId = (await tx.wait()).logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;
    await escrow.connect(employer).cancelJob(jobId);
    expect(await token.balanceOf(employer.address)).to.equal(1000000);
  });

  it("operator can claim after timeout", async () => {
    const reward = 700;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "job", seed);
    const jobId = (await tx.wait()).logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;
    await escrow.connect(operator).submitResult(jobId, "res");
    await time.increase(3 * 24 * 60 * 60 + 1);
    await escrow.connect(operator).acceptResult(jobId);
    expect(await token.balanceOf(operator.address)).to.equal(reward);
  });

  it("prevents operator claiming before timeout", async () => {
    const reward = 300;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "job", seed);
    const jobId = (await tx.wait()).logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;
    await escrow.connect(operator).submitResult(jobId, "res");
    await expect(escrow.connect(operator).acceptResult(jobId)).to.be.revertedWith(
      "timeout"
    );
  });

  it("acknowledgeAndAcceptResult accepts and records acknowledgement", async () => {
    const reward = 800;
    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const jobRegistry = await JobRegistry.deploy(
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
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const policy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry.connect(owner).setTaxPolicy(await policy.getAddress());
    await jobRegistry
      .connect(owner)
      .setAcknowledger(await escrow.getAddress(), true);
    await escrow
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());

    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow
      .connect(employer)
      .postJob(reward, "ipfs://job", seed);
    const jobId = (await tx.wait()).logs.find(
      (l) => l.fragment && l.fragment.name === "JobPosted"
    ).args.jobId;
    await escrow.connect(operator).submitResult(jobId, "ipfs://result");
    await expect(
      escrow.connect(employer).acknowledgeAndAcceptResult(jobId)
    )
      .to.emit(escrow, "ResultAccepted")
      .withArgs(jobId, employer.address);
    expect(await token.balanceOf(operator.address)).to.equal(reward);
    expect(await policy.hasAcknowledged(employer.address)).to.equal(true);
  });
});

