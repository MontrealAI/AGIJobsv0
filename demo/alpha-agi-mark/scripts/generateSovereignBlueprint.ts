import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { formatEther } from "ethers";
import { z } from "zod";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const RECAP_PATH = path.join(REPORT_DIR, "alpha-mark-recap.json");
const BLUEPRINT_PATH = path.join(REPORT_DIR, "alpha-mark-blueprint.md");

const WHOLE_TOKEN = 10n ** 18n;

const participantSchema = z
  .object({
    address: z.string(),
    tokens: z.string(),
    tokensWei: z.string(),
    contributionWei: z.string(),
    contributionEth: z.string().optional(),
  })
  .passthrough();

const tradeSchema = z
  .object({
    kind: z.enum(["BUY", "SELL"]),
    actor: z.string(),
    label: z.string(),
    tokensWhole: z.string(),
    valueWei: z.string(),
    valueEth: z.string().optional(),
  })
  .passthrough();

const ownerParameterSchema = z.object({
  parameter: z.string(),
  value: z.unknown(),
  description: z.string(),
});

const timelineEntrySchema = z
  .object({
    order: z.number().int(),
    phase: z.string(),
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
    actor: z.string().optional(),
    actorLabel: z.string().optional(),
  })
  .passthrough();

const recapSchema = z
  .object({
    generatedAt: z.string(),
    network: z
      .object({
        label: z.string(),
        name: z.string(),
        chainId: z.string(),
        dryRun: z.boolean(),
      })
      .passthrough(),
    orchestrator: z
      .object({
        commit: z.string().optional(),
        branch: z.string().optional(),
        mode: z.enum(["dry-run", "broadcast"]),
      })
      .passthrough(),
    actors: z.object({
      owner: z.string(),
      investors: z.array(z.string()).min(3),
      validators: z.array(z.string()).min(3),
    }),
    contracts: z.object({
      novaSeed: z.string(),
      riskOracle: z.string(),
      markExchange: z.string(),
      sovereignVault: z.string(),
    }),
    bondingCurve: z
      .object({
        supplyWholeTokens: z.string(),
        reserveWei: z.string(),
        nextPriceWei: z.string(),
        basePriceWei: z.string(),
        slopeWei: z.string(),
        reserveEth: z.string().optional(),
        nextPriceEth: z.string().optional(),
        basePriceEth: z.string().optional(),
        slopeEth: z.string().optional(),
      })
      .passthrough(),
    ownerControls: z
      .object({
        paused: z.boolean(),
        whitelistEnabled: z.boolean(),
        emergencyExitEnabled: z.boolean(),
        finalized: z.boolean(),
        aborted: z.boolean(),
        validationOverrideEnabled: z.boolean(),
        validationOverrideStatus: z.boolean(),
        treasury: z.string(),
        riskOracle: z.string(),
        baseAsset: z.string(),
        usesNativeAsset: z.boolean(),
        fundingCapWei: z.string(),
        fundingCapEth: z.string().optional(),
        maxSupplyWholeTokens: z.string(),
        saleDeadlineTimestamp: z.string(),
        basePriceWei: z.string(),
        basePriceEth: z.string().optional(),
        slopeWei: z.string(),
        slopeEth: z.string().optional(),
      })
      .passthrough(),
    ownerParameterMatrix: z.array(ownerParameterSchema).nonempty(),
    participants: z.array(participantSchema).nonempty(),
    trades: z.array(tradeSchema).nonempty(),
    validators: z
      .object({
        approvalCount: z.string(),
        approvalThreshold: z.string(),
        members: z.array(z.string()),
        matrix: z.array(z.object({ address: z.string(), approved: z.boolean() })),
      })
      .passthrough()
      .optional(),
    launch: z
      .object({
        finalized: z.boolean(),
        aborted: z.boolean(),
        treasury: z.string(),
        sovereignVault: z
          .object({
            manifestUri: z.string(),
            totalReceivedWei: z.string(),
            totalReceivedEth: z.string().optional(),
            lastAcknowledgedAmountWei: z.string(),
            lastAcknowledgedAmountEth: z.string().optional(),
            decodedMetadata: z.string().optional(),
            vaultBalanceWei: z.string().optional(),
            vaultBalanceEth: z.string().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    verification: z
      .object({
        supplyConsensus: z.object({ consistent: z.boolean() }).passthrough(),
        pricing: z.object({ consistent: z.boolean() }).passthrough(),
        capitalFlows: z.object({ consistent: z.boolean() }).passthrough(),
        contributions: z.object({ consistent: z.boolean() }).passthrough(),
      })
      .optional(),
    timeline: z.array(timelineEntrySchema).optional(),
    checksums: z
      .object({
        algorithm: z.string(),
        canonicalEncoding: z.string(),
        recapSha256: z.string(),
      })
      .optional(),
  })
  .passthrough();

type Recap = z.infer<typeof recapSchema>;

type Check = {
  label: string;
  ok: boolean;
  expected?: string;
  observed?: string;
};

function parseBigInt(label: string, value: string): bigint {
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Failed to parse ${label} as bigint (value: ${value})`);
  }
}

function shorten(address: string): string {
  if (!address) return address;
  return address.length <= 10 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function sanitizeMermaid(value: string): string {
  return value.replace(/`/g, "'").replace(/\\/g, "\\\\").replace(/\r?\n/g, " ").replace(/:/g, "\\:");
}

function renderFlowMermaid(recap: Recap): string {
  const owner = shorten(recap.actors.owner);
  const seed = shorten(recap.contracts.novaSeed);
  const oracle = shorten(recap.contracts.riskOracle);
  const exchange = shorten(recap.contracts.markExchange);
  const vault = shorten(recap.contracts.sovereignVault);

  return [
    "flowchart TD",
    `  Operator((Operator ${owner})) -->|Mint| NovaSeed[NovaSeedNFT\\n${seed}]`,
    "  NovaSeed -->|Validation Request| Oracle[AlphaMarkRiskOracle\\n" + oracle + "]",
    "  NovaSeed -->|Financing| Exchange[AlphaMarkEToken\\n" + exchange + "]",
    "  Investors((SeedShare Contributors)) -->|Bonding Curve| Exchange",
    "  Oracle -->|Quorum| Exchange",
    "  Exchange -->|Reserve Dispatch| Vault[AlphaSovereignVault\\n" + vault + "]",
    "  Exchange -->|Owner Controls| ControlDeck{{Owner Command Deck}}",
    "  ControlDeck --> Exchange",
    "  Vault -->|Ignition Metadata| Sovereign[[α-AGI Sovereign]]",
  ].join("\n");
}

function renderSequenceMermaid(recap: Recap, ledgerNet: bigint): string {
  const reserveEth = formatEther(parseBigInt("reserve", recap.bondingCurve.reserveWei));
  const vaultEth = formatEther(parseBigInt("vault receipts", recap.launch.sovereignVault.totalReceivedWei));
  const totalEth = formatEther(ledgerNet);

  return [
    "sequenceDiagram",
    "  autonumber",
    "  participant O as Operator",
    "  participant NE as NovaSeedNFT",
    "  participant RO as RiskOracle",
    "  participant EX as BondingCurve",
    "  participant SV as SovereignVault",
    "  O->>NE: Mint Nova-Seed",
    "  O->>RO: Install validator quorum",
    "  O->>EX: Configure bonding curve & controls",
    "  loop Market Lifecycle",
    "    Investors->>EX: Buy/Sell SeedShares",
    "    EX-->>Investors: Dynamic pricing curve",
    "    RO-->>EX: Approval heartbeat",
    "  end",
    `  EX->>SV: finalizeLaunch() transfers ${vaultEth} ETH`,
    "  SV-->>EX: notifyLaunch acknowledgement",
    `  EX-->>O: Reserve left on exchange ${reserveEth} ETH`,
    `  SV-->>O: Total reconciled capital ${totalEth} ETH`,
  ].join("\n");
}

function renderOwnerMatrixTable(recap: Recap): string {
  const header = "| Parameter | Value | Description |\n|:---------|:------|:------------|";
  const rows = recap.ownerParameterMatrix
    .map((item) => {
      let value: string;
      if (typeof item.value === "boolean") {
        value = item.value ? "✅ Enabled" : "⛔ Disabled";
      } else if (item.value && typeof item.value === "object") {
        value = "```json\n" + JSON.stringify(item.value, null, 2) + "\n```";
      } else {
        value = String(item.value ?? "—");
      }
      return `| ${item.parameter} | ${value} | ${item.description} |`;
    })
    .join("\n");
  return `${header}\n${rows}`;
}

function renderParticipantTable(recap: Recap): string {
  const header = "| Address | Tokens | Contribution (wei) | Contribution (ETH) |\n|:--------|------:|-------------------:|--------------------:|";
  const rows = recap.participants
    .map((participant) => {
      const eth =
        participant.contributionEth ?? formatEther(parseBigInt("contribution", participant.contributionWei));
      return `| ${shorten(participant.address)} | ${participant.tokens} | ${participant.contributionWei} | ${eth} |`;
    })
    .join("\n");
  return `${header}\n${rows}`;
}

function renderValidatorTable(recap: Recap): string | undefined {
  if (!recap.validators) return undefined;
  const header = "| Validator | Approved |\n|:---------|:--------:|";
  const rows = recap.validators.matrix
    .map((entry) => `| ${shorten(entry.address)} | ${entry.approved ? "✅" : "⌛"} |`)
    .join("\n");
  return `${header}\n${rows}`;
}

function renderTimeline(recap: Recap): string | undefined {
  if (!recap.timeline || recap.timeline.length === 0) return undefined;
  const header = "| # | Phase | Event | Details |\n|:-:|:------|:------|:--------|";
  const rows = recap.timeline
    .map((entry) => {
      const icon = entry.icon ? `${entry.icon} ` : "";
      return `| ${entry.order} | ${entry.phase} | ${icon}${entry.title} | ${entry.description} |`;
    })
    .join("\n");
  const mermaid = ["timeline", "    title Mission Arc"];
  let currentPhase: string | undefined;
  for (const entry of recap.timeline) {
    if (currentPhase !== entry.phase) {
      mermaid.push(`    section ${sanitizeMermaid(entry.phase)}`);
      currentPhase = entry.phase;
    }
    const actor = entry.actorLabel || (entry.actor ? shorten(entry.actor) : undefined);
    const title = `${entry.icon ? entry.icon + " " : ""}${entry.title}${actor ? ` (${actor})` : ""}`;
    mermaid.push(`      ${sanitizeMermaid(title)} : ${sanitizeMermaid(entry.description)}`);
  }
  return "```mermaid\n" + mermaid.join("\n") + "\n```\n\n" + `${header}\n${rows}`;
}

function buildChecks(recap: Recap) {
  const checks: Check[] = [];

  const supply = parseBigInt("supply", recap.bondingCurve.supplyWholeTokens);
  const reserve = parseBigInt("reserve", recap.bondingCurve.reserveWei);
  const vaultReceived = parseBigInt("vault receipts", recap.launch.sovereignVault.totalReceivedWei);

  let ledgerSupply = 0n;
  let ledgerGross = 0n;
  let ledgerRedemptions = 0n;
  recap.trades.forEach((trade, index) => {
    const tokens = parseBigInt(`trade[${index}] tokens`, trade.tokensWhole);
    const value = parseBigInt(`trade[${index}] value`, trade.valueWei);
    if (trade.kind === "BUY") {
      ledgerSupply += tokens;
      ledgerGross += value;
    } else {
      ledgerSupply -= tokens;
      ledgerRedemptions += value;
    }
  });

  const ledgerNet = ledgerGross - ledgerRedemptions;
  const participantTokenWeiSum = recap.participants.reduce((acc, participant) => {
    return acc + parseBigInt(`participant ${participant.address} tokensWei`, participant.tokensWei);
  }, 0n);
  const participantContributionSum = recap.participants.reduce((acc, participant) => {
    return acc + parseBigInt(`participant ${participant.address} contribution`, participant.contributionWei);
  }, 0n);

  checks.push({
    label: "Ledger supply equals bonding curve supply",
    ok: ledgerSupply === supply,
    expected: supply.toString(),
    observed: ledgerSupply.toString(),
  });

  checks.push({
    label: "Participant balances equal total supply",
    ok: participantTokenWeiSum === supply * WHOLE_TOKEN,
    expected: (supply * WHOLE_TOKEN).toString(),
    observed: participantTokenWeiSum.toString(),
  });

  checks.push({
    label: "Vault receipts + reserve equal ledger net",
    ok: vaultReceived + reserve === ledgerNet,
    expected: (vaultReceived + reserve).toString(),
    observed: ledgerNet.toString(),
  });

  checks.push({
    label: "Participant contributions equal ledger gross",
    ok: participantContributionSum === ledgerGross,
    expected: participantContributionSum.toString(),
    observed: ledgerGross.toString(),
  });

  checks.push({
    label: "Treasury matches owner control snapshot",
    ok: recap.launch.treasury === recap.ownerControls.treasury,
    expected: recap.ownerControls.treasury,
    observed: recap.launch.treasury,
  });

  checks.push({
    label: "Risk oracle address aligns with owner control",
    ok: recap.ownerControls.riskOracle === recap.contracts.riskOracle,
    expected: recap.contracts.riskOracle,
    observed: recap.ownerControls.riskOracle,
  });

  return { checks, ledgerNet };
}

async function main() {
  const raw = await readFile(RECAP_PATH, "utf8");
  const recap = recapSchema.parse(JSON.parse(raw));

  const { checks, ledgerNet } = buildChecks(recap);
  const failedCheck = checks.find((check) => !check.ok);
  if (failedCheck) {
    throw new Error(
      `Blueprint verification failed: ${failedCheck.label} (expected ${failedCheck.expected}, observed ${failedCheck.observed})`,
    );
  }

  const flowMermaid = renderFlowMermaid(recap);
  const sequenceMermaid = renderSequenceMermaid(recap, ledgerNet);
  const ownerMatrixTable = renderOwnerMatrixTable(recap);
  const participantTable = renderParticipantTable(recap);
  const validatorTable = renderValidatorTable(recap);
  const timelineSection = renderTimeline(recap);

  const generatedAt = new Date(recap.generatedAt).toISOString();
  const checksumSection = recap.checksums
    ? `- **Checksum (${recap.checksums.algorithm}):** \`${recap.checksums.recapSha256}\`\n`
    : "";

  const verificationSummary = recap.verification
    ? `- Supply consensus: **${recap.verification.supplyConsensus.consistent ? "✅" : "⚠️"}**\n` +
      `- Pricing parity: **${recap.verification.pricing.consistent ? "✅" : "⚠️"}**\n` +
      `- Capital flows: **${recap.verification.capitalFlows.consistent ? "✅" : "⚠️"}**\n` +
      `- Contribution ledger: **${recap.verification.contributions.consistent ? "✅" : "⚠️"}**\n`
    : "- Verification matrix not present – run `npm run verify:alpha-agi-mark`.\n";

  const markdownParts: string[] = [];
  markdownParts.push(`# α-AGI MARK Sovereign Blueprint\n`);
  markdownParts.push(
    `Generated ${generatedAt} on **${recap.network.label}** (mode: ${recap.orchestrator.mode}).\\\n` +
      `Owner: \`${recap.actors.owner}\`\\\n` +
      `Contracts: NovaSeed \`${recap.contracts.novaSeed}\`, RiskOracle \`${recap.contracts.riskOracle}\`, ` +
      `Exchange \`${recap.contracts.markExchange}\`, SovereignVault \`${recap.contracts.sovereignVault}\`.\n` +
      checksumSection,
  );

  markdownParts.push("## 1. Systems Constellation\n");
  markdownParts.push("```mermaid\n" + flowMermaid + "\n```\n");

  markdownParts.push("## 2. Launch Sequence Chronicle\n");
  markdownParts.push("```mermaid\n" + sequenceMermaid + "\n```\n");

  markdownParts.push("## 3. Owner Command Lattice\n");
  markdownParts.push(ownerMatrixTable + "\n");

  markdownParts.push("## 4. Participant Ledger\n");
  markdownParts.push(participantTable + "\n");

  if (validatorTable) {
    markdownParts.push("## 5. Validator Council Snapshot\n");
    markdownParts.push(validatorTable + "\n");
  }

  markdownParts.push("## 6. Verification Triad\n");
  markdownParts.push(verificationSummary);

  markdownParts.push("## 7. Deterministic Cross-Checks\n");
  markdownParts.push(
    checks
      .map((check) => `- **${check.label}:** ${check.ok ? "✅" : "❌"} (${check.expected ?? ""})`)
      .join("\n") + "\n",
  );

  if (timelineSection) {
    markdownParts.push("## 8. Mission Timeline\n");
    markdownParts.push(timelineSection + "\n");
  }

  markdownParts.push(
    "> **Operator Tip:** Pair this blueprint with the `npm run console:alpha-agi-mark -- --snapshot` command to brief " +
      "stakeholders using both textual and cinematic artefacts without leaving the terminal.\n",
  );

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(BLUEPRINT_PATH, markdownParts.join("\n"), "utf8");

  console.log(`Sovereign blueprint written to ${BLUEPRINT_PATH}`);
}

main().catch((error) => {
  console.error("Failed to generate sovereign blueprint:", error);
  process.exitCode = 1;
});

