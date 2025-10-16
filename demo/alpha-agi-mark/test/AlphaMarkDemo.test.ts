import { expect } from "chai";
import { ethers } from "hardhat";

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

describe("α-AGI MARK bonding curve", function () {
  async function deployFixture() {
    const [owner, investor, validatorA, validatorB] = await ethers.getSigners();

    const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    const riskOracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address], 2);
    await riskOracle.waitForDeployment();

    const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken");
    const basePrice = toWei("0.1");
    const slope = toWei("0.05");
    const mark = await AlphaMark.deploy("SeedShares", "SEED", owner.address, riskOracle.target, basePrice, slope, 100);
    await mark.waitForDeployment();

    await mark.setTreasury(owner.address);
    await mark.setWhitelistEnabled(true);
    await mark.setWhitelist([investor.address], true);

    return { owner, investor, validatorA, validatorB, mark, riskOracle, basePrice, slope };
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

    await expect(mark.connect(owner).finalizeLaunch(owner.address)).to.be.revertedWith("Not validated");

    await riskOracle.connect(validatorA).approveSeed();
    await expect(mark.connect(owner).finalizeLaunch(owner.address)).to.be.revertedWith("Not validated");

    await riskOracle.connect(validatorB).approveSeed();
    await expect(mark.connect(owner).finalizeLaunch(owner.address))
      .to.emit(mark, "LaunchFinalized");

    expect(await mark.finalized()).to.equal(true);
    expect(await mark.reserveBalance()).to.equal(0n);
  });
});
