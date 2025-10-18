import { expect } from "chai";
import { ethers } from "hardhat";

import type { AlphaInsightNovaSeed } from "../typechain-types";

describe("AlphaInsightNovaSeed", () => {
  let contract: AlphaInsightNovaSeed;
  let owner: any;
  let alice: any;
  let bob: any;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AlphaInsightNovaSeed");
    contract = (await factory.deploy(owner.address)) as unknown as AlphaInsightNovaSeed;
    await contract.waitForDeployment();
  });

  function sampleInput(
    overrides: Partial<{
      sector: string;
      thesis: string;
      disruptionTimestamp: bigint;
      sealedURI: string;
      confidenceBps: number;
      forecastValue: string;
    }> = {}
  ) {
    return {
      sector: overrides.sector ?? "Finance",
      thesis: overrides.thesis ?? "Autonomous capital markets eclipse human traders.",
      disruptionTimestamp: overrides.disruptionTimestamp ?? BigInt(Math.floor(Date.UTC(2027, 0, 1) / 1000)),
      sealedURI: overrides.sealedURI ?? "ipfs://sealed",
      confidenceBps: overrides.confidenceBps ?? 9100,
      forecastValue: overrides.forecastValue ?? "42T",
    };
  }

  it("allows owner minting and stores metadata", async () => {
    const tx = await contract.mintInsight(alice.address, sampleInput());
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1n);

    expect(await contract.ownerOf(1n)).to.equal(alice.address);
    const insight = await contract.getInsight(1n);
    expect(insight.sector).to.equal("Finance");
    expect(insight.fusionRevealed).to.equal(false);
    expect(insight.originalMinter).to.equal(owner.address);
    expect(insight.mintedAt).to.be.gt(0n);
    expect(insight.confidenceBps).to.equal(9100);
    expect(insight.forecastValue).to.equal("42T");
  });

  it("permits delegated minters and enforces authorization", async () => {
    await expect(contract.connect(alice).mintInsight(bob.address, sampleInput())).to.be.revertedWith("NOT_AUTHORIZED");

    await contract.setMinter(alice.address, true);
    await contract
      .connect(alice)
      .mintInsight(
        bob.address,
        sampleInput({ sector: "Energy", confidenceBps: 8800, forecastValue: "17T" })
      );

    const stored = await contract.getInsight(1n);
    expect(stored.sector).to.equal("Energy");
    expect(stored.originalMinter).to.equal(alice.address);
    expect(stored.confidenceBps).to.equal(8800);
    expect(stored.forecastValue).to.equal("17T");
  });

  it("blocks operations while paused", async () => {
    await contract.pause();
    await expect(contract.mintInsight(alice.address, sampleInput())).to.be.revertedWithCustomError(contract, "EnforcedPause");
    await contract.unpause();
    await contract.mintInsight(alice.address, sampleInput());
  });

  it("allows owner to update and reveal fusion plan", async () => {
    await contract.mintInsight(alice.address, sampleInput());
    await contract.updateInsightDetails(
      1n,
      "Healthcare",
      "AGI cures rare diseases",
      BigInt(Math.floor(Date.UTC(2028, 0, 1) / 1000)),
      9400,
      "55T"
    );
    await contract.revealFusionPlan(1n, "ipfs://fusion");
    await contract.updateFusionPlan(1n, "ipfs://fusion?rev=2");

    const updated = await contract.getInsight(1n);
    expect(updated.sector).to.equal("Healthcare");
    expect(updated.thesis).to.equal("AGI cures rare diseases");
    expect(updated.fusionRevealed).to.equal(true);
    expect(updated.fusionURI).to.equal("ipfs://fusion?rev=2");
    expect(updated.confidenceBps).to.equal(9400);
    expect(updated.forecastValue).to.equal("55T");
    expect(await contract.tokenURI(1n)).to.equal("ipfs://fusion?rev=2");
  });

  it("keeps fusion URI in sync with sealed updates prior to reveal", async () => {
    await contract.mintInsight(alice.address, sampleInput());
    await contract.updateSealedURI(1n, "ipfs://sealed-updated");

    let metadata = await contract.getInsight(1n);
    expect(metadata.sealedURI).to.equal("ipfs://sealed-updated");
    expect(metadata.fusionURI).to.equal("ipfs://sealed-updated");
    expect(metadata.fusionRevealed).to.equal(false);

    await contract.revealFusionPlan(1n, "ipfs://fusion");
    await contract.updateSealedURI(1n, "ipfs://sealed-post-reveal");

    metadata = await contract.getInsight(1n);
    expect(metadata.sealedURI).to.equal("ipfs://sealed-post-reveal");
    expect(metadata.fusionURI).to.equal("ipfs://fusion");
    expect(metadata.confidenceBps).to.equal(9100);
  });

  it("allows delegated sentinel to pause", async () => {
    await contract.setSystemPause(alice.address);
    expect(await contract.systemPause()).to.equal(alice.address);

    await contract.connect(alice).pause();
    await expect(contract.mintInsight(alice.address, sampleInput())).to.be.revertedWithCustomError(contract, "EnforcedPause");

    await contract.unpause();
    await contract.mintInsight(alice.address, sampleInput());
  });

  it("blocks unauthorized pause and sentinel unpause attempts", async () => {
    await contract.setSystemPause(alice.address);

    await expect(contract.connect(bob).pause()).to.be.revertedWith("NOT_AUTHORIZED");

    await contract.connect(alice).pause();
    await expect(contract.connect(alice).unpause())
      .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);

    await contract.unpause();
  });

  it("prevents blank metadata", async () => {
    await expect(contract.mintInsight(alice.address, sampleInput({ sector: "" }))).to.be.revertedWith("SECTOR_REQUIRED");
    await expect(contract.mintInsight(alice.address, sampleInput({ thesis: "" }))).to.be.revertedWith("THESIS_REQUIRED");
    await expect(contract.mintInsight(alice.address, sampleInput({ sealedURI: "" }))).to.be.revertedWith("URI_REQUIRED");
    await expect(contract.mintInsight(alice.address, sampleInput({ forecastValue: "" }))).to.be.revertedWith("FORECAST_REQUIRED");
    await expect(contract.mintInsight(alice.address, sampleInput({ confidenceBps: 20000 }))).to.be.revertedWith("CONFIDENCE_INVALID");

    await contract.mintInsight(alice.address, sampleInput());
    await expect(
      contract.updateInsightDetails(1n, "", "Valid thesis", BigInt(Math.floor(Date.UTC(2028, 0, 1) / 1000)), 9000, "10T")
    ).to.be.revertedWith("SECTOR_REQUIRED");
    await expect(
      contract.updateInsightDetails(1n, "Finance", "", BigInt(Math.floor(Date.UTC(2028, 0, 1) / 1000)), 9000, "10T")
    ).to.be.revertedWith("THESIS_REQUIRED");
    await expect(
      contract.updateInsightDetails(1n, "Finance", "Valid", BigInt(Math.floor(Date.UTC(2028, 0, 1) / 1000)), 9000, "")
    ).to.be.revertedWith("FORECAST_REQUIRED");
    await expect(
      contract.updateInsightDetails(1n, "Finance", "Valid", BigInt(Math.floor(Date.UTC(2028, 0, 1) / 1000)), 15000, "10T")
    ).to.be.revertedWith("CONFIDENCE_INVALID");
  });
});
