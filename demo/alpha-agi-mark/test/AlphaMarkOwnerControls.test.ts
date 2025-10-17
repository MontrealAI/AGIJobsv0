import { expect } from "chai";
import { ethers } from "hardhat";

const toWei = (value: string) => ethers.parseEther(value);
const WHOLE = ethers.parseEther("1");

describe("α-AGI MARK owner command deck", function () {
  it("keeps the owner in full control of configuration, compliance, and emergency flows", async function () {
    const [owner, investor, outsider, validatorA, validatorB] = await ethers.getSigners();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const riskOracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address], 2);
    await riskOracle.waitForDeployment();

    const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken");
    const initialBasePrice = toWei("0.10");
    const initialSlope = toWei("0.025");
    const mark = await AlphaMark.deploy(
      "SeedShares",
      "SEED",
      owner.address,
      riskOracle.target,
      initialBasePrice,
      initialSlope,
      0,
      ethers.ZeroAddress,
    );
    await mark.waitForDeployment();

    await expect(mark.connect(outsider).pauseMarket()).to.be.revertedWithCustomError(
      mark,
      "OwnableUnauthorizedAccount",
    );

    const recalibratedBase = toWei("0.2");
    const recalibratedSlope = toWei("0.05");
    await expect(mark.connect(owner).setCurveParameters(recalibratedBase, recalibratedSlope))
      .to.emit(mark, "CurveParametersUpdated")
      .withArgs(recalibratedBase, recalibratedSlope);
    expect(await mark.basePrice()).to.equal(recalibratedBase);
    expect(await mark.slope()).to.equal(recalibratedSlope);

    await expect(mark.connect(owner).setMaxSupply(50)).to.emit(mark, "MaxSupplyUpdated").withArgs(50);
    expect(await mark.maxSupply()).to.equal(50n);

    const fundingCap = toWei("250");
    await expect(mark.connect(owner).setFundingCap(fundingCap)).to.emit(mark, "FundingCapUpdated").withArgs(fundingCap);
    expect(await mark.fundingCap()).to.equal(fundingCap);

    const now = await ethers.provider.getBlock("latest");
    const futureDeadline = Number(now?.timestamp ?? 0) + 7200;
    await expect(mark.connect(owner).setSaleDeadline(futureDeadline))
      .to.emit(mark, "SaleDeadlineUpdated")
      .withArgs(futureDeadline);
    expect(await mark.saleDeadline()).to.equal(BigInt(futureDeadline));

    const replacementOracle = await RiskOracle.deploy(owner.address, [validatorA.address], 1);
    await replacementOracle.waitForDeployment();
    await mark.connect(owner).setRiskOracle(replacementOracle.target);
    expect(await mark.riskOracle()).to.equal(replacementOracle.target);

    await mark.connect(owner).setTreasury(owner.address);
    expect(await mark.treasury()).to.equal(owner.address);

    await mark.connect(owner).setWhitelistEnabled(true);
    await mark.connect(owner).setWhitelist([investor.address], true);
    expect(await mark.whitelist(investor.address)).to.equal(true);

    const Stablecoin = await ethers.getContractFactory("TestStablecoin");
    const stable = await Stablecoin.deploy();
    await stable.waitForDeployment();

    await expect(mark.connect(owner).setBaseAsset(stable.target))
      .to.emit(mark, "BaseAssetUpdated")
      .withArgs(stable.target, false);
    expect(await mark.usesNativeAsset()).to.equal(false);

    await expect(mark.connect(outsider).setBaseAsset(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      mark,
      "OwnableUnauthorizedAccount",
    );

    const allowance = toWei("10");
    await stable.mint(investor.address, allowance);
    await stable.connect(investor).approve(mark.target, allowance);

    const purchaseAmount = 2n * WHOLE;
    const purchaseCost = await mark.previewPurchaseCost(purchaseAmount);
    await expect(mark.connect(investor).buyTokens(purchaseAmount)).to.emit(mark, "TokensPurchased");
    expect(await mark.totalSupply()).to.equal(purchaseAmount);
    expect(await mark.reserveBalance()).to.equal(purchaseCost);

    await expect(mark.connect(owner).setFundingCap(toWei("0.1"))).to.be.revertedWith("Below reserve");
    await expect(mark.connect(owner).setMaxSupply(1)).to.be.revertedWith("Below supply");
    await expect(mark.connect(owner).setBaseAsset(ethers.ZeroAddress)).to.be.revertedWith("Supply exists");

    await mark.connect(owner).setEmergencyExit(true);
    expect(await mark.emergencyExitEnabled()).to.equal(true);

    await mark.connect(owner).pauseMarket();
    expect(await mark.paused()).to.equal(true);

    await expect(mark.connect(outsider).setEmergencyExit(false)).to.be.revertedWithCustomError(
      mark,
      "OwnableUnauthorizedAccount",
    );

    await expect(mark.connect(investor).sellTokens(WHOLE)).to.emit(mark, "TokensSold");

    await mark.connect(owner).unpauseMarket();
    expect(await mark.paused()).to.equal(false);

    await mark.connect(owner).setValidationOverride(true, true);
    expect(await mark.validationOverrideEnabled()).to.equal(true);
    expect(await mark.validationOverrideStatus()).to.equal(true);

    await mark.connect(owner).setValidationOverride(false, false);
    expect(await mark.validationOverrideEnabled()).to.equal(false);

    await mark.connect(owner).abortLaunch();
    expect(await mark.aborted()).to.equal(true);
    expect(await mark.paused()).to.equal(true);
    expect(await mark.emergencyExitEnabled()).to.equal(true);

    await expect(mark.connect(outsider).abortLaunch()).to.be.revertedWithCustomError(
      mark,
      "OwnableUnauthorizedAccount",
    );

    await expect(mark.connect(investor).sellTokens(WHOLE)).to.emit(mark, "TokensSold");
    expect(await mark.totalSupply()).to.equal(0n);

    const residual = toWei("1");
    await stable.mint(mark.target, residual);
    const ownerStableBefore = await stable.balanceOf(owner.address);
    await mark.connect(owner).withdrawResidual(owner.address);
    const ownerStableAfter = await stable.balanceOf(owner.address);
    expect(ownerStableAfter - ownerStableBefore).to.equal(residual);

    await expect(mark.connect(outsider).withdrawResidual(outsider.address)).to.be.revertedWithCustomError(
      mark,
      "OwnableUnauthorizedAccount",
    );

    const controls = await mark.getOwnerControls();
    expect(controls.isPaused).to.equal(true);
    expect(controls.whitelistMode).to.equal(true);
    expect(controls.emergencyExit).to.equal(true);
    expect(controls.isAborted).to.equal(true);
    expect(controls.overrideEnabled_).to.equal(false);
    expect(controls.treasuryAddr).to.equal(owner.address);
    expect(controls.baseAssetAddr).to.equal(stable.target);
    expect(controls.usesNative).to.equal(false);
  });
});
