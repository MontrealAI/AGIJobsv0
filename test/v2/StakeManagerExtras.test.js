const { expect } = require("chai");
const { ethers } = require("hardhat");

// Additional StakeManager unit tests focusing on staking flows and limits

describe("StakeManager extras", function () {
  const { AGIALPHA } = require("../../scripts/constants");
  let token, stakeManager, owner, user, treasury;

  beforeEach(async () => {
    [owner, user, treasury] = await ethers.getSigners();
    token = await ethers.getContractAt(
      "contracts/test/AGIALPHAToken.sol:AGIALPHAToken",
      AGIALPHA
    );
    await token.mint(user.address, ethers.parseEther("1000"));
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(0);
  });

  async function setupRegistryAck(signer) {
    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
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
    const taxPolicy = await TaxPolicy.deploy(
      "ipfs://policy",
      "ack"
    );
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    if (signer) {
      await jobRegistry.connect(signer).acknowledgeTaxPolicy();
    }
    return { jobRegistry };
  }

  it("allows deposit and withdrawal of stake", async () => {
    await setupRegistryAck(user);
    await token
      .connect(user)
      .approve(await stakeManager.getAddress(), ethers.parseEther("200"));
    await stakeManager
      .connect(user)
      .depositStake(0, ethers.parseEther("200"));
    await stakeManager
      .connect(user)
      .withdrawStake(0, ethers.parseEther("50"));
    expect(await stakeManager.stakeOf(user.address, 0)).to.equal(
      ethers.parseEther("150")
    );
  });

  it("requires tax policy acknowledgement before staking", async () => {
    await setupRegistryAck();
    await token
      .connect(user)
      .approve(await stakeManager.getAddress(), ethers.parseEther("100"));
    await expect(
      stakeManager
        .connect(user)
        .depositStake(0, ethers.parseEther("100"))
    )
      .to.be.revertedWithCustomError(stakeManager, "TaxPolicyNotAcknowledged")
      .withArgs(user.address);
  });

  it("enforces max stake per address", async () => {
    await setupRegistryAck(user);
    await stakeManager
      .connect(owner)
      .setMaxStakePerAddress(ethers.parseEther("150"));
    await token
      .connect(user)
      .approve(await stakeManager.getAddress(), ethers.parseEther("200"));
    await stakeManager
      .connect(user)
      .depositStake(0, ethers.parseEther("100"));
    await expect(
      stakeManager
        .connect(user)
        .depositStake(0, ethers.parseEther("100"))
    ).to.be.revertedWithCustomError(stakeManager, "MaxStakeExceeded");
  });

});

