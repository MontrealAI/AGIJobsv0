const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager", function () {
  let token, stakeManager, owner, user, employer, treasury;

  beforeEach(async () => {
    [owner, user, employer, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    await token.mint(user.address, 1000);
    await token.mint(employer.address, 1000);
    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      owner.address,
      treasury.address
    );
    await stakeManager
      .connect(owner)
      .setStakeParameters(0, 50, 50, treasury.address);
  });

  it("handles staking, job escrow and slashing", async () => {
    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await expect(
      stakeManager.connect(user).depositStake(200)
    ).to.emit(stakeManager, "StakeDeposited").withArgs(user.address, 200);

    expect(await stakeManager.stakes(user.address)).to.equal(200n);

    await stakeManager.connect(user).withdrawStake(50);
    expect(await stakeManager.stakes(user.address)).to.equal(150n);

    const jobId = ethers.encodeBytes32String("job1");
    await token.connect(employer).approve(await stakeManager.getAddress(), 300);
    await stakeManager
      .connect(owner)
      .lockPayout(jobId, employer.address, 300);

    await expect(
      stakeManager.connect(owner).releasePayout(jobId, user.address, 200)
    ).to.emit(stakeManager, "PayoutReleased").withArgs(jobId, user.address, 200);
    expect(await token.balanceOf(user.address)).to.equal(1050n);

    await expect(
      stakeManager.connect(owner).slash(user.address, 100, employer.address)
    ).to.emit(stakeManager, "StakeSlashed").withArgs(
      user.address,
      employer.address,
      treasury.address,
      50,
      50
    );
    expect(await stakeManager.stakes(user.address)).to.equal(50n);
    expect(await token.balanceOf(employer.address)).to.equal(750n);
    expect(await token.balanceOf(treasury.address)).to.equal(50n);
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

