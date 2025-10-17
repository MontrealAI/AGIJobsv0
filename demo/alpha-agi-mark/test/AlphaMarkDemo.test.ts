import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const toWei = (value: string) => ethers.parseEther(value);
const WHOLE = toWei("1");

function purchaseCost(base: bigint, slope: bigint, supply: bigint, amount: bigint): bigint {
  const baseComponent = base * amount;
  const slopeComponent = slope * ((amount * ((2n * supply) + amount - 1n)) / 2n);
  return baseComponent + slopeComponent;
}

function saleReturn(base: bigint, slope: bigint, supply: bigint, amount: bigint): bigint {
  const baseComponent = base * amount;
  if (amount === 0n) return baseComponent;
  const numerator = amount * ((2n * (supply - 1n)) - (amount - 1n));
  const slopeComponent = slope * (numerator / 2n);
  return baseComponent + slopeComponent;
}

function discretePurchaseSum(base: bigint, slope: bigint, supply: bigint, amount: bigint): bigint {
  let total = 0n;
  for (let i = 0n; i < amount; i++) {
    total += base + slope * (supply + i);
  }
  return total;
}

function discreteSaleSum(base: bigint, slope: bigint, supply: bigint, amount: bigint): bigint {
  let total = 0n;
  for (let i = 0n; i < amount; i++) {
    total += base + slope * (supply - 1n - i);
  }
  return total;
}

describe("α-AGI MARK bonding curve", function () {
  async function deployFixture() {
    const [owner, investor, validatorA, validatorB, outsider] = await ethers.getSigners();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const riskOracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address], 2);
    await riskOracle.waitForDeployment();

    const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken");
    const basePrice = toWei("0.1");
    const slope = toWei("0.05");
    const mark = await AlphaMark.deploy(
      "SeedShares",
      "SEED",
      owner.address,
      riskOracle.target,
      basePrice,
      slope,
      100,
      ethers.ZeroAddress
    );
    await mark.waitForDeployment();

    await mark.setTreasury(owner.address);
    await mark.setWhitelistEnabled(true);
    await mark.setWhitelist([investor.address], true);

    return { owner, investor, validatorA, validatorB, outsider, mark, riskOracle, basePrice, slope };
  }

  it("charges the discrete bonding curve price for purchases", async function () {
    const { investor, mark, basePrice, slope } = await deployFixture();
    const amount = 2n; // whole tokens
    const cost = purchaseCost(basePrice, slope, 0n, amount);

    await expect(mark.connect(investor).buyTokens(amount * WHOLE, { value: cost }))
      .to.emit(mark, "TokensPurchased")
      .withArgs(investor.address, amount * WHOLE, cost);

    expect(await mark.reserveBalance()).to.equal(cost);
    expect(await mark.totalSupply()).to.equal(amount * WHOLE);
  });

  it("returns bonding curve value on sell", async function () {
    const { investor, mark, basePrice, slope } = await deployFixture();
    const buyAmount = 3n;
    const cost = purchaseCost(basePrice, slope, 0n, buyAmount);
    await mark.connect(investor).buyTokens(buyAmount * WHOLE, { value: cost });

    const sellAmount = 1n;
    const refund = saleReturn(basePrice, slope, buyAmount, sellAmount);
    await expect(mark.connect(investor).sellTokens(sellAmount * WHOLE))
      .to.emit(mark, "TokensSold")
      .withArgs(investor.address, sellAmount * WHOLE, refund);

    expect(await mark.reserveBalance()).to.equal(cost - refund);
  });

  it("matches arithmetic-series pricing against discrete summation", async function () {
    const scenarios = [
      { existingSupply: 0n, purchaseAmount: 1n, saleAmount: 1n },
      { existingSupply: 0n, purchaseAmount: 4n, saleAmount: 2n },
      { existingSupply: 3n, purchaseAmount: 2n, saleAmount: 1n },
      { existingSupply: 6n, purchaseAmount: 3n, saleAmount: 3n },
    ];

    for (const scenario of scenarios) {
      const { investor, mark, basePrice, slope } = await deployFixture();

      if (scenario.existingSupply > 0n) {
        const seedCost = purchaseCost(basePrice, slope, 0n, scenario.existingSupply);
        await mark.connect(investor).buyTokens(scenario.existingSupply * WHOLE, { value: seedCost });
      }

      const previewCost = await mark.previewPurchaseCost(scenario.purchaseAmount * WHOLE);
      const expectedCost = discretePurchaseSum(
        basePrice,
        slope,
        scenario.existingSupply,
        scenario.purchaseAmount,
      );
      expect(previewCost).to.equal(expectedCost);

      await mark.connect(investor).buyTokens(scenario.purchaseAmount * WHOLE, { value: previewCost });

      const newSupply = scenario.existingSupply + scenario.purchaseAmount;
      const saleAmount = scenario.saleAmount <= newSupply ? scenario.saleAmount : newSupply;
      const previewRefund = await mark.previewSaleReturn(saleAmount * WHOLE);
      const expectedRefund = discreteSaleSum(basePrice, slope, newSupply, saleAmount);
      expect(previewRefund).to.equal(expectedRefund);
    }
  });

  it("prevents purchases while paused and allows emergency exits", async function () {
    const { owner, investor, mark, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 1n);
    await mark.connect(investor).buyTokens(WHOLE, { value: cost });

    await mark.connect(owner).pauseMarket();
    await expect(mark.connect(investor).buyTokens(WHOLE, { value: cost })).to.be.revertedWithCustomError(
      mark,
      "EnforcedPause"
    );

    await mark.connect(owner).abortLaunch();
    await expect(mark.connect(investor).sellTokens(WHOLE))
      .to.emit(mark, "TokensSold")
      .withArgs(investor.address, WHOLE, saleReturn(basePrice, slope, 1n, 1n));
  });

  it("requires oracle approvals before finalization", async function () {
    const { owner, investor, validatorA, validatorB, mark, riskOracle, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 2n);
    await mark.connect(investor).buyTokens(2n * WHOLE, { value: cost });

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("launch"));

    await expect(mark.connect(owner).finalizeLaunch(owner.address, metadata)).to.be.revertedWithCustomError(
      mark,
      "ValidationRequired",
    );

    await riskOracle.connect(validatorA).approveSeed();
    await expect(mark.connect(owner).finalizeLaunch(owner.address, metadata)).to.be.revertedWithCustomError(
      mark,
      "ValidationRequired",
    );

    await riskOracle.connect(validatorB).approveSeed();
    const reserveBeforeFinalize = await mark.reserveBalance();
    await expect(mark.connect(owner).finalizeLaunch(owner.address, metadata))
      .to.emit(mark, "LaunchFinalized")
      .withArgs(owner.address, reserveBeforeFinalize, metadata);

    expect(await mark.finalized()).to.equal(true);
    expect(await mark.reserveBalance()).to.equal(0n);
  });

  it("exposes owner control snapshot", async function () {
    const { owner, mark } = await deployFixture();
    await mark.connect(owner).setTreasury(owner.address);
    await mark.connect(owner).setEmergencyExit(true);
    const futureDeadline = (await time.latest()) + 3600;
    await mark.connect(owner).setSaleDeadline(futureDeadline);

    const controls = await mark.getOwnerControls();
    expect(controls.isPaused).to.equal(false);
    expect(controls.whitelistMode).to.equal(true);
    expect(controls.emergencyExit).to.equal(true);
    expect(controls.isFinalized).to.equal(false);
    expect(controls.isAborted).to.equal(false);
    expect(controls.overrideEnabled_).to.equal(false);
    expect(controls.overrideStatus_).to.equal(false);
    expect(controls.treasuryAddr).to.equal(owner.address);
    expect(controls.riskOracleAddr).to.be.properAddress;
    expect(controls.baseAssetAddr).to.equal(ethers.ZeroAddress);
    expect(controls.usesNative).to.equal(true);
    expect(controls.fundingCapWei).to.equal(await mark.fundingCap());
    expect(controls.maxSupplyWholeTokens).to.equal(await mark.maxSupply());
    expect(controls.saleDeadlineTimestamp).to.equal(BigInt(futureDeadline));
    expect(controls.basePriceWei).to.equal(await mark.basePrice());
    expect(controls.slopeWei).to.equal(await mark.slope());
  });

  it("enforces whitelist rules", async function () {
    const { owner, outsider, mark, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 1n);
    await expect(mark.connect(outsider).buyTokens(WHOLE, { value: cost }))
      .to.be.revertedWithCustomError(mark, "NotWhitelisted")
      .withArgs(outsider.address);

    await mark.connect(owner).setWhitelist([outsider.address], true);
    await expect(mark.connect(outsider).buyTokens(WHOLE, { value: cost })).to.emit(mark, "TokensPurchased");
  });

  it("honors funding caps", async function () {
    const { owner, investor, mark, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 1n);
    await mark.connect(owner).setFundingCap(cost);
    await mark.connect(investor).buyTokens(WHOLE, { value: cost });
    await expect(mark.connect(investor).buyTokens(WHOLE, { value: cost }))
      .to.be.revertedWithCustomError(mark, "FundingCapReached");
  });

  it("respects sale deadlines", async function () {
    const { owner, investor, mark, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 1n);
    const deadline = (await time.latest()) + 3600;
    await mark.connect(owner).setSaleDeadline(deadline);
    await time.increaseTo(deadline + 1);
    await expect(mark.connect(investor).buyTokens(WHOLE, { value: cost }))
      .to.be.revertedWithCustomError(mark, "SaleExpired");
  });

  it("lets the owner curate validators and reset approvals", async function () {
    const { owner, validatorA, validatorB, outsider, riskOracle } = await deployFixture();

    const roster = Array.from(await riskOracle.getValidators());
    expect(roster).to.have.members([validatorA.address, validatorB.address]);

    await riskOracle.connect(validatorA).approveSeed();
    await riskOracle.connect(validatorB).approveSeed();
    expect(await riskOracle.approvalCount()).to.equal(2n);

    await expect(riskOracle.connect(owner).resetApprovals()).to.emit(riskOracle, "ApprovalsReset");
    expect(await riskOracle.approvalCount()).to.equal(0n);

    await riskOracle.connect(owner).removeValidators([validatorB.address]);
    expect(await riskOracle.validatorCount()).to.equal(1n);
    await expect(riskOracle.connect(outsider).approveSeed())
      .to.be.revertedWithCustomError(riskOracle, "NotValidator")
      .withArgs(outsider.address);

    await expect(riskOracle.connect(validatorA).approveSeed())
      .to.emit(riskOracle, "ApprovalCast")
      .withArgs(validatorA.address);
  });

  it("allows owner validation override", async function () {
    const { owner, investor, mark, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 1n);
    await mark.connect(investor).buyTokens(WHOLE, { value: cost });
    await mark.connect(owner).setTreasury(owner.address);
    await mark.connect(owner).setValidationOverride(true, true);

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("override"));
    await expect(mark.connect(owner).finalizeLaunch(owner.address, metadata))
      .to.emit(mark, "LaunchFinalized")
      .withArgs(owner.address, cost, metadata);
  });

  it("records participant contribution history without decrementing on redemption", async function () {
    const { investor, mark, basePrice, slope } = await deployFixture();
    const firstCost = purchaseCost(basePrice, slope, 0n, 1n);
    await mark.connect(investor).buyTokens(WHOLE, { value: firstCost });

    const secondCost = purchaseCost(basePrice, slope, 1n, 2n);
    await mark.connect(investor).buyTokens(2n * WHOLE, { value: secondCost });

    expect(await mark.participantContribution(investor.address)).to.equal(firstCost + secondCost);

    const refund = saleReturn(basePrice, slope, 3n, 1n);
    await mark.connect(investor).sellTokens(WHOLE);
    expect(await mark.participantContribution(investor.address)).to.equal(firstCost + secondCost);
    expect(await mark.reserveBalance()).to.equal(firstCost + secondCost - refund);
  });

  it("finalizes into the sovereign vault and records metadata", async function () {
    const { owner, investor, validatorA, validatorB, mark, riskOracle, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 2n);
    await mark.connect(investor).buyTokens(2n * WHOLE, { value: cost });
    await riskOracle.connect(validatorA).approveSeed();
    await riskOracle.connect(validatorB).approveSeed();

    const Vault = await ethers.getContractFactory("AlphaSovereignVault");
    const vault = await Vault.deploy(owner.address, "ipfs://alpha-mark/sovereign-test");
    await vault.waitForDeployment();
    await vault.connect(owner).designateMarkExchange(mark.target);

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("sovereign-metadata"));
    const reserveBefore = await mark.reserveBalance();

    await expect(mark.connect(owner).finalizeLaunch(vault.target, metadata))
      .to.emit(mark, "LaunchFinalized")
      .withArgs(vault.target, reserveBefore, metadata);

    expect(await mark.finalized()).to.equal(true);
    expect(await vault.totalReceived()).to.equal(reserveBefore);
    expect(await vault.totalReceivedNative()).to.equal(reserveBefore);
    expect(await vault.totalReceivedExternal()).to.equal(0n);
    expect(await vault.lastAcknowledgedAmount()).to.equal(reserveBefore);
    expect(await vault.lastAcknowledgedMetadata()).to.equal(metadata);
    expect(await vault.lastAcknowledgedUsedNative()).to.equal(true);
  });

  it("reverts if the sovereign vault refuses acknowledgement", async function () {
    const { owner, investor, validatorA, validatorB, mark, riskOracle, basePrice, slope } = await deployFixture();
    const cost = purchaseCost(basePrice, slope, 0n, 1n);
    await mark.connect(investor).buyTokens(WHOLE, { value: cost });
    await riskOracle.connect(validatorA).approveSeed();
    await riskOracle.connect(validatorB).approveSeed();

    const Vault = await ethers.getContractFactory("AlphaSovereignVault");
    const vault = await Vault.deploy(owner.address, "ipfs://alpha-mark/sovereign-test");
    await vault.waitForDeployment();
    // Deliberately skip designateMarkExchange to trigger failure.

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("sovereign-metadata"));

    await expect(mark.connect(owner).finalizeLaunch(vault.target, metadata))
      .to.be.revertedWithCustomError(mark, "LaunchAcknowledgementFailed");
    expect(await mark.finalized()).to.equal(false);
    expect(await vault.totalReceived()).to.equal(0n);
  });

  it("permits re-targeting the base asset before launch", async function () {
    const { owner, investor, mark, basePrice, slope } = await deployFixture();
    const Stable = await ethers.getContractFactory("TestStablecoin");
    const stable = await Stable.deploy();
    await stable.waitForDeployment();

    const depositAmount = toWei("1000");
    await stable.mint(investor.address, depositAmount);

    await mark.connect(owner).setBaseAsset(stable.target);
    const controls = await mark.getOwnerControls();
    expect(controls.baseAssetAddr).to.equal(stable.target);
    expect(controls.usesNative).to.equal(false);

    await stable.connect(investor).approve(mark.target, depositAmount);

    const nativeCost = purchaseCost(basePrice, slope, 0n, 1n);
    await expect(mark.connect(investor).buyTokens(WHOLE, { value: nativeCost }))
      .to.be.revertedWithCustomError(mark, "NativePaymentDisabled");

    await expect(mark.connect(investor).buyTokens(WHOLE))
      .to.emit(mark, "TokensPurchased")
      .withArgs(investor.address, WHOLE, nativeCost);

    expect(await mark.reserveBalance()).to.equal(nativeCost);
    expect(await stable.balanceOf(mark.target)).to.equal(nativeCost);

    await expect(mark.connect(owner).setBaseAsset(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      mark,
      "SaleAlreadyStarted",
    );
  });
});

describe("α-AGI MARK ERC20 base asset flows", function () {
  it("processes ERC20 deposits and redemptions", async function () {
    const [owner, investor, validatorA, validatorB] = await ethers.getSigners();

    const Stable = await ethers.getContractFactory("TestStablecoin");
    const stable = await Stable.deploy();
    await stable.waitForDeployment();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const riskOracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address], 2);
    await riskOracle.waitForDeployment();

    const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken");
    const basePrice = toWei("1");
    const slope = toWei("0.5");
    const mark = await AlphaMark.deploy(
      "SeedShares",
      "SEED",
      owner.address,
      riskOracle.target,
      basePrice,
      slope,
      100,
      stable.target
    );
    await mark.waitForDeployment();

    await mark.setTreasury(owner.address);
    await mark.setWhitelistEnabled(true);
    await mark.setWhitelist([investor.address], true);

    const investorBudget = toWei("20");
    await stable.mint(investor.address, investorBudget);
    await stable.connect(investor).approve(mark.target, investorBudget);

    const buyAmount = 2n;
    const cost = purchaseCost(basePrice, slope, 0n, buyAmount);
    await expect(mark.connect(investor).buyTokens(buyAmount * WHOLE))
      .to.emit(mark, "TokensPurchased")
      .withArgs(investor.address, buyAmount * WHOLE, cost);

    expect(await stable.balanceOf(mark.target)).to.equal(cost);
    expect(await mark.reserveBalance()).to.equal(cost);

    const sellAmount = 1n;
    const refund = saleReturn(basePrice, slope, buyAmount, sellAmount);
    await expect(mark.connect(investor).sellTokens(sellAmount * WHOLE))
      .to.emit(mark, "TokensSold")
      .withArgs(investor.address, sellAmount * WHOLE, refund);

    expect(await stable.balanceOf(investor.address)).to.equal(investorBudget - cost + refund);

    await riskOracle.connect(validatorA).approveSeed();
    await riskOracle.connect(validatorB).approveSeed();
    await mark.setTreasury(owner.address);

    const reserveBeforeFinalize = await mark.reserveBalance();
    const metadata = ethers.hexlify(ethers.toUtf8Bytes("erc20-launch"));
    await expect(mark.connect(owner).finalizeLaunch(owner.address, metadata))
      .to.emit(mark, "LaunchFinalized")
      .withArgs(owner.address, reserveBeforeFinalize, metadata);

    expect(await mark.reserveBalance()).to.equal(0n);
    expect(await stable.balanceOf(owner.address)).to.equal(reserveBeforeFinalize);
  });

  it("records ERC20 vault receipts through acknowledgement", async function () {
    const [owner, investor, validatorA, validatorB] = await ethers.getSigners();

    const Stable = await ethers.getContractFactory("TestStablecoin");
    const stable = await Stable.deploy();
    await stable.waitForDeployment();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const riskOracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address], 2);
    await riskOracle.waitForDeployment();

    const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken");
    const basePrice = toWei("0.5");
    const slope = toWei("0.25");
    const mark = await AlphaMark.deploy(
      "SeedShares",
      "SEED",
      owner.address,
      riskOracle.target,
      basePrice,
      slope,
      100,
      stable.target,
    );
    await mark.waitForDeployment();

    await mark.setWhitelistEnabled(true);
    await mark.setWhitelist([investor.address], true);

    const Vault = await ethers.getContractFactory("AlphaSovereignVault");
    const vault = await Vault.deploy(owner.address, "ipfs://alpha-mark/erc20-launch");
    await vault.waitForDeployment();
    await vault.connect(owner).designateMarkExchange(mark.target);

    const investorBudget = toWei("100");
    await stable.mint(investor.address, investorBudget);
    await stable.connect(investor).approve(mark.target, investorBudget);

    const buyAmount = 4n;
    const cost = purchaseCost(basePrice, slope, 0n, buyAmount);
    await mark.connect(investor).buyTokens(buyAmount * WHOLE);

    await riskOracle.connect(validatorA).approveSeed();
    await riskOracle.connect(validatorB).approveSeed();

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("erc20-vault"));
    await expect(mark.connect(owner).finalizeLaunch(vault.target, metadata))
      .to.emit(mark, "LaunchFinalized")
      .withArgs(vault.target, cost, metadata);

    expect(await vault.totalReceived()).to.equal(cost);
    expect(await vault.totalReceivedNative()).to.equal(0n);
    expect(await vault.totalReceivedExternal()).to.equal(cost);
    expect(await vault.lastAcknowledgedUsedNative()).to.equal(false);
    expect(await vault.lastAcknowledgedAmount()).to.equal(cost);
    expect(await vault.lastAcknowledgedMetadata()).to.equal(metadata);
  });

  it("allows owner to withdraw residual ERC20 funds after closure", async function () {
    const [owner, investor, validatorA, validatorB] = await ethers.getSigners();

    const Stable = await ethers.getContractFactory("TestStablecoin");
    const stable = await Stable.deploy();
    await stable.waitForDeployment();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const riskOracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address], 2);
    await riskOracle.waitForDeployment();

    const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken");
    const basePrice = toWei("0.2");
    const slope = toWei("0.1");
    const mark = await AlphaMark.deploy(
      "SeedShares",
      "SEED",
      owner.address,
      riskOracle.target,
      basePrice,
      slope,
      100,
      stable.target
    );
    await mark.waitForDeployment();

    await mark.setTreasury(owner.address);
    await mark.setWhitelistEnabled(true);
    await mark.setWhitelist([investor.address], true);

    const investorBudget = toWei("20");
    await stable.mint(investor.address, investorBudget);
    await stable.connect(investor).approve(mark.target, investorBudget);

    const buyAmount = 3n;
    const cost = purchaseCost(basePrice, slope, 0n, buyAmount);
    await mark.connect(investor).buyTokens(buyAmount * WHOLE);

    await riskOracle.connect(validatorA).approveSeed();
    await riskOracle.connect(validatorB).approveSeed();

    const metadata = ethers.hexlify(ethers.toUtf8Bytes("residual"));

    await expect(mark.connect(owner).withdrawResidual(owner.address)).to.be.revertedWithCustomError(
      mark,
      "NotClosed",
    );

    await expect(mark.connect(owner).finalizeLaunch(owner.address, metadata))
      .to.emit(mark, "LaunchFinalized")
      .withArgs(owner.address, cost, metadata);

    const extra = toWei("1");
    await stable.mint(owner.address, extra);
    await stable.connect(owner).transfer(mark.target, extra);

    const balanceBefore = await stable.balanceOf(owner.address);
    await mark.connect(owner).withdrawResidual(owner.address);
    const balanceAfter = await stable.balanceOf(owner.address);
    expect(balanceAfter - balanceBefore).to.equal(extra);
  });
});
