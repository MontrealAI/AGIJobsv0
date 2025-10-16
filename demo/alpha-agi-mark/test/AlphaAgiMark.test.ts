import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const SCALE = 10n ** 18n;

function reserveAt(supply: bigint, basePrice: bigint, slope: bigint): bigint {
  const linear = (basePrice * supply) / SCALE;
  const supplySquared = (supply * supply) / (SCALE * SCALE);
  const quadratic = (slope * supplySquared) / 2n;
  return linear + quadratic;
}

function purchaseCost(
  startSupply: bigint,
  amount: bigint,
  basePrice: bigint,
  slope: bigint,
): bigint {
  const endSupply = startSupply + amount;
  return reserveAt(endSupply, basePrice, slope) - reserveAt(startSupply, basePrice, slope);
}

async function deployFixture() {
  const [owner, investor1, investor2, investor3, validator1, validator2, validator3, outsider] =
    await ethers.getSigners();

  const seedFactory = await ethers.getContractFactory("NovaSeedNFT");
  const seed = await seedFactory.connect(owner).deploy(owner.address);
  await seed.waitForDeployment();

  const mintTx = await seed.connect(owner).mint(owner.address, "ipfs://nova-seed");
  await mintTx.wait();

  const basePrice = ethers.parseEther("0.1");
  const slope = ethers.parseEther("0.05");
  const maxSupply = ethers.parseEther("1000");

  const markFactory = await ethers.getContractFactory("AlphaAgiMark");
  const mark = await markFactory
    .connect(owner)
    .deploy(
      owner.address,
      await seed.getAddress(),
      1n,
      {
        basePrice,
        slope,
        maxSupply,
      },
      2,
      [validator1.address, validator2.address, validator3.address],
      "Alpha Sovereign Manifesto",
    );
  await mark.waitForDeployment();

  return {
    owner,
    investor1,
    investor2,
    investor3,
    validator1,
    validator2,
    validator3,
    outsider,
    seed,
    mark,
    basePrice,
    slope,
    maxSupply,
  };
}

describe("AlphaAgiMark", () => {
  it("mints and redeems shares along the bonding curve", async () => {
    const { mark, investor1, investor2, basePrice, slope } = await loadFixture(deployFixture);

    const unit = ethers.parseEther("1");

    const costInvestor1 = purchaseCost(0n, unit, basePrice, slope);
    await expect(mark.connect(investor1).buyShares(unit, { value: costInvestor1 }))
      .to.emit(mark, "SharesPurchased")
      .withArgs(investor1.address, unit, costInvestor1, unit);

    const costInvestor2 = purchaseCost(unit, unit, basePrice, slope);
    await mark.connect(investor2).buyShares(unit, { value: costInvestor2 });

    const expectedPayout = await mark.calculateSaleReturn.staticCall(unit);
    await expect(mark.connect(investor1).sellShares(unit))
      .to.emit(mark, "SharesRedeemed")
      .withArgs(investor1.address, unit, expectedPayout, unit);
  });

  it("enforces whitelist when enabled", async () => {
    const { mark, owner, investor1, outsider, basePrice, slope } = await loadFixture(deployFixture);
    const unit = ethers.parseEther("1");
    const cost = purchaseCost(0n, unit, basePrice, slope);

    await mark.connect(owner).setWhitelistEnabled(true);
    await mark.connect(owner).setWhitelist(investor1.address, true);

    await expect(mark.connect(investor1).buyShares(unit, { value: cost }))
      .to.emit(mark, "SharesPurchased")
      .withArgs(investor1.address, unit, cost, unit);

    await expect(mark.connect(outsider).buyShares(unit, { value: cost })).to.be.revertedWith(
      "Not whitelisted",
    );
  });

  it("requires validator approvals before finalisation", async () => {
    const {
      mark,
      owner,
      investor1,
      validator1,
      validator2,
      basePrice,
      slope,
    } = await loadFixture(deployFixture);

    const unit = ethers.parseEther("1");
    const cost = purchaseCost(0n, unit, basePrice, slope);
    await mark.connect(investor1).buyShares(unit, { value: cost });

    await expect(
      mark
        .connect(owner)
        .finaliseLaunch(ethers.Wallet.createRandom().address),
    ).to.be.revertedWith("Seed not validated");

    await mark.connect(validator1).approveSeed();
    await mark.connect(validator2).approveSeed();

    const vaultFactory = await ethers.getContractFactory("SovereignVault");
    const vault = await vaultFactory
      .connect(owner)
      .deploy(owner.address, "Sovereign Mandate");
    await vault.waitForDeployment();

    const vaultAddress = await vault.getAddress();

    await expect(mark.connect(owner).finaliseLaunch(vaultAddress))
      .to.emit(mark, "LaunchFinalised")
      .withArgs(vaultAddress, cost);

    expect(await ethers.provider.getBalance(vaultAddress)).to.equal(cost);
  });

  it("allows the owner to abort and investors to exit", async () => {
    const { mark, owner, investor1, basePrice, slope } = await loadFixture(deployFixture);
    const unit = ethers.parseEther("1");
    const cost = purchaseCost(0n, unit, basePrice, slope);
    await mark.connect(investor1).buyShares(unit, { value: cost });

    await expect(mark.connect(owner).abortLaunch()).to.emit(mark, "LaunchAborted");

    await expect(mark.connect(investor1).sellShares(unit))
      .to.emit(mark, "SharesRedeemed")
      .withArgs(investor1.address, unit, cost, 0n);
  });

  it("lets the owner override validation as an emergency lever", async () => {
    const { mark, owner, investor1, basePrice, slope } = await loadFixture(deployFixture);
    const unit = ethers.parseEther("1");
    const cost = purchaseCost(0n, unit, basePrice, slope);
    await mark.connect(investor1).buyShares(unit, { value: cost });

    await mark.connect(owner).ownerValidateSeed("Emergency override");

    const vaultFactory = await ethers.getContractFactory("SovereignVault");
    const vault = await vaultFactory
      .connect(owner)
      .deploy(owner.address, "Emergency Mandate");
    await vault.waitForDeployment();

    await mark.connect(owner).finaliseLaunch(await vault.getAddress());

    expect(await mark.launchFinalised()).to.equal(true);
  });

  it("prevents parameter tuning once shares are issued", async () => {
    const { mark, owner, investor1, basePrice, slope } = await loadFixture(deployFixture);
    const unit = ethers.parseEther("1");
    const cost = purchaseCost(0n, unit, basePrice, slope);
    await mark.connect(investor1).buyShares(unit, { value: cost });

    await expect(
      mark.connect(owner).setCurveParameters(ethers.parseEther("0.2"), slope, ethers.parseEther("2000")),
    ).to.be.revertedWith("Already issued");
  });
});
