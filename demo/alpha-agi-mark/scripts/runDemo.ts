import { ethers } from "hardhat";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

type Address = string;

interface ParticipantSnapshot {
  address: Address;
  tokens: string;
  contributionWei: string;
}

const OUTPUT_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");

const MIN_BALANCE = ethers.parseEther("0.05");

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

  const network = await ethers.provider.getNetwork();
  const dryRun = (process.env.AGIJOBS_DEMO_DRY_RUN ?? "true").toLowerCase() !== "false";
  const networkLabel = describeNetworkName(network.name, network.chainId);

  await requireOperatorConsent(networkLabel, dryRun, network.chainId);

  console.log("🚀 Booting α-AGI MARK foresight exchange demo\n");
  console.log(`   • Network: ${networkLabel}`);
  console.log(`   • Dry run mode: ${dryRun ? "enabled" : "disabled"}`);
  console.log(`   • Actor source: ${usesExternalKeys ? "environment-provided keys" : "Hardhat signers"}\n`);

  await ensureBalance("Owner", owner);
  await Promise.all(investors.map((signer, idx) => ensureBalance(`Investor ${idx + 1}`, signer)));
  await Promise.all(validators.map((signer, idx) => ensureBalance(`Validator ${idx + 1}`, signer)));

  console.log("   • All actors funded above operational threshold\n");

  const NovaSeed = await ethers.getContractFactory("NovaSeedNFT", owner);
  const novaSeed = await NovaSeed.deploy(ownerAddress);
  await novaSeed.waitForDeployment();
  const seedId = await novaSeed.mintSeed.staticCall(ownerAddress, "ipfs://alpha-mark/seed/genesis");
  await (await novaSeed.mintSeed(ownerAddress, "ipfs://alpha-mark/seed/genesis")).wait();
  console.log(`🌱 Nova-Seed minted with tokenId=${seedId} at ${novaSeed.target}`);

  const RiskOracle = await ethers.getContractFactory("AlphaMarkRiskOracle", owner);
  const riskOracle = await RiskOracle.deploy(ownerAddress, validatorAddresses, 2);
  await riskOracle.waitForDeployment();
  console.log(`🛡️  Risk oracle deployed at ${riskOracle.target}`);

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

  const SovereignVault = await ethers.getContractFactory("AlphaSovereignVault", owner);
  const sovereignVault = await SovereignVault.deploy(ownerAddress, "ipfs://alpha-mark/sovereign/genesis");
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

  await (await mark.setTreasury(ownerAddress)).wait();
  await (await mark.setFundingCap(ethers.parseEther("1000"))).wait();
  await (await mark.setWhitelistEnabled(true)).wait();
  await (await mark.setWhitelist(investorAddresses, true)).wait();

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
  console.log(`   • Validator ${validatorAddresses[0]} approved`);
  await safeAttempt("Premature finalize attempt", async () => {
    const prematureMetadata = ethers.toUtf8Bytes("Attempt before consensus");
    await mark.finalizeLaunch(sovereignVault.target, prematureMetadata);
  });
  await (await riskOracle.connect(validatorB).approveSeed()).wait();
  console.log(`   • Validator ${validatorAddresses[1]} approved`);

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

  const participants: ParticipantSnapshot[] = [];
  for (let i = 0; i < investors.length; i++) {
    const address = investorAddresses[i];
    const balance = await mark.balanceOf(address);
    const contribution = await mark.participantContribution(address);
    participants.push({
      address,
      tokens: ethers.formatEther(balance),
      contributionWei: contribution.toString(),
    });
  }

  const validatorRoster = await riskOracle.getValidators();
  const validatorMatrix = [] as Array<{ address: Address; approved: boolean }>;
  for (const validator of validatorRoster) {
    const approved = await riskOracle.hasApproved(validator);
    validatorMatrix.push({ address: validator, approved });
  }

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
      parameter: "fundingCapWei",
      value: ownerControls.fundingCapWei,
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
      parameter: "basePriceWei",
      value: ownerControls.basePriceWei,
      description: "Bonding curve base price component",
    },
    {
      parameter: "slopeWei",
      value: ownerControls.slopeWei,
      description: "Bonding curve slope component",
    },
  ];

  const enrichedRecap = {
    ...recap,
    ownerParameterMatrix,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(enrichedRecap, null, 2));

  console.log("\n🧾 Demo recap written to", OUTPUT_PATH);
  console.log(JSON.stringify(enrichedRecap, null, 2));
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
