import { ethers } from "hardhat";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type Address = string;

interface ParticipantSnapshot {
  address: Address;
  tokens: string;
  contributionWei: string;
}

const OUTPUT_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");

async function safeAttempt<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    console.log(`⚠️  ${label} -> reverted: ${(error as Error).message}`);
    return undefined;
  }
}

async function main() {
  const [owner, investorA, investorB, investorC, validatorA, validatorB, validatorC] = await ethers.getSigners();

  console.log("🚀 Booting α-AGI MARK foresight exchange demo\n");

  const NovaSeed = await ethers.getContractFactory("NovaSeedNFT", owner);
  const novaSeed = await NovaSeed.deploy(owner.address);
  await novaSeed.waitForDeployment();
  const seedId = await novaSeed.mintSeed.staticCall(owner.address, "ipfs://alpha-mark/seed/genesis");
  await (await novaSeed.mintSeed(owner.address, "ipfs://alpha-mark/seed/genesis")).wait();
  console.log(`🌱 Nova-Seed minted with tokenId=${seedId} at ${novaSeed.target}`);

  const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle", owner);
  const riskOracle = await RiskOracle.deploy(owner.address, [validatorA.address, validatorB.address, validatorC.address], 2);
  await riskOracle.waitForDeployment();
  console.log(`🛡️  Risk oracle deployed at ${riskOracle.target}`);

  const basePrice = ethers.parseEther("0.1");
  const slope = ethers.parseEther("0.05");
  const maxSupply = 100; // whole tokens

  const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken", owner);
  const mark = await AlphaMark.deploy(
    "α-AGI SeedShares",
    "SEED",
    owner.address,
    riskOracle.target,
    basePrice,
    slope,
    maxSupply,
    ethers.ZeroAddress
  );
  await mark.waitForDeployment();
  console.log(`🏛️  AlphaMark exchange deployed at ${mark.target}`);

  const SovereignVault = await ethers.getContractFactory("AlphaSovereignVault", owner);
  const sovereignVault = await SovereignVault.deploy(owner.address, "ipfs://alpha-mark/sovereign/genesis");
  await sovereignVault.waitForDeployment();
  await (await sovereignVault.designateMarkExchange(mark.target)).wait();
  console.log(`👑 Sovereign vault deployed at ${sovereignVault.target}`);

  await (await sovereignVault.pauseVault()).wait();
  await (await sovereignVault.unpauseVault()).wait();
  console.log("   • Sovereign vault pause/unpause controls verified");

  const Stable = await ethers.getContractFactory("TestStablecoin", owner);
  const stable = await Stable.deploy();
  await stable.waitForDeployment();

  console.log("   🪙 Owner demonstrates base-asset retargeting to a stablecoin and back");
  await (await mark.setBaseAsset(stable.target)).wait();
  await (await mark.setBaseAsset(ethers.ZeroAddress)).wait();

  await (await mark.setTreasury(owner.address)).wait();
  await (await mark.setFundingCap(ethers.parseEther("1000"))).wait();
  await (await mark.setWhitelistEnabled(true)).wait();
  await (await mark.setWhitelist([investorA.address, investorB.address, investorC.address], true)).wait();

  console.log("\n📊 Initial bonding curve configuration:");
  console.log(`   • Base price: ${ethers.formatEther(basePrice)} ETH`);
  console.log(`   • Slope: ${ethers.formatEther(slope)} ETH per token`);
  console.log(`   • Max supply: ${maxSupply} SeedShares\n`);
  console.log("   • Base asset: Native ETH (owner can retarget to a stablecoin pre-launch)\n");

  const buy = async (label: string, signer: any, amountTokens: string, overpay = "0") => {
    const amount = ethers.parseEther(amountTokens);
    const cost = await mark.previewPurchaseCost(amount);
    const totalValue = cost + ethers.parseEther(overpay);
    await (await mark.connect(signer).buyTokens(amount, { value: totalValue })).wait();
    console.log(`   ✅ ${label} bought ${amountTokens} SEED for ${ethers.formatEther(cost)} ETH`);
  };

  await buy("Investor A", investorA, "5", "0.2");

  console.log("   🔒 Owner pauses market to demonstrate compliance gate");
  await (await mark.pauseMarket()).wait();
  await safeAttempt("Investor C purchase while paused", async () => {
    const amount = ethers.parseEther("2");
    const cost = await mark.previewPurchaseCost(amount);
    await mark.connect(investorC).buyTokens(amount, { value: cost });
  });
  console.log("   🔓 Owner unpauses market\n");
  await (await mark.unpauseMarket()).wait();

  await buy("Investor B", investorB, "3");
  await buy("Investor C", investorC, "4");

  console.log("\n💡 Validator council activity:");
  await (await riskOracle.connect(validatorA).approveSeed()).wait();
  console.log(`   • Validator ${validatorA.address} approved`);
  await safeAttempt("Premature finalize attempt", async () => {
    const prematureMetadata = ethers.toUtf8Bytes("Attempt before consensus");
    await mark.finalizeLaunch(sovereignVault.target, prematureMetadata);
  });
  await (await riskOracle.connect(validatorB).approveSeed()).wait();
  console.log(`   • Validator ${validatorB.address} approved`);

  console.log("\n♻️  Investor B tests liquidity by selling 1 SEED");
  const sellAmount = ethers.parseEther("1");
  const sellReturn = await mark.previewSaleReturn(sellAmount);
  await (await mark.connect(investorB).sellTokens(sellAmount)).wait();
  console.log(`   ✅ Investor B redeemed 1 SEED for ${ethers.formatEther(sellReturn)} ETH`);

  console.log("\n🟢 Oracle threshold satisfied, owner finalizes launch to the sovereign vault");
  const launchMetadata = ethers.toUtf8Bytes("α-AGI Sovereign ignition: Nova-Seed ascends");
  await (await mark.finalizeLaunch(sovereignVault.target, launchMetadata)).wait();
  console.log(
    `   • Sovereign vault acknowledged ignition metadata: "${ethers.toUtf8String(launchMetadata)}"`
  );

  const [supply, reserve, nextPrice] = await mark.getCurveState();
  const approvalCount = await riskOracle.approvalCount();
  const threshold = await riskOracle.approvalThreshold();
  const ownerControlsRaw = await mark.getOwnerControls();

  const ownerControls = {
    paused: ownerControlsRaw.isPaused,
    whitelistEnabled: ownerControlsRaw.whitelistMode,
    emergencyExitEnabled: ownerControlsRaw.emergencyExit,
    finalized: ownerControlsRaw.isFinalized,
    aborted: ownerControlsRaw.isAborted,
    validationOverrideEnabled: ownerControlsRaw.overrideEnabled_,
    validationOverrideStatus: ownerControlsRaw.overrideStatus_,
    treasury: ownerControlsRaw.treasuryAddr as Address,
    riskOracle: ownerControlsRaw.riskOracleAddr as Address,
    baseAsset: ownerControlsRaw.baseAssetAddr as Address,
    usesNativeAsset: ownerControlsRaw.usesNative,
    fundingCapWei: ownerControlsRaw.fundingCapWei.toString(),
    maxSupplyWholeTokens: ownerControlsRaw.maxSupplyWholeTokens.toString(),
    saleDeadlineTimestamp: ownerControlsRaw.saleDeadlineTimestamp.toString(),
    basePriceWei: ownerControlsRaw.basePriceWei.toString(),
    slopeWei: ownerControlsRaw.slopeWei.toString(),
  };

  const participants: ParticipantSnapshot[] = [investorA, investorB, investorC].map((signer) => ({
    address: signer.address,
    tokens: "0",
    contributionWei: "0",
  }));

  for (const participant of participants) {
    const balance = await mark.balanceOf(participant.address);
    const contribution = await mark.participantContribution(participant.address);
    participant.tokens = ethers.formatEther(balance);
    participant.contributionWei = contribution.toString();
  }

  const validatorRoster = await riskOracle.getValidators();

  const sovereignMetadata = await sovereignVault.lastAcknowledgedMetadata();
  const sovereignTotalReceived = await sovereignVault.totalReceived();
  const recap = {
    contracts: {
      novaSeed: novaSeed.target,
      riskOracle: riskOracle.target,
      markExchange: mark.target,
      sovereignVault: sovereignVault.target,
    },
    seed: {
      tokenId: seedId.toString(),
      holder: owner.address,
    },
    validators: {
      approvalCount: approvalCount.toString(),
      approvalThreshold: threshold.toString(),
      members: validatorRoster,
    },
    bondingCurve: {
      supplyWholeTokens: supply.toString(),
      reserveWei: reserve.toString(),
      nextPriceWei: nextPrice.toString(),
      basePriceWei: basePrice.toString(),
      slopeWei: slope.toString(),
    },
    ownerControls,
    participants,
    launch: {
      finalized: await mark.finalized(),
      aborted: await mark.aborted(),
      treasury: await mark.treasury(),
      sovereignVault: {
        manifestUri: await sovereignVault.manifestUri(),
        totalReceivedWei: sovereignTotalReceived.toString(),
        lastAcknowledgedAmountWei: (await sovereignVault.lastAcknowledgedAmount()).toString(),
        lastAcknowledgedMetadataHex: sovereignMetadata,
        decodedMetadata: ethers.toUtf8String(sovereignMetadata),
        vaultBalanceWei: (await sovereignVault.vaultBalance()).toString(),
      },
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(recap, null, 2));

  console.log("\n🧾 Demo recap written to", OUTPUT_PATH);
  console.log(JSON.stringify(recap, null, 2));
  console.log(
    `\n✨ α-AGI MARK demo complete. Sovereign vault now safeguards ${ethers.formatEther(sovereignTotalReceived)} ETH.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
