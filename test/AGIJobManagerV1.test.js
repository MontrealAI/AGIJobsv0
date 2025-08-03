const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AGIJobManagerV1", function () {
  let owner, employer, agent, validator, buyer;
  let token, manager;

  beforeEach(async function () {
    [owner, employer, agent, validator, buyer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockAGIToken");
    token = await Token.deploy();
    await token.waitForDeployment();

    const MockENS = await ethers.getContractFactory("MockENS");
    const ens = await MockENS.deploy();
    await ens.waitForDeployment();

    const MockNameWrapper = await ethers.getContractFactory("MockNameWrapper");
    const nameWrapper = await MockNameWrapper.deploy();
    await nameWrapper.waitForDeployment();

    const Manager = await ethers.getContractFactory("AGIJobManagerV1");
    manager = await Manager.deploy(
      token.target,
      "",
      ens.target,
      nameWrapper.target,
      ethers.ZeroHash,
      ethers.ZeroHash,
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await manager.waitForDeployment();

    await manager.addAdditionalAgent(agent.address);
    await manager.addAdditionalValidator(validator.address);
    await manager.setRequiredValidatorApprovals(1);
  });

  it("handles job lifecycle and marketplace", async function () {
    const payout = ethers.parseEther("100");
    const price = ethers.parseEther("10");

    await token.mint(employer.address, payout);
    await token.mint(buyer.address, payout);
    await token.connect(employer).approve(manager.target, payout);

    await expect(
      manager
        .connect(employer)
        .createJob("ipfsHash", payout, 1000, "details")
    ).to.emit(manager, "JobCreated");

    await manager.connect(agent).applyForJob(0, "", []);
    await manager.connect(agent).requestJobCompletion(0, "resultHash");

    await expect(manager.connect(validator).validateJob(0, "", []))
      .to.emit(manager, "JobCompleted");

    const job = await manager.jobs(0);
    expect(job.completed).to.equal(true);

    await expect(
      manager.connect(employer).listNFT(0, price)
    ).to.emit(manager, "NFTListed");

    await expect(
      manager.connect(employer).delistNFT(0)
    ).to.emit(manager, "NFTDelisted");

    await manager.connect(employer).listNFT(0, price);
    await token.connect(buyer).approve(manager.target, price);

    await expect(
      manager.connect(buyer).purchaseNFT(0)
    ).to.emit(manager, "NFTPurchased");

    expect(await manager.ownerOf(0)).to.equal(buyer.address);
  });
});
