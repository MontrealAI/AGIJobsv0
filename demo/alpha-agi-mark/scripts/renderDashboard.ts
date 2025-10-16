import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { ethers } from "ethers";

type Address = string;

type Participant = {
  address: Address;
  tokens: string;
  contributionWei: string;
};

type OwnerControls = {
  paused: boolean;
  whitelistEnabled: boolean;
  emergencyExitEnabled: boolean;
  finalized: boolean;
  aborted: boolean;
  validationOverrideEnabled: boolean;
  validationOverrideStatus: boolean;
  treasury: Address;
  riskOracle: Address;
  baseAsset: Address;
  usesNativeAsset: boolean;
  fundingCapWei: string;
  maxSupplyWholeTokens: string;
  saleDeadlineTimestamp: string;
  basePriceWei: string;
  slopeWei: string;
};

type Recap = {
  contracts: Record<string, Address>;
  seed: { tokenId: string; holder: Address };
  validators: {
    approvalCount: string;
    approvalThreshold: string;
    members: Address[];
  };
  bondingCurve: {
    supplyWholeTokens: string;
    reserveWei: string;
    nextPriceWei: string;
    basePriceWei: string;
    slopeWei: string;
  };
  ownerControls: OwnerControls;
  participants: Participant[];
  launch: {
    finalized: boolean;
    aborted: boolean;
    treasury: Address;
    sovereignVault: {
      manifestUri: string;
      totalReceivedWei: string;
      lastAcknowledgedAmountWei: string;
      decodedMetadata: string;
      vaultBalanceWei: string;
    };
  };
  ownerParameterMatrix?: Array<{
    parameter: string;
    value: unknown;
    description: string;
  }>;
};

function weiToEth(wei: string): string {
  return ethers.formatEther(wei);
}

function formatBoolean(value: boolean): string {
  return value ? "✅" : "⛔";
}

function timestampToIso(timestamp: string): string {
  const value = BigInt(timestamp);
  if (value === 0n) {
    return "—";
  }
  return new Date(Number(value) * 1000).toISOString();
}

function buildOwnerControlRows(controls: OwnerControls) {
  return [
    { label: "Market Paused", value: formatBoolean(controls.paused) },
    { label: "Whitelist Enabled", value: formatBoolean(controls.whitelistEnabled) },
    { label: "Emergency Exit", value: formatBoolean(controls.emergencyExitEnabled) },
    { label: "Finalized", value: formatBoolean(controls.finalized) },
    { label: "Aborted", value: formatBoolean(controls.aborted) },
    {
      label: "Validation Override",
      value: controls.validationOverrideEnabled
        ? `ON (${controls.validationOverrideStatus ? "green" : "red"})`
        : "OFF",
    },
    { label: "Treasury", value: controls.treasury },
    { label: "Risk Oracle", value: controls.riskOracle },
    {
      label: "Base Asset",
      value: controls.usesNativeAsset ? "Native ETH" : controls.baseAsset,
    },
    { label: "Funding Cap", value: `${weiToEth(controls.fundingCapWei)} ETH` },
    { label: "Max Supply", value: controls.maxSupplyWholeTokens },
    { label: "Sale Deadline", value: timestampToIso(controls.saleDeadlineTimestamp) },
    { label: "Base Price", value: `${weiToEth(controls.basePriceWei)} ETH` },
    { label: "Slope", value: `${weiToEth(controls.slopeWei)} ETH` },
  ];
}

function buildParticipantTable(participants: Participant[]) {
  const rows = participants
    .map((participant, idx) => {
      const contribution = weiToEth(participant.contributionWei);
      return `
        <tr>
          <td>${idx + 1}</td>
          <td><code>${participant.address}</code></td>
          <td>${Number(participant.tokens).toLocaleString()}</td>
          <td>${contribution} ETH</td>
        </tr>`;
    })
    .join("\n");

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Participant</th>
          <th>SeedShares</th>
          <th>Total Contribution</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildOwnerControlTable(controls: OwnerControls) {
  const rows = buildOwnerControlRows(controls)
    .map(
      (row) => `
      <tr>
        <td>${row.label}</td>
        <td>${row.value}</td>
      </tr>`,
    )
    .join("\n");

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Owner Control Lever</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildMermaidFlow(recap: Recap): string {
  const treasury = recap.launch.treasury ?? recap.ownerControls.treasury;
  return `
flowchart LR
  subgraph Seed["🌱 Nova-Seed Genesis"]
    A{{"Mint Nova-Seed NFT"}}
    B["Validator Council Config"]
  end
  subgraph Market["⚖️  AlphaMark Bonding Curve"]
    C["Investors acquire SeedShares"]
    D["Dynamic pricing via base=${weiToEth(recap.bondingCurve.basePriceWei)} ETH"]
    E["Reserve balance ${weiToEth(recap.bondingCurve.reserveWei)} ETH"]
  end
  subgraph Governance["🛡️  Risk Oracle"]
    F["Approvals ${recap.validators.approvalCount}/${recap.validators.approvalThreshold}"]
  end
  subgraph Sovereign["👑 Sovereign Vault"]
    G["Funds safeguarded at ${treasury}"]
    H["Manifest ${recap.launch.sovereignVault.manifestUri}"]
  end
  A --> C
  C --> D --> E
  E --> F
  F -->|Green-light| G
  G --> H
`;
}

function buildContributionPie(participants: Participant[]): string {
  const slices = participants
    .map((participant, idx) => {
      const contribution = parseFloat(weiToEth(participant.contributionWei));
      const label = `Investor ${idx + 1}`;
      return `  "${label}" : ${contribution.toFixed(6)}`;
    })
    .join("\n");

  return `
pie showData
${slices}
`;
}

function buildLaunchTimeline(recap: Recap): string {
  return `
timeline
  title α-AGI MARK Sovereign Ignition
  section Seed Formation
    Nova-Seed minted : milestone, 0
    Validator roster bootstrapped : 1
  section Foresight Market
    Bonding curve activated : 2
    Compliance levers exercised : 3
  section Consensus
    Risk oracle approvals cross-threshold : 4
  section Sovereign Transfer
    Funds streamed to vault : 5
    Metadata anchored : 6
`;
}

function buildOwnerMatrixCards(matrix: Recap["ownerParameterMatrix"]): string {
  if (!matrix || matrix.length === 0) {
    return "";
  }

  return matrix
    .map((entry) => {
      const value = typeof entry.value === "object" ? JSON.stringify(entry.value) : String(entry.value);
      return `
        <article class="card">
          <header>${entry.parameter}</header>
          <p>${value}</p>
          <footer>${entry.description}</footer>
        </article>`;
    })
    .join("\n");
}

async function main() {
  const recapPath = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
  const dashboardPath = path.join(__dirname, "..", "reports", "alpha-mark-dashboard.html");
  const raw = await readFile(recapPath, "utf8");
  const recap: Recap = JSON.parse(raw);

  const participantsTable = buildParticipantTable(recap.participants);
  const ownerTable = buildOwnerControlTable(recap.ownerControls);
  const flowDiagram = buildMermaidFlow(recap);
  const pieDiagram = buildContributionPie(recap.participants);
  const timelineDiagram = buildLaunchTimeline(recap);
  const matrixCards = buildOwnerMatrixCards(recap.ownerParameterMatrix ?? []);

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>α-AGI MARK Demo Control Room</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" />
    <style>
      :root {
        color-scheme: dark;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        background: radial-gradient(circle at 10% 20%, #0a141f 0%, #020407 60%, #010101 100%);
        color: #f6f9ff;
      }
      body {
        margin: 0;
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }
      header {
        text-align: center;
      }
      h1 {
        margin-bottom: 0.25rem;
        font-size: clamp(2.5rem, 4vw, 3.5rem);
        letter-spacing: 0.08em;
      }
      h2 {
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.2em;
      }
      .grid {
        display: grid;
        gap: 2rem;
      }
      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        background: rgba(9, 20, 36, 0.75);
        border: 1px solid rgba(82, 165, 255, 0.3);
        border-radius: 0.75rem;
        overflow: hidden;
      }
      .data-table th,
      .data-table td {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid rgba(82, 165, 255, 0.2);
        text-align: left;
        font-size: 0.95rem;
      }
      .data-table tbody tr:last-child td {
        border-bottom: none;
      }
      code {
        background: rgba(82, 165, 255, 0.15);
        padding: 0.1rem 0.25rem;
        border-radius: 0.35rem;
      }
      .mermaid {
        background: rgba(7, 18, 34, 0.7);
        padding: 1.5rem;
        border-radius: 1rem;
        border: 1px solid rgba(134, 214, 255, 0.25);
      }
      .card-deck {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
      }
      .card {
        background: linear-gradient(145deg, rgba(11, 34, 68, 0.8), rgba(4, 12, 24, 0.9));
        border: 1px solid rgba(91, 200, 255, 0.35);
        border-radius: 1rem;
        padding: 1rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .card header {
        font-weight: 600;
        font-size: 1.05rem;
        letter-spacing: 0.08em;
      }
      .card footer {
        font-size: 0.85rem;
        opacity: 0.75;
      }
      footer {
        text-align: center;
        opacity: 0.65;
        font-size: 0.85rem;
      }
      a {
        color: #9bd9ff;
      }
    </style>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: true, theme: 'forest', securityLevel: 'loose' });
    </script>
  </head>
  <body>
    <header>
      <h1>α-AGI MARK</h1>
      <p>Foresight Exchange Command Deck &mdash; orchestrated by AGI Jobs v0 (v2)</p>
    </header>

    <section>
      <h2>Mission Telemetry</h2>
      <div class="grid two">
        <article>
          <h3>Participants</h3>
          ${participantsTable}
        </article>
        <article>
          <h3>Owner Control Snapshot</h3>
          ${ownerTable}
        </article>
      </div>
    </section>

    <section>
      <h2>System Cartography</h2>
      <div class="grid">
        <div class="mermaid">
${flowDiagram}
        </div>
        <div class="mermaid">
${pieDiagram}
        </div>
        <div class="mermaid">
${timelineDiagram}
        </div>
      </div>
    </section>

    ${matrixCards ? `<section><h2>Owner Parameter Matrix</h2><div class="card-deck">${matrixCards}</div></section>` : ""}

    <footer>
      <p>Generated from <code>alpha-mark-recap.json</code> &mdash; empowering non-technical launch commanders.</p>
    </footer>
  </body>
</html>`;

  await mkdir(path.dirname(dashboardPath), { recursive: true });
  await writeFile(dashboardPath, html, "utf8");
  console.log(`α-AGI MARK dashboard generated at ${dashboardPath}`);
}

main().catch((error) => {
  console.error("Failed to render α-AGI MARK dashboard:", error);
  process.exitCode = 1;
});
