const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("JobEscrow", function () {
  let token, routing, escrow, owner, employer, operator;

  beforeEach(async () => {
    [owner, employer, operator] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy(owner.address);
    await token.connect(owner).mint(employer.address, 1000000);

    // Mock RoutingModule that always returns operator
    const Routing = await ethers.getContractFactory("MockRoutingModule");
    routing = await Routing.deploy(operator.address);

    const Escrow = await ethers.getContractFactory(
      "contracts/v2/modules/JobEscrow.sol:JobEscrow"
    );
    escrow = await Escrow.deploy(await token.getAddress(), await routing.getAddress());
  });

  it("runs normal job flow", async () => {
    const reward = 1000;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "ipfs://job");
    const rcpt = await tx.wait();
    const jobId = rcpt.logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;

    await escrow.connect(operator).submitResult(jobId, "ipfs://result");
    await escrow.connect(employer).acceptResult(jobId);

    expect(await token.balanceOf(operator.address)).to.equal(reward);
  });

  it("allows cancellation before submission", async () => {
    const reward = 500;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "job");
    const jobId = (await tx.wait()).logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;
    await escrow.connect(employer).cancelJob(jobId);
    expect(await token.balanceOf(employer.address)).to.equal(1000000);
  });

  it("operator can claim after timeout", async () => {
    const reward = 700;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "job");
    const jobId = (await tx.wait()).logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;
    await escrow.connect(operator).submitResult(jobId, "res");
    await time.increase(3 * 24 * 60 * 60 + 1);
    await escrow.connect(operator).acceptResult(jobId);
    expect(await token.balanceOf(operator.address)).to.equal(reward);
  });

  it("prevents operator claiming before timeout", async () => {
    const reward = 300;
    await token.connect(employer).approve(await escrow.getAddress(), reward);
    const tx = await escrow.connect(employer).postJob(reward, "job");
    const jobId = (await tx.wait()).logs.find((l) => l.fragment && l.fragment.name === "JobPosted").args.jobId;
    await escrow.connect(operator).submitResult(jobId, "res");
    await expect(escrow.connect(operator).acceptResult(jobId)).to.be.revertedWith(
      "timeout"
    );
  });
});

