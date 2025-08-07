const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobRegistry integration", function () {
  let token, stakeManager, rep, validation, nft, registry;
  let owner, employer, agent;

  const reward = 100;
  const stake = 200;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    const StakeManager = await ethers.getContractFactory("StakeManager");
    stakeManager = await StakeManager.deploy(await token.getAddress(), owner.address);
    const Validation = await ethers.getContractFactory(
      "contracts/ValidationModule.sol:ValidationModule"
    );
    validation = await Validation.deploy(owner.address);
    const Rep = await ethers.getContractFactory("ReputationEngine");
    rep = await Rep.deploy(owner.address);
    const NFT = await ethers.getContractFactory("CertificateNFT");
    nft = await NFT.deploy("Cert", "CERT", owner.address);
    const Registry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    registry = await Registry.deploy(owner.address);

    await registry.connect(owner).setValidationModule(await validation.getAddress());
    await registry.connect(owner).setStakeManager(await stakeManager.getAddress());
    await registry.connect(owner).setReputationEngine(await rep.getAddress());
    await registry.connect(owner).setCertificateNFT(await nft.getAddress());
    await rep.connect(owner).setCaller(await registry.getAddress(), true);
    await stakeManager.connect(owner).transferOwnership(await registry.getAddress());
    await nft.connect(owner).transferOwnership(await registry.getAddress());

    await token.mint(employer.address, 1000);
    await token.mint(agent.address, 1000);

    await token.connect(agent).approve(await stakeManager.getAddress(), stake);
    await stakeManager.connect(agent).depositStake(stake);
  });

  it("runs successful job lifecycle", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await validation.connect(owner).setOutcome(1, true);
    await registry.connect(employer).createJob(agent.address, reward, stake);
    await registry.connect(agent).requestJobCompletion(1);
    await registry.finalize(1);

    expect(await token.balanceOf(agent.address)).to.equal(1100);
    expect(await rep.reputation(agent.address)).to.equal(1);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("handles collusion resolved by dispute", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await validation.connect(owner).setOutcome(1, false); // colluding validator
    await registry.connect(employer).createJob(agent.address, reward, stake);
    await registry.connect(agent).requestJobCompletion(1);
    await registry.connect(agent).dispute(1);
    await registry.connect(owner).resolveDispute(1, true);
    await registry.finalize(1);

    expect(await token.balanceOf(agent.address)).to.equal(1100);
    expect(await rep.reputation(agent.address)).to.equal(1);
    expect(await nft.balanceOf(agent.address)).to.equal(1);
  });

  it("slashes stake when dispute fails", async () => {
    await token.connect(employer).approve(await stakeManager.getAddress(), reward);
    await validation.connect(owner).setOutcome(1, false);
    await registry.connect(employer).createJob(agent.address, reward, stake);
    await registry.connect(agent).requestJobCompletion(1);
    await registry.connect(agent).dispute(1);
    await registry.connect(owner).resolveDispute(1, false);
    await registry.finalize(1);

    expect(await token.balanceOf(agent.address)).to.equal(800);
    expect(await token.balanceOf(employer.address)).to.equal(1200);
    expect(await rep.reputation(agent.address)).to.equal(-1);
    expect(await nft.balanceOf(agent.address)).to.equal(0);
  });
});

