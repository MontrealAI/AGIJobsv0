const { expect } = require("chai");
const { ethers } = require("hardhat");

// helper constants
const TOKEN = 1000000n; // 1 token with 6 decimals
const STAKE_ALICE = 200n * TOKEN; // 200 tokens
const STAKE_BOB = 100n * TOKEN; // 100 tokens
const REWARD = 50n * TOKEN; // job reward 50 tokens
const FEE = 300n * TOKEN; // fee 300 tokens
const FEE2 = 300n * TOKEN; // second fee after token swap

describe("Platform reward flow", function () {
  let owner, alice, bob, employer, treasury;
  let token, token2, stakeManager, jobRegistry, platformRegistry, jobRouter, feePool;

  beforeEach(async () => {
    [owner, alice, bob, employer, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token = await Token.deploy();
    await token.mint(alice.address, 1000n * TOKEN);
    await token.mint(bob.address, 1000n * TOKEN);
    await token.mint(employer.address, 1000n * TOKEN);

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

    const Reputation = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const reputation = await Reputation.deploy();

    const PlatformRegistry = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    platformRegistry = await PlatformRegistry.deploy(
      await stakeManager.getAddress(),
      await reputation.getAddress(),
      0
    );

    const JobRouter = await ethers.getContractFactory(
      "contracts/v2/modules/JobRouter.sol:JobRouter"
    );
    jobRouter = await JobRouter.deploy(
      await platformRegistry.getAddress()
    );

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
    await feePool.setBurnPct(0);
  });

  it("handles zero-stake owner, proportional fees, and token swap", async () => {
    // owner registers with zero stake
    await platformRegistry.connect(owner).register();
    await jobRouter.connect(owner).register();
    expect(await platformRegistry.getScore(owner.address)).to.equal(0n);
    expect(await jobRouter.routingWeight(owner.address)).to.equal(0n);

    // Alice and Bob acknowledge tax policy
    await jobRegistry.connect(alice).acknowledgeTaxPolicy();
    await jobRegistry.connect(bob).acknowledgeTaxPolicy();

    // stake and register
    await token.connect(alice).approve(await stakeManager.getAddress(), STAKE_ALICE);
    await token.connect(bob).approve(await stakeManager.getAddress(), STAKE_BOB);
    await stakeManager.connect(alice).depositStake(2, STAKE_ALICE);
    await stakeManager.connect(bob).depositStake(2, STAKE_BOB);
    await platformRegistry.connect(alice).register();
    await platformRegistry.connect(bob).register();
    await jobRouter.connect(alice).register();
    await jobRouter.connect(bob).register();

    const weightAlice = (STAKE_ALICE * 10n ** 18n) / (STAKE_ALICE + STAKE_BOB);
    const weightBob = (STAKE_BOB * 10n ** 18n) / (STAKE_ALICE + STAKE_BOB);
    expect(await jobRouter.routingWeight(alice.address)).to.equal(weightAlice);
    expect(await jobRouter.routingWeight(bob.address)).to.equal(weightBob);

    // simulate job creation and finalization
    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr, "0x1000000000000000000"]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const jobId = ethers.encodeBytes32String("job1");
    await token.connect(employer).approve(await stakeManager.getAddress(), REWARD + FEE);
    await stakeManager
      .connect(registrySigner)
      .lockJobFunds(jobId, employer.address, REWARD + FEE);

    const aliceBeforeReward = await token.balanceOf(alice.address);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(jobId, alice.address, REWARD, FEE, await feePool.getAddress());
    expect(await token.balanceOf(alice.address)).to.equal(aliceBeforeReward + REWARD);

    // fee distribution
    await feePool.distributeFees();

    const aliceBefore = await token.balanceOf(alice.address);
    const bobBefore = await token.balanceOf(bob.address);
    const ownerBefore = await token.balanceOf(owner.address);

    await feePool.connect(alice).claimRewards();
    await feePool.connect(bob).claimRewards();
    await feePool.connect(owner).claimRewards();

    expect(await token.balanceOf(alice.address)).to.equal(aliceBefore + STAKE_ALICE * FEE / (STAKE_ALICE + STAKE_BOB));
    expect(await token.balanceOf(bob.address)).to.equal(bobBefore + STAKE_BOB * FEE / (STAKE_ALICE + STAKE_BOB));
    expect(await token.balanceOf(owner.address)).to.equal(ownerBefore);

    // token swap
    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    token2 = await Token.deploy();
    await token2.mint(employer.address, 1000n * TOKEN);

    await stakeManager.connect(owner).setToken(await token2.getAddress());
    await feePool.connect(owner).setToken(await token2.getAddress());

    // new job with token2
    const jobId2 = ethers.encodeBytes32String("job2");
    await token2.connect(employer).approve(await stakeManager.getAddress(), FEE2);
    await stakeManager
      .connect(registrySigner)
      .lockJobFunds(jobId2, employer.address, FEE2);
    await stakeManager
      .connect(registrySigner)
      .finalizeJobFunds(jobId2, bob.address, 0, FEE2, await feePool.getAddress());

    await feePool.distributeFees();

    const alice2Before = await token2.balanceOf(alice.address);
    const bob2Before = await token2.balanceOf(bob.address);
    await feePool.connect(alice).claimRewards();
    await feePool.connect(bob).claimRewards();
    await feePool.connect(owner).claimRewards();
    expect(await token2.balanceOf(alice.address)).to.equal(alice2Before + STAKE_ALICE * FEE2 / (STAKE_ALICE + STAKE_BOB));
    expect(await token2.balanceOf(bob.address)).to.equal(bob2Before + STAKE_BOB * FEE2 / (STAKE_ALICE + STAKE_BOB));
    expect(await token2.balanceOf(owner.address)).to.equal(0n);
  });
});

