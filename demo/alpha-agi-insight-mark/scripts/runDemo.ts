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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  listingPrice?: string;
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
    let listingPrice: string | undefined;

    if (i < 2) {
      await novaSeed.connect(receiver).approve(await exchange.getAddress(), mintedId);
      await exchange.connect(receiver).listInsight(mintedId, price);
      status = "LISTED";
      listingPrice = ethers.formatUnits(price, 18);
      log("Venture Cartographer", `Token ${mintedId.toString()} listed on α-AGI MARK at ${listingPrice} AIC.`);

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
      listingPrice,
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
  const htmlPath = path.join(reportsDir, "insight-report.html");
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
    .map((entry) => {
      const saleDetails = entry.sale
        ? `${entry.sale.price} AIC → net ${entry.sale.netPayout} AIC`
        : entry.status === "LISTED"
          ? entry.listingPrice
            ? `Listed @ ${entry.listingPrice} AIC`
            : "Listed"
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
            : "Held by operator";
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
              <td>${escapeHtml(entry.status)}</td>
              <td>${escapeHtml(saleDetails)}</td>
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
        <span class="meta-grid__label">Treasury</span>
        <span class="meta-grid__value">${escapeHtml(await exchange.treasury())}</span>
      </div>
      <div class="meta-grid__item">
        <span class="meta-grid__label">Fee</span>
        <span class="meta-grid__value">${(Number(await exchange.feeBps()) / 100).toFixed(2)}%</span>
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
            <th>Status</th>
            <th>Market State</th>
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
        <li>Reveal a FusionPlan at will using <code>revealFusionPlan(tokenId, uri)</code>.</li>
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
  await writeFile(htmlPath, html);

  const manifestEntries: { path: string; sha256: string }[] = [];
  for (const file of [recapPath, reportPath, htmlPath, matrixPath, mermaidPath, telemetryPath]) {
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
