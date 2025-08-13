const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

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
      0,
      50,
      50,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stakeManager.connect(owner).setMinStake(0);
  });

  it("handles staking, job escrow and slashing", async () => {
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
      0
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
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await expect(
      stakeManager.connect(user).depositStake(0, 200)
    ).to.emit(stakeManager, "StakeDeposited").withArgs(user.address, 0, 200);

    expect(await stakeManager.stakes(user.address, 0)).to.equal(200n);
    expect(await stakeManager.totalStake(0)).to.equal(200n);

    await stakeManager.connect(user).withdrawStake(0, 50);
    expect(await stakeManager.stakes(user.address, 0)).to.equal(150n);
    expect(await stakeManager.totalStake(0)).to.equal(150n);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr, "0x56BC75E2D63100000"]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const jobId = ethers.encodeBytes32String("job1");
    await token.connect(employer).approve(await stakeManager.getAddress(), 300);
    await stakeManager
      .connect(registrySigner)
      .lockJobFunds(jobId, employer.address, 300);

    await expect(
      stakeManager.connect(registrySigner).releaseJobFunds(jobId, user.address, 200)
    ).to.emit(stakeManager, "JobFundsReleased").withArgs(jobId, user.address, 200);
    expect(await token.balanceOf(user.address)).to.equal(1050n);

    await expect(
      stakeManager
        .connect(registrySigner)
        .slash(user.address, 0, 100, employer.address)
    ).to.emit(stakeManager, "StakeSlashed").withArgs(
      user.address,
      0,
      employer.address,
      treasury.address,
      50,
      50
    );
    expect(await stakeManager.stakes(user.address, 0)).to.equal(50n);
    expect(await stakeManager.totalStake(0)).to.equal(50n);
    expect(await token.balanceOf(employer.address)).to.equal(750n);
    expect(await token.balanceOf(treasury.address)).to.equal(50n);
  });

  it("rejects unauthorized slashing and excessive amounts", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(user).depositStake(0, 100);

    await expect(
      stakeManager
        .connect(user)
        .slash(user.address, 0, 10, employer.address)
    ).to.be.revertedWith("only job registry");

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr, "0x56BC75E2D63100000"]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await expect(
      stakeManager
        .connect(registrySigner)
        .slash(user.address, 0, 200, employer.address)
    ).to.be.revertedWith("stake");
  });

  it("supports staking and slashing for all roles", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.connect(user).approve(await stakeManager.getAddress(), 600);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [
      registryAddr,
      "0x56BC75E2D63100000",
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    for (const role of [0, 1, 2]) {
      await stakeManager.connect(user).depositStake(role, 100);
      expect(await stakeManager.stakes(user.address, role)).to.equal(100n);
      await stakeManager
        .connect(registrySigner)
        .slash(user.address, role, 50, employer.address);
      expect(await stakeManager.stakes(user.address, role)).to.equal(50n);
    }
  });

  it("reverts for invalid role", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await expect(
      stakeManager.connect(user).depositStake(3, 100)
    ).to.be.revertedWithoutReason();
    await expect(
      stakeManager.connect(user).withdrawStake(3, 1)
    ).to.be.revertedWithoutReason();

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [
      registryAddr,
      "0x56BC75E2D63100000",
    ]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);
    await expect(
      stakeManager
        .connect(registrySigner)
        .slash(user.address, 3, 1, employer.address)
    ).to.be.revertedWithoutReason();
  });

  it("enforces tax acknowledgement for staking operations", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await token.connect(user).approve(await stakeManager.getAddress(), 200);

    await expect(
      stakeManager.connect(user).depositStake(0, 100)
    ).to.be.revertedWith("acknowledge tax policy");

    await jobRegistry.connect(user).acknowledgeTaxPolicy();
    await expect(
      stakeManager.connect(user).depositStake(0, 100)
    ).to.emit(stakeManager, "StakeDeposited");

    await jobRegistry.connect(owner).bumpTaxPolicyVersion();
    await expect(
      stakeManager.connect(user).withdrawStake(0, 50)
    ).to.be.revertedWith("acknowledge tax policy");

    await jobRegistry.connect(user).acknowledgeTaxPolicy();
    await expect(
      stakeManager.connect(user).withdrawStake(0, 50)
    ).to.emit(stakeManager, "StakeWithdrawn").withArgs(user.address, 0, 50);
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
    await expect(
      stakeManager.connect(owner).setToken(await token2.getAddress())
    )
      .to.emit(stakeManager, "TokenUpdated")
      .withArgs(await token2.getAddress());
    expect(await stakeManager.token()).to.equal(await token2.getAddress());
  });

  it("uses new token for deposits and payouts after update", async () => {
    const Token2 = await ethers.getContractFactory("MockERC20");
    const token2 = await Token2.deploy();

    // wire job registry so user can stake
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    // owner updates staking token
    await stakeManager.connect(owner).setToken(await token2.getAddress());

    // old token approvals have no effect
    await token.connect(user).approve(await stakeManager.getAddress(), 100);
    await expect(
      stakeManager.connect(user).depositStake(0, 100)
    )
      .to.be.revertedWithCustomError(token2, "ERC20InsufficientAllowance")
      .withArgs(await stakeManager.getAddress(), 0n, 100n);

    // deposit using the new token
    await token2.mint(user.address, 200);
    await token2.connect(user).approve(await stakeManager.getAddress(), 200);
    await expect(
      stakeManager.connect(user).depositStake(0, 200)
    )
      .to.emit(stakeManager, "StakeDeposited")
      .withArgs(user.address, 0, 200);
    expect(await stakeManager.stakes(user.address, 0)).to.equal(200n);

    // locking funds with old token fails
    const registryAddr2 = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr2, "0x56BC75E2D63100000"]);
    const registrySigner2 = await ethers.getImpersonatedSigner(registryAddr2);

    const jobId = ethers.encodeBytes32String("job1");
    await token.connect(employer).approve(await stakeManager.getAddress(), 100);
    await expect(
      stakeManager
        .connect(registrySigner2)
        .lockJobFunds(jobId, employer.address, 100)
    )
      .to.be.revertedWithCustomError(token2, "ERC20InsufficientAllowance")
      .withArgs(await stakeManager.getAddress(), 0n, 100n);

    // lock and release using the new token
    await token2.mint(employer.address, 100);
    await token2
      .connect(employer)
      .approve(await stakeManager.getAddress(), 100);
    await stakeManager
      .connect(registrySigner2)
      .lockJobFunds(jobId, employer.address, 100);
    await expect(
      stakeManager
        .connect(registrySigner2)
        .releaseJobFunds(jobId, user.address, 100)
    )
      .to.emit(stakeManager, "JobFundsReleased")
      .withArgs(jobId, user.address, 100);

    // balances reflect only the new token being used
    expect(await token.balanceOf(user.address)).to.equal(1000n);
    expect(await token2.balanceOf(user.address)).to.equal(100n);
    expect(await token.balanceOf(employer.address)).to.equal(1000n);
    expect(await token2.balanceOf(employer.address)).to.equal(0n);
  });

  it("restricts min stake updates to owner", async () => {
    await expect(
      stakeManager.connect(user).setMinStake(1)
    ).to.be.revertedWithCustomError(
      stakeManager,
      "OwnableUnauthorizedAccount"
    );
    await expect(stakeManager.connect(owner).setMinStake(1))
      .to.emit(stakeManager, "MinStakeUpdated")
      .withArgs(1);
    expect(await stakeManager.minStake()).to.equal(1n);
  });

  it("restricts slashing percentage updates to owner", async () => {
    await expect(
      stakeManager.connect(user).setSlashingPercentages(60, 30)
    ).to.be.revertedWithCustomError(
      stakeManager,
      "OwnableUnauthorizedAccount"
    );
    await expect(
      stakeManager.connect(owner).setSlashingPercentages(60, 30)
    )
      .to.emit(stakeManager, "SlashingPercentagesUpdated")
      .withArgs(60, 30);
    expect(await stakeManager.employerSlashPct()).to.equal(60);
    expect(await stakeManager.treasurySlashPct()).to.equal(30);
  });

  it("slashes full amount when percentages sum under 100", async () => {
    await stakeManager.connect(owner).setSlashingPercentages(60, 20);
    await stakeManager.connect(owner).setJobRegistry(owner.address);
    await token.connect(owner).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(owner).depositStake(0, 100);
    await stakeManager
      .connect(owner)
      .slash(owner.address, 0, 100, employer.address);
    expect(await stakeManager.stakes(owner.address, 0)).to.equal(0n);
    expect(await token.balanceOf(employer.address)).to.equal(1060n);
    expect(await token.balanceOf(treasury.address)).to.equal(20n);
    expect(
      await token.balanceOf(await stakeManager.getAddress())
    ).to.equal(20n);
  });

  it("slashes full amount when percentages sum to 100", async () => {
    await stakeManager.connect(owner).setSlashingPercentages(70, 30);
    await stakeManager.connect(owner).setJobRegistry(owner.address);
    await token.connect(owner).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(owner).depositStake(0, 100);
    await stakeManager
      .connect(owner)
      .slash(owner.address, 0, 100, employer.address);
    expect(await stakeManager.stakes(owner.address, 0)).to.equal(0n);
    expect(await token.balanceOf(employer.address)).to.equal(1070n);
    expect(await token.balanceOf(treasury.address)).to.equal(30n);
    expect(
      await token.balanceOf(await stakeManager.getAddress())
    ).to.equal(0n);
  });

  it("reverts when slashing percentages sum over 100", async () => {
    await expect(
      stakeManager.connect(owner).setSlashingPercentages(60, 50)
    ).to.be.revertedWith("pct");
  });

  it("can enforce percentage sum to 100", async () => {
    await stakeManager.connect(owner).setSlashingPercentages(60, 20);
    await stakeManager
      .connect(owner)
      .setSlashPercentSumEnforcement(true);
    await stakeManager.connect(owner).setJobRegistry(owner.address);
    await token.connect(owner).approve(await stakeManager.getAddress(), 100);
    await stakeManager.connect(owner).depositStake(0, 100);
    await expect(
      stakeManager
        .connect(owner)
        .slash(owner.address, 0, 100, employer.address)
    ).to.be.revertedWith("pct");
  });

  it("restricts treasury updates to owner", async () => {
    await expect(
      stakeManager.connect(user).setTreasury(user.address)
    ).to.be.revertedWithCustomError(
      stakeManager,
      "OwnableUnauthorizedAccount"
    );
    await expect(
      stakeManager.connect(owner).setTreasury(user.address)
    )
      .to.emit(stakeManager, "TreasuryUpdated")
      .withArgs(user.address);
    expect(await stakeManager.treasury()).to.equal(user.address);
  });

  it("enforces stake locks and unlocks after expiry", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr, "0x56BC75E2D63100000"]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const lockDuration = 3600n;
    const current = BigInt(await time.latest());
    const expectedUnlock = current + 1n + lockDuration;
    await expect(
      stakeManager
        .connect(registrySigner)
        .lockStake(user.address, 200, Number(lockDuration))
    )
      .to.emit(stakeManager, "StakeLocked")
      .withArgs(user.address, 200n, expectedUnlock);

    await expect(
      stakeManager.connect(user).withdrawStake(0, 1)
    ).to.be.revertedWith("locked");

    await time.increase(lockDuration);

    await expect(
      stakeManager.connect(user).withdrawStake(0, 50)
    )
      .to.emit(stakeManager, "StakeUnlocked")
      .withArgs(user.address, 200n)
      .and.to.emit(stakeManager, "StakeWithdrawn")
      .withArgs(user.address, 0, 50n);
  });

  it("allows slashing during active lock", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr, "0x56BC75E2D63100000"]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await stakeManager
      .connect(registrySigner)
      .lockStake(user.address, 100, 3600);

    await expect(
      stakeManager
        .connect(registrySigner)
        .slash(user.address, 0, 100, employer.address)
    )
      .to.emit(stakeManager, "StakeSlashed")
      .withArgs(user.address, 0, employer.address, treasury.address, 50, 50)
      .and.to.emit(stakeManager, "StakeUnlocked")
      .withArgs(user.address, 100);

    expect(await stakeManager.lockedStakes(user.address)).to.equal(0n);
  });

  it("rejects zero stake deposits", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await expect(
      stakeManager.connect(user).depositStake(0, 0)
    ).to.be.revertedWith("amount");
  });

  it("allows withdrawal after slashing", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.connect(user).approve(await stakeManager.getAddress(), 200);
    await stakeManager.connect(user).depositStake(0, 200);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr, "0x56BC75E2D63100000"]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await stakeManager
      .connect(registrySigner)
      .slash(user.address, 0, 100, employer.address);
    await stakeManager.connect(user).withdrawStake(0, 100);

    expect(await stakeManager.stakes(user.address, 0)).to.equal(0n);
    expect(await token.balanceOf(user.address)).to.equal(900n);
  });

  it("supports token swap for new stakes", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    const Token = await ethers.getContractFactory("MockERC20");
    const token2 = await Token.deploy();
    await token2.mint(user.address, 500);
    await stakeManager.connect(owner).setToken(await token2.getAddress());

    await token2.connect(user).approve(await stakeManager.getAddress(), 200);
    await expect(
      stakeManager.connect(user).depositStake(0, 200)
    ).to.emit(stakeManager, "StakeDeposited").withArgs(user.address, 0, 200);
  });

  it("matches 18-decimal slashing math", async () => {
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
      0
    );
    const TaxPolicy = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const taxPolicy = await TaxPolicy.deploy("ipfs://policy", "ack");
    await jobRegistry
      .connect(owner)
      .setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await jobRegistry.connect(user).acknowledgeTaxPolicy();

    await token.mint(user.address, 1000000);
    await token.connect(user).approve(await stakeManager.getAddress(), 1000000);
    await stakeManager.connect(user).depositStake(0, 1000000);

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send("hardhat_setBalance", [registryAddr, "0x56BC75E2D63100000"]);
    const registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const amount = 123456n;
    const amount18 = amount * 10n ** 12n;
    const employerBefore = await token.balanceOf(employer.address);
    const treasuryBefore = await token.balanceOf(treasury.address);

    await stakeManager
      .connect(registrySigner)
      .slash(user.address, 0, amount, employer.address);

    const employerAfter = await token.balanceOf(employer.address);
    const treasuryAfter = await token.balanceOf(treasury.address);
    const share6 = (amount * 50n) / 100n;

    expect(employerAfter - employerBefore).to.equal(share6);
    expect(treasuryAfter - treasuryBefore).to.equal(share6);

    const shareFrom18 = (amount18 * 50n / 100n) / 10n ** 12n;
    expect(share6).to.equal(shareFrom18);
    expect(await stakeManager.stakes(user.address, 0)).to.equal(1000000n - amount);
  });

  it("enforces owner-only parameter updates", async () => {
    await expect(
      stakeManager.connect(owner).setMinStake(10)
    ).to.emit(stakeManager, "MinStakeUpdated").withArgs(10n);
    await expect(
      stakeManager.connect(user).setMinStake(1)
    )
      .to.be.revertedWithCustomError(stakeManager, "OwnableUnauthorizedAccount")
      .withArgs(user.address);
    await expect(
      stakeManager.connect(owner).setSlashingPercentages(40, 60)
    ).to.emit(stakeManager, "SlashingPercentagesUpdated").withArgs(40n, 60n);
  });
});

