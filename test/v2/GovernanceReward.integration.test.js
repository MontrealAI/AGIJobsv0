const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Governance reward lifecycle", function () {
  let owner, voter1, voter2, voter3, token, reward;

  beforeEach(async () => {
    [owner, voter1, voter2, voter3] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy(owner.address);
    await token.mint(owner.address, 1000 * 1e6);

    const Reward = await ethers.getContractFactory(
      "contracts/v2/GovernanceReward.sol:GovernanceReward"
    );
    reward = await Reward.deploy(await token.getAddress(), owner.address);
  });

  it("distributes rewards across epochs and allows claims", async () => {
    // epoch 0 with two voters
    await reward.recordVoters([voter1.address, voter2.address]);
    const total0 = 200 * 1e6;
    await token.approve(await reward.getAddress(), total0);
    await reward.finalizeEpoch(total0);

    await reward.connect(voter1).claim(0);
    await reward.connect(voter2).claim(0);

    expect(await token.balanceOf(voter1.address)).to.equal(100 * 1e6);
    expect(await token.balanceOf(voter2.address)).to.equal(100 * 1e6);
    await expect(reward.connect(voter1).claim(0)).to.be.revertedWith("claimed");
    await expect(reward.connect(voter3).claim(0)).to.be.revertedWith("not voter");

    // epoch 1 with a single voter
    await reward.recordVoters([voter3.address]);
    const total1 = 50 * 1e6;
    await token.approve(await reward.getAddress(), total1);
    await reward.finalizeEpoch(total1);

    await reward.connect(voter3).claim(1);
    expect(await token.balanceOf(voter3.address)).to.equal(50 * 1e6);
  });
});

