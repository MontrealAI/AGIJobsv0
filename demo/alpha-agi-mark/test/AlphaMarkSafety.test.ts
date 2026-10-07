import { expect } from "chai";
import { ethers } from "hardhat";

const WHOLE = ethers.parseEther("1");

describe("α-AGI MARK reserve and receipt safety", function () {
  it("rejects an impossible requested quorum instead of silently lowering it", async function () {
    const [owner, validator] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("AlphaMarkRiskOracle");
    await expect(Oracle.deploy(owner.address, [validator.address], 2))
      .to.be.revertedWith("Threshold above validator count");
    await expect(Oracle.deploy(owner.address, [validator.address, validator.address, ethers.ZeroAddress], 2))
      .to.be.revertedWith("Threshold above validator count");
    await expect(Oracle.deploy(owner.address, [], 1)).to.be.revertedWith("Threshold above validator count");
    const empty = await Oracle.deploy(owner.address, [], 0);
    expect(await empty.seedValidated()).to.equal(false);
  });

  async function fixture() {
    const [owner, buyer, trader] = await ethers.getSigners();
    const asset = await (await ethers.getContractFactory("FeeAsset")).deploy();
    const mark = await (await ethers.getContractFactory("AlphaMarkEToken")).deploy(
      "Shares", "SHR", owner.address, ethers.ZeroAddress, 1000, 100, 100, asset.target,
    );
    const vault = await (await ethers.getContractFactory("AlphaSovereignVault")).deploy(owner.address, "ipfs://test");
    await vault.designateMarkExchange(mark.target);
    await mark.setValidationOverride(true, true);
    for (const account of [buyer, trader]) {
      await asset.mint(account.address, 100000);
      await asset.connect(account).approve(mark.target, 100000);
    }
    return { owner, buyer, trader, asset, mark, vault };
  }

  it("quotes zero purchases and redemptions at empty and nonempty supply", async function () {
    const { buyer, mark } = await fixture();
    for (const _ of [0, 1]) {
      expect(await mark.previewPurchaseCost(0)).to.equal(0);
      expect(await mark.previewSaleReturn(0)).to.equal(0);
      await mark.connect(buyer).buyTokens(WHOLE);
    }
    await expect(mark.connect(buyer).buyTokens(0)).to.be.revertedWith("Amount zero");
  });

  for (const chargeSender of [false, true]) {
    it(`rejects ${chargeSender ? "sender" : "recipient"} fees before recording a purchase`, async function () {
      const { buyer, asset, mark } = await fixture();
      await asset.setFee(100, chargeSender);
      const before = await asset.balanceOf(buyer.address);
      await expect(mark.connect(buyer).buyTokens(WHOLE)).to.be.revertedWith("Unsupported asset transfer");
      expect(await mark.totalSupply()).to.equal(0);
      expect(await mark.reserveBalance()).to.equal(0);
      expect(await mark.participantContribution(buyer.address)).to.equal(0);
      expect(await asset.balanceOf(mark.target)).to.equal(0);
      expect(await asset.balanceOf(buyer.address)).to.equal(before);
    });

    it(`rolls back redemption after an asset enables ${chargeSender ? "sender" : "recipient"} fees`, async function () {
      const { buyer, asset, mark } = await fixture();
      await mark.connect(buyer).buyTokens(3n * WHOLE);
      const reserve = await mark.reserveBalance();
      await asset.setFee(100, chargeSender);
      await expect(mark.connect(buyer).sellTokens(WHOLE)).to.be.revertedWith("Unsupported asset transfer");
      expect(await mark.totalSupply()).to.equal(3n * WHOLE);
      expect(await mark.reserveBalance()).to.equal(reserve);
      expect(await asset.balanceOf(mark.target)).to.equal(reserve);
      await asset.setFee(0, false);
      await mark.connect(buyer).sellTokens(3n * WHOLE);
      expect(await mark.reserveBalance()).to.equal(0);
    });
  }

  it("rolls back finalization when the vault receives fewer tokens than the recorded reserve", async function () {
    const { buyer, asset, mark, vault } = await fixture();
    await mark.connect(buyer).buyTokens(2n * WHOLE);
    await asset.setFee(100, false);
    await expect(mark.finalizeLaunch(vault.target, "0x")).to.be.revertedWith("Unsupported asset transfer");
    expect(await mark.finalized()).to.equal(false);
    expect(await mark.paused()).to.equal(false);
    expect(await mark.reserveBalance()).to.equal(2100);
    expect(await asset.balanceOf(mark.target)).to.equal(2100);
    expect(await asset.balanceOf(vault.target)).to.equal(0);
    expect(await vault.launchAcknowledged(mark.target)).to.equal(false);
  });

  it("bounds purchase and redemption prices across intervening trades", async function () {
    const { buyer, trader, mark } = await fixture();
    const quotedCost = await mark.previewPurchaseCost(WHOLE);
    await mark.connect(trader).buyTokens(WHOLE);
    await expect(mark.connect(buyer).buyTokensWithLimit(WHOLE, quotedCost))
      .to.be.revertedWith("Purchase cost exceeds limit");
    await mark.connect(buyer).buyTokensWithLimit(WHOLE, 1100);
    const quotedRefund = await mark.previewSaleReturn(WHOLE);
    await mark.connect(trader).sellTokens(WHOLE);
    await expect(mark.connect(buyer).sellTokensWithLimit(WHOLE, quotedRefund))
      .to.be.revertedWith("Sale return below limit");
    expect(await mark.balanceOf(buyer.address)).to.equal(WHOLE);
    await mark.connect(buyer).sellTokensWithLimit(WHOLE, 1000);
    expect(await mark.reserveBalance()).to.equal(0);
  });

  it("rejects non-contract base assets and makes finalization terminal for redemption", async function () {
    const { owner, buyer, mark, vault } = await fixture();
    await expect(mark.setBaseAsset(owner.address)).to.be.revertedWith("Asset must be a contract");
    await mark.connect(buyer).buyTokens(WHOLE);
    await mark.finalizeLaunch(vault.target, "0x");
    await mark.setEmergencyExit(true);
    await expect(mark.connect(buyer).sellTokens(WHOLE)).to.be.revertedWith("Launch finalized");
  });

  it("accepts backed token intake once and records it per asset", async function () {
    const { asset, vault } = await fixture();
    const source = await (await ethers.getContractFactory("LaunchSourceFixture")).deploy(asset.target);
    await vault.designateMarkExchange(source.target);
    await expect(source.acknowledge(vault.target, 1000, false)).to.be.revertedWith("Token receipt mismatch");
    expect(await vault.launchAcknowledged(source.target)).to.equal(false);
    await asset.mint(vault.target, 1000);
    await source.acknowledge(vault.target, 1000, false);
    expect(await vault.totalReceivedToken(asset.target)).to.equal(1000);
    await expect(source.acknowledge(vault.target, 1000, false)).to.be.revertedWith("Launch already acknowledged");
    expect(await vault.totalReceivedExternal()).to.equal(1000);
  });

  it("does not acknowledge the same token backing for another exchange", async function () {
    const { owner, asset, vault } = await fixture();
    const Source = await ethers.getContractFactory("LaunchSourceFixture");
    const first = await Source.deploy(asset.target);
    const second = await Source.deploy(asset.target);
    await vault.designateMarkExchange(first.target);
    await asset.mint(vault.target, 1000);
    await first.acknowledge(vault.target, 1000, false);
    await vault.designateMarkExchange(second.target);
    await expect(second.acknowledge(vault.target, 1000, false)).to.be.revertedWith("Token receipt mismatch");
    await vault.withdrawToken(asset.target, owner.address, 1000);
    await asset.mint(vault.target, 1000);
    await second.acknowledge(vault.target, 1000, false);
    expect(await vault.totalReceivedToken(asset.target)).to.equal(2000);
  });

  it("does not count native donations from other senders as launch proceeds", async function () {
    const { owner, vault } = await fixture();
    const source = await (await ethers.getContractFactory("LaunchSourceFixture")).deploy(ethers.ZeroAddress);
    await vault.designateMarkExchange(source.target);
    await owner.sendTransaction({ to: vault.target, value: 1000 });
    await expect(source.acknowledge(vault.target, 1000, true)).to.be.revertedWith("Native receipt mismatch");
    await source.deposit(vault.target, { value: 1000 });
    await source.acknowledge(vault.target, 1000, true);
    await expect(source.acknowledge(vault.target, 1000, true)).to.be.revertedWith("Launch already acknowledged");
    expect(await vault.totalReceivedNative()).to.equal(2000);
    expect(await vault.lastAcknowledgedAmount()).to.equal(1000);
  });
});
