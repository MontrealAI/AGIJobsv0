const { expect } = require("chai");
const { ethers } = require("hardhat");

const TOKEN = 10n ** 18n; // 1 token with 18 decimals

describe("Governance reward lifecycle", function () {
  let owner, voter1, voter2, voter3, token, stakeManager, feePool, reward, treasury;

  beforeEach(async () => {
    [owner, voter1, voter2, voter3, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy();

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
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager.connect(owner).setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(voter1).acknowledgeTaxPolicy();
    await jobRegistry.connect(voter2).acknowledgeTaxPolicy();
    await jobRegistry.connect(voter3).acknowledgeTaxPolicy();

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePool.deploy(
      await token.getAddress(),
      await stakeManager.getAddress(),
      0,
      treasury.address
    );
    await feePool.setBurnPct(0);

    const Reward = await ethers.getContractFactory(
      "contracts/v2/GovernanceReward.sol:GovernanceReward"
    );
    reward = await Reward.deploy(
      await token.getAddress(),
      await feePool.getAddress(),
      await stakeManager.getAddress(),
      2,
      1,
      50
    );

    await feePool.connect(owner).transferOwnership(await reward.getAddress());

    // stake setup
    await token.mint(voter1.address, 100n * TOKEN);
    await token.mint(voter2.address, 100n * TOKEN);
    await token.mint(voter3.address, 100n * TOKEN);

    await token
      .connect(voter1)
      .approve(await stakeManager.getAddress(), 100n * TOKEN);
    await token
      .connect(voter2)
      .approve(await stakeManager.getAddress(), 100n * TOKEN);
    await token
      .connect(voter3)
      .approve(await stakeManager.getAddress(), 100n * TOKEN);
    await stakeManager.connect(voter1).depositStake(2, 100n * TOKEN);
    await stakeManager.connect(voter2).depositStake(2, 100n * TOKEN);
    await stakeManager.connect(voter3).depositStake(2, 100n * TOKEN);

    // fund pool with 200 tokens
    await token.mint(await feePool.getAddress(), 200n * TOKEN);
  });

  it("distributes rewards across epochs and allows claims", async () => {
    // epoch 0 with two voters
    await reward.recordVoters([voter1.address, voter2.address]);
    await ethers.provider.send("evm_increaseTime", [1]);
    await ethers.provider.send("evm_mine", []);
    await reward.finalizeEpoch();

    await reward.connect(voter1).claim(0);
    await reward.connect(voter2).claim(0);

    expect(await token.balanceOf(voter1.address)).to.equal(50n * TOKEN);
    expect(await token.balanceOf(voter2.address)).to.equal(50n * TOKEN);
    await expect(reward.connect(voter1).claim(0)).to.be.revertedWith("claimed");
    await expect(reward.connect(voter3).claim(0)).to.be.revertedWith("not voter");

    // fund pool with remaining 100 tokens for next epoch already there
    await reward.recordVoters([voter3.address]);
    await ethers.provider.send("evm_increaseTime", [1]);
    await ethers.provider.send("evm_mine", []);
    await reward.finalizeEpoch();

    await reward.connect(voter3).claim(1);
    expect(await token.balanceOf(voter3.address)).to.equal(50n * TOKEN);
  });
});

