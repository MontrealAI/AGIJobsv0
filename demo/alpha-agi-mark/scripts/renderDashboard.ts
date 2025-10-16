import { mkdir, writeFile } from "fs/promises";
import path from "path";

const DASHBOARD_PATH = path.join(__dirname, "..", "reports", "alpha-mark-dashboard.html");

type RecapParticipant = {
  address: string;
  tokens: string;
  tokensWei: string;
  contributionWei: string;
  contributionEth?: string;
};

type RecapTrade = {
  kind: "BUY" | "SELL";
  actor: string;
  label: string;
  tokensWhole: string;
  valueWei: string;
  valueEth?: string;
};

type VerificationSnapshot = {
  supplyConsensus: {
    ledgerWholeTokens: string;
    contractWholeTokens: string;
    simulationWholeTokens: string;
    participantAggregateWholeTokens: string;
    consistent: boolean;
  };
  pricing: {
    contractNextPriceWei: string;
    contractNextPriceEth?: string;
    simulatedNextPriceWei: string;
    simulatedNextPriceEth?: string;
    consistent: boolean;
  };
  capitalFlows: {
    ledgerGrossWei: string;
    ledgerGrossEth?: string;
    ledgerRedemptionsWei: string;
    ledgerRedemptionsEth?: string;
    ledgerNetWei: string;
    ledgerNetEth?: string;
    simulatedReserveWei: string;
    simulatedReserveEth?: string;
    contractReserveWei: string;
    contractReserveEth?: string;
    vaultReceivedWei: string;
    vaultReceivedEth?: string;
    combinedReserveWei: string;
    combinedReserveEth?: string;
    consistent: boolean;
  };
  contributions: {
    participantAggregateWei: string;
    participantAggregateEth?: string;
    ledgerGrossWei: string;
    ledgerGrossEth?: string;
    consistent: boolean;
  };
};

type RecapData = {
  contracts: {
    novaSeed: string;
    riskOracle: string;
    markExchange: string;
    sovereignVault: string;
  };
  seed: {
    tokenId: string;
    holder: string;
  };
  validators: {
    approvalCount: string;
    approvalThreshold: string;
    members: string[];
    matrix: Array<{ address: string; approved: boolean }>;
  };
  bondingCurve: {
    supplyWholeTokens: string;
    reserveWei: string;
    nextPriceWei: string;
    basePriceWei: string;
    slopeWei: string;
    reserveEth?: string;
    nextPriceEth?: string;
    basePriceEth?: string;
    slopeEth?: string;
  };
  ownerControls: {
    paused: boolean;
    whitelistEnabled: boolean;
    emergencyExitEnabled: boolean;
    finalized: boolean;
    aborted: boolean;
    validationOverrideEnabled: boolean;
    validationOverrideStatus: boolean;
    treasury: string;
    riskOracle: string;
    baseAsset: string;
    usesNativeAsset: boolean;
    fundingCapWei: string;
    maxSupplyWholeTokens: string;
    saleDeadlineTimestamp: string;
    basePriceWei: string;
    slopeWei: string;
    fundingCapEth?: string;
    basePriceEth?: string;
    slopeEth?: string;
  };
  participants: RecapParticipant[];
  trades?: RecapTrade[];
  launch: {
    finalized: boolean;
    aborted: boolean;
    treasury: string;
    sovereignVault: {
      manifestUri: string;
      totalReceivedWei: string;
      lastAcknowledgedAmountWei: string;
      lastAcknowledgedMetadataHex: string;
      decodedMetadata: string;
      vaultBalanceWei: string;
      totalReceivedEth?: string;
      lastAcknowledgedAmountEth?: string;
      vaultBalanceEth?: string;
    };
  };
  ownerParameterMatrix?: Array<{ parameter: string; value: unknown; description: string }>;
  verification?: VerificationSnapshot;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortenAddress(address: string): string {
  if (!address || address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function renderBooleanBadge(value: boolean): string {
  return `<span class="badge ${value ? "on" : "off"}">${value ? "ENABLED" : "DISABLED"}</span>`;
}

function renderConsistencyBadge(ok: boolean): string {
  return `<span class="badge ${ok ? "success" : "danger"}">${ok ? "CONSISTENT" : "REVIEW"}</span>`;
}

function renderTradeBadge(kind: "BUY" | "SELL"): string {
  const cssClass = kind === "BUY" ? "buy" : "sell";
  return `<span class="badge ${cssClass}">${kind}</span>`;
}

function formatNumber(value: string | undefined, fallback = "-"): string {
  if (!value || value === "0") {
    return fallback;
  }
  return value;
}

function buildControlHighlights(recap: RecapData): string {
  const controls = [
    {
      label: "Market State",
      detail: recap.ownerControls.paused ? "Paused for operator oversight" : "Live & programmable",
      badge: recap.ownerControls.paused ? renderBooleanBadge(false) : '<span class="badge success">LIVE</span>',
    },
    {
      label: "Whitelist",
      detail: recap.ownerControls.whitelistEnabled
        ? "Only approved sovereign contributors may participate"
        : "Open liquidity access",
      badge: renderBooleanBadge(recap.ownerControls.whitelistEnabled),
    },
    {
      label: "Emergency Exit",
      detail: recap.ownerControls.emergencyExitEnabled
        ? "Participants can unwind even during a pause"
        : "Exit lever on standby",
      badge: renderBooleanBadge(recap.ownerControls.emergencyExitEnabled),
    },
    {
      label: "Validation Override",
      detail: recap.ownerControls.validationOverrideEnabled
        ? `Owner override engaged (${recap.ownerControls.validationOverrideStatus ? "FORCE-GREEN" : "FORCE-RED"})`
        : "Validator council governs launch",
      badge: renderBooleanBadge(recap.ownerControls.validationOverrideEnabled),
    },
  ];

  return controls
    .map(
      (control) => `
        <article class="control-card">
          <header>
            <h3>${escapeHtml(control.label)}</h3>
            ${control.badge}
          </header>
          <p>${escapeHtml(control.detail)}</p>
        </article>
      `,
    )
    .join("\n");
}

function buildParticipantsTable(participants: RecapParticipant[]): string {
  const rows = participants
    .map((participant, idx) => {
      const contribution = participant.contributionEth ?? participant.contributionWei;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td class="mono">${escapeHtml(shortenAddress(participant.address))}</td>
          <td>${escapeHtml(participant.tokens)}</td>
          <td>${escapeHtml(contribution)}</td>
        </tr>
      `;
    })
    .join("\n");

  return `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Participant</th>
          <th>SeedShares</th>
          <th>Contribution</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildTradesTable(trades: RecapTrade[]): string {
  if (!trades.length) {
    return "<p>No trades recorded.</p>";
  }

  const rows = trades
    .map(
      (trade, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${renderTradeBadge(trade.kind)}</td>
          <td>${escapeHtml(trade.label)}<br /><span class="mono">${escapeHtml(shortenAddress(trade.actor))}</span></td>
          <td>${escapeHtml(trade.tokensWhole)}</td>
          <td>${escapeHtml(trade.valueEth ?? trade.valueWei)}</td>
        </tr>
      `,
    )
    .join("\n");

  return `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Kind</th>
          <th>Actor</th>
          <th>Tokens</th>
          <th>Value (ETH)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildOwnerMatrixTable(entries: Array<{ parameter: string; value: unknown; description: string }> = []): string {
  if (entries.length === 0) {
    return "<p>No owner parameter matrix entries captured.</p>";
  }

  const rows = entries
    .map((entry) => {
      const value =
        typeof entry.value === "object" && entry.value !== null
          ? escapeHtml(JSON.stringify(entry.value))
          : escapeHtml(String(entry.value));
      return `
        <tr>
          <td class="mono">${escapeHtml(entry.parameter)}</td>
          <td>${value}</td>
          <td>${escapeHtml(entry.description)}</td>
        </tr>
      `;
    })
    .join("\n");

  return `
    <table>
      <thead>
        <tr>
          <th>Control Lever</th>
          <th>Value</th>
          <th>Purpose</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildVerificationSection(verification?: VerificationSnapshot): string {
  if (!verification) {
    return "";
  }

  const supplyCard = {
    title: "Supply Consensus",
    consistent: verification.supplyConsensus.consistent,
    body: `
      <p class="mono">
        Ledger ${escapeHtml(verification.supplyConsensus.ledgerWholeTokens)} ·
        Contract ${escapeHtml(verification.supplyConsensus.contractWholeTokens)} ·
        Simulation ${escapeHtml(verification.supplyConsensus.simulationWholeTokens)} ·
        Participants ${escapeHtml(verification.supplyConsensus.participantAggregateWholeTokens)}
      </p>
    `,
  };

  const pricingCard = {
    title: "Pricing Integrity",
    consistent: verification.pricing.consistent,
    body: `
      <p>
        On-chain quote: <span class="mono">${escapeHtml(
          formatNumber(verification.pricing.contractNextPriceEth, `${verification.pricing.contractNextPriceWei} wei`),
        )}</span><br />
        Simulated quote: <span class="mono">${escapeHtml(
          formatNumber(verification.pricing.simulatedNextPriceEth, `${verification.pricing.simulatedNextPriceWei} wei`),
        )}</span>
      </p>
    `,
  };

  const capitalCard = {
    title: "Capital Flow Integrity",
    consistent: verification.capitalFlows.consistent,
    body: `
      <p>
        Gross inflow: <span class="mono">${escapeHtml(
          formatNumber(verification.capitalFlows.ledgerGrossEth, `${verification.capitalFlows.ledgerGrossWei} wei`),
        )}</span><br />
        Redemptions: <span class="mono">${escapeHtml(
          formatNumber(
            verification.capitalFlows.ledgerRedemptionsEth,
            `${verification.capitalFlows.ledgerRedemptionsWei} wei`,
          ),
        )}</span><br />
        Net reserve: <span class="mono">${escapeHtml(
          formatNumber(verification.capitalFlows.ledgerNetEth, `${verification.capitalFlows.ledgerNetWei} wei`),
        )}</span><br />
        Vault received: <span class="mono">${escapeHtml(
          formatNumber(verification.capitalFlows.vaultReceivedEth, `${verification.capitalFlows.vaultReceivedWei} wei`),
        )}</span>
      </p>
    `,
  };

  const contributionsCard = {
    title: "Contribution Accounting",
    consistent: verification.contributions.consistent,
    body: `
      <p>
        On-chain aggregate: <span class="mono">${escapeHtml(
          formatNumber(
            verification.contributions.participantAggregateEth,
            `${verification.contributions.participantAggregateWei} wei`,
          ),
        )}</span><br />
        Ledger aggregate: <span class="mono">${escapeHtml(
          formatNumber(verification.contributions.ledgerGrossEth, `${verification.contributions.ledgerGrossWei} wei`),
        )}</span>
      </p>
    `,
  };

  const cards = [supplyCard, pricingCard, capitalCard, contributionsCard];

  const grid = cards
    .map(
      (card) => `
        <article class="verification-card">
          <header>
            <h3>${escapeHtml(card.title)}</h3>
            ${renderConsistencyBadge(card.consistent)}
          </header>
          ${card.body}
        </article>
      `,
    )
    .join("\n");

  return `
    <section>
      <h2>Triple-Verification Matrix</h2>
      <p>
        Independent ledgers, on-chain state introspection, and first-principles math cross-check the sovereign launch
        in real time.
      </p>
      <div class="verification-grid">
        ${grid}
      </div>
    </section>
  `;
}

function buildMermaidFlow(recap: RecapData): string {
  const metadataSnippet = recap.launch.sovereignVault.decodedMetadata
    ? recap.launch.sovereignVault.decodedMetadata.replace(/\"/g, '\\"')
    : "Ignition metadata";

  const mermaidLines = [
    "flowchart LR",
    `    Operator((Operator ${shortenAddress(recap.seed.holder)})) --> Seed[Nova-Seed #${recap.seed.tokenId}]`,
    "    Seed -->|Tokenizes vision| Exchange[α-AGI SeedShares Exchange]",
    "    Exchange -->|Bonding curve capital| Reserve((Sovereign Reserve))",
    `    Exchange -->|Validator consensus (${recap.validators.approvalCount}/${recap.validators.approvalThreshold})| Oracle[Risk Oracle Council]`,
    "    Oracle --> Launch{Launch Condition}",
    "    Launch -->|Finalized| Vault[[α-AGI Sovereign Vault]]",
    `    Vault -->|Acknowledge| Manifest>\"${metadataSnippet}\"]`,
    "    Launch -.->|Abort| Emergency((Emergency Exit))",
  ];

  return mermaidLines.join("\n");
}

function buildDashboardHtml(recap: RecapData): string {
  const participantCount = recap.participants.length;
  const reserve = formatNumber(recap.bondingCurve.reserveEth, `${recap.bondingCurve.reserveWei} wei`);
  const nextPrice = formatNumber(recap.bondingCurve.nextPriceEth, `${recap.bondingCurve.nextPriceWei} wei`);
  const sovereignBalance = formatNumber(
    recap.launch.sovereignVault.totalReceivedEth,
    `${recap.launch.sovereignVault.totalReceivedWei} wei`,
  );
  const lastIgnition = formatNumber(
    recap.launch.sovereignVault.lastAcknowledgedAmountEth,
    `${recap.launch.sovereignVault.lastAcknowledgedAmountWei} wei`,
  );

  const ownerMatrix = buildOwnerMatrixTable(recap.ownerParameterMatrix ?? []);
  const mermaidDefinition = escapeHtml(buildMermaidFlow(recap));
  const verificationSection = buildVerificationSection(recap.verification);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>α-AGI MARK Sovereign Launch Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-gradient: radial-gradient(circle at 20% 20%, #1a1f4d 0%, #05010c 65%, #000000 100%);
        --accent: #60ffcf;
        --accent-soft: rgba(96, 255, 207, 0.2);
        --warning: #ffb347;
        --danger: #ff6b6b;
        --success: #2ecc71;
        --card-bg: rgba(255, 255, 255, 0.04);
        --table-header: rgba(255, 255, 255, 0.08);
        font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg-gradient);
        color: #f6faff;
        padding: 3rem 1rem 4rem;
        line-height: 1.6;
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
      }
      header.hero {
        text-align: center;
        margin-bottom: 3rem;
      }
      header.hero h1 {
        font-size: clamp(2.5rem, 5vw, 3.8rem);
        margin: 0;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      header.hero p {
        max-width: 720px;
        margin: 1rem auto 0 auto;
        color: rgba(255, 255, 255, 0.78);
      }
      section {
        margin-bottom: 3rem;
        background: var(--card-bg);
        border-radius: 18px;
        padding: 2rem;
        box-shadow: 0 18px 50px rgba(8, 11, 40, 0.45);
        backdrop-filter: blur(12px);
      }
      section h2 {
        margin-top: 0;
        font-size: 1.6rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
      }
      .metric {
        border: 1px solid rgba(96, 255, 207, 0.25);
        border-radius: 14px;
        padding: 1.5rem;
        text-align: center;
      }
      .metric h3 {
        margin: 0 0 0.5rem 0;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.9rem;
        letter-spacing: 0.1em;
      }
      .metric strong {
        font-size: 1.6rem;
        color: var(--accent);
        font-weight: 600;
      }
      .control-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1.25rem;
      }
      .control-card {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 14px;
        padding: 1.2rem 1.3rem;
        border: 1px solid rgba(96, 255, 207, 0.12);
      }
      .verification-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.5rem;
      }
      .verification-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        padding: 1.4rem;
        border: 1px solid rgba(96, 255, 207, 0.16);
      }
      .verification-card header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.9rem;
      }
      .control-card header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
      }
      .control-card h3 {
        margin: 0;
        font-size: 1rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .badge {
        display: inline-block;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 1px solid currentColor;
      }
      .badge.on {
        color: var(--accent);
        background: rgba(96, 255, 207, 0.1);
      }
      .badge.off {
        color: rgba(255, 255, 255, 0.56);
        border-color: rgba(255, 255, 255, 0.4);
      }
      .badge.success {
        color: var(--success);
        background: rgba(46, 204, 113, 0.16);
        border-color: rgba(46, 204, 113, 0.6);
      }
      .badge.danger {
        color: var(--danger);
        background: rgba(255, 107, 107, 0.18);
        border-color: rgba(255, 107, 107, 0.6);
      }
      .badge.buy {
        color: #5ac8fa;
        background: rgba(90, 200, 250, 0.18);
        border-color: rgba(90, 200, 250, 0.6);
      }
      .badge.sell {
        color: #ffaf5f;
        background: rgba(255, 175, 95, 0.18);
        border-color: rgba(255, 175, 95, 0.6);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        font-size: 0.95rem;
      }
      table thead {
        background: var(--table-header);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-size: 0.8rem;
      }
      table th,
      table td {
        padding: 0.8rem 1rem;
        text-align: left;
      }
      table tbody tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.04);
      }
      .mono {
        font-family: "JetBrains Mono", "Fira Code", "SFMono-Regular", ui-monospace, monospace;
      }
      pre.mermaid {
        background: rgba(0, 0, 0, 0.45);
        border-radius: 12px;
        padding: 1.5rem;
        overflow-x: auto;
        border: 1px solid rgba(96, 255, 207, 0.2);
      }
      footer {
        text-align: center;
        margin-top: 4rem;
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.85rem;
      }
      a {
        color: var(--accent);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js" integrity="sha256-YBtS2OVCkXbkqVKgf/mBlC9ZwTe74MkRUyvMh35vjps=" crossorigin="anonymous"></script>
    <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
  </head>
  <body>
    <main>
      <header class="hero">
        <p class="mono">α-AGI Sovereign Command Console</p>
        <h1>MARK Launch Telemetry</h1>
        <p>
          Autonomous foresight launch executed via AGI Jobs v0 (v2). This dossier captures every
          actuator a non-technical steward needs to command an α-AGI Nova-Seed into sovereign reality.
        </p>
      </header>

      <section>
        <h2>Mission Control Metrics</h2>
        <div class="metrics">
          <article class="metric">
            <h3>Validator Consensus</h3>
            <strong>${escapeHtml(`${recap.validators.approvalCount}/${recap.validators.approvalThreshold}`)}</strong>
            <p>${escapeHtml(recap.validators.members.length.toString())} guardians in council</p>
          </article>
          <article class="metric">
            <h3>Live SeedShares Supply</h3>
            <strong>${escapeHtml(recap.bondingCurve.supplyWholeTokens)}</strong>
            <p>Dynamic bonding curve issuance</p>
          </article>
          <article class="metric">
            <h3>Reserve Power</h3>
            <strong>${escapeHtml(reserve)}</strong>
            <p>Capital safeguarding the sovereign ignition</p>
          </article>
          <article class="metric">
            <h3>Next Token Price</h3>
            <strong>${escapeHtml(nextPrice)}</strong>
            <p>Real-time quote for incremental participation</p>
          </article>
          <article class="metric">
            <h3>Sovereign Vault</h3>
            <strong>${escapeHtml(sovereignBalance)}</strong>
            <p>Manifest URI: ${escapeHtml(recap.launch.sovereignVault.manifestUri)}<br />Last ignition: ${escapeHtml(
              lastIgnition,
            )}</p>
          </article>
          <article class="metric">
            <h3>Participants</h3>
            <strong>${participantCount}</strong>
            <p>Every participant recorded with on-chain contributions</p>
          </article>
        </div>
      </section>

      ${verificationSection}

      <section>
        <h2>Owner Control Deck</h2>
        <div class="control-grid">
          ${buildControlHighlights(recap)}
        </div>
      </section>

      ${recap.trades && recap.trades.length
        ? `
      <section>
        <h2>Trade Resonance Log</h2>
        <p>Every bonding curve action captured chronologically to prove deterministic capital flows.</p>
        ${buildTradesTable(recap.trades)}
      </section>
      `
        : ""}

      <section>
        <h2>Participant Ledger</h2>
        <p>The bonding curve ledger ensures contributions and SeedShares stay solvent in both ascent and emergency exit scenarios.</p>
        ${buildParticipantsTable(recap.participants)}
      </section>

      <section>
        <h2>Operator Parameter Matrix</h2>
        <p>Every actuator exposed to the owner is catalogued here to guarantee absolute command authority.</p>
        ${ownerMatrix}
      </section>

      <section>
        <h2>Launch Dynamics</h2>
        <pre class="mermaid">
${mermaidDefinition}
        </pre>
        <p class="mono">Contracts: NovaSeed ${escapeHtml(shortenAddress(recap.contracts.novaSeed))} · Oracle ${escapeHtml(shortenAddress(recap.contracts.riskOracle))} · Exchange ${escapeHtml(shortenAddress(recap.contracts.markExchange))} · Vault ${escapeHtml(shortenAddress(recap.contracts.sovereignVault))}</p>
      </section>

      <footer>
        Crafted autonomously by AGI Jobs v0 (v2). Re-run <code>npm run demo:alpha-agi-mark</code> to regenerate this living dossier.
      </footer>
    </main>
  </body>
</html>`;
}

export async function renderDashboard(recap: RecapData, outputPath = DASHBOARD_PATH): Promise<string> {
  const html = buildDashboardHtml(recap);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  return outputPath;
}
