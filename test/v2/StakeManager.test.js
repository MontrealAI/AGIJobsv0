const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager", function () {
  let token, stakeManager, owner, user, employer, recipient;

  beforeEach(async () => {
    [owner, user, employer, recipient] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    await token.mint(user.address, 1000);
    await token.mint(employer.address, 1000);
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      owner.address
    );
  });

  it("handles staking, job funds and slashing", async () => {
    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await expect(
      stakeManager.connect(user).depositStake(200)
    ).to.emit(stakeManager, "StakeDeposited").withArgs(user.address, 200);

    expect(await stakeManager.stakes(user.address)).to.equal(200n);

    await stakeManager.connect(user).withdrawStake(50);
    expect(await stakeManager.stakes(user.address)).to.equal(150n);

    await token.connect(employer).approve(await stakeManager.getAddress(), 300);
    await stakeManager
      .connect(owner)
      .lockJobFunds(employer.address, 300);

    await expect(
      stakeManager.connect(owner).releaseJobFunds(user.address, 200)
    ).to.emit(stakeManager, "FundsReleased").withArgs(user.address, 200);
    expect(await token.balanceOf(user.address)).to.equal(1050n);

    await expect(
      stakeManager
        .connect(owner)
        .slash(user.address, recipient.address, 100)
    ).to.emit(stakeManager, "StakeSlashed").withArgs(
      user.address,
      recipient.address,
      100
    );
    expect(await stakeManager.stakes(user.address)).to.equal(50n);
    expect(await token.balanceOf(recipient.address)).to.equal(100n);
  });

  it("restricts token updates to owner", async () => {
    const Token2 = await ethers.getContractFactory("MockERC20");
    const token2 = await Token2.deploy();
    await expect(
      stakeManager.connect(user).setToken(await token2.getAddress())
    ).to.be.revertedWithCustomError(
      stakeManager,
      "OwnableUnauthorizedAccount"
    );
    await stakeManager.connect(owner).setToken(await token2.getAddress());
    expect(await stakeManager.token()).to.equal(await token2.getAddress());
  });
});

