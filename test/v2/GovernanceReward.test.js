const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GovernanceReward", function () {
  let owner, voter1, voter2, token, stakeManager, feePool, reward, treasury;

  beforeEach(async () => {
    [owner, voter1, voter2, treasury] = await ethers.getSigners();

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
      ethers.ZeroAddress
    );

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
      ethers.ZeroAddress,
      0,
      0
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

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePool.deploy(
      await token.getAddress(),
      await stakeManager.getAddress(),
      2,
      0,
      treasury.address
    );

    const Reward = await ethers.getContractFactory(
      "contracts/v2/GovernanceReward.sol:GovernanceReward"
    );
    reward = await Reward.deploy(
      await token.getAddress(),
      await feePool.getAddress(),
      await stakeManager.getAddress(),
      2
    );

    await reward.setEpochLength(1);
    await reward.setRewardPct(50);

    await token.mint(voter1.address, 100 * 1e6);
    await token.mint(voter2.address, 300 * 1e6);

    await token.connect(voter1).approve(await stakeManager.getAddress(), 100 * 1e6);
    await token.connect(voter2).approve(await stakeManager.getAddress(), 300 * 1e6);
    await stakeManager.connect(voter1).depositStake(2, 100 * 1e6);
    await stakeManager.connect(voter2).depositStake(2, 300 * 1e6);

    // fund fee pool
    await token.mint(await feePool.getAddress(), 100 * 1e6);
  });

  it("rewards voters proportional to staked balance", async () => {
    await reward.recordVoters([voter1.address, voter2.address]);

    await ethers.provider.send("evm_increaseTime", [1]);
    await ethers.provider.send("evm_mine", []);

    await expect(reward.finalizeEpoch())
      .to.emit(reward, "EpochFinalized")
      .withArgs(0, 50 * 1e6);

    await expect(reward.connect(voter1).claim(0))
      .to.emit(reward, "RewardClaimed")
      .withArgs(0, voter1.address, 12500000);
    await expect(reward.connect(voter2).claim(0))
      .to.emit(reward, "RewardClaimed")
      .withArgs(0, voter2.address, 37500000);

    expect(await token.balanceOf(voter1.address)).to.equal(12500000);
    expect(await token.balanceOf(voter2.address)).to.equal(37500000);

    await expect(reward.connect(voter1).claim(0)).to.be.revertedWith("claimed");
  });
});

