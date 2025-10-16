import { ethers } from "hardhat";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type Address = string;

interface ParticipantSnapshot {
  label: string;
  address: Address;
  tokens: string;
  contributionWei: string;
}

const OUTPUT_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
const OUTPUT_MARKDOWN_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.md");

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

  const participantProfiles = [
    { label: "Investor A", signer: investorA },
    { label: "Investor B", signer: investorB },
    { label: "Investor C", signer: investorC },
  ];

  const participants: ParticipantSnapshot[] = participantProfiles.map(({ label, signer }) => ({
    label,
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

  const formatEth = (wei: string) => ethers.formatEther(BigInt(wei));
  const boolBadge = (value: boolean) => (value ? "✅ Enabled" : "⬜ Disabled");

  const participantRows = participants
    .map(
      (participant) =>
        `| ${participant.label} | ${participant.address} | ${participant.tokens} | ${formatEth(participant.contributionWei)} |`
    )
    .join("\n");

  const ownerRows = [
    ["Market paused", boolBadge(ownerControls.paused)],
    ["Whitelist", boolBadge(ownerControls.whitelistEnabled)],
    ["Emergency exit", boolBadge(ownerControls.emergencyExitEnabled)],
    ["Finalized", ownerControls.finalized ? "🎯 Finalized" : "⏳ Pending"],
    ["Aborted", ownerControls.aborted ? "🛑 Halted" : "🟢 Active"],
    ["Validation override", boolBadge(ownerControls.validationOverrideEnabled)],
  ]
    .map(([label, value]) => `| ${label} | ${value} |`)
    .join("\n");

  const pieMermaid = [
    "```mermaid",
    "pie showData",
    "  title SeedShare contributions (ETH)",
    ...participants
      .filter((participant) => BigInt(participant.contributionWei) > 0n)
      .map((participant) => {
        const value = Number(formatEth(participant.contributionWei)).toFixed(3);
        return `  \"${participant.label}\" : ${value}`;
      }),
    "```",
  ].join("\n");

  const flowMermaid = [
    "```mermaid",
    "flowchart TD",
    "    classDef operator fill:#302B70,stroke:#9A7FF2,color:#fff,stroke-width:2px;",
    "    classDef contract fill:#0F4C75,stroke:#7FDBFF,color:#FFFFFF,stroke-width:1.5px;",
    "    classDef action fill:#1B262C,stroke:#BBE1FA,color:#FFFFFF,stroke-width:1.5px;",
    "",
    "    subgraph Operator[Operator -- guided by AGI Jobs v0 (v2)]",
    "        Start[Run npm run demo:alpha-agi-mark]",
    "    end",
    "",
    "    subgraph Contracts[α-AGI MARK Foresight Stack]",
    "        Seed[NovaSeedNFT\\nGenesis seed minted]",
    "        Oracle[AlphaMarkRiskOracle\\nValidator quorum + overrides]",
    "        Curve[AlphaMarkEToken\\nBonding curve + compliance gates]",
    "        Vault[AlphaSovereignVault\\nIgnition manifest + treasury]",
    "    end",
    "",
    "    subgraph Dynamics[Market + Governance Dynamics]",
    "        Investors[Investors acquire SeedShares]",
    "        Validators[Validators approve seed]",
    "        Finalize[Owner finalizes sovereign ignition]",
    "        Recap[Recap dossier written for operator]",
    "    end",
    "",
    "    Start --> Seed --> Oracle --> Curve --> Investors --> Validators --> Finalize --> Vault",
    "    Oracle -. Owner override .-> Finalize",
    "    Curve -. Emergency exit .-> Investors",
    "    Vault --> Recap",
    "",
    "    class Start,Recap operator",
    "    class Seed,Oracle,Curve,Vault contract",
    "    class Investors,Validators,Finalize action",
    "```",
  ].join("\n");

  const journeyMermaid = [
    "```mermaid",
    "journey",
    "    title Operator mission timeline",
    "    section Seed Genesis",
    "      Boot Hardhat chain: 5",
    "      Deploy Nova-Seed NFT: 5",
    "    section Market Formation",
    "      Configure bonding curve + whitelist: 4",
    "      Investors join the SeedShares pool: 4",
    "      Pause & resume compliance drill: 3",
    "    section Validation & Ignition",
    "      Validators reach quorum: 5",
    "      Owner finalizes launch: 5",
    "      Sovereign vault acknowledges ignition: 5",
    "```",
  ].join("\n");

  const markdown = `# α-AGI MARK Demo Recap\n\n` +
    `This dossier is generated automatically by the demo run so that a non-technical operator can audit every milestone of the foresight market ignition.\n\n` +
    `${flowMermaid}\n\n` +
    `## Contracts\n\n` +
    `| Component | Address |\n| --- | --- |\n` +
    `| NovaSeedNFT | ${recap.contracts.novaSeed} |\n` +
    `| Risk Oracle | ${recap.contracts.riskOracle} |\n` +
    `| AlphaMark Exchange | ${recap.contracts.markExchange} |\n` +
    `| Sovereign Vault | ${recap.contracts.sovereignVault} |\n\n` +
    `## Owner Control Dashboard\n\n` +
    `| Control | Status |\n| --- | --- |\n${ownerRows}\n\n` +
    `**Treasury:** ${ownerControls.treasury}\n\n` +
    `**Base asset:** ${ownerControls.usesNativeAsset ? "Native ETH" : ownerControls.baseAsset}\n\n` +
    `**Funding cap:** ${formatEth(ownerControls.fundingCapWei)} ETH\n\n` +
    `## Capital Formation Radar\n\n` +
    `${pieMermaid}\n\n` +
    `| Participant | Address | SeedShares | Contribution (ETH) |\n| --- | --- | --- | --- |\n${participantRows}\n\n` +
    `## Validator Council\n\n` +
    `Approval threshold: ${recap.validators.approvalThreshold} of ${recap.validators.members.length}\n\n` +
    recap.validators.members.map((member, index) => `- Validator ${index + 1}: ${member}`).join("\n") +
    `\n\n## Launch Telemetry\n\n` +
    `- Launch finalized: ${recap.launch.finalized ? "Yes" : "No"}\n` +
    `- Aborted: ${recap.launch.aborted ? "Yes" : "No"}\n` +
    `- Reserve transferred: ${ethers.formatEther(BigInt(recap.launch.sovereignVault.totalReceivedWei))} ETH\n` +
    `- Sovereign vault manifest: ${recap.launch.sovereignVault.manifestUri}\n` +
    `- Ignition metadata: ${recap.launch.sovereignVault.decodedMetadata}\n` +
    `- Vault balance: ${ethers.formatEther(BigInt(recap.launch.sovereignVault.vaultBalanceWei))} ETH\n\n` +
    `${journeyMermaid}`;

  await writeFile(OUTPUT_MARKDOWN_PATH, markdown);

  console.log("\n🧾 Demo recap written to", OUTPUT_PATH);
  console.log("🖋️  Markdown dossier written to", OUTPUT_MARKDOWN_PATH);
  console.log(JSON.stringify(recap, null, 2));
  console.log(
    `\n✨ α-AGI MARK demo complete. Sovereign vault now safeguards ${ethers.formatEther(sovereignTotalReceived)} ETH.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
