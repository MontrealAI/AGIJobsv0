import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";

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
const dataFile = path.join(__dirname, "..", "data", "insight-scenarios.json");

function toTimestamp(year: number): bigint {
  return BigInt(Math.floor(Date.UTC(year, 0, 1) / 1000));
}

function sha256(content: string | Buffer): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

async function loadScenarioConfig(): Promise<ScenarioConfig> {
  const raw = await readFile(dataFile, "utf8");
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
  status: "HELD" | "LISTED" | "SOLD";
  sale?: {
    buyer: string;
    price: string;
    fee: string;
    netPayout: string;
    transactionHash: string;
  };
  fusionRevealed: boolean;
  disruptionTimestamp: string;
}

async function main() {
  await ensureReportsDir();
  const config = await loadScenarioConfig();

  const [operator, oracle, strategist, buyerA, buyerB] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

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

  const telemetry: AgentLogEntry[] = [];
  const minted: MintedInsightRecord[] = [];

  function log(agent: string, message: string) {
    const entry: AgentLogEntry = { agent, message, timestamp: new Date().toISOString() };
    telemetry.push(entry);
    console.log(`🤖 [${agent}] ${message}`);
  }

  log("Meta-Sentinel", "Initialising α-AGI Insight MARK deployment lattice.");

  const scenarioAllocations = [
    { minter: operator, receiver: operator },
    { minter: oracle, receiver: oracle },
    { minter: operator, receiver: strategist },
  ];

  const priceSchedule = [ethers.parseUnits("250", 18), ethers.parseUnits("180", 18), ethers.parseUnits("420", 18)];

  for (let i = 0; i < config.scenarios.length; i += 1) {
    const scenario = config.scenarios[i];
    const { minter, receiver } = scenarioAllocations[i] ?? scenarioAllocations[0];

    log("Thermodynamic Oracle", `Evaluating ${scenario.sector} rupture – confidence ${(scenario.confidence * 100).toFixed(1)}%.`);

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
    if (i === 0) {
      await novaSeed.revealFusionPlan(mintedId, scenario.fusionURI);
      fusionRevealed = true;
      log("Guardian Auditor", `Fusion plan for token ${mintedId.toString()} revealed under owner control.`);
    }

    const price = priceSchedule[i] ?? priceSchedule[0];
    let status: MintedInsightRecord["status"] = "HELD";
    let sale: MintedInsightRecord["sale"] | undefined;

    if (i < 2) {
      await novaSeed.connect(receiver).approve(await exchange.getAddress(), mintedId);
      await exchange.connect(receiver).listInsight(mintedId, price);
      status = "LISTED";
      log("Venture Cartographer", `Token ${mintedId.toString()} listed on α-AGI MARK at ${ethers.formatUnits(price, 18)} AIC.`);

      if (i === 0) {
        await accessToken.mint(buyerA.address, ethers.parseUnits("1000", 18));
        await accessToken.connect(buyerA).approve(await exchange.getAddress(), ethers.parseUnits("1000", 18));
        const buyTx = await exchange.connect(buyerA).buyInsight(mintedId);
        const buyReceipt = await buyTx.wait();
        const fee = price * BigInt(await exchange.feeBps()) / 10_000n;
        const net = price - fee;
        sale = {
          buyer: buyerA.address,
          price: ethers.formatUnits(price, 18),
          fee: ethers.formatUnits(fee, 18),
          netPayout: ethers.formatUnits(net, 18),
          transactionHash: buyReceipt?.hash ?? "",
        };
        status = "SOLD";
        log("Meta-Sentinel", `Token ${mintedId.toString()} acquired by ${buyerA.address}. Net payout ${ethers.formatUnits(net, 18)} AIC.`);
        await exchange.resolvePrediction(mintedId, true, `${scenario.sector} rupture confirmed by insight engine.`);
      }
    }

    minted.push({
      tokenId: mintedId.toString(),
      scenario,
      mintedTo: receiver.address,
      mintedBy: minter.address,
      listed: status !== "HELD",
      status,
      sale,
      fusionRevealed,
      disruptionTimestamp: toTimestamp(scenario.ruptureYear).toString(),
    });
  }

  await accessToken.mint(buyerB.address, ethers.parseUnits("800", 18));
  await accessToken.connect(buyerB).approve(await exchange.getAddress(), ethers.parseUnits("800", 18));
  log("Guardian Auditor", "Liquidity buffers provisioned for additional foresight acquisitions.");

  const recapPath = path.join(reportsDir, "insight-recap.json");
  const reportPath = path.join(reportsDir, "insight-report.md");
  const matrixPath = path.join(reportsDir, "insight-control-matrix.json");
  const mermaidPath = path.join(reportsDir, "insight-control-map.mmd");
  const telemetryPath = path.join(reportsDir, "insight-telemetry.log");
  const manifestPath = path.join(reportsDir, "insight-manifest.json");

  const recap = {
    generatedAt: new Date().toISOString(),
    network: { chainId: network.chainId.toString(), name: network.name },
    contracts: {
      novaSeed: await novaSeed.getAddress(),
      foresightExchange: await exchange.getAddress(),
      settlementToken: await accessToken.getAddress(),
    },
    operator: operator.address,
    oracle: oracle.address,
    treasury: await exchange.treasury(),
    feeBps: Number(await exchange.feeBps()),
    minted,
    telemetry,
  };

  const tableRows = minted
    .map((entry, index) => {
      const saleDetails = entry.sale
        ? `${entry.sale.price} AIC → net ${entry.sale.netPayout} AIC`
        : entry.status === "LISTED"
          ? `Listed @ ${ethers.formatUnits(priceSchedule[index] ?? priceSchedule[0], 18)} AIC`
          : "Held by operator";
      return `| ${entry.tokenId} | ${entry.scenario.sector} | ${entry.scenario.ruptureYear} | ${entry.scenario.thesis} | ${entry.status} | ${saleDetails} |`;
    })
    .join("\n");

  const markdown = `# α-AGI Insight MARK Recap\n\n` +
    `**Network:** ${network.name} (chainId ${network.chainId})\\\n` +
    `**Operator:** ${operator.address}\\\n` +
    `**Oracle:** ${oracle.address}\\\n` +
    `**Fee:** ${(Number(await exchange.feeBps()) / 100).toFixed(2)}%\\\n` +
    `**Treasury:** ${await exchange.treasury()}\\\n\n` +
    `| Token | Sector | Rupture Year | Thesis | Status | Market State |\n| --- | --- | --- | --- | --- | --- |\n${tableRows}\n\n` +
    `## Owner Command Hooks\n- Owner may pause tokens, exchange, and settlement token immediately.\n- Oracle address (${oracle.address}) can resolve predictions without redeploying contracts.\n- Treasury destination configurable via \`setTreasury\`.\n\n` +
    `## Telemetry Snapshot\n` +
    telemetry
      .map((entry) => `- ${entry.timestamp} — **${entry.agent}**: ${entry.message}`)
      .join("\n") +
    "\n";

  const controlMatrix = {
    generatedAt: new Date().toISOString(),
    owner: operator.address,
    oracle: oracle.address,
    contracts: [
      {
        name: "InsightAccessToken",
        address: await accessToken.getAddress(),
        owner: operator.address,
        pausible: true,
        configurable: ["mint", "pause", "unpause"],
      },
      {
        name: "AlphaInsightNovaSeed",
        address: await novaSeed.getAddress(),
        owner: operator.address,
        pausible: true,
        configurable: ["setMinter", "updateInsightDetails", "revealFusionPlan"],
      },
      {
        name: "AlphaInsightExchange",
        address: await exchange.getAddress(),
        owner: operator.address,
        pausible: true,
        configurable: ["setOracle", "setTreasury", "setFeeBps", "setPaymentToken"],
      },
    ],
  };

  const mermaid = `flowchart TD\n    operator((Operator)):::actor -->|Mints| nova[α-AGI Nova-Seed]:::contract\n` +
    `    nova -->|Lists insight| exchange[Insight Exchange]:::contract\n` +
    `    buyers((Market Participants)):::actor -->|Acquire foresight| exchange\n` +
    `    exchange -->|Fee| treasury((Treasury)):::control\n` +
    `    operator -->|Pause / Update| exchange\n` +
    `    operator -->|Reveal fusion plans| nova\n    classDef actor fill:#102a43,stroke:#8ff7ff,color:#e5f9ff;\n    classDef contract fill:#1b2845,stroke:#9ef6ff,color:#f0f8ff;\n    classDef control fill:#2c1f3d,stroke:#d2b0ff,color:#f8f5ff;\n`;

  const telemetryLog = telemetry.map((entry) => `${entry.timestamp} [${entry.agent}] ${entry.message}`).join("\n");

  await writeFile(recapPath, JSON.stringify(recap, null, 2));
  await writeFile(reportPath, markdown);
  await writeFile(matrixPath, JSON.stringify(controlMatrix, null, 2));
  await writeFile(mermaidPath, mermaid);
  await writeFile(telemetryPath, telemetryLog);

  const manifestEntries: { path: string; sha256: string }[] = [];
  for (const file of [recapPath, reportPath, matrixPath, mermaidPath, telemetryPath]) {
    const content = await readFile(file);
    const relativePath = path.relative(path.join(__dirname, ".."), file);
    manifestEntries.push({ path: relativePath.replace(/\\\\/g, "/"), sha256: sha256(content) });
  }

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
