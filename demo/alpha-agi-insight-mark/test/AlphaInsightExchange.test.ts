import { expect } from "chai";
import { ethers } from "hardhat";

import type { AlphaInsightExchange, AlphaInsightNovaSeed, InsightAccessToken } from "../typechain-types";

describe("AlphaInsightExchange", () => {
  let owner: any;
  let seller: any;
  let buyer: any;
  let oracle: any;
  let nova: AlphaInsightNovaSeed;
  let token: InsightAccessToken;
  let exchange: AlphaInsightExchange;

  beforeEach(async () => {
    [owner, seller, buyer, oracle] = await ethers.getSigners();

    const novaFactory = await ethers.getContractFactory("AlphaInsightNovaSeed");
    nova = (await novaFactory.deploy(owner.address)) as unknown as AlphaInsightNovaSeed;
    await nova.waitForDeployment();

    const tokenFactory = await ethers.getContractFactory("InsightAccessToken");
    token = (await tokenFactory.deploy(owner.address)) as unknown as InsightAccessToken;
    await token.waitForDeployment();

    const exchangeFactory = await ethers.getContractFactory("AlphaInsightExchange");
    exchange = (await exchangeFactory.deploy(owner.address, nova, token, owner.address, 500)) as unknown as AlphaInsightExchange;
    await exchange.waitForDeployment();

    await nova.setMinter(owner.address, true);
    await nova.mintInsight(seller.address, {
      sector: "Finance",
      thesis: "Synthetic AI investors fracture market equilibrium",
      disruptionTimestamp: BigInt(Math.floor(Date.UTC(2027, 0, 1) / 1000)),
      sealedURI: "ipfs://seed/finance",
    });

    await token.mint(buyer.address, ethers.parseUnits("1000", 18));
    await token.connect(buyer).approve(await exchange.getAddress(), ethers.parseUnits("1000", 18));
  });

  it("supports listing, purchasing, and fee distribution", async () => {
    await nova.connect(seller).approve(await exchange.getAddress(), 1n);
    await exchange.connect(seller).listInsight(1n, ethers.parseUnits("250", 18));

    const treasuryBalanceBefore = await token.balanceOf(owner.address);
    const sellerBalanceBefore = await token.balanceOf(seller.address);

    await exchange.connect(buyer).buyInsight(1n);

    expect(await nova.ownerOf(1n)).to.equal(buyer.address);
    const treasuryDelta = (await token.balanceOf(owner.address)) - treasuryBalanceBefore;
    const sellerDelta = (await token.balanceOf(seller.address)) - sellerBalanceBefore;

    expect(treasuryDelta).to.equal(ethers.parseUnits("12.5", 18));
    expect(sellerDelta).to.equal(ethers.parseUnits("237.5", 18));

    const listing = await exchange.listing(1n);
    expect(listing.active).to.equal(false);
    expect(listing.buyer).to.equal(buyer.address);
  });

  it("allows cancellations and pausing", async () => {
    await nova.connect(seller).approve(await exchange.getAddress(), 1n);
    await exchange.connect(seller).listInsight(1n, ethers.parseUnits("100", 18));

    await exchange.pause();
    await expect(exchange.connect(buyer).buyInsight(1n)).to.be.revertedWithCustomError(exchange, "EnforcedPause");
    await exchange.unpause();

    await exchange.connect(seller).cancelListing(1n);
    expect(await nova.ownerOf(1n)).to.equal(seller.address);
  });

  it("records oracle resolution", async () => {
    await exchange.setOracle(oracle.address);
    await exchange.connect(oracle).resolvePrediction(1n, true, "Finance rupture confirmed");
    const record = await exchange.resolution(1n);
    expect(record.resolved).to.equal(true);
    expect(record.fulfilled).to.equal(true);
    expect(record.notes).to.equal("Finance rupture confirmed");
    expect(record.resolver).to.equal(oracle.address);
  });
});
