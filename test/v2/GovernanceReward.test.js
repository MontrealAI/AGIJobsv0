const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GovernanceReward", function () {
  let owner, voter1, voter2, token, reward;

  beforeEach(async () => {
    [owner, voter1, voter2] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy(owner.address);
    await token.mint(owner.address, 1000 * 1e6); // 1000 tokens

    const Reward = await ethers.getContractFactory(
      "contracts/v2/GovernanceReward.sol:GovernanceReward"
    );
    reward = await Reward.deploy(await token.getAddress(), owner.address);
  });

  it("distributes rewards equally to recorded voters", async () => {
    await reward.recordVoters([voter1.address, voter2.address]);
    const total = 200 * 1e6; // 200 tokens
    await token.approve(await reward.getAddress(), total);
    await reward.finalizeEpoch(total);

    await reward.connect(voter1).claim(0);
    await reward.connect(voter2).claim(0);

    expect(await token.balanceOf(voter1.address)).to.equal(100 * 1e6);
    expect(await token.balanceOf(voter2.address)).to.equal(100 * 1e6);

    await expect(reward.connect(voter1).claim(0)).to.be.revertedWith("claimed");
    await expect(reward.connect(owner).claim(0)).to.be.revertedWith("not voter");
  });
});

