import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { format } from "util";
import { ethers } from "ethers";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const JSON_PATH = path.join(REPORT_DIR, "alpha-mark-recap.json");
const MARKDOWN_PATH = path.join(REPORT_DIR, "alpha-mark-recap.md");

interface RecapParticipant {
  address: string;
  tokens: string;
  contributionWei: string;
}

interface RecapData {
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
  };
  bondingCurve: {
    supplyWholeTokens: string;
    reserveWei: string;
    nextPriceWei: string;
    basePriceWei: string;
    slopeWei: string;
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
  };
  participants: RecapParticipant[];
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
    };
  };
}

function formatEtherAbbreviated(value: bigint): string {
  const etherString = ethers.formatEther(value);
  const [integerPart, fractionalRaw = "0"] = etherString.split(".");
  const fractional = fractionalRaw.slice(0, 4).replace(/0+$/, "");
  return fractional.length > 0 ? `${integerPart}.${fractional}` : integerPart;
}

function formatWei(value: string, currencyLabel: string): string {
  const bigValue = BigInt(value || "0");
  return `${formatEtherAbbreviated(bigValue)} ${currencyLabel}`;
}

function formatTimestamp(ts: string): string {
  const numeric = Number(ts);
  if (!numeric) {
    return "—";
  }
  const date = new Date(numeric * 1000);
  return `${date.toISOString()} (${numeric})`;
}

function boolToStatus(value: boolean): string {
  return value ? "✅" : "⬜️";
}

async function main(): Promise<void> {
  const raw = await readFile(JSON_PATH, "utf8").catch((error) => {
    throw new Error(`Unable to read recap dossier at ${JSON_PATH}: ${(error as Error).message}`);
  });

  const recap = JSON.parse(raw) as RecapData;
  const currencyLabel = recap.ownerControls.usesNativeAsset ? "ETH" : "base units";
  const baseAssetDescriptor = recap.ownerControls.usesNativeAsset
    ? "Native ETH"
    : recap.ownerControls.baseAsset;

  const mermaidDiagram = [
    "```mermaid",
    "flowchart LR",
    "    classDef owner fill:#0f172a,color:#f8fafc,stroke:#38bdf8,stroke-width:2px;",
    "    classDef contract fill:#1e293b,color:#e0f2fe,stroke:#22d3ee,stroke-width:2px;",
    "    classDef control fill:#172554,color:#fef3c7,stroke:#fbbf24,stroke-width:2px;",
    "    classDef data fill:#082f49,color:#bbf7d0,stroke:#34d399,stroke-width:2px;",
    format(
      "    owner((Operator Key\\n%s)):::owner --> seed[(NovaSeedNFT\\n%s\\nToken #%s)]:::contract",
      recap.seed.holder,
      recap.contracts.novaSeed,
      recap.seed.tokenId,
    ),
    "    seed --> oracle{AlphaMarkRiskOracle\\nValidators: " +
      `${recap.validators.approvalCount}/${recap.validators.approvalThreshold}` +
      "}:::contract",
    "    oracle -- approvals --> approvals[[Consensus Layer]]:::control",
    "    approvals --> mark[(AlphaMarkEToken\\n" +
      `${recap.contracts.markExchange}\\nSupply: ${recap.bondingCurve.supplyWholeTokens}` +
      ")]:::contract",
    "    investors[[Investors A/B/C]]:::owner --> mark",
    "    mark --> reserve[[Bonding Curve Reserve\\n" +
      `${formatWei(recap.launch.sovereignVault.lastAcknowledgedAmountWei, currencyLabel)}` +
      "]]:::data",
    "    mark -. compliance levers .-> controls[Pause / Whitelist / Funding Cap]:::control",
    "    controls -. owner authority .-> owner",
    "    mark --> |Finalize| vault[(AlphaSovereignVault\\n" +
      `${recap.contracts.sovereignVault}` +
      ")]:::contract",
    "    vault --> manifest{{Launch Manifest\\n" +
      `${recap.launch.sovereignVault.manifestUri}` +
      "}}:::data",
    "    vault --> owner",
    "```",
  ].join("\n");

  const ownerControlsTable = [
    "| Control Lever | Status | Details |",
    "| --- | --- | --- |",
    `| Market paused | ${boolToStatus(recap.ownerControls.paused)} | Exchange trading switch`,
    `| Whitelist enforced | ${boolToStatus(recap.ownerControls.whitelistEnabled)} | Compliance gate`,
    `| Emergency exit | ${boolToStatus(recap.ownerControls.emergencyExitEnabled)} | Enables redemptions during pauses`,
    `| Launch finalized | ${boolToStatus(recap.ownerControls.finalized)} | Sale locked and reserves transferred`,
    `| Launch aborted | ${boolToStatus(recap.ownerControls.aborted)} | Funds returned scenario`,
    `| Validation override | ${boolToStatus(recap.ownerControls.validationOverrideEnabled)} | Forced decision -> ${recap.ownerControls.validationOverrideStatus}`,
    `| Treasury address | ✅ | ${recap.ownerControls.treasury}`,
    `| Base asset | ✅ | ${baseAssetDescriptor}`,
    `| Funding cap | ✅ | ${formatWei(recap.ownerControls.fundingCapWei, currencyLabel)}`,
    `| Max supply | ✅ | ${recap.ownerControls.maxSupplyWholeTokens} SeedShares`,
    `| Sale deadline | ✅ | ${formatTimestamp(recap.ownerControls.saleDeadlineTimestamp)}`,
    `| Curve base price | ✅ | ${formatWei(recap.ownerControls.basePriceWei, currencyLabel)}`,
    `| Curve slope | ✅ | ${formatWei(recap.ownerControls.slopeWei, currencyLabel)}`,
  ].join("\n");

  const contractTable = [
    "| Component | Address |",
    "| --- | --- |",
    `| NovaSeedNFT | ${recap.contracts.novaSeed} |`,
    `| Risk Oracle | ${recap.contracts.riskOracle} |`,
    `| Bonding Curve Exchange | ${recap.contracts.markExchange} |`,
    `| Sovereign Vault | ${recap.contracts.sovereignVault} |`,
  ].join("\n");

  const validatorList = recap.validators.members
    .map((member, index) => `| ${index + 1} | ${member} |`)
    .join("\n");

  const validatorTable = [
    "| # | Validator Address |",
    "| --- | --- |",
    validatorList,
    `| ✅ Consensus | ${recap.validators.approvalCount}/${recap.validators.approvalThreshold} approvals |`,
  ]
    .filter(Boolean)
    .join("\n");

  const participantsTable = [
    "| Investor | SeedShares | Contribution | Raw Wei |",
    "| --- | ---: | ---: | --- |",
    ...recap.participants.map((participant) => {
      const contribution = formatWei(participant.contributionWei, currencyLabel);
      return `| ${participant.address} | ${participant.tokens} | ${contribution} | ${participant.contributionWei} |`;
    }),
  ].join("\n");

  const vaultTable = [
    "| Field | Value |",
    "| --- | --- |",
    `| Manifest URI | ${recap.launch.sovereignVault.manifestUri} |`,
    `| Vault balance | ${formatWei(recap.launch.sovereignVault.vaultBalanceWei, currencyLabel)} |`,
    `| Total received | ${formatWei(recap.launch.sovereignVault.totalReceivedWei, currencyLabel)} |`,
    `| Last acknowledged amount | ${formatWei(recap.launch.sovereignVault.lastAcknowledgedAmountWei, currencyLabel)} |`,
    `| Launch metadata | ${recap.launch.sovereignVault.decodedMetadata} |`,
  ].join("\n");

  const markdown = `# α-AGI MARK Power Dossier\n\n` +
    `> Non-technical operators receive a sovereign-grade audit trail rendered directly from the AGI Jobs v0 (v2) run.` +
    ` The dossier fuses cryptoeconomic telemetry, validator consensus, and owner controls into a single launch brief.\n\n` +
    `## Hypergraph Overview\n\n${mermaidDiagram}\n\n` +
    `## System Snapshot\n\n${contractTable}\n\n` +
    `## Owner Command Matrix\n\n${ownerControlsTable}\n\n` +
    `## Validator Council Ledger\n\n${validatorTable}\n\n` +
    `## Participant Capitalization\n\n${participantsTable}\n\n` +
    `## Sovereign Vault State\n\n${vaultTable}\n\n` +
    `### Launch Verdict\n\n` +
    `- Finalized: ${recap.launch.finalized ? "✅" : "❌"}\n` +
    `- Aborted: ${
      recap.launch.aborted
        ? "⚠️ Abort triggered — review emergency exit timeline."
        : "✅ No abort triggered (flag=false confirms sovereign ascent succeeded)."
    }\n` +
    `- Treasury receiving address: ${recap.launch.treasury}\n` +
    `- Sovereign vault manifest confirms ignition metadata: “${recap.launch.sovereignVault.decodedMetadata}”\n` +
    `- Bonding curve supply closed at ${recap.bondingCurve.supplyWholeTokens} SeedShares with next price ` +
    `${formatWei(recap.bondingCurve.nextPriceWei, currencyLabel)}.\n\n` +
    `AGI Jobs v0 (v2) transforms the on-chain market choreography into a narrated briefing so the operator can execute ` +
    `audits, investor updates, or regulatory submissions without touching Solidity or CLI minutiae.\n`;

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(MARKDOWN_PATH, markdown, "utf8");

  console.log(`📄 Rendered α-AGI MARK dossier to ${MARKDOWN_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
