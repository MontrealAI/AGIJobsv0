import { ethers } from "hardhat";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createHash } from "crypto";
import { execSync } from "child_process";

import { renderDashboard } from "./renderDashboard";
import { canonicalStringify } from "./utils/canonical";

type Address = string;

interface ParticipantSnapshot {
  address: Address;
  tokens: string;
  tokensWei: string;
  contributionWei: string;
  contributionEth?: string;
}

interface TradeRecord {
  kind: "BUY" | "SELL";
  actor: Address;
  label: string;
  tokensWhole: bigint;
  valueWei: bigint;
}

interface TimelineEntry {
  phase: string;
  title: string;
  description: string;
  icon?: string;
  actor?: Address;
  actorLabel?: string;
}

const OUTPUT_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");

const MIN_BALANCE = ethers.parseEther("0.05");
const ONE_TOKEN = ethers.parseEther("1");

function calculatePurchaseCost(basePriceWei: bigint, slopeWei: bigint, supplyWhole: bigint, amountWhole: bigint): bigint {
  const baseComponent = basePriceWei * amountWhole;
  const slopeComponent = slopeWei * ((amountWhole * ((2n * supplyWhole) + amountWhole - 1n)) / 2n);
  return baseComponent + slopeComponent;
}

function calculateSaleReturn(basePriceWei: bigint, slopeWei: bigint, supplyWhole: bigint, amountWhole: bigint): bigint {
  const baseComponent = basePriceWei * amountWhole;
  if (amountWhole === 0n || supplyWhole === 0n) {
    return baseComponent;
  }

  const numerator = amountWhole * ((2n * (supplyWhole - 1n)) - (amountWhole - 1n));
  const slopeComponent = slopeWei * (numerator / 2n);
  return baseComponent + slopeComponent;
}

function expectEqual(label: string, actual: bigint, expected: bigint) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
  console.log(`   ✅ ${label}`);
}

async function safeAttempt<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    console.log(`⚠️  ${label} -> reverted: ${(error as Error).message}`);
    return undefined;
  }
}

function parsePrivateKeys(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function ensureBalance(label: string, signer: any): Promise<void> {
  const address = await signer.getAddress();
  const balance = await signer.provider!.getBalance(address);
  if (balance < MIN_BALANCE) {
    throw new Error(
      `${label} (${address}) requires at least ${ethers.formatEther(MIN_BALANCE)} ETH but only has ${ethers.formatEther(balance)} ETH`,
    );
  }
}

const HARDHAT_CHAIN_ID = 31337n;

async function requireOperatorConsent(
  networkLabel: string,
  isDryRun: boolean,
  networkChainId: bigint,
): Promise<void> {
  const flag = process.env.AGIJOBS_DEMO_DRY_RUN ?? "unset";
  if (isDryRun) {
    if (networkChainId !== HARDHAT_CHAIN_ID) {
      console.log(
        "🛑 Dry-run safeguard active – refusing to execute against a live network. " +
          "Set AGIJOBS_DEMO_DRY_RUN=false to opt in to broadcasts.",
      );
      process.exit(0);
    }

    console.log(
      `🛡️  Dry-run safeguard active (AGIJOBS_DEMO_DRY_RUN=${flag}). Using Hardhat in-memory network (${networkLabel}).`,
    );
    return;
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question(
    `⚠️  Real network broadcast detected on ${networkLabel}. Type "launch" to confirm execution: `,
  );
  rl.close();

  if (answer.trim().toLowerCase() !== "launch") {
    console.log("🛑 Operator declined broadcast – exiting demo without executing transactions.");
    process.exit(0);
  }
}

async function loadActors() {
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  const isHardhat = network.chainId === 31337n;

  const ownerKey = process.env.ALPHA_MARK_OWNER_KEY;
  const investorKeys = parsePrivateKeys(process.env.ALPHA_MARK_INVESTOR_KEYS);
  const validatorKeys = parsePrivateKeys(process.env.ALPHA_MARK_VALIDATOR_KEYS);

  if (isHardhat && !ownerKey && investorKeys.length === 0 && validatorKeys.length === 0) {
    const signers = await ethers.getSigners();
    return {
      owner: signers[0],
      investors: [signers[1], signers[2], signers[3]],
      validators: [signers[4], signers[5], signers[6]],
      usesExternalKeys: false,
    };
  }

  if (!ownerKey) {
    throw new Error(
      "ALPHA_MARK_OWNER_KEY must be provided when running outside the Hardhat in-memory network.",
    );
  }
  if (investorKeys.length < 3) {
    throw new Error("ALPHA_MARK_INVESTOR_KEYS must supply at least three comma-separated private keys.");
  }
  if (validatorKeys.length < 3) {
    throw new Error("ALPHA_MARK_VALIDATOR_KEYS must supply at least three comma-separated private keys.");
  }

  const makeWallet = (key: string) => new ethers.Wallet(key, provider);

  return {
    owner: makeWallet(ownerKey),
    investors: investorKeys.slice(0, 3).map(makeWallet),
    validators: validatorKeys.slice(0, 3).map(makeWallet),
    usesExternalKeys: true,
  };
}

function describeNetworkName(name: string, chainId: bigint): string {
  if (!name || name === "unknown") {
    return `chain-${chainId.toString()}`;
  }
  return `${name} (chainId ${chainId})`;
}

async function main() {
  const { owner, investors, validators, usesExternalKeys } = await loadActors();
  const [investorA, investorB, investorC] = investors;
  const [validatorA, validatorB, validatorC] = validators;

  const ownerAddress = await owner.getAddress();
  const investorAddresses = await Promise.all(investors.map((signer) => signer.getAddress()));
  const validatorAddresses = await Promise.all(validators.map((signer) => signer.getAddress()));

  const tradeLedger: TradeRecord[] = [];
  const timeline: TimelineEntry[] = [];
  const accountState = new Map<
    Address,
    {
      tokens: bigint;
      grossContribution: bigint;
      netContribution: bigint;
    }
  >();
  let simulatedSupply = 0n;
  let simulatedReserve = 0n;

  const pushTimeline = (entry: TimelineEntry) => {
    timeline.push(entry);
  };

  const recordTrade = (entry: TradeRecord) => {
    tradeLedger.push(entry);
    const previous = accountState.get(entry.actor) ?? { tokens: 0n, grossContribution: 0n, netContribution: 0n };
    const tokensDelta = entry.kind === "BUY" ? entry.tokensWhole : -entry.tokensWhole;
    const grossDelta = entry.kind === "BUY" ? entry.valueWei : 0n;
    const netDelta = entry.kind === "BUY" ? entry.valueWei : -entry.valueWei;
    accountState.set(entry.actor, {
      tokens: previous.tokens + tokensDelta,
      grossContribution: previous.grossContribution + grossDelta,
      netContribution: previous.netContribution + netDelta,
    });

    const tokensDisplay = entry.tokensWhole.toString();
    const valueEth = ethers.formatEther(entry.valueWei);
    const isBuy = entry.kind === "BUY";
    pushTimeline({
      phase: isBuy ? "Market Activation" : "Liquidity",
      title: `${entry.label} ${isBuy ? "acquires" : "redeems"} ${tokensDisplay} SeedShares`,
      description: `${valueEth} ETH ${isBuy ? "committed to" : "released from"} the reserve`,
      icon: isBuy ? "🟢" : "🔄",
      actor: entry.actor,
      actorLabel: entry.label,
    });
  };

  const network = await ethers.provider.getNetwork();
  const currentBlock = await ethers.provider.getBlockNumber();
  const dryRun = (process.env.AGIJOBS_DEMO_DRY_RUN ?? "true").toLowerCase() !== "false";
  const networkLabel = describeNetworkName(network.name, network.chainId);

  await requireOperatorConsent(networkLabel, dryRun, network.chainId);

  console.log("🚀 Booting α-AGI MARK foresight exchange demo\n");
  console.log(`   • Network: ${networkLabel}`);
  console.log(`   • Dry run mode: ${dryRun ? "enabled" : "disabled"}`);
  console.log(`   • Actor source: ${usesExternalKeys ? "environment-provided keys" : "Hardhat signers"}\n`);

  pushTimeline({
    phase: "Orchestration",
    title: "Mission boot sequence",
    description: `AGI Jobs orchestrator engaged on ${networkLabel} (${dryRun ? "dry-run" : "broadcast"} mode)`,
    icon: "🚀",
  });

  await ensureBalance("Owner", owner);
  await Promise.all(investors.map((signer, idx) => ensureBalance(`Investor ${idx + 1}`, signer)));
  await Promise.all(validators.map((signer, idx) => ensureBalance(`Validator ${idx + 1}`, signer)));

  console.log("   • All actors funded above operational threshold\n");

  pushTimeline({
    phase: "Orchestration",
    title: "Actors cleared for launch",
    description: `Owner, investors, and validators funded ≥ ${ethers.formatEther(MIN_BALANCE)} ETH`,
    icon: "💠",
  });

  const NovaSeed = await ethers.getContractFactory("NovaSeedNFT", owner);
  const novaSeed = await NovaSeed.deploy(ownerAddress);
  await novaSeed.waitForDeployment();
  const seedId = await novaSeed.mintSeed.staticCall(ownerAddress, "ipfs://alpha-mark/seed/genesis");
  await (await novaSeed.mintSeed(ownerAddress, "ipfs://alpha-mark/seed/genesis")).wait();
  console.log(`🌱 Nova-Seed minted with tokenId=${seedId} at ${novaSeed.target}`);
  pushTimeline({
    phase: "Seed Genesis",
    title: `Nova-Seed minted (#${seedId})`,
    description: "Operator forges the foresight seed NFT underpinning the launch",
    icon: "🌱",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle", owner);
  const riskOracle = await RiskOracle.deploy(ownerAddress, validatorAddresses, 2);
  await riskOracle.waitForDeployment();
  console.log(`🛡️  Risk oracle deployed at ${riskOracle.target}`);
  pushTimeline({
    phase: "Deployment",
    title: "Risk oracle council activated",
    description: "Validator quorum contract online with 2-of-3 threshold",
    icon: "🛡️",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  const basePrice = ethers.parseEther("0.1");
  const slope = ethers.parseEther("0.05");
  const maxSupply = 100; // whole tokens

  const AlphaMark = await ethers.getContractFactory("AlphaMarkEToken", owner);
  const mark = await AlphaMark.deploy(
    "α-AGI SeedShares",
    "SEED",
    ownerAddress,
    riskOracle.target,
    basePrice,
    slope,
    maxSupply,
    ethers.ZeroAddress
  );
  await mark.waitForDeployment();
  console.log(`🏛️  AlphaMark exchange deployed at ${mark.target}`);
  pushTimeline({
    phase: "Deployment",
    title: "Bonding-curve exchange deployed",
    description: "AlphaMarkEToken market-maker ready for capital formation",
    icon: "🏛️",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  const SovereignVault = await ethers.getContractFactory("AlphaSovereignVault", owner);
  const sovereignVault = await SovereignVault.deploy(ownerAddress, "ipfs://alpha-mark/sovereign/genesis");
  await sovereignVault.waitForDeployment();
  await (await sovereignVault.designateMarkExchange(mark.target)).wait();
  console.log(`👑 Sovereign vault deployed at ${sovereignVault.target}`);
  pushTimeline({
    phase: "Deployment",
    title: "Sovereign vault commissioned",
    description: "Vault bound to the exchange for sovereign ignition",
    icon: "👑",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  await (await sovereignVault.pauseVault()).wait();
  await (await sovereignVault.unpauseVault()).wait();
  console.log("   • Sovereign vault pause/unpause controls verified");
  pushTimeline({
    phase: "Safety & Compliance",
    title: "Vault circuit breaker tested",
    description: "Owner pauses and resumes the sovereign vault to verify emergency controls",
    icon: "🛡️",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  const Stable = await ethers.getContractFactory("TestStablecoin", owner);
  const stable = await Stable.deploy();
  await stable.waitForDeployment();

  console.log("   🪙 Owner demonstrates base-asset retargeting to a stablecoin and back");
  await (await mark.setBaseAsset(stable.target)).wait();
  await (await mark.setBaseAsset(ethers.ZeroAddress)).wait();
  pushTimeline({
    phase: "Configuration",
    title: "Base asset retargeted",
    description: "Funding rail toggled from ETH to stablecoin and back before launch",
    icon: "🪙",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  await (await mark.setTreasury(ownerAddress)).wait();
  await (await mark.setFundingCap(ethers.parseEther("1000"))).wait();
  await (await mark.setWhitelistEnabled(true)).wait();
  await (await mark.setWhitelist(investorAddresses, true)).wait();
  pushTimeline({
    phase: "Configuration",
    title: "Owner governance levers calibrated",
    description: "Treasury, funding cap, and whitelist configured for sovereign launch",
    icon: "🛠️",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  console.log("\n📊 Initial bonding curve configuration:");
  console.log(`   • Base price: ${ethers.formatEther(basePrice)} ETH`);
  console.log(`   • Slope: ${ethers.formatEther(slope)} ETH per token`);
  console.log(`   • Max supply: ${maxSupply} SeedShares\n`);
  console.log("   • Base asset: Native ETH (owner can retarget to a stablecoin pre-launch)\n");

  const buy = async (label: string, signer: any, amountTokens: string, overpay = "0") => {
    const amount = ethers.parseEther(amountTokens);
    const tokensWhole = amount / ONE_TOKEN;
    const cost = await mark.previewPurchaseCost(amount);
    const manualCost = calculatePurchaseCost(basePrice, slope, simulatedSupply, tokensWhole);
    expectEqual(
      `Bonding curve cost parity for ${label} (${ethers.formatEther(cost)} ETH)`,
      cost,
      manualCost,
    );

    const totalValue = cost + ethers.parseEther(overpay);
    await (await mark.connect(signer).buyTokens(amount, { value: totalValue })).wait();

    simulatedSupply += tokensWhole;
    simulatedReserve += cost;
    const buyerAddress = await signer.getAddress();
    recordTrade({ kind: "BUY", actor: buyerAddress, label, tokensWhole, valueWei: cost });

    console.log(`   ✅ ${label} bought ${amountTokens} SEED for ${ethers.formatEther(cost)} ETH`);
  };

  await buy("Investor A", investorA, "5", "0.2");

  console.log("   🔒 Owner pauses market to demonstrate compliance gate");
  await (await mark.pauseMarket()).wait();
  pushTimeline({
    phase: "Safety & Compliance",
    title: "Market paused for compliance review",
    description: "Owner halts trading to showcase real-time control",
    icon: "⏸️",
    actor: ownerAddress,
    actorLabel: "Owner",
  });
  const pausedAttempt = await safeAttempt("Investor C purchase while paused", async () => {
    const amount = ethers.parseEther("2");
    const cost = await mark.previewPurchaseCost(amount);
    await mark.connect(investorC).buyTokens(amount, { value: cost });
  });
  if (pausedAttempt === undefined) {
    pushTimeline({
      phase: "Safety & Compliance",
      title: "Pause enforcement confirmed",
      description: "Investor C blocked while the market pause is active",
      icon: "🛑",
      actor: investorAddresses[2],
      actorLabel: "Investor C",
    });
  }
  console.log("   🔓 Owner unpauses market\n");
  await (await mark.unpauseMarket()).wait();
  pushTimeline({
    phase: "Safety & Compliance",
    title: "Market resumed",
    description: "Owner reopens trading after compliance check",
    icon: "▶️",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

  await buy("Investor B", investorB, "3");
  await buy("Investor C", investorC, "4");

  console.log("\n💡 Validator council activity:");
  await (await riskOracle.connect(validatorA).approveSeed()).wait();
  console.log(`   • Validator ${validatorAddresses[0]} approved`);
  pushTimeline({
    phase: "Governance",
    title: "Validator A casts approval",
    description: `Consensus progress: 1/${validatorAddresses.length}`,
    icon: "🗳️",
    actor: validatorAddresses[0],
    actorLabel: "Validator A",
  });
  const prematureFinalize = await safeAttempt("Premature finalize attempt", async () => {
    const prematureMetadata = ethers.toUtf8Bytes("Attempt before consensus");
    await mark.finalizeLaunch(sovereignVault.target, prematureMetadata);
  });
  if (prematureFinalize === undefined) {
    pushTimeline({
      phase: "Governance",
      title: "Launch guard rejected premature finalize",
      description: "Owner cannot finalize before oracle quorum",
      icon: "⚖️",
      actor: ownerAddress,
      actorLabel: "Owner",
    });
  }
  await (await riskOracle.connect(validatorB).approveSeed()).wait();
  console.log(`   • Validator ${validatorAddresses[1]} approved`);
  const approvalsNow = await riskOracle.approvalCount();
  const thresholdNow = await riskOracle.approvalThreshold();
  pushTimeline({
    phase: "Governance",
    title: "Validator B casts approval",
    description: `Consensus secured (${approvalsNow.toString()}/${thresholdNow.toString()})`,
    icon: "🗳️",
    actor: validatorAddresses[1],
    actorLabel: "Validator B",
  });

  console.log("\n♻️  Investor B tests liquidity by selling 1 SEED");
  const sellAmount = ethers.parseEther("1");
  const sellAmountWhole = sellAmount / ONE_TOKEN;
  const sellReturn = await mark.previewSaleReturn(sellAmount);
  const manualReturn = calculateSaleReturn(basePrice, slope, simulatedSupply, sellAmountWhole);
  expectEqual(
    `Bonding curve redemption parity for Investor B (${ethers.formatEther(sellReturn)} ETH)`,
    sellReturn,
    manualReturn,
  );
  await (await mark.connect(investorB).sellTokens(sellAmount)).wait();

  simulatedSupply -= sellAmountWhole;
  simulatedReserve -= sellReturn;
  const sellerAddress = await investorB.getAddress();
  recordTrade({ kind: "SELL", actor: sellerAddress, label: "Investor B", tokensWhole: sellAmountWhole, valueWei: sellReturn });

  console.log(`   ✅ Investor B redeemed 1 SEED for ${ethers.formatEther(sellReturn)} ETH`);

  console.log("\n🟢 Oracle threshold satisfied, owner finalizes launch to the sovereign vault");
  const launchMetadata = ethers.toUtf8Bytes("α-AGI Sovereign ignition: Nova-Seed ascends");
  await (await mark.finalizeLaunch(sovereignVault.target, launchMetadata)).wait();
  console.log(
    `   • Sovereign vault acknowledged ignition metadata: "${ethers.toUtf8String(launchMetadata)}"`
  );
  pushTimeline({
    phase: "Launch",
    title: "Sovereign ignition finalized",
    description: "Funds transferred to the vault with ignition metadata recorded",
    icon: "✨",
    actor: ownerAddress,
    actorLabel: "Owner",
  });

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
    fundingCapEth: ethers.formatEther(ownerControlsRaw.fundingCapWei),
    maxSupplyWholeTokens: ownerControlsRaw.maxSupplyWholeTokens.toString(),
    saleDeadlineTimestamp: ownerControlsRaw.saleDeadlineTimestamp.toString(),
    basePriceWei: ownerControlsRaw.basePriceWei.toString(),
    basePriceEth: ethers.formatEther(ownerControlsRaw.basePriceWei),
    slopeWei: ownerControlsRaw.slopeWei.toString(),
    slopeEth: ethers.formatEther(ownerControlsRaw.slopeWei),
  };

  const participants: ParticipantSnapshot[] = [];
  let participantContributionAggregate = 0n;
  let participantTokenAggregate = 0n;
  for (let i = 0; i < investors.length; i++) {
    const address = investorAddresses[i];
    const balance = await mark.balanceOf(address);
    const balanceWhole = balance / ONE_TOKEN;
    const contribution = await mark.participantContribution(address);
    const ledgerEntry = accountState.get(address);
    if (!ledgerEntry) {
      throw new Error(`Missing ledger entry for participant ${address}`);
    }

    participantContributionAggregate += contribution;
    participantTokenAggregate += balanceWhole;

    expectEqual(
      `Participant ${i + 1} token ledger alignment (${balanceWhole.toString()} SeedShares)`,
      ledgerEntry.tokens,
      balanceWhole,
    );
    expectEqual(
      `Participant ${i + 1} gross contribution alignment (${ethers.formatEther(contribution)} ETH)`,
      ledgerEntry.grossContribution,
      contribution,
    );

    participants.push({
      address,
      tokens: ethers.formatEther(balance),
      tokensWei: balance.toString(),
      contributionWei: contribution.toString(),
      contributionEth: ethers.formatEther(contribution),
    });
  }

  let ledgerSupplyWhole = 0n;
  let ledgerGrossWei = 0n;
  let ledgerSellWei = 0n;
  for (const entry of tradeLedger) {
    if (entry.kind === "BUY") {
      ledgerSupplyWhole += entry.tokensWhole;
      ledgerGrossWei += entry.valueWei;
    } else {
      ledgerSupplyWhole -= entry.tokensWhole;
      ledgerSellWei += entry.valueWei;
    }
  }

  const ledgerNetWei = ledgerGrossWei - ledgerSellWei;
  const simulatedNextPrice = basePrice + slope * simulatedSupply;

  const validatorRoster = await riskOracle.getValidators();
  const validatorMatrix = [] as Array<{ address: Address; approved: boolean }>;
  for (const validator of validatorRoster) {
    const approved = await riskOracle.hasApproved(validator);
    validatorMatrix.push({ address: validator, approved });
  }

  const sovereignMetadata = await sovereignVault.lastAcknowledgedMetadata();
  const sovereignTotalReceived = await sovereignVault.totalReceived();
  const lastAcknowledgedAmount = await sovereignVault.lastAcknowledgedAmount();
  const vaultBalance = await sovereignVault.vaultBalance();
  const combinedReserve = reserve + sovereignTotalReceived;

  console.log("\n🔍 Triple-verification matrix:");
  expectEqual(
    `Ledger supply matches on-chain total (${ledgerSupplyWhole.toString()} SeedShares)`,
    ledgerSupplyWhole,
    supply,
  );
  expectEqual(
    `Simulation supply matches on-chain total (${simulatedSupply.toString()} SeedShares)`,
    simulatedSupply,
    supply,
  );
  expectEqual(
    `Participant balances sum to supply (${participantTokenAggregate.toString()} SeedShares)`,
    participantTokenAggregate,
    supply,
  );
  expectEqual(
    `Next token price matches first-principles math (${ethers.formatEther(nextPrice)} ETH)`,
    nextPrice,
    simulatedNextPrice,
  );
  expectEqual(
    `Vault receipts equal ledger net capital (${ethers.formatEther(sovereignTotalReceived)} ETH)`,
    sovereignTotalReceived,
    ledgerNetWei,
  );
  expectEqual(
    `Simulated reserve equals ledger net capital (${ethers.formatEther(simulatedReserve)} ETH)`,
    simulatedReserve,
    ledgerNetWei,
  );
  expectEqual(
    `Reserve + vault equals ledger net capital (${ethers.formatEther(combinedReserve)} ETH)`,
    combinedReserve,
    ledgerNetWei,
  );
  expectEqual(
    `Participant contributions equal ledger gross capital (${ethers.formatEther(participantContributionAggregate)} ETH)`,
    participantContributionAggregate,
    ledgerGrossWei,
  );
  const recap = {
    contracts: {
      novaSeed: novaSeed.target,
      riskOracle: riskOracle.target,
      markExchange: mark.target,
      sovereignVault: sovereignVault.target,
    },
    seed: {
      tokenId: seedId.toString(),
      holder: ownerAddress,
    },
    validators: {
      approvalCount: approvalCount.toString(),
      approvalThreshold: threshold.toString(),
      members: validatorRoster,
      matrix: validatorMatrix,
    },
    bondingCurve: {
      supplyWholeTokens: supply.toString(),
      reserveWei: reserve.toString(),
      nextPriceWei: nextPrice.toString(),
      basePriceWei: basePrice.toString(),
      slopeWei: slope.toString(),
      reserveEth: ethers.formatEther(reserve),
      nextPriceEth: ethers.formatEther(nextPrice),
      basePriceEth: ownerControls.basePriceEth,
      slopeEth: ownerControls.slopeEth,
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
        totalReceivedEth: ethers.formatEther(sovereignTotalReceived),
        lastAcknowledgedAmountWei: lastAcknowledgedAmount.toString(),
        lastAcknowledgedAmountEth: ethers.formatEther(lastAcknowledgedAmount),
        lastAcknowledgedMetadataHex: sovereignMetadata,
        decodedMetadata: ethers.toUtf8String(sovereignMetadata),
        vaultBalanceWei: vaultBalance.toString(),
        vaultBalanceEth: ethers.formatEther(vaultBalance),
      },
    },
  };

  const ownerParameterMatrix = [
    {
      parameter: "pauseMarket",
      value: ownerControls.paused,
      description: "Master halt switch for all bonding-curve trades",
    },
    {
      parameter: "whitelistEnabled",
      value: ownerControls.whitelistEnabled,
      description: "Compliance gate restricting participation to approved wallets",
    },
    {
      parameter: "emergencyExitEnabled",
      value: ownerControls.emergencyExitEnabled,
      description: "Allow redemptions while paused for orderly unwinding",
    },
    {
      parameter: "validationOverrideEnabled",
      value: ownerControls.validationOverrideEnabled,
      description: "Owner override switch for the risk oracle consensus",
    },
    {
      parameter: "validationOverrideStatus",
      value: ownerControls.validationOverrideStatus,
      description: "Forced validation outcome when override is enabled",
    },
    {
      parameter: "finalized",
      value: ownerControls.finalized,
      description: "Indicates whether sovereign funds have been dispatched",
    },
    {
      parameter: "aborted",
      value: ownerControls.aborted,
      description: "Emergency abort flag preserving participant capital",
    },
    {
      parameter: "treasury",
      value: ownerControls.treasury,
      description: "Address receiving proceeds on finalization",
    },
    {
      parameter: "riskOracle",
      value: ownerControls.riskOracle,
      description: "Validator council contract controlling launch approvals",
    },
    {
      parameter: "baseAsset",
      value: ownerControls.baseAsset,
      description: "Current financing currency (0x0 indicates native ETH)",
    },
    {
      parameter: "usesNativeAsset",
      value: ownerControls.usesNativeAsset,
      description: "True when the market accepts native ETH deposits",
    },
    {
      parameter: "fundingCap",
      value: { wei: ownerControls.fundingCapWei, eth: ownerControls.fundingCapEth },
      description: "Upper bound on capital accepted before launch",
    },
    {
      parameter: "maxSupplyWholeTokens",
      value: ownerControls.maxSupplyWholeTokens,
      description: "Maximum SeedShares that can ever be minted",
    },
    {
      parameter: "saleDeadlineTimestamp",
      value: ownerControls.saleDeadlineTimestamp,
      description: "Timestamp after which purchases are rejected",
    },
    {
      parameter: "basePrice",
      value: { wei: ownerControls.basePriceWei, eth: ownerControls.basePriceEth },
      description: "Bonding curve base price component",
    },
    {
      parameter: "slope",
      value: { wei: ownerControls.slopeWei, eth: ownerControls.slopeEth },
      description: "Bonding curve slope component",
    },
  ];

  const verification = {
    supplyConsensus: {
      ledgerWholeTokens: ledgerSupplyWhole.toString(),
      contractWholeTokens: supply.toString(),
      simulationWholeTokens: simulatedSupply.toString(),
      participantAggregateWholeTokens: participantTokenAggregate.toString(),
      consistent:
        ledgerSupplyWhole === supply &&
        simulatedSupply === supply &&
        participantTokenAggregate === supply,
    },
    pricing: {
      contractNextPriceWei: nextPrice.toString(),
      contractNextPriceEth: ethers.formatEther(nextPrice),
      simulatedNextPriceWei: simulatedNextPrice.toString(),
      simulatedNextPriceEth: ethers.formatEther(simulatedNextPrice),
      consistent: nextPrice === simulatedNextPrice,
    },
    capitalFlows: {
      ledgerGrossWei: ledgerGrossWei.toString(),
      ledgerGrossEth: ethers.formatEther(ledgerGrossWei),
      ledgerRedemptionsWei: ledgerSellWei.toString(),
      ledgerRedemptionsEth: ethers.formatEther(ledgerSellWei),
      ledgerNetWei: ledgerNetWei.toString(),
      ledgerNetEth: ethers.formatEther(ledgerNetWei),
      simulatedReserveWei: simulatedReserve.toString(),
      simulatedReserveEth: ethers.formatEther(simulatedReserve),
      contractReserveWei: reserve.toString(),
      contractReserveEth: ethers.formatEther(reserve),
      vaultReceivedWei: sovereignTotalReceived.toString(),
      vaultReceivedEth: ethers.formatEther(sovereignTotalReceived),
      combinedReserveWei: combinedReserve.toString(),
      combinedReserveEth: ethers.formatEther(combinedReserve),
      consistent: ledgerNetWei === combinedReserve,
    },
    contributions: {
      participantAggregateWei: participantContributionAggregate.toString(),
      participantAggregateEth: ethers.formatEther(participantContributionAggregate),
      ledgerGrossWei: ledgerGrossWei.toString(),
      ledgerGrossEth: ethers.formatEther(ledgerGrossWei),
      consistent: participantContributionAggregate === ledgerGrossWei,
    },
  };

  pushTimeline({
    phase: "Verification",
    title: "Triple-verification matrix aligned",
    description: "Ledger, simulation, and on-chain state reconcile 1:1",
    icon: "✅",
  });

  pushTimeline({
    phase: "Mission Control",
    title: "Recap dossier synthesis",
    description: "Preparing sovereign dashboard, owner matrix, and recap digest",
    icon: "🧾",
  });

  const timelineRecap = timeline.map((entry, index) => ({
    order: index + 1,
    phase: entry.phase,
    title: entry.title,
    description: entry.description,
    icon: entry.icon,
    actor: entry.actor,
    actorLabel: entry.actorLabel,
  }));

  const enrichedRecap = {
    ...recap,
    trades: tradeLedger.map((entry) => ({
      kind: entry.kind,
      actor: entry.actor,
      label: entry.label,
      tokensWhole: entry.tokensWhole.toString(),
      valueWei: entry.valueWei.toString(),
      valueEth: ethers.formatEther(entry.valueWei),
    })),
    ownerParameterMatrix,
    verification,
    timeline: timelineRecap,
  };

  const actors = {
    owner: ownerAddress,
    investors: investorAddresses,
    validators: validatorAddresses,
  };

  const gitInfo = (command: string): string | undefined => {
    try {
      return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch (error) {
      return undefined;
    }
  };

  const orchestrationMetadata = {
    commit: gitInfo("git rev-parse HEAD"),
    branch: gitInfo("git rev-parse --abbrev-ref HEAD"),
    workspaceDirty: Boolean(gitInfo("git status --short")),
    mode: dryRun ? "dry-run" : "broadcast",
  };

  const generatedAt = new Date().toISOString();
  const baseRecap = {
    generatedAt,
    network: {
      label: networkLabel,
      name: network.name ?? "unknown",
      chainId: network.chainId.toString(),
      blockNumber: currentBlock.toString(),
      dryRun,
    },
    orchestrator: orchestrationMetadata,
    actors,
    ...enrichedRecap,
  };

  const digest = createHash("sha256").update(canonicalStringify(baseRecap)).digest("hex");
  const finalRecap = {
    ...baseRecap,
    checksums: {
      algorithm: "sha256",
      canonicalEncoding: "json-key-sorted",
      recapSha256: digest,
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(finalRecap, null, 2));
  const dashboardPath = await renderDashboard(finalRecap);

  console.log("\n🧾 Demo recap written to", OUTPUT_PATH);
  console.log("🖥️  Sovereign dashboard rendered to", dashboardPath);
  console.log(JSON.stringify(finalRecap, null, 2));
  console.log(`🔐 Recap digest (sha256): ${digest}`);
  console.log("\n🧭 Owner parameter matrix snapshot:");
  console.table(ownerParameterMatrix);
  console.log(
    `\n✨ α-AGI MARK demo complete. Sovereign vault now safeguards ${ethers.formatEther(sovereignTotalReceived)} ETH.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
