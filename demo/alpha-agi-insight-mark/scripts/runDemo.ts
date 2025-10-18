import { mkdir, writeFile, readFile, stat } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

import { ethers } from "hardhat";

import type { AlphaInsightExchange, AlphaInsightNovaSeed, InsightAccessToken } from "../typechain-types";

type InsightScenario = {
  sector: string;
  thesis: string;
  ruptureYear: number;
  sealedURI: string;
  fusionURI: string;
  confidence: number;
  forecastValue: string;
};

type ScenarioConfig = {
  meta: { version: string; source: string };
  agents: string[];
  scenarios: InsightScenario[];
};

const reportsDir = path.join(__dirname, "..", "reports");
const defaultScenarioFile = path.join(__dirname, "..", "data", "insight-scenarios.json");

function resolveScenarioFile(): string {
  const override = process.env.INSIGHT_MARK_SCENARIO_FILE;
  if (!override) {
    return defaultScenarioFile;
  }
  if (path.isAbsolute(override)) {
    return override;
  }
  return path.join(process.cwd(), override);
}

function toTimestamp(year: number): bigint {
  return BigInt(Math.floor(Date.UTC(year, 0, 1) / 1000));
}

function sha256(content: string | Buffer): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortenUri(uri: string, maxLength = 42): string {
  if (uri.length <= maxLength) {
    return uri;
  }
  const prefixLength = Math.floor((maxLength - 1) / 2);
  const suffixLength = maxLength - 1 - prefixLength;
  return `${uri.slice(0, prefixLength)}…${uri.slice(-suffixLength)}`;
}

function shortenAddress(address: string, prefix = 6, suffix = 4): string {
  if (address.length <= prefix + suffix + 1) {
    return address;
  }
  return `${address.slice(0, prefix)}…${address.slice(-suffix)}`;
}

function escapeMermaidLabel(label: string): string {
  return label.replace(/"/g, '\"');
}

function toMermaidId(label: string, prefix: string): string {
  const sanitized = label.replace(/[^A-Za-z0-9]/g, "_");
  if (!sanitized.length) {
    return `${prefix}_${Math.random().toString(16).slice(2, 6)}`;
  }
  return `${prefix}_${sanitized}`;
}

function parseForecastValueTrillions(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*([TtMmBb]?)$/);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  const unit = match[2]?.toUpperCase() ?? "";
  switch (unit) {
    case "T":
      return amount;
    case "B":
      return amount / 1000;
    case "M":
      return amount / 1_000_000;
    default:
      return amount;
  }
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatControlHook(name: string): string {
  switch (name) {
    case "mint":
      return "`mint(address,uint256)`";
    case "pause":
      return "`pause()`";
    case "unpause":
      return "`unpause()`";
    case "setSystemPause":
      return "`setSystemPause(address)`";
    case "setMinter":
      return "`setMinter(address,bool)`";
    case "updateInsightDetails":
      return "`updateInsightDetails(tokenId,sector,thesis,timestamp)`";
    case "revealFusionPlan":
      return "`revealFusionPlan(tokenId,uri)`";
    case "updateFusionPlan":
      return "`updateFusionPlan(tokenId,uri)`";
    case "setOracle":
      return "`setOracle(address)`";
    case "setTreasury":
      return "`setTreasury(address)`";
    case "setFeeBps":
      return "`setFeeBps(uint96)`";
    case "setPaymentToken":
      return "`setPaymentToken(address)`";
    case "updateListingPrice":
      return "`updateListingPrice(tokenId,newPrice)`";
    case "forceDelist":
      return "`forceDelist(tokenId,recipient)`";
    default:
      return `\`${name}(…)\``;
  }
}

async function loadScenarioConfig(scenarioPath: string): Promise<ScenarioConfig> {
  try {
    await stat(scenarioPath);
  } catch (error) {
    throw new Error(`Scenario file not found at ${scenarioPath}. Set INSIGHT_MARK_SCENARIO_FILE to a valid JSON file.`);
  }
  const raw = await readFile(scenarioPath, "utf8");
  return JSON.parse(raw) as ScenarioConfig;
}

async function ensureReportsDir() {
  await mkdir(reportsDir, { recursive: true });
}

interface AgentLogEntry {
  agent: string;
  message: string;
  timestamp: string;
}

interface MintedInsightRecord {
  tokenId: string;
  scenario: InsightScenario;
  mintedTo: string;
  mintedBy: string;
  listed: boolean;
  status: "HELD" | "LISTED" | "SOLD" | "FORCE_DELISTED";
  listingPrice?: string;
  sale?: {
    buyer: string;
    price: string;
    fee: string;
    netPayout: string;
    transactionHash: string;
  };
  fusionRevealed: boolean;
  fusionURI: string;
  disruptionTimestamp: string;
  onchainVerified: boolean;
  ownerActions: string[];
  finalCustodian: string;
}

async function main() {
  await ensureReportsDir();
  const scenarioPath = resolveScenarioFile();
  const config = await loadScenarioConfig(scenarioPath);

  const dryRunFlag = (process.env.AGIJOBS_DEMO_DRY_RUN ?? "true").toLowerCase();
  const requireLaunchConfirmation = dryRunFlag === "false";

  if (requireLaunchConfirmation) {
    const rl = createInterface({ input, output });
    try {
      const confirmation = await rl.question(
        "Launch confirmation required (AGIJOBS_DEMO_DRY_RUN=false). Type LAUNCH to continue: "
      );
      if (confirmation.trim().toUpperCase() !== "LAUNCH") {
        throw new Error("Launch aborted by operator.");
      }
    } finally {
      rl.close();
    }
  }

  const [operator, oracle, strategist, buyerA, buyerB] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const expectedNetworkName = process.env.INSIGHT_MARK_NETWORK;
  if (expectedNetworkName && expectedNetworkName !== network.name) {
    throw new Error(
      `Network mismatch: expected ${expectedNetworkName} (INSIGHT_MARK_NETWORK) but connected to ${network.name}.`
    );
  }

  const expectedChainId = process.env.INSIGHT_MARK_CHAIN_ID;
  if (expectedChainId && expectedChainId !== network.chainId.toString()) {
    throw new Error(
      `Chain ID mismatch: expected ${expectedChainId} (INSIGHT_MARK_CHAIN_ID) but connected to ${network.chainId}.`
    );
  }

  const expectedOperator = process.env.INSIGHT_MARK_EXPECTED_OWNER?.toLowerCase();
  if (expectedOperator && expectedOperator !== operator.address.toLowerCase()) {
    throw new Error(
      `Owner mismatch: expected deployer ${process.env.INSIGHT_MARK_EXPECTED_OWNER} but signer[0] is ${operator.address}.`
    );
  }

  const AccessToken = await ethers.getContractFactory("InsightAccessToken");
  const accessToken = (await AccessToken.deploy(operator.address)) as unknown as InsightAccessToken;
  await accessToken.waitForDeployment();

  const NovaSeed = await ethers.getContractFactory("AlphaInsightNovaSeed");
  const novaSeed = (await NovaSeed.deploy(operator.address)) as unknown as AlphaInsightNovaSeed;
  await novaSeed.waitForDeployment();

  const Exchange = await ethers.getContractFactory("AlphaInsightExchange");
  const exchange = (await Exchange.deploy(operator.address, novaSeed, accessToken, operator.address, 500)) as unknown as AlphaInsightExchange;
  await exchange.waitForDeployment();

  await exchange.setOracle(oracle.address);
  await novaSeed.setMinter(operator.address, true);
  await novaSeed.setMinter(oracle.address, true);
  await accessToken.setSystemPause(strategist.address);
  await novaSeed.setSystemPause(strategist.address);
  await exchange.setSystemPause(strategist.address);

  const settlementTokenAddress = await accessToken.getAddress();
  const novaSeedAddress = await novaSeed.getAddress();
  const exchangeAddress = await exchange.getAddress();
  const accessTokenSystemPause = await accessToken.systemPause();
  const novaSeedSystemPause = await novaSeed.systemPause();
  const exchangeSystemPause = await exchange.systemPause();
  const exchangeTreasury = await exchange.treasury();
  const exchangeFeeBps = await exchange.feeBps();
  const exchangeFeeBpsNumber = Number(exchangeFeeBps);
  const exchangeFeePercentDisplay = (exchangeFeeBpsNumber / 100).toFixed(2);

  const telemetry: AgentLogEntry[] = [];
  const minted: MintedInsightRecord[] = [];

  function log(agent: string, message: string) {
    const entry: AgentLogEntry = { agent, message, timestamp: new Date().toISOString() };
    telemetry.push(entry);
    console.log(`🤖 [${agent}] ${message}`);
  }

  log("Guardian Auditor", `SystemPause sentinel anchored to ${strategist.address} for cross-contract halts.`);
  log("Meta-Sentinel", "Initialising α-AGI Insight MARK deployment lattice.");
  log(
    "MATS Engine",
    "Meta-Agentic Tree Search (NSGA-II) swarm bootstrapped – generating Pareto-efficient foresight strategies."
  );
  log(
    "Thermodynamic Trigger",
    "Monitoring AGI capability index T_AGI across disruption domains for imminent phase transitions."
  );

  const scenarioAllocations = [
    { minter: operator, receiver: operator },
    { minter: oracle, receiver: oracle },
    { minter: operator, receiver: strategist },
  ];

  const priceSchedule = [ethers.parseUnits("250", 18), ethers.parseUnits("180", 18), ethers.parseUnits("420", 18)];

  for (let i = 0; i < config.scenarios.length; i += 1) {
    const scenario = config.scenarios[i];
    const { minter, receiver } = scenarioAllocations[i] ?? scenarioAllocations[0];

    log(
      "Thermodynamic Oracle",
      `Evaluating ${scenario.sector} rupture – confidence ${(scenario.confidence * 100).toFixed(1)}%.`
    );
    log(
      "MATS Engine",
      `Pareto frontier surfaced ${scenario.sector} vector at ${(scenario.confidence * 100).toFixed(1)}% certainty.`
    );

    const tx = await novaSeed
      .connect(minter)
      .mintInsight(receiver.address, {
        sector: scenario.sector,
        thesis: scenario.thesis,
        disruptionTimestamp: toTimestamp(scenario.ruptureYear),
        sealedURI: scenario.sealedURI,
      });
    const receipt = await tx.wait();
    if (receipt?.status !== 1n && receipt?.status !== 1) {
      throw new Error(`Mint transaction for ${scenario.sector} failed`);
    }

    const mintedId = (await novaSeed.nextTokenId()) - 1n;
    log("FusionSmith", `Seed ${mintedId.toString()} forged for ${scenario.sector}.`);

    let fusionRevealed = false;
    let activeFusionURI = scenario.sealedURI;
    const ownerActions: string[] = [];
    let finalCustodian = receiver.address;
    if (i === 0) {
      await novaSeed.revealFusionPlan(mintedId, scenario.fusionURI);
      fusionRevealed = true;
      activeFusionURI = scenario.fusionURI;
      log("Guardian Auditor", `Fusion plan for token ${mintedId.toString()} revealed under owner control.`);

      const revisionedFusionURI = `${scenario.fusionURI}?revision=2`;
      await novaSeed.updateFusionPlan(mintedId, revisionedFusionURI);
      activeFusionURI = revisionedFusionURI;
      log("Guardian Auditor", `Fusion dossier for token ${mintedId.toString()} retargeted to ${revisionedFusionURI}.`);
    }

    const price = priceSchedule[i] ?? priceSchedule[0];
    let status: MintedInsightRecord["status"] = "HELD";
    let sale: MintedInsightRecord["sale"] | undefined;
    let listingPrice: string | undefined;

    if (i < 2) {
      await novaSeed.connect(receiver).approve(exchangeAddress, mintedId);
      await exchange.connect(receiver).listInsight(mintedId, price);
      status = "LISTED";
      listingPrice = ethers.formatUnits(price, 18);
      log("Venture Cartographer", `Token ${mintedId.toString()} listed on α-AGI MARK at ${listingPrice} AIC.`);

      if (i === 0) {
        const repriced = price - ethers.parseUnits("10", 18);
        await exchange.connect(receiver).updateListingPrice(mintedId, repriced);
        const listingState = await exchange.listing(mintedId);
        listingPrice = ethers.formatUnits(listingState.price, 18);
        ownerActions.push(`Seller repriced to ${listingPrice} AIC`);
        log(
          "Venture Cartographer",
          `Token ${mintedId.toString()} repriced by seller to ${listingPrice} AIC for strategic acceleration.`
        );
      }

      if (i === 1) {
        const adjustedPrice = price + ethers.parseUnits("15", 18);
        await exchange.updateListingPrice(mintedId, adjustedPrice);
        const listingState = await exchange.listing(mintedId);
        listingPrice = ethers.formatUnits(listingState.price, 18);
        ownerActions.push(`Owner repriced to ${listingPrice} AIC`);
        log("Guardian Auditor", `Owner repriced token ${mintedId.toString()} to ${listingPrice} AIC for governance alignment.`);
      }

      if (i === 0) {
        await accessToken.mint(buyerA.address, ethers.parseUnits("1000", 18));
        await accessToken.connect(buyerA).approve(exchangeAddress, ethers.parseUnits("1000", 18));
        const listingState = await exchange.listing(mintedId);
        const buyTx = await exchange.connect(buyerA).buyInsight(mintedId);
        const buyReceipt = await buyTx.wait();
        const clearedPrice = listingState.price;
        const fee = (clearedPrice * exchangeFeeBps) / 10_000n;
        const net = clearedPrice - fee;
        sale = {
          buyer: buyerA.address,
          price: ethers.formatUnits(clearedPrice, 18),
          fee: ethers.formatUnits(fee, 18),
          netPayout: ethers.formatUnits(net, 18),
          transactionHash: buyReceipt?.hash ?? "",
        };
        status = "SOLD";
        finalCustodian = buyerA.address;
        log(
          "Meta-Sentinel",
          `Token ${mintedId.toString()} acquired by ${buyerA.address}. Net payout ${ethers.formatUnits(net, 18)} AIC.`
        );
        await exchange.resolvePrediction(mintedId, true, `${scenario.sector} rupture confirmed by insight engine.`);
      } else if (i === 1) {
        await exchange.forceDelist(mintedId, strategist.address);
        ownerActions.push(`Owner force-delisted to ${strategist.address}`);
        finalCustodian = strategist.address;
        status = "FORCE_DELISTED";
        listingPrice = undefined;
        log(
          "System Sentinel",
          `Owner executed force delist for token ${mintedId.toString()} sending custody to sentinel ${strategist.address}.`
        );
      }
    }

    if (i === 2) {
      await novaSeed.reclaimInsight(mintedId, operator.address);
      ownerActions.push(`Owner reclaimed to ${operator.address}`);
      finalCustodian = operator.address;
      log(
        "Guardian Auditor",
        `Owner reclaimed token ${mintedId.toString()} to operator custody ${operator.address} for sovereign safekeeping.`
      );
    }

    const onchain = await novaSeed.getInsight(mintedId);
    if (onchain.sector !== scenario.sector || onchain.thesis !== scenario.thesis) {
      throw new Error(`On-chain insight metadata mismatch for token ${mintedId.toString()}.`);
    }
    if (onchain.disruptionTimestamp !== toTimestamp(scenario.ruptureYear)) {
      throw new Error(`Disruption timestamp mismatch for token ${mintedId.toString()}.`);
    }
    if (onchain.fusionURI !== activeFusionURI) {
      throw new Error(`Fusion URI mismatch for token ${mintedId.toString()}.`);
    }
    if (onchain.fusionRevealed !== fusionRevealed) {
      throw new Error(`Fusion reveal state mismatch for token ${mintedId.toString()}.`);
    }

    minted.push({
      tokenId: mintedId.toString(),
      scenario,
      mintedTo: receiver.address,
      mintedBy: minter.address,
      listed: status !== "HELD",
      status,
      listingPrice,
      sale,
      fusionRevealed,
      fusionURI: activeFusionURI,
      disruptionTimestamp: toTimestamp(scenario.ruptureYear).toString(),
      onchainVerified: true,
      ownerActions,
      finalCustodian,
    });
  }

  await accessToken.mint(buyerB.address, ethers.parseUnits("800", 18));
  await accessToken.connect(buyerB).approve(exchangeAddress, ethers.parseUnits("800", 18));
  log("Guardian Auditor", "Liquidity buffers provisioned for additional foresight acquisitions.");

  log("System Sentinel", "Triggering cross-contract pause sweep via delegated sentinel.");
  await exchange.connect(strategist).pause();
  await novaSeed.connect(strategist).pause();
  await accessToken.connect(strategist).pause();
  log("System Sentinel", "Emergency pause executed. Awaiting owner clearance.");

  await exchange.unpause();
  await novaSeed.unpause();
  await accessToken.unpause();
  log("Meta-Sentinel", "Owner restored foresight lattice following sentinel drill.");

  const recapPath = path.join(reportsDir, "insight-recap.json");
  const reportPath = path.join(reportsDir, "insight-report.md");
  const matrixPath = path.join(reportsDir, "insight-control-matrix.json");
  const mermaidPath = path.join(reportsDir, "insight-control-map.mmd");
  const governancePath = path.join(reportsDir, "insight-governance.mmd");
  const superintelligencePath = path.join(reportsDir, "insight-superintelligence.mmd");
  const telemetryPath = path.join(reportsDir, "insight-telemetry.log");
  const htmlPath = path.join(reportsDir, "insight-report.html");
  const ownerBriefPath = path.join(reportsDir, "insight-owner-brief.md");
  const safetyChecklistPath = path.join(reportsDir, "insight-safety-checklist.md");
  const csvPath = path.join(reportsDir, "insight-market-matrix.csv");
  const constellationPath = path.join(reportsDir, "insight-constellation.mmd");
  const agencyOrbitPath = path.join(reportsDir, "insight-agency-orbit.mmd");
  const lifecyclePath = path.join(reportsDir, "insight-lifecycle.mmd");
  const manifestPath = path.join(reportsDir, "insight-manifest.json");

  const scenarioRelativePath = path
    .relative(path.join(__dirname, ".."), scenarioPath)
    .replace(/\\/g, "/");
  const scenarioHash = sha256(await readFile(scenarioPath));

  const mintedByOwnerCount = minted.filter((entry) => entry.mintedBy.toLowerCase() === operator.address.toLowerCase()).length;
  const delegatedMintCount = minted.length - mintedByOwnerCount;
  const soldCount = minted.filter((entry) => entry.status === "SOLD").length;
  const listedCount = minted.filter((entry) => entry.status === "LISTED").length;
  const forceDelistedCount = minted.filter((entry) => entry.status === "FORCE_DELISTED").length;
  const sealedCount = minted.filter((entry) => !entry.fusionRevealed).length;
  const revealedCount = minted.length - sealedCount;

  const mintedTotalConfidence = minted.reduce((acc, entry) => acc + entry.scenario.confidence, 0);
  const averageConfidence = minted.length ? mintedTotalConfidence / minted.length : 0;

  const totalForecastTrillions = minted.reduce(
    (acc, entry) => acc + parseForecastValueTrillions(entry.scenario.forecastValue ?? "0"),
    0
  );
  const peakConfidence = minted.reduce((acc, entry) => Math.max(acc, entry.scenario.confidence), 0);
  const floorConfidence = minted.reduce(
    (acc, entry) => Math.min(acc, entry.scenario.confidence),
    minted.length ? minted[0].scenario.confidence : 0
  );
  const agiCapabilityIndex = minted.length ? averageConfidence * 0.6 + peakConfidence * 0.4 : 0;
  const capabilityPercent = Math.round(agiCapabilityIndex * 100);
  const peakPercent = Math.round(peakConfidence * 100);
  const floorPercent = Math.round(floorConfidence * 100);
  const totalForecastDisplay = `${totalForecastTrillions.toFixed(2)}T`;
  const forecastValuePrecise = Number(totalForecastTrillions.toFixed(2));
  const averageConfidencePercent = Number((averageConfidence * 100).toFixed(2));
  const capabilityPercentPrecise = Number((agiCapabilityIndex * 100).toFixed(2));
  const peakPercentPrecise = Number((peakConfidence * 100).toFixed(2));
  const floorPercentPrecise = Number((floorConfidence * 100).toFixed(2));

  const mintedStats = {
    minted: minted.length,
    mintedByOwner: mintedByOwnerCount,
    mintedByDelegates: delegatedMintCount,
    sold: soldCount,
    listed: listedCount,
    forceDelisted: forceDelistedCount,
    sealed: sealedCount,
    revealed: revealedCount,
    averageConfidencePercent,
    capabilityIndexPercent: capabilityPercentPrecise,
    confidenceFloorPercent: floorPercentPrecise,
    confidencePeakPercent: peakPercentPrecise,
    forecastValueTrillions: forecastValuePrecise,
    telemetryEntries: telemetry.length,
  };

  const averageConfidenceSummary = averageConfidencePercent.toFixed(1);
  const capabilityPercentSummary = capabilityPercentPrecise.toFixed(1);
  const confidenceFloorSummary = floorPercentPrecise.toFixed(1);
  const confidencePeakSummary = peakPercentPrecise.toFixed(1);
  const marketStatusSummary = `${soldCount} sold, ${listedCount} listed, ${forceDelistedCount} sentinel custody`;
  const fusionPlanSummary = `${revealedCount} revealed, ${sealedCount} sealed`;

  const recap = {
    generatedAt: new Date().toISOString(),
    network: { chainId: network.chainId.toString(), name: network.name },
    contracts: {
      novaSeed: novaSeedAddress,
      foresightExchange: exchangeAddress,
      settlementToken: settlementTokenAddress,
    },
    scenarioSource: {
      path: scenarioRelativePath,
      sha256: scenarioHash,
    },
    operator: operator.address,
    oracle: oracle.address,
    systemPause: strategist.address,
    treasury: exchangeTreasury,
    feeBps: exchangeFeeBpsNumber,
    stats: mintedStats,
    minted,
    telemetry,
  };

  const tableRows = minted
    .map((entry) => {
      const saleDetails = entry.sale
        ? `${entry.sale.price} AIC → net ${entry.sale.netPayout} AIC`
        : entry.status === "LISTED"
          ? entry.listingPrice
            ? `Listed @ ${entry.listingPrice} AIC`
            : "Listed"
          : entry.status === "FORCE_DELISTED"
            ? `Force delisted to ${shortenAddress(entry.finalCustodian)}`
            : "Held by operator";
      const fusionStatus = entry.fusionRevealed
        ? `Revealed ↦ ${shortenUri(entry.fusionURI)}`
        : `Sealed ↦ ${shortenUri(entry.fusionURI)}`;
      const ownerNotes = entry.ownerActions.length ? entry.ownerActions.join("; ") : "—";
      const custodian = shortenAddress(entry.finalCustodian ?? entry.mintedTo);
      return `| ${entry.tokenId} | ${entry.scenario.sector} | ${entry.scenario.ruptureYear} | ${entry.scenario.thesis} | ${fusionStatus} | ${entry.status} | ${saleDetails} | ${custodian} | ${ownerNotes} |`;
    })
    .join("\n");

  const markdown = `# α-AGI Insight MARK Recap\n\n` +
    `**Network:** ${network.name} (chainId ${network.chainId})\\\n` +
    `**Operator:** ${operator.address}\\\n` +
    `**Oracle:** ${oracle.address}\\\n` +
    `**System Pause Sentinel:** ${strategist.address}\\\n` +
    `**Fee:** ${exchangeFeePercentDisplay}%\\\n` +
    `**Treasury:** ${exchangeTreasury}\\\n\n` +
    `## Superintelligent Engine Summary\n` +
    `- Meta-Agentic Tree Search agents engaged: ${config.agents.join(", ")}.\\\n` +
    `- Composite AGI capability index (weighted): ${(agiCapabilityIndex * 100).toFixed(1)}%.\\\n` +
    `- Confidence band: min ${(floorConfidence * 100).toFixed(1)}% → max ${(peakConfidence * 100).toFixed(1)}%.\\\n` +
    `- Portfolio forecast value: ${totalForecastTrillions.toFixed(2)}T equivalent.\\\n` +
    `- Scenario dataset fingerprint: ${scenarioHash}.\\\n\n` +
    `## Operational Command Metrics\n` +
    `- Minted insights: ${minted.length} (owner minted ${mintedByOwnerCount}, delegated minted ${delegatedMintCount}).\\\n` +
    `- Market state: ${marketStatusSummary}.\\\n` +
    `- Fusion dossiers: ${fusionPlanSummary}.\\\n` +
    `- Confidence band: ${confidenceFloorSummary}% → ${confidencePeakSummary}% (avg ${averageConfidenceSummary}%).\\\n` +
    `- Forecast value tokenised: ${forecastValuePrecise.toFixed(2)}T.\\\n\n` +
    `## Foresight Portfolio Ledger\n` +
    `| Token | Sector | Rupture Year | Thesis | Fusion Plan | Status | Market State | Custodian | Owner Controls |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${tableRows}\n\n` +
    `## Owner Command Hooks\n- Owner may pause tokens, exchange, and settlement token immediately.\n- Oracle address (${oracle.address}) can resolve predictions without redeploying contracts.\n- Treasury destination configurable via \`setTreasury\`.\n- Sentinel (${strategist.address}) authorised through \`setSystemPause\` to trigger emergency halts across modules.\n- Listings can be repriced live with \`updateListingPrice\` (owner override supported).\n- Owner may invoke \`forceDelist\` to evacuate foresight assets to a safe wallet instantly.\n\n` +
    `## Scenario Dataset\n- Config file: ${scenarioRelativePath}\\\n- SHA-256: ${scenarioHash}\n\n` +
    `## Telemetry Snapshot\n` +
    telemetry
      .map((entry) => `- ${entry.timestamp} — **${entry.agent}**: ${entry.message}`)
      .join("\n") +
    "\n";

  const sortedByRupture = [...minted].sort((a, b) => a.scenario.ruptureYear - b.scenario.ruptureYear);
  const timelineStart = sortedByRupture[0]?.scenario.ruptureYear ?? 0;
  const timelineEnd = sortedByRupture.at(-1)?.scenario.ruptureYear ?? timelineStart;
  const timelineSpan = Math.max(1, timelineEnd - timelineStart);

  const htmlRows = sortedByRupture
    .map((entry) => {
      const confidencePercent = Math.round(entry.scenario.confidence * 100);
      const saleDetails =
        entry.sale
          ? `${escapeHtml(entry.sale.price)} AIC → net ${escapeHtml(entry.sale.netPayout)} AIC`
          : entry.status === "LISTED"
            ? entry.listingPrice
              ? `Listed @ ${escapeHtml(entry.listingPrice)} AIC`
              : "Listed"
            : entry.status === "FORCE_DELISTED"
              ? `Force delisted to ${escapeHtml(shortenAddress(entry.finalCustodian))}`
              : "Held by operator";
      const fusionStatus = entry.fusionRevealed
        ? `Revealed ↦ ${escapeHtml(shortenUri(entry.fusionURI))}`
        : `Sealed ↦ ${escapeHtml(shortenUri(entry.fusionURI))}`;
      const ownerNotes = entry.ownerActions.length
        ? entry.ownerActions.map((note) => escapeHtml(note)).join("<br />")
        : "&mdash;";
      const custodianDisplay = escapeHtml(shortenAddress(entry.finalCustodian ?? entry.mintedTo));
      return `            <tr>
              <td>${escapeHtml(entry.tokenId)}</td>
              <td>${escapeHtml(entry.scenario.sector)}</td>
              <td>${entry.scenario.ruptureYear}</td>
              <td>${escapeHtml(entry.scenario.thesis)}</td>
              <td>
                <div class="confidence-bar">
                  <div class="confidence-fill" style="width:${confidencePercent}%"></div>
                  <span>${confidencePercent}%</span>
                </div>
              </td>
              <td>${fusionStatus}</td>
              <td>${escapeHtml(entry.status)}</td>
              <td>${saleDetails}</td>
              <td>${custodianDisplay}</td>
              <td>${ownerNotes}</td>
            </tr>`;
    })
    .join("\n");

  const timelineMarks = sortedByRupture
    .map((entry) => {
      const offset = timelineSpan === 0 ? 0 : ((entry.scenario.ruptureYear - timelineStart) / timelineSpan) * 100;
      const confidencePercent = Math.round(entry.scenario.confidence * 100);
      return `          <div class="timeline-node" style="left:${offset}%">
            <div class="timeline-node__label">${escapeHtml(entry.scenario.sector)}</div>
            <div class="timeline-node__year">${entry.scenario.ruptureYear}</div>
            <div class="timeline-node__confidence">${confidencePercent}% confidence</div>
          </div>`;
    })
    .join("\n");

  const scenarioHashShort = `${scenarioHash.substring(0, 16)}…`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>α-AGI Insight MARK Executive Report</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
        background: #030712;
        color: #e8f1ff;
      }
      body {
        margin: 0;
        padding: 32px 24px 48px;
      }
      h1 {
        font-size: 2.5rem;
        margin-bottom: 0.25rem;
      }
      h2 {
        margin-top: 2.5rem;
        margin-bottom: 1rem;
        font-size: 1.5rem;
      }
      p, li {
        line-height: 1.6;
      }
      .meta-grid {
        display: grid;
        gap: 0.5rem 1.5rem;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin: 1.5rem 0;
        padding: 1.5rem;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(51, 141, 255, 0.2), rgba(166, 86, 255, 0.08));
        border: 1px solid rgba(146, 214, 255, 0.2);
      }
      .meta-grid__item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .meta-grid__label {
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(206, 234, 255, 0.7);
      }
      .meta-grid__value {
        font-size: 1.05rem;
        word-break: break-all;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1.5rem;
        font-size: 0.95rem;
      }
      thead {
        background: rgba(31, 64, 128, 0.4);
      }
      th, td {
        padding: 0.75rem 0.85rem;
        border-bottom: 1px solid rgba(71, 116, 194, 0.35);
        vertical-align: top;
        text-align: left;
      }
      tbody tr:hover {
        background: rgba(41, 71, 145, 0.25);
      }
      .confidence-bar {
        position: relative;
        width: 100%;
        height: 18px;
        border-radius: 12px;
        background: rgba(22, 40, 86, 0.65);
        overflow: hidden;
      }
      .confidence-fill {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, #3ddff5, #9178ff);
      }
      .confidence-bar span {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-weight: 600;
        color: #021321;
      }
      .engine {
        margin: 2rem 0;
        padding: 1.75rem;
        border-radius: 22px;
        background: linear-gradient(135deg, rgba(34, 95, 183, 0.45), rgba(116, 70, 208, 0.28));
        border: 1px solid rgba(129, 205, 255, 0.3);
        box-shadow: 0 24px 64px rgba(12, 25, 68, 0.55);
      }
      .engine__intro {
        margin-bottom: 1.25rem;
        max-width: 960px;
      }
      .engine__gauges {
        display: grid;
        gap: 1.25rem;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .gauge {
        position: relative;
        padding: 1.15rem 1.35rem 1.5rem;
        border-radius: 18px;
        background: rgba(10, 27, 64, 0.55);
        border: 1px solid rgba(146, 214, 255, 0.35);
        overflow: hidden;
      }
      .gauge__label {
        font-size: 0.8rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(198, 229, 255, 0.7);
        margin-bottom: 0.75rem;
      }
      .gauge__bar {
        position: relative;
        height: 14px;
        border-radius: 12px;
        background: rgba(22, 40, 86, 0.7);
        overflow: hidden;
      }
      .gauge__fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: linear-gradient(90deg, #48e8ff, #9d7bff);
        box-shadow: 0 0 16px rgba(132, 246, 255, 0.55);
      }
      .gauge__value {
        margin-top: 0.75rem;
        font-size: 1.35rem;
        font-weight: 600;
      }
      .gauge__meta {
        font-size: 0.85rem;
        color: rgba(198, 229, 255, 0.75);
      }
      .gauge--forecast {
        background: rgba(27, 12, 64, 0.55);
        border: 1px solid rgba(193, 172, 255, 0.35);
      }
      .engine__agents {
        margin-top: 1.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .engine__agent {
        padding: 0.45rem 0.85rem;
        border-radius: 999px;
        background: rgba(30, 71, 155, 0.55);
        border: 1px solid rgba(135, 217, 255, 0.35);
        font-size: 0.85rem;
      }
      .metrics {
        margin: 2rem 0;
      }
      .metrics-grid {
        display: grid;
        gap: 1.35rem;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .metric-card {
        padding: 1.25rem 1.5rem;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(24, 58, 131, 0.55), rgba(91, 43, 168, 0.35));
        border: 1px solid rgba(141, 206, 255, 0.35);
        box-shadow: 0 18px 44px rgba(8, 18, 54, 0.55);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-height: 160px;
      }
      .metric-label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: rgba(204, 232, 255, 0.72);
      }
      .metric-value {
        font-size: 2.1rem;
        font-weight: 700;
        color: #ffffff;
      }
      .metric-meta {
        font-size: 0.95rem;
        color: rgba(198, 229, 255, 0.78);
      }
      .timeline {
        position: relative;
        margin: 2rem 0 3rem;
        padding: 60px 12px 28px;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(23, 52, 132, 0.45), rgba(18, 34, 88, 0.3));
        border: 1px solid rgba(141, 188, 255, 0.25);
      }
      .timeline::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 24px;
        right: 24px;
        height: 2px;
        background: linear-gradient(90deg, rgba(110, 185, 255, 0.5), rgba(133, 99, 255, 0.7));
      }
      .timeline-node {
        position: absolute;
        transform: translateX(-50%);
        text-align: center;
        min-width: 160px;
      }
      .timeline-node__label {
        font-weight: 600;
        margin-bottom: 8px;
      }
      .timeline-node__year {
        font-size: 1.35rem;
        margin-bottom: 6px;
        color: #7cf9ff;
      }
      .timeline-node__confidence {
        font-size: 0.85rem;
        color: rgba(202, 230, 255, 0.85);
      }
      .timeline-node::after {
        content: '';
        position: absolute;
        top: 52px;
        left: 50%;
        transform: translate(-50%, 0);
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: radial-gradient(circle at 50% 50%, #b2f5ff, #5d73ff);
        box-shadow: 0 0 18px rgba(118, 255, 255, 0.6);
      }
      footer {
        margin-top: 3rem;
        font-size: 0.85rem;
        color: rgba(173, 217, 255, 0.75);
      }
      code {
        font-family: 'JetBrains Mono', 'Source Code Pro', monospace;
        font-size: 0.85rem;
        color: #8ae5ff;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>α-AGI Insight MARK Executive Report</h1>
      <p>The foresight lattice autonomously mapped AGI rupture points and tokenised them as Nova-Seeds. The operator retains complete command via pause levers, oracle rotation, and treasury retargeting without redeployments.</p>
    </header>
    <section class="meta-grid">
      <div class="meta-grid__item">
        <span class="meta-grid__label">Network</span>
        <span class="meta-grid__value">${escapeHtml(network.name)} (chainId ${escapeHtml(network.chainId.toString())})</span>
      </div>
      <div class="meta-grid__item">
        <span class="meta-grid__label">Operator</span>
        <span class="meta-grid__value">${escapeHtml(operator.address)}</span>
      </div>
      <div class="meta-grid__item">
        <span class="meta-grid__label">Oracle</span>
        <span class="meta-grid__value">${escapeHtml(oracle.address)}</span>
      </div>
      <div class="meta-grid__item">
        <span class="meta-grid__label">System Pause Sentinel</span>
        <span class="meta-grid__value">${escapeHtml(strategist.address)}</span>
      </div>
      <div class="meta-grid__item">
        <span class="meta-grid__label">Scenario Dataset</span>
        <span class="meta-grid__value">${escapeHtml(scenarioRelativePath)}<br /><small>sha256 ${escapeHtml(scenarioHashShort)}</small></span>
      </div>
      <div class="meta-grid__item">
        <span class="meta-grid__label">Treasury</span>
        <span class="meta-grid__value">${escapeHtml(exchangeTreasury)}</span>
      </div>
      <div class="meta-grid__item">
        <span class="meta-grid__label">Fee</span>
        <span class="meta-grid__value">${exchangeFeePercentDisplay}%</span>
      </div>
    </section>
    <section class="engine">
      <h2>Superintelligent Engine Pulse</h2>
      <p class="engine__intro">
        The Meta-Agentic Tree Search lattice and thermodynamic trigger collaborate to forecast rupture points beyond human foresight.
        Capability gauges below surface the live AGI index, certainty band, and total forecast value commanding the marketplace.
      </p>
      <div class="engine__gauges">
        <div class="gauge">
          <div class="gauge__label">Composite Capability Index</div>
          <div class="gauge__bar">
            <div class="gauge__fill" style="width:${capabilityPercent}%"></div>
          </div>
          <div class="gauge__value">${capabilityPercent}% certainty</div>
          <div class="gauge__meta">Weighted blend of swarm average and peak disruption confidence.</div>
        </div>
        <div class="gauge">
          <div class="gauge__label">Confidence Band</div>
          <div class="gauge__bar">
            <div class="gauge__fill" style="width:${peakPercent}%"></div>
          </div>
          <div class="gauge__value">${floorPercent}% → ${peakPercent}%</div>
          <div class="gauge__meta">Floor and ceiling disruption certainty across analysed sectors.</div>
        </div>
        <div class="gauge gauge--forecast">
          <div class="gauge__label">Tokenised Opportunity Mass</div>
          <div class="gauge__value">${totalForecastDisplay}</div>
          <div class="gauge__meta">Cumulative forecast value distilled into Nova-Seed inventory (trillion-equivalent).</div>
        </div>
      </div>
      <div class="engine__agents">
        ${config.agents
          .map((agent) => `<span class="engine__agent">${escapeHtml(agent)}</span>`)
          .join("\n        ")}
      </div>
    </section>
    <section class="metrics">
      <h2>Operational Command Metrics</h2>
      <div class="metrics-grid">
        <article class="metric-card">
          <span class="metric-label">Minted Nova-Seeds</span>
          <span class="metric-value">${mintedStats.minted}</span>
          <span class="metric-meta">${mintedStats.mintedByOwner} owner • ${mintedStats.mintedByDelegates} delegated</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Market State</span>
          <span class="metric-value">${soldCount + listedCount + forceDelistedCount}</span>
          <span class="metric-meta">${marketStatusSummary}</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Fusion Dossiers</span>
          <span class="metric-value">${revealedCount}</span>
          <span class="metric-meta">${fusionPlanSummary}</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Confidence & Capability</span>
          <span class="metric-value">${averageConfidenceSummary}%</span>
          <span class="metric-meta">Band ${confidenceFloorSummary}% → ${confidencePeakSummary}% • Capability ${capabilityPercentSummary}%</span>
        </article>
      </div>
    </section>
    <section class="timeline">
      <h2>Disruption Timeline</h2>
${timelineMarks}
    </section>
    <section>
      <h2>Nova-Seed Market Matrix</h2>
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Sector</th>
            <th>Rupture Year</th>
            <th>Disruption Thesis</th>
            <th>Confidence</th>
            <th>Fusion Plan</th>
            <th>Status</th>
            <th>Market State</th>
            <th>Custodian</th>
            <th>Owner Controls</th>
          </tr>
        </thead>
        <tbody>
${htmlRows}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Owner Command Hooks</h2>
      <ul>
        <li>Invoke <code>pause()</code> on the exchange, Nova-Seed, or settlement token to halt activity instantly.</li>
        <li>Reassign the oracle via <code>setOracle(address)</code> for immediate foresight adjudication.</li>
        <li>Redirect protocol yield by calling <code>setTreasury(address)</code>.</li>
        <li>Authorise or rotate the cross-contract sentinel with <code>setSystemPause(address)</code>.</li>
        <li>Reveal a FusionPlan at will using <code>revealFusionPlan(tokenId, uri)</code>.</li>
        <li>Reprice any listing in-place using <code>updateListingPrice(tokenId, newPrice)</code>.</li>
        <li>Evacuate a listing to cold storage instantly with <code>forceDelist(tokenId, recipient)</code>.</li>
      </ul>
    </section>
    <footer>
      Generated ${escapeHtml(new Date().toISOString())}. Manifest fingerprints in <code>insight-manifest.json</code> attest to dossier integrity.
    </footer>
  </body>
</html>`;

  const controlMatrix = {
    generatedAt: new Date().toISOString(),
    owner: operator.address,
    oracle: oracle.address,
    systemPause: strategist.address,
    contracts: [
      {
        name: "InsightAccessToken",
        address: settlementTokenAddress,
        owner: operator.address,
        pausable: true,
        systemPause: accessTokenSystemPause,
        configurable: ["mint", "pause", "unpause", "setSystemPause"],
      },
      {
        name: "AlphaInsightNovaSeed",
        address: novaSeedAddress,
        owner: operator.address,
        pausable: true,
        systemPause: novaSeedSystemPause,
        configurable: ["setMinter", "updateInsightDetails", "revealFusionPlan", "updateFusionPlan", "setSystemPause"],
      },
      {
        name: "AlphaInsightExchange",
        address: exchangeAddress,
        owner: operator.address,
        pausable: true,
        systemPause: exchangeSystemPause,
        configurable: [
          "setOracle",
          "setTreasury",
          "setFeeBps",
          "setPaymentToken",
          "setSystemPause",
          "updateListingPrice",
          "forceDelist",
        ],
      },
    ],
  };

  const controlTableRows = controlMatrix.contracts
    .map((entry) => {
      const sentinelAddress = entry.systemPause && entry.systemPause !== ethers.ZeroAddress ? entry.systemPause : "—";
      const hookList = entry.configurable.map((hook) => formatControlHook(hook)).join("<br />");
      const sentinelCell = sentinelAddress === "—" ? "—" : `\`${sentinelAddress}\``;
      return `| ${entry.name} | \`${entry.address}\` | \`${entry.owner}\` | ${sentinelCell} | ${hookList} |`;
    })
    .join("\n");

  const sentinelDrillLines = [
    `- Delegated sentinel \`${strategist.address}\` executed pause() across Insight Access Token, α-AGI Nova-Seed, and Insight Exchange before owner \`${operator.address}\` restored operations.`,
    `- Liquidity reserve minted via \`mint(address,uint256)\` on the settlement token to rehydrate markets immediately after the drill.`,
  ].join("\n");

  const parameterOverrideLines = [
    `- Exchange treasury routed to \`${exchangeTreasury}\`; retarget via \`setTreasury(address)\`.`,
    `- Exchange oracle anchored to \`${oracle.address}\`; rotate via \`setOracle(address)\`.`,
    `- Trading fee configured at ${exchangeFeePercentDisplay}% (\`${exchangeFeeBpsNumber} bps\`); adjust with \`setFeeBps(uint96)\`.`,
    `- Settlement token \`${settlementTokenAddress}\` remains owner-mintable and can be rotated with \`setPaymentToken(address)\`.`,
    `- System sentinel handshake enforced across modules via \`setSystemPause(address)\` (current \`${strategist.address}\`).`,
  ].join("\n");

  const integrityAssertionLines = [
    `- Nova-Seeds minted: ${mintedStats.minted} (owner ${mintedByOwnerCount}, delegates ${delegatedMintCount}).`,
    `- Market custody positions: ${soldCount} sold • ${listedCount} listed • ${forceDelistedCount} sentinel custody.`,
    `- Fusion dossiers: ${revealedCount} revealed • ${sealedCount} sealed.`,
    `- Confidence envelope: floor ${confidenceFloorSummary}% → peak ${confidencePeakSummary}% (capability ${capabilityPercentSummary}%).`,
    `- Opportunity magnitude: ${totalForecastDisplay}.`,
    `- Scenario dataset sha256 ${scenarioHash}.`,
  ].join("\n");

  const safetyChecklist = `# α-AGI Insight MARK – Safety & Control Checklist\n\n` +
    `Generated ${new Date().toISOString()} on ${network.name} (chainId ${network.chainId}).\n\n` +
    `## Contract Command Matrix\n` +
    `| Contract | Address | Owner | Sentinel | Owner Hooks |\n` +
    `| --- | --- | --- | --- | --- |\n` +
    `${controlTableRows}\n\n` +
    `## Sentinel Drills\n` +
    `${sentinelDrillLines}\n\n` +
    `## Parameter Overrides\n` +
    `${parameterOverrideLines}\n\n` +
    `## Integrity Assertions\n` +
    `${integrityAssertionLines}\n`;

  const mermaid = `flowchart TD\n` +
    `    operator((Operator)):::actor -->|Mints insights| nova[α-AGI Nova-Seed]:::contract\n` +
    `    operator -->|Configures| exchange[Insight Exchange]:::contract\n` +
    `    operator -->|Mints credits| credit[Insight Access Token]:::contract\n` +
    `    nova -->|Lists foresight| exchange\n` +
    `    buyers((Market Participants)):::actor -->|Acquire foresight| exchange\n` +
    `    exchange -->|Fee flow| treasury((Treasury)):::control\n` +
    `    exchange -->|Settlement| credit\n` +
    `    operator -->|Reveal / Update fusion plans| nova\n` +
    `    sentinel((System Pause Sentinel)):::control -->|Pause command| nova\n` +
    `    sentinel -->|Pause command| exchange\n` +
    `    sentinel -->|Pause command| credit\n` +
    `    operator -->|Resume operations| exchange\n` +
    `    operator -->|Resume operations| nova\n` +
    `    operator -->|Resume operations| credit\n` +
    `    classDef actor fill:#102a43,stroke:#8ff7ff,color:#e5f9ff;\n` +
    `    classDef contract fill:#1b2845,stroke:#9ef6ff,color:#f0f8ff;\n` +
    `    classDef control fill:#2c1f3d,stroke:#d2b0ff,color:#f8f5ff;\n`;

  const governanceMermaid = `flowchart LR\n` +
    `    subgraph Intelligence_Swarm["Meta-Agentic Insight Swarm"]\n` +
    `      metasentinel[[Meta-Sentinel]]:::agent\n` +
    `      planner[[Strategic Planner]]:::agent\n` +
    `      oracleAgent[[Thermodynamic Oracle]]:::agent\n` +
    `      cartographer[[Venture Cartographer]]:::agent\n` +
    `      guardian[[Guardian Auditor]]:::agent\n` +
    `    end\n` +
    `    metasentinel --> planner --> oracleAgent --> cartographer --> guardian --> metasentinel\n` +
    `    metasentinel -->|Mint directives| nova[α-AGI Nova-Seed]:::contract\n` +
    `    guardian -->|Seal / Reveal| nova\n` +
    `    metasentinel -->|Configure| exchange[Insight Exchange]:::contract\n` +
    `    guardian -->|Assign sentinel| pauseSentinel((System Pause Sentinel)):::control\n` +
    `    pauseSentinel -->|Pause| nova\n` +
    `    pauseSentinel -->|Pause| exchange\n` +
    `    pauseSentinel -->|Pause| credit[Insight Access Token]:::contract\n` +
    `    exchange --> buyers((Market Operators)):::actor\n` +
    `    buyers --> exchange\n` +
    `    exchange --> treasury((Treasury)):::control\n` +
    `    classDef actor fill:#102a43,stroke:#8ff7ff,color:#e5f9ff;\n` +
    `    classDef contract fill:#1b2845,stroke:#9ef6ff,color:#f0f8ff;\n` +
    `    classDef control fill:#2c1f3d,stroke:#d2b0ff,color:#f8f5ff;\n` +
    `    classDef agent fill:#14233b,stroke:#60d2ff,color:#e8f6ff;\n`;

  const agentMermaidNodes = config.agents.map((agent, index) => ({
    id: toMermaidId(agent, `agent${index}`),
    label: agent,
  }));
  const agentMermaidDefinitions = agentMermaidNodes
    .map(({ id, label }) => `    ${id}["${escapeMermaidLabel(label)}"]:::agent`)
    .join("\n");
  const agentMermaidFlow = agentMermaidNodes
    .map(({ id }, index) => {
      const next = agentMermaidNodes[index + 1];
      if (next) {
        return `    ${id} --> ${next.id}`;
      }
      return `    ${id} --> guardianSentinel`;
    })
    .join("\n");

  const superintelligenceMermaid = `flowchart LR\n` +
    `    mats[[Meta-Agentic Tree Search (NSGA-II)]]:::engine\n` +
    `    thermo[[Thermodynamic Rupture Trigger]]:::engine\n` +
    `    capability[[AGI Capability Index]]:::signal\n` +
    `    novaSeed[α-AGI Nova-Seed Forge]:::contract\n` +
    `    market[α-AGI MARK Exchange]:::contract\n` +
    `    treasuryNode((Treasury Governance)):::control\n` +
    `    guardianSentinel((System Sentinel)):::control\n` +
    (agentMermaidDefinitions ? `${agentMermaidDefinitions}\n` : "") +
    `    mats --> thermo\n` +
    `    thermo --> capability\n` +
    `    capability --> novaSeed\n` +
    `    novaSeed --> market\n` +
    `    market --> treasuryNode\n` +
    `    guardianSentinel --> mats\n` +
    `    guardianSentinel --> market\n` +
    (agentMermaidNodes.length ? `    mats --> ${agentMermaidNodes[0].id}\n` : "") +
    (agentMermaidFlow ? `${agentMermaidFlow}\n` : "") +
    `    classDef engine fill:#162d59,stroke:#8ff6ff,color:#e8f6ff;\n` +
    `    classDef signal fill:#1e3d76,stroke:#ffe174,color:#fff9d4;\n` +
    `    classDef contract fill:#1b2845,stroke:#9ef6ff,color:#f0f8ff;\n` +
    `    classDef control fill:#2c1f3d,stroke:#d2b0ff,color:#f8f5ff;\n` +
    `    classDef agent fill:#14233b,stroke:#60d2ff,color:#e8f6ff;\n`;

  const csvHeader = [
    "tokenId",
    "sector",
    "ruptureYear",
    "confidence",
    "status",
    "marketState",
    "custodian",
    "mintedTo",
    "mintedBy",
    "fusionURI",
    "sealedURI",
    "disruptionTimestamp",
    "forecastValue",
    "ownerActions",
  ].join(",");

  const csvRows = minted.map((entry) => {
    const marketState = entry.sale
      ? `${entry.sale.price} AIC → ${entry.sale.netPayout} AIC`
      : entry.status === "LISTED"
        ? entry.listingPrice
          ? `Listed @ ${entry.listingPrice} AIC`
          : "Listed"
        : entry.status === "FORCE_DELISTED"
          ? `Force delisted → ${shortenAddress(entry.finalCustodian)}`
          : "Held";

    return [
      csvEscape(entry.tokenId),
      csvEscape(entry.scenario.sector),
      csvEscape(entry.scenario.ruptureYear),
      csvEscape(formatPercent(entry.scenario.confidence)),
      csvEscape(entry.status),
      csvEscape(marketState),
      csvEscape(shortenAddress(entry.finalCustodian)),
      csvEscape(shortenAddress(entry.mintedTo)),
      csvEscape(shortenAddress(entry.mintedBy)),
      csvEscape(entry.fusionURI),
      csvEscape(entry.scenario.sealedURI),
      csvEscape(entry.disruptionTimestamp),
      csvEscape(entry.scenario.forecastValue),
      csvEscape(entry.ownerActions.join("; ")),
    ].join(",");
  });

  const csvContent = [csvHeader, ...csvRows].join("\n");

  const ownerBriefTableRows = minted
    .map((entry) => {
      const custodian = shortenAddress(entry.finalCustodian);
      const ownerNotes = entry.ownerActions.length ? entry.ownerActions.join("; ") : "—";
      return `| #${entry.tokenId} | ${entry.scenario.sector} | ${entry.scenario.ruptureYear} | ${formatPercent(entry.scenario.confidence)} | ${entry.status} | ${custodian} | ${ownerNotes} |`;
    })
    .join("\n");

  const ownerBrief = `# α-AGI Insight MARK – Owner Command Brief\n\n` +
    `Generated ${new Date().toISOString()} on ${network.name} (chainId ${network.chainId}).\\\n` +
    `- Minted Nova-Seeds: ${minted.length} (owner minted ${mintedByOwnerCount}, delegated minted ${delegatedMintCount}).\\\n` +
    `- Live market activity: ${soldCount} sold, ${listedCount} listed, ${forceDelistedCount} under sentinel custody.\\\n` +
    `- Fusion dossier state: ${revealedCount} revealed, ${sealedCount} sealed.\\\n` +
    `- Average confidence: ${formatPercent(averageConfidence)}.\\\n` +
    `- Composite AGI capability index: ${capabilityPercent}%.\\\n` +
    `- Portfolio forecast magnitude: ${totalForecastDisplay}.\\\n\n` +
    `## Rapid Command Checklist\n` +
    `- [ ] Trigger \`pause()\` on Insight Exchange (${exchangeAddress}) for market freeze.\n` +
    `- [ ] Invoke \`pause()\` on α-AGI Nova-Seed (${novaSeedAddress}) to freeze custody flows.\n` +
    `- [ ] Confirm sentinel ${shortenAddress(strategist.address)} retains \`setSystemPause\` authority across modules.\n` +
    `- [ ] Rotate oracle via \`setOracle(${shortenAddress(oracle.address)})\` if adjudication policy must change.\n` +
    `- [ ] Validate treasury destination ${shortenAddress(exchangeTreasury)} with finance desk.\n\n` +
    `## Sector Timeline\n` +
    `| Token | Sector | Rupture Year | Confidence | Status | Custodian | Owner Actions |\n` +
    `| --- | --- | --- | --- | --- | --- | --- |\n` +
    `${ownerBriefTableRows}\n\n` +
    `## Intelligence Signals\n` +
    minted
      .map((entry) => `- ${entry.scenario.sector}: ${entry.scenario.thesis} (forecast value ${entry.scenario.forecastValue}).`)
      .join("\n") +
    "\n";

  const mintedNodeLines = minted
    .map((entry) => {
      const saleDescriptor = entry.sale
        ? `Sold @ ${entry.sale.price} AIC`
        : entry.status === "LISTED" && entry.listingPrice
          ? `Listed @ ${entry.listingPrice} AIC`
          : entry.status === "FORCE_DELISTED"
            ? `Custody ${shortenAddress(entry.finalCustodian)}`
            : `Held ${shortenAddress(entry.finalCustodian)}`;
      return `      token${entry.tokenId}("#${entry.tokenId} ${entry.scenario.sector}\\n${entry.scenario.ruptureYear} • ${saleDescriptor}")`;
    })
    .join("\n");

  const mintedConnections = minted
    .map((entry) => {
      const mintedByLabel = entry.mintedBy.toLowerCase() === operator.address.toLowerCase() ? "Owner" : "Delegate";
      const listingEdge = entry.status === "SOLD" || entry.status === "LISTED" || entry.status === "FORCE_DELISTED"
        ? `\n    token${entry.tokenId} --> exchangeNode`
        : "";
      const custodyEdge = entry.status === "FORCE_DELISTED"
        ? `\n    token${entry.tokenId} -.custody.-> sentinel`
        : entry.status === "SOLD"
          ? `\n    token${entry.tokenId} --> buyers`
          : "";
      return `    operator -.${mintedByLabel}.-> token${entry.tokenId}${listingEdge}${custodyEdge}`;
    })
    .join("\n");

  const mintedClassLines = minted
    .map((entry) => {
      const className =
        entry.status === "SOLD"
          ? "sold"
          : entry.status === "LISTED"
            ? "listed"
            : entry.status === "FORCE_DELISTED"
              ? "custody"
              : entry.fusionRevealed
                ? "revealed"
                : "sealed";
      return `    class token${entry.tokenId} ${className};`;
    })
    .join("\n");

  const constellationMermaid = `flowchart TB\n` +
    `    operator((Owner ${shortenAddress(operator.address)})):::actor\n` +
    `    sentinel((System Pause ${shortenAddress(strategist.address)})):::control\n` +
    `    oracleNode((Oracle ${shortenAddress(oracle.address)})):::control\n` +
    `    exchangeNode{{Insight Exchange}}:::contract\n` +
    `    treasuryNode((Treasury ${shortenAddress(exchangeTreasury)})):::control\n` +
    `    buyers((Market Operators)):::actor\n` +
    `    subgraph NovaSeeds["α-AGI Nova-Seeds"]\n${mintedNodeLines}\n    end\n` +
    `    operator --> exchangeNode\n` +
    `    oracleNode --> exchangeNode\n` +
    `    exchangeNode --> treasuryNode\n` +
    `    sentinel -.pause sweep.-> exchangeNode\n` +
    `    sentinel -.pause sweep.-> NovaSeeds\n` +
    `    buyers --> exchangeNode\n` +
    `${mintedConnections ? `${mintedConnections}\n` : ""}` +
    `${mintedClassLines ? `${mintedClassLines}\n` : ""}` +
    `    classDef actor fill:#102a43,stroke:#8ff7ff,color:#e5f9ff;\n` +
    `    classDef contract fill:#1b2845,stroke:#9ef6ff,color:#f0f8ff;\n` +
    `    classDef control fill:#2c1f3d,stroke:#d2b0ff,color:#f8f5ff;\n` +
    `    classDef sold fill:#0f5132,stroke:#1bff82,color:#eafff5;\n` +
    `    classDef listed fill:#1f3d7a,stroke:#90c2ff,color:#eaf3ff;\n` +
    `    classDef custody fill:#553c9a,stroke:#c1a8ff,color:#f3edff;\n` +
    `    classDef sealed fill:#343a55,stroke:#7a8bbd,color:#f1f5ff;\n` +
    `    classDef revealed fill:#214d6d,stroke:#7fe6ff,color:#ecfbff;\n`;

  const agencySeedNodes = minted
    .map((entry) =>
      `        seed${entry.tokenId}("#${entry.tokenId} ${escapeMermaidLabel(entry.scenario.sector)}\\n${formatPercent(entry.scenario.confidence)} certainty")`
    )
    .join("\n");

  const agencySeedEdges = minted
    .map((entry) => {
      const custodyTarget =
        entry.status === "SOLD"
          ? "Market"
          : entry.status === "FORCE_DELISTED"
            ? "SentinelCustody"
            : "OwnerVault";
      const mintedByEdge =
        entry.mintedBy.toLowerCase() === operator.address.toLowerCase()
          ? `    MetaSentinel -.owner mint.-> seed${entry.tokenId}`
          : `    ThermodynamicOracle -.delegate mint.-> seed${entry.tokenId}`;
      const listingEdge =
        entry.status === "SOLD" || entry.status === "LISTED"
          ? `\n    seed${entry.tokenId} --> VentureCartographer`
          : "";
      return [
        `    FusionSmith --> seed${entry.tokenId}`,
        `    GuardianAuditor --> seed${entry.tokenId}`,
        `    ThermodynamicOracle --> seed${entry.tokenId}`,
        mintedByEdge,
        `${listingEdge}`,
        `    seed${entry.tokenId} --> ${custodyTarget}`,
      ]
        .filter((segment) => segment.length > 0)
        .join("\n");
    })
    .join("\n");

  const agencyClassLines = minted
    .map((entry) => {
      const className =
        entry.status === "SOLD"
          ? "seedSold"
          : entry.status === "LISTED"
            ? "seedListed"
            : entry.status === "FORCE_DELISTED"
              ? "seedCustody"
              : entry.fusionRevealed
                ? "seedRevealed"
                : "seedSealed";
      return `    class seed${entry.tokenId} ${className};`;
    })
    .join("\n");

  const agencyOrbitMermaid = `flowchart LR\n` +
    `    classDef agent fill:#1a2c4f,stroke:#9cc9ff,color:#f4fbff;\n` +
    `    classDef custody fill:#2c1f4f,stroke:#d0b0ff,color:#fdf9ff;\n` +
    `    classDef seedSold fill:#0f5132,stroke:#1bff82,color:#eafff5;\n` +
    `    classDef seedListed fill:#1f3d7a,stroke:#90c2ff,color:#eaf3ff;\n` +
    `    classDef seedCustody fill:#553c9a,stroke:#c1a8ff,color:#f3edff;\n` +
    `    classDef seedSealed fill:#343a55,stroke:#7a8bbd,color:#f1f5ff;\n` +
    `    classDef seedRevealed fill:#214d6d,stroke:#7fe6ff,color:#ecfbff;\n` +
    `    subgraph AgentSwarm["Meta-Agent Constellation"]\n` +
    `        MetaSentinel((Meta-Sentinel)):::agent\n` +
    `        MATSEngine((MATS Engine)):::agent\n` +
    `        ThermodynamicOracle((Thermodynamic Oracle)):::agent\n` +
    `        FusionSmith((FusionSmith)):::agent\n` +
    `        GuardianAuditor((Guardian Auditor)):::agent\n` +
    `        VentureCartographer((Venture Cartographer)):::agent\n` +
    `        SystemSentinel((System Sentinel)):::agent\n` +
    `    end\n` +
    `    subgraph NovaSeedFoundry["α-AGI Nova-Seed Forge"]\n${agencySeedNodes}\n    end\n` +
    `    subgraph MarketGrid["α-AGI MARK Market Grid"]\n` +
    `        OwnerVault((Owner Vault)):::custody\n` +
    `        SentinelCustody((Sentinel Custody)):::custody\n` +
    `        Market((Market Operators)):::custody\n` +
    `    end\n` +
    `    MetaSentinel --> MATSEngine\n` +
    `    MATSEngine --> ThermodynamicOracle\n` +
    `    ThermodynamicOracle --> FusionSmith\n` +
    `    FusionSmith --> GuardianAuditor\n` +
    `    GuardianAuditor --> VentureCartographer\n` +
    `    SystemSentinel -.pause sweep.-> NovaSeedFoundry\n` +
    `    SystemSentinel -.pause sweep.-> VentureCartographer\n` +
    `    VentureCartographer --> Market\n` +
    `    GuardianAuditor --> OwnerVault\n` +
    `${agencySeedEdges ? `${agencySeedEdges}\n` : ""}` +
    `${agencyClassLines ? `${agencyClassLines}\n` : ""}`;

  const lifecycleMermaid =
    `sequenceDiagram\n` +
    `    autonumber\n` +
    `    participant Operator as Owner / Operator\n` +
    `    participant MetaSwarm as Meta-Agentic Swarm\n` +
    `    participant Forge as α-AGI Nova-Seed Forge\n` +
    `    participant Exchange as α-AGI MARK Exchange\n` +
    `    participant Sentinel as System Pause Sentinel\n` +
    `    participant Treasury as Treasury Governance\n` +
    `    Operator->>MetaSwarm: Define disruption mandate + guardrails\n` +
    `    MetaSwarm-->>MetaSwarm: Thermodynamic rupture exploration\n` +
    `    MetaSwarm->>Forge: Submit cryptosealed Nova-Seed blueprint\n` +
    `    Forge-->>Operator: Mint #seedId + notarise provenance hash\n` +
    `    Operator->>Exchange: Configure listing, fees, oracle policy\n` +
    `    Exchange-->>Treasury: Route settlement fees (${exchangeFeePercentDisplay}%)\n` +
    `    Exchange-)Operator: Emit trade + custody attestations\n` +
    `    Sentinel-->>Forge: Pause / resume custody lattice\n` +
    `    Sentinel-->>Exchange: Trigger market circuit-break\n` +
    `    Operator->>Forge: Reveal FusionPlan when strategic window opens\n` +
    `    Operator->>Exchange: Resolve prediction via oracle rotation\n` +
    `    Exchange-->>MetaSwarm: Feed confirmed rupture telemetry\n` +
    `    MetaSwarm-->>Operator: Update capability index + executive dossier\n` +
    `    note over Operator,Exchange: Owner retains unilateral pause, repricing, oracle and treasury authority.\n`;

  const telemetryLog = telemetry.map((entry) => `${entry.timestamp} [${entry.agent}] ${entry.message}`).join("\n");

  await writeFile(recapPath, JSON.stringify(recap, null, 2));
  await writeFile(reportPath, markdown);
  await writeFile(matrixPath, JSON.stringify(controlMatrix, null, 2));
  await writeFile(mermaidPath, mermaid);
  await writeFile(governancePath, governanceMermaid);
  await writeFile(superintelligencePath, superintelligenceMermaid);
  await writeFile(telemetryPath, telemetryLog);
  await writeFile(htmlPath, html);
  await writeFile(ownerBriefPath, ownerBrief);
  await writeFile(safetyChecklistPath, safetyChecklist);
  await writeFile(csvPath, csvContent);
  await writeFile(constellationPath, constellationMermaid);
  await writeFile(agencyOrbitPath, agencyOrbitMermaid);
  await writeFile(lifecyclePath, lifecycleMermaid);

  const manifestEntries: { path: string; sha256: string }[] = [];
  for (const file of [
    recapPath,
    reportPath,
    htmlPath,
    matrixPath,
    mermaidPath,
    governancePath,
    superintelligencePath,
    telemetryPath,
    ownerBriefPath,
    safetyChecklistPath,
    csvPath,
    constellationPath,
    agencyOrbitPath,
    lifecyclePath,
  ]) {
    const content = await readFile(file);
    const relativePath = path.relative(path.join(__dirname, ".."), file);
    manifestEntries.push({ path: relativePath.replace(/\\/g, "/"), sha256: sha256(content) });
  }

  manifestEntries.push({ path: scenarioRelativePath, sha256: scenarioHash });

  const manifest = {
    generatedAt: new Date().toISOString(),
    files: manifestEntries,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n✅ α-AGI Insight MARK demo completed. Reports available in demo/alpha-agi-insight-mark/reports.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
