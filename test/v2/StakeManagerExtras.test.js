const { expect } = require("chai");
const { ethers } = require("hardhat");

// Additional StakeManager unit tests focusing on staking flows and limits

describe("StakeManager extras", function () {
  let token, stakeManager, owner, user, treasury;

  beforeEach(async () => {
    [owner, user, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC206Decimals");
    token = await Token.deploy();
    await token.mint(user.address, 1000);
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
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
    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);
    await stakeManager.connect(user).withdrawStake(0, 50);
    expect(await stakeManager.stakeOf(user.address, 0)).to.equal(150n);
  });

  it("requires tax policy acknowledgement before staking", async () => {
    await setupRegistryAck();
    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await expect(
      stakeManager.connect(user).depositStake(0, 100)
    ).to.be.revertedWith("acknowledge tax policy");
  });

  it("enforces max stake per address", async () => {
    await setupRegistryAck(user);
    await stakeManager.connect(owner).setMaxStakePerAddress(150);
    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 100);
    await expect(
      stakeManager.connect(user).depositStake(0, 100)
    ).to.be.revertedWith("max stake");
  });

  it("emits event and accepts new token after token swap", async () => {
    await setupRegistryAck(user);
    const Token = await ethers.getContractFactory("MockERC206Decimals");
    const token2 = await Token.deploy();
    await token2.mint(user.address, 200);
    await expect(
      stakeManager.connect(owner).setToken(await token2.getAddress())
    )
      .to.emit(stakeManager, "TokenUpdated")
      .withArgs(await token2.getAddress());
    await token2
      .connect(user)
      .approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);
    expect(await stakeManager.stakeOf(user.address, 0)).to.equal(200n);
  });
});

