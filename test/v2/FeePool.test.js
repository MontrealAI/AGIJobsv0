const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeePool", function () {
  let token, token2, stakeManager, jobRegistry, feePool, owner, user1, user2, employer, treasury, registrySigner;

  beforeEach(async () => {
    [owner, user1, user2, employer, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy();
    token2 = await Token.deploy();

    const StakeManager = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    stakeManager = await StakeManager.deploy(
      await token.getAddress(),
      owner.address,
      treasury.address
    );

    const JobRegistry = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    jobRegistry = await JobRegistry.deploy(owner.address);
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy(
      owner.address,
      "ipfs://policy",
      "ack"
    );
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager.connect(owner).setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user1).acknowledgeTaxPolicy();
    await jobRegistry.connect(user2).acknowledgeTaxPolicy();

    await token.mint(user1.address, 1000);
    await token.mint(user2.address, 1000);
    await token.mint(employer.address, 1000);

    const FeePool = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    feePool = await FeePool.deploy(
      await token.getAddress(),
      await stakeManager.getAddress(),
      2,
      owner.address
    );

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [
      registryAddr,
      "0x56BC75E2D63100000",
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await token.connect(user1).approve(await stakeManager.getAddress(), 1000);
    await token.connect(user2).approve(await stakeManager.getAddress(), 1000);
    await stakeManager.connect(user1).depositStake(2, 100);
    await stakeManager.connect(user2).depositStake(2, 300);
  });

  it("distributes rewards proportionally", async () => {
    const feeAmount = 100;
    const jobId = ethers.encodeBytes32String("job1");
    await token.connect(employer).approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockJobFunds(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(25n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(75n);
  });

  it("burns configured percentage of fees", async () => {
    await feePool.connect(owner).setBurnPct(25);
    const feeAmount = 80;
    const jobId = ethers.encodeBytes32String("job2");
    await token.connect(employer).approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockJobFunds(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );

    const before1 = await token.balanceOf(user1.address);
    const before2 = await token.balanceOf(user2.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token.balanceOf(user1.address)) - before1).to.equal(15n);
    expect((await token.balanceOf(user2.address)) - before2).to.equal(45n);
    const burnAddr = "0x000000000000000000000000000000000000dEaD";
    expect(await token.balanceOf(burnAddr)).to.equal(20n);
  });

  it("uses new token after token swap", async () => {
    await stakeManager.connect(owner).setToken(await token2.getAddress());
    await feePool.connect(owner).setToken(await token2.getAddress());

    await token2.mint(employer.address, 1000);
    const feeAmount = 100;
    const jobId = ethers.encodeBytes32String("job3");
    await token2.connect(employer).approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockJobFunds(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );

    const before1 = await token2.balanceOf(user1.address);
    const before2 = await token2.balanceOf(user2.address);
    await feePool.connect(owner).distributeFees();
    await feePool.connect(user1).claimRewards();
    await feePool.connect(user2).claimRewards();
    expect((await token2.balanceOf(user1.address)) - before1).to.equal(25n);
    expect((await token2.balanceOf(user2.address)) - before2).to.equal(75n);
  });

  it("prevents deployer from claiming rewards without stake", async () => {
    const feeAmount = 50;
    const jobId = ethers.encodeBytes32String("job4");
    await token.connect(employer).approve(await stakeManager.getAddress(), feeAmount);
    await stakeManager
      .connect(registrySigner)
      .lockJobFunds(jobId, employer.address, feeAmount);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(
        jobId,
        user1.address,
        0,
        feeAmount,
        await feePool.getAddress()
      );
    await feePool.connect(owner).distributeFees();
    const before = await token.balanceOf(owner.address);
    await expect(feePool.connect(owner).claimRewards())
      .to.emit(feePool, "RewardsClaimed")
      .withArgs(owner.address, 0);
    expect(await token.balanceOf(owner.address)).to.equal(before);
  });
});
