const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeManager release", function () {
  let token, stakeManager, jobRegistry, feePool, owner, user1, user2, treasury, registrySigner;

  beforeEach(async () => {
    [owner, user1, user2, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(0,
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
    jobRegistry = await JobRegistry.deploy(
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
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user1).acknowledgeTaxPolicy();
    await jobRegistry.connect(user2).acknowledgeTaxPolicy();

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePool.deploy(await stakeManager.getAddress(),
      0,
      treasury.address
    );
    await feePool.connect(owner).setBurnPct(0);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [
      registryAddr,
      "0x56BC75E2D63100000",
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await token.mint(user1.address, 1000);
    await token.mint(user2.address, 1000);
    await token.connect(user1).approve(await stakeManager.getAddress(), 1000);
    await token.connect(user2).approve(await stakeManager.getAddress(), 1000);
    await stakeManager.connect(user1).depositStake(2, 100);
    await stakeManager.connect(user2).depositStake(2, 300);

    await stakeManager.connect(owner).setFeePool(await feePool.getAddress());
    await stakeManager.connect(owner).setFeePct(20);
    await stakeManager.connect(owner).setBurnPct(10);

    await token.mint(await stakeManager.getAddress(), 100);
  });

  it("diverts fee and burn on release", async () => {
    const burnAddr = "0x000000000000000000000000000000000000dEaD";
    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    const beforeBurn = await token.balanceOf(burnAddr);

    await expect(
      stakeManager.connect(registrySigner).release(user1.address, 100)
    )
      .to.emit(stakeManager, "StakeReleased")
      .withArgs(ethers.ZeroHash, await feePool.getAddress(), 20)
      .and.to.emit(stakeManager, "StakeReleased")
      .withArgs(ethers.ZeroHash, burnAddr, 10)
      .and.to.emit(stakeManager, "StakeReleased")
      .withArgs(ethers.ZeroHash, user1.address, 70);

    expect((await token.balanceOf(user1.address)) - before1).to.equal(70n);
    expect((await token.balanceOf(burnAddr)) - beforeBurn).to.equal(10n);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(20n);

    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();

    expect((await token.balanceOf(user1.address)) - (before1 + 70n)).to.equal(
      5n
    );
    expect((await token.balanceOf(user2.address)) - before2).to.equal(15n);
  });

  it("splits job fund release with fee and burn", async () => {
    const burnAddr = "0x000000000000000000000000000000000000dEaD";
    const jobId = ethers.encodeBytes32String("jobA");
    const before1 = await token.balanceOf(user1.address);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, user2.address, 100);
    const before2 = await token.balanceOf(user2.address);
    const beforeBurn = await token.balanceOf(burnAddr);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, user1.address, 100)
    )
      .to.emit(stakeManager, "StakeReleased")
      .withArgs(jobId, await feePool.getAddress(), 20)
      .and.to.emit(stakeManager, "StakeReleased")
      .withArgs(jobId, burnAddr, 10)
      .and.to.emit(stakeManager, "StakeReleased")
      .withArgs(jobId, user1.address, 70);

    expect((await token.balanceOf(user1.address)) - before1).to.equal(70n);
    expect((await token.balanceOf(burnAddr)) - beforeBurn).to.equal(10n);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(20n);

    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();

    expect((await token.balanceOf(user1.address)) - (before1 + 70n)).to.equal(
      5n
    );
    expect((await token.balanceOf(user2.address)) - before2).to.equal(15n);
  });

  it("burns fee when fee pool unset", async () => {
    const burnAddr = "0x000000000000000000000000000000000000dEaD";
    await stakeManager.connect(owner).setFeePool(ethers.ZeroAddress);

    const before1 = await token.balanceOf(user1.address);
    const beforeBurn = await token.balanceOf(burnAddr);

    await expect(
      stakeManager.connect(registrySigner).release(user1.address, 100)
    )
      .to.emit(stakeManager, "StakeReleased")
      .withArgs(ethers.ZeroHash, burnAddr, 20)
      .and.to.emit(stakeManager, "StakeReleased")
      .withArgs(ethers.ZeroHash, burnAddr, 10)
      .and.to.emit(stakeManager, "StakeReleased")
      .withArgs(ethers.ZeroHash, user1.address, 70);

    expect((await token.balanceOf(user1.address)) - before1).to.equal(70n);
    expect((await token.balanceOf(burnAddr)) - beforeBurn).to.equal(30n);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(0n);
  });

  it("restricts fee configuration to owner", async () => {
    await expect(stakeManager.connect(user1).setFeePct(1)).to.be.revertedWith(
      "governance only"
    );
    await expect(
      stakeManager.connect(user1).setFeePool(await feePool.getAddress())
    ).to.be.revertedWith("governance only");
    await expect(stakeManager.connect(user1).setBurnPct(1)).to.be.revertedWith(
      "governance only"
    );
  });
});
