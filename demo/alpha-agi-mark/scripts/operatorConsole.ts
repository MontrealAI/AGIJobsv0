import { readFile } from "fs/promises";
import path from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { formatEther } from "ethers";
import { z } from "zod";

const DEFAULT_RECAP_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");

const timelineEntrySchema = z
  .object({
    phase: z.string(),
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
    actor: z.string().optional(),
    actorLabel: z.string().optional(),
  })
  .passthrough();

const ownerMatrixSchema = z
  .object({
    parameter: z.string(),
    value: z.any().optional(),
    description: z.string().optional(),
  })
  .passthrough();

const participantSchema = z
  .object({
    address: z.string(),
    tokens: z.string(),
    tokensWei: z.string(),
    contributionWei: z.string(),
    contributionEth: z.string().optional(),
  })
  .passthrough();

const verificationSchema = z
  .object({
    supplyConsensus: z
      .object({
        consistent: z.boolean(),
      })
      .passthrough(),
    pricing: z
      .object({
        consistent: z.boolean(),
      })
      .passthrough(),
    capitalFlows: z
      .object({
        consistent: z.boolean(),
        ledgerGrossWei: z.string(),
        ledgerRedemptionsWei: z.string(),
        ledgerNetWei: z.string(),
        vaultReceivedWei: z.string(),
      })
      .passthrough(),
    contributions: z
      .object({
        consistent: z.boolean(),
        participantAggregateWei: z.string(),
      })
      .passthrough(),
  })
  .partial();

const recapSchema = z
  .object({
    generatedAt: z.string(),
    network: z
      .object({
        label: z.string(),
        name: z.string(),
        chainId: z.string(),
        blockNumber: z.string(),
        dryRun: z.boolean(),
      })
      .passthrough(),
    orchestrator: z
      .object({
        commit: z.string().optional(),
        branch: z.string().optional(),
        mode: z.string().optional(),
      })
      .passthrough(),
    actors: z
      .object({
        owner: z.string(),
        investors: z.array(z.string()).min(1),
        validators: z.array(z.string()).min(1),
      })
      .passthrough(),
    contracts: z
      .object({
        novaSeed: z.string(),
        riskOracle: z.string(),
        markExchange: z.string(),
        sovereignVault: z.string(),
      })
      .passthrough(),
    seed: z
      .object({
        tokenId: z.string(),
        holder: z.string(),
      })
      .partial()
      .optional(),
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
        maxSupplyWholeTokens: z.string(),
        basePriceWei: z.string(),
        slopeWei: z.string(),
      })
      .passthrough(),
    ownerParameterMatrix: z.array(ownerMatrixSchema).optional(),
    participants: z.array(participantSchema).optional(),
    validators: z
      .object({
        approvalCount: z.string(),
        approvalThreshold: z.string(),
        members: z.array(z.string()),
        matrix: z
          .array(
            z
              .object({
                address: z.string(),
                approved: z.boolean(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .partial()
      .optional(),
    bondingCurve: z
      .object({
        supplyWholeTokens: z.string(),
        reserveWei: z.string(),
        nextPriceWei: z.string(),
        basePriceWei: z.string(),
        slopeWei: z.string(),
      })
      .passthrough()
      .optional(),
    launch: z
      .object({
        finalized: z.boolean(),
        aborted: z.boolean(),
        treasury: z.string().optional(),
        sovereignVault: z
          .object({
            manifestUri: z.string().optional(),
            totalReceivedWei: z.string().optional(),
            totalReceivedNativeWei: z.string().optional(),
            totalReceivedExternalWei: z.string().optional(),
            lastAcknowledgedAmountWei: z.string().optional(),
            decodedMetadata: z.string().optional(),
            totalReceivedEth: z.string().optional(),
            totalReceivedNativeEth: z.string().optional(),
            totalReceivedExternalEth: z.string().optional(),
            lastAcknowledgedUsedNative: z.boolean().optional(),
          })
          .passthrough()
          .optional(),
      })
      .optional(),
    verification: verificationSchema.optional(),
    timeline: z.array(timelineEntrySchema).optional(),
    trades: z.array(z.any()).optional(),
  })
  .passthrough();

type Recap = z.infer<typeof recapSchema>;

interface Options {
  recapPath: string;
  snapshot: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  let recapPath = DEFAULT_RECAP_PATH;
  let snapshot = false;

  for (const arg of args) {
    if (arg === "--snapshot" || arg === "--non-interactive") {
      snapshot = true;
    } else if (arg.startsWith("--recap=")) {
      recapPath = path.resolve(arg.split("=", 2)[1]);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!input.isTTY || !output.isTTY) {
    snapshot = true;
  }

  return { recapPath, snapshot };
}

function printHelp() {
  console.log(`α-AGI MARK Operator Console\n\n` +
    `Usage: npm run console:alpha-agi-mark [-- --snapshot] [-- --recap=path]\n\n` +
    `Options:\n` +
    `  --snapshot       Print a non-interactive mission brief. Automatically enabled in non-TTY environments.\n` +
    `  --recap=<path>   Override the recap dossier path (defaults to reports/alpha-mark-recap.json).\n`);
}

function colour(text: string, code: string): string {
  return `\u001b[${code}m${text}\u001b[0m`;
}

const styles = {
  heading: (text: string) => colour(text, "1;38;2;96;255;207"),
  subheading: (text: string) => colour(text, "1;38;2;157;123;255"),
  accent: (text: string) => colour(text, "38;2;224;245;255"),
  muted: (text: string) => colour(text, "2;38;2;180;200;215"),
  success: (text: string) => colour(text, "1;38;2;110;255;180"),
  info: (text: string) => colour(text, "1;38;2;130;200;255"),
  warning: (text: string) => colour(text, "1;38;2;255;210;110"),
  danger: (text: string) => colour(text, "1;38;2;255;120;120"),
};

function divider(label?: string): void {
  const line = "═".repeat(60);
  if (!label) {
    console.log(styles.muted(line));
    return;
  }
  const padded = ` ${label} `;
  const remaining = Math.max(0, line.length - padded.length);
  const prefix = "═".repeat(Math.floor(remaining / 2));
  const suffix = "═".repeat(remaining - prefix.length);
  console.log(styles.muted(`${prefix}${padded}${suffix}`));
}

function formatAddress(address?: string): string {
  if (!address) return "n/a";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function renderKeyValues(pairs: Array<[string, string]>): void {
  const width = Math.max(...pairs.map(([label]) => label.length)) + 2;
  pairs.forEach(([label, value]) => {
    console.log(`  ${styles.accent(label.padEnd(width))}${value}`);
  });
}

function boolBadge(value: boolean, labelTrue = "ON", labelFalse = "OFF"): string {
  return value
    ? styles.success(`● ${labelTrue}`)
    : styles.muted(`○ ${labelFalse}`);
}

function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return styles.muted("  (no records)");
  }

  const cleanRows = rows.map((row) => row.map((cell) => cell ?? ""));
  const widths = headers.map((header, columnIndex) => {
    return Math.max(
      header.length,
      ...cleanRows.map((row) => plainLength(row[columnIndex])),
    );
  });

  const border = (left: string, fill: string, middle: string, right: string) =>
    `${left}${widths.map((w) => fill.repeat(w + 2)).join(middle)}${right}`;

  const padCell = (value: string, width: number) => {
    const rawLength = plainLength(value);
    if (rawLength > width) {
      return truncatePlain(value, width);
    }
    return value + " ".repeat(width - rawLength);
  };

  const headerRow = `│ ${headers
    .map((header, index) => padCell(header, widths[index]))
    .join(" │ ")} │`;

  const rowStrings = cleanRows.map(
    (row) =>
      `│ ${row
        .map((cell, index) => padCell(cell, widths[index]))
        .join(" │ ")} │`,
  );

  return [
    border("┌", "─", "┬", "┐"),
    headerRow,
    border("├", "─", "┼", "┤"),
    ...rowStrings,
    border("└", "─", "┴", "┘"),
  ].join("\n");
}

function plainLength(value: string): number {
  return value.replace(/\u001b\[[0-9;]*m/g, "").length;
}

function truncatePlain(value: string, width: number): string {
  const raw = value.replace(/\u001b\[[0-9;]*m/g, "");
  if (raw.length <= width) {
    return value;
  }
  const truncated = raw.slice(0, Math.max(0, width - 1)) + "…";
  return truncated;
}

function weiToEth(wei?: string): string {
  if (!wei) return "0";
  try {
    return formatEther(BigInt(wei));
  } catch {
    return "0";
  }
}

function renderSummary(recap: Recap): void {
  console.log(styles.heading("MISSION SUMMARY"));
  divider();

  const launchStatus = recap.launch?.finalized
    ? styles.success("Finalized")
    : recap.launch?.aborted
      ? styles.danger("Aborted")
      : styles.warning("Pending");

  const treasury = recap.launch?.treasury ?? recap.ownerControls.treasury;
  const sovereign = recap.launch?.sovereignVault;

  renderKeyValues([
    ["Generated", recap.generatedAt],
    ["Network", `${recap.network.label}`],
    ["Dry run", recap.network.dryRun ? styles.success("yes") : styles.warning("no")],
    ["Orchestrator", `${recap.orchestrator.branch ?? "n/a"} @ ${recap.orchestrator.commit ?? "HEAD"}`],
    ["Launch status", launchStatus],
    ["Treasury", formatAddress(treasury)],
    [
      "Vault intake",
      sovereign?.totalReceivedWei
        ? `${weiToEth(sovereign.totalReceivedWei)} units (native ${weiToEth(
            sovereign.totalReceivedNativeWei,
          )} | external ${weiToEth(sovereign.totalReceivedExternalWei)})`
        : "—",
    ],
    [
      "Ignition mode",
      sovereign?.lastAcknowledgedUsedNative === undefined
        ? "—"
        : sovereign.lastAcknowledgedUsedNative
          ? styles.success("Native asset")
          : styles.info("External asset"),
    ],
    ["Seed holder", formatAddress(recap.seed?.holder ?? recap.actors.owner)],
    ["Supply", recap.bondingCurve?.supplyWholeTokens ?? "n/a"],
  ]);

  if (sovereign?.decodedMetadata) {
    console.log(`\n  ${styles.subheading("Sovereign ignition")}`);
    console.log(`    ${sovereign.decodedMetadata}`);
  }
}

function renderOwnerDeck(recap: Recap): void {
  console.log(`\n${styles.heading("OWNER COMMAND DECK")}`);
  divider();

  renderKeyValues([
    ["Paused", boolBadge(recap.ownerControls.paused)],
    ["Whitelist", boolBadge(recap.ownerControls.whitelistEnabled)],
    ["Emergency exit", boolBadge(recap.ownerControls.emergencyExitEnabled)],
    ["Validation override", boolBadge(recap.ownerControls.validationOverrideEnabled, "ACTIVE", "Dormant")],
    ["Override status", recap.ownerControls.validationOverrideStatus ? styles.warning("Forced GREEN") : styles.muted("Oracle governed")],
    ["Base asset", recap.ownerControls.usesNativeAsset ? "ETH" : formatAddress(recap.ownerControls.baseAsset)],
    ["Funding cap", `${weiToEth(recap.ownerControls.fundingCapWei)} ETH`],
    ["Max supply", recap.ownerControls.maxSupplyWholeTokens],
    ["Base price", `${weiToEth(recap.ownerControls.basePriceWei)} ETH`],
    ["Slope", `${weiToEth(recap.ownerControls.slopeWei)} ETH`],
  ]);

  if (recap.ownerParameterMatrix && recap.ownerParameterMatrix.length > 0) {
    console.log(`\n${styles.subheading("Parameter matrix")}`);
    const rows = recap.ownerParameterMatrix.map((entry) => {
      const value = formatMatrixValue(entry.value);
      return [entry.parameter, value, entry.description ?? ""];
    });
    console.log(formatTable(["Parameter", "Value", "Description"], rows));
  }
}

function formatMatrixValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatMatrixValue(item)).join(", ")}]`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "{…}";
    }
  }
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value);
}

function renderParticipants(recap: Recap): void {
  console.log(`\n${styles.heading("PARTICIPANT LEDGER")}`);
  divider();

  const participants = recap.participants ?? [];
  const rows = participants.map((participant) => [
    formatAddress(participant.address),
    `${participant.tokens}`,
    `${weiToEth(participant.contributionWei)} ETH`,
  ]);
  console.log(formatTable(["Address", "SeedShares", "Contribution"], rows));
}

function renderValidators(recap: Recap): void {
  console.log(`\n${styles.heading("VALIDATOR COUNCIL")}`);
  divider();

  if (!recap.validators) {
    console.log(styles.muted("  No validator data recorded."));
    return;
  }

  renderKeyValues([
    ["Approvals", `${recap.validators.approvalCount ?? "0"}/${recap.validators.approvalThreshold ?? "?"}`],
  ]);

  if (recap.validators.matrix && recap.validators.matrix.length > 0) {
    const rows = recap.validators.matrix.map((entry, index) => [
      `${index + 1}`,
      formatAddress(entry.address),
      entry.approved ? "🟢 Approved" : "⚪ Pending",
    ]);
    console.log("\n" + formatTable(["#", "Validator", "Status"], rows));
  } else if (recap.validators.members) {
    const rows = recap.validators.members.map((member, index) => [
      `${index + 1}`,
      formatAddress(member),
    ]);
    console.log("\n" + formatTable(["#", "Validator"], rows));
  }
}

function renderVerification(recap: Recap): void {
  console.log(`\n${styles.heading("TRIPLE-VERIFICATION MATRIX")}`);
  divider();

  const verification = recap.verification;
  if (!verification) {
    console.log(styles.warning("  Verification artefacts unavailable. Re-run npm run verify:alpha-agi-mark."));
    return;
  }

  const checks = [
    { label: "Supply consensus", consistent: verification.supplyConsensus?.consistent ?? false },
    { label: "Pricing parity", consistent: verification.pricing?.consistent ?? false },
    { label: "Capital flows", consistent: verification.capitalFlows?.consistent ?? false },
    { label: "Contribution totals", consistent: verification.contributions?.consistent ?? false },
  ];

  const total = checks.length;
  const passing = checks.filter((check) => check.consistent).length;
  const confidence = Math.round((passing / total) * 100);

  console.log(`  Confidence index: ${
    passing === total ? styles.success(`${confidence}%`) : styles.warning(`${confidence}%`)
  }`);

  console.log();
  checks.forEach((check) => {
    const badge = check.consistent ? styles.success("✅") : styles.danger("⚠️");
    console.log(`  ${badge} ${check.label}`);
  });

  if (verification.capitalFlows) {
    console.log("\n  Capital summary:");
    renderKeyValues([
      ["Gross inflows", `${weiToEth(verification.capitalFlows.ledgerGrossWei)} ETH`],
      ["Redemptions", `${weiToEth(verification.capitalFlows.ledgerRedemptionsWei)} ETH`],
      ["Net reserve", `${weiToEth(verification.capitalFlows.ledgerNetWei)} ETH`],
      ["Vault received", `${weiToEth(verification.capitalFlows.vaultReceivedWei)} ETH`],
    ]);
  }
}

function renderTimeline(recap: Recap): void {
  console.log(`\n${styles.heading("MISSION TIMELINE")}`);
  divider();

  const timeline = recap.timeline ?? [];
  if (timeline.length === 0) {
    console.log(styles.muted("  Timeline data unavailable. Regenerate with npm run timeline:alpha-agi-mark."));
    return;
  }

  timeline.slice(0, 8).forEach((entry, index) => {
    const icon = entry.icon ?? "•";
    console.log(`  ${styles.accent(`${index + 1}. ${icon} ${entry.title}`)}`);
    console.log(`     ${entry.phase} – ${entry.description}`);
    if (entry.actorLabel || entry.actor) {
      console.log(`     Actor: ${entry.actorLabel ?? formatAddress(entry.actor!)}`);
    }
  });

  if (timeline.length > 8) {
    console.log(`\n  ${styles.muted(`… ${timeline.length - 8} additional events available in the timeline dossier.`)}`);
  }
}

function renderMermaid(recap: Recap): void {
  console.log(`\n${styles.heading("DYNAMIC MERMAID BLUEPRINT")}`);
  divider();

  const owner = formatAddress(recap.actors.owner);
  const investors = (recap.actors.investors ?? []).map(formatAddress).slice(0, 3);
  const validators = (recap.validators?.members ?? []).map(formatAddress);
  const mermaid = [
    "```mermaid",
    "flowchart TD",
    "    classDef operator fill:#0d2818,stroke:#60ffcf,color:#f1fff8,stroke-width:2px;",
    "    classDef contract fill:#101546,stroke:#60ffcf,color:#f6faff,stroke-width:2px;",
    "    classDef council fill:#2f2445,stroke:#9d7bff,color:#f6f0ff;",
    "    classDef investor fill:#162b24,stroke:#6dffd6,color:#f1fffb;",
    `    Operator{{${owner}}}:::operator --> SeedNFT[NovaSeedNFT\\n${formatAddress(recap.contracts.novaSeed)}]:::contract`,
    `    Operator --> Oracle[Risk Oracle\\n${formatAddress(recap.contracts.riskOracle)}]:::contract`,
    `    Operator --> Exchange[Bonding Curve\\n${formatAddress(recap.contracts.markExchange)}]:::contract`,
    `    Exchange --> Vault[α-AGI Sovereign Vault\\n${formatAddress(recap.contracts.sovereignVault)}]:::contract`,
    `    SeedNFT --> Exchange`,
    `    Oracle --> Exchange`,
  ];

  investors.forEach((investor, index) => {
    mermaid.push(`    Investor${index + 1}[Investor ${index + 1}\\n${investor}]:::investor --> Exchange`);
  });

  validators.forEach((validator, index) => {
    mermaid.push(`    Council${index + 1}[Validator ${index + 1}\\n${validator}]:::council --> Oracle`);
  });

  mermaid.push("    Exchange -->|Ignition| Vault");
  mermaid.push("```\n");

  console.log(mermaid.join("\n"));
}

async function loadRecap(recapPath: string): Promise<Recap> {
  let raw: string;
  try {
    raw = await readFile(recapPath, "utf8");
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    throw new Error(
      `Unable to read recap dossier at ${recapPath}. Run npm run demo:alpha-agi-mark first.\n${message}`,
    );
  }

  try {
    const parsed = JSON.parse(raw);
    return recapSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Recap dossier schema mismatch: ${error.message}`);
    }
    throw new Error(`Unable to parse recap dossier: ${(error as Error).message ?? error}`);
  }
}

async function interactiveLoop(recap: Recap): Promise<void> {
  console.log(styles.heading("α-AGI MARK Operator Console"));
  console.log(styles.muted("Press the number of a panel to explore it. Type 0 to exit."));

  const rl = createInterface({ input, output });

  const actions: Array<{ key: string; description: string; run: () => void }> = [
    { key: "1", description: "Mission summary", run: () => renderSummary(recap) },
    { key: "2", description: "Owner command deck", run: () => renderOwnerDeck(recap) },
    { key: "3", description: "Participant ledger", run: () => renderParticipants(recap) },
    { key: "4", description: "Validator council", run: () => renderValidators(recap) },
    { key: "5", description: "Triple-verification matrix", run: () => renderVerification(recap) },
    { key: "6", description: "Mission timeline", run: () => renderTimeline(recap) },
    { key: "7", description: "Mermaid blueprint", run: () => renderMermaid(recap) },
  ];

  let active = true;
  while (active) {
    console.log();
    actions.forEach((action) => {
      console.log(`  ${styles.accent(action.key)} → ${action.description}`);
    });
    console.log(`  ${styles.accent("0")} → Exit console`);

    const answer = await rl.question(styles.muted("Select panel: "));
    if (answer.trim() === "0") {
      active = false;
      break;
    }
    const action = actions.find((candidate) => candidate.key === answer.trim());
    if (!action) {
      console.log(styles.warning("Unknown selection. Choose a number from the menu."));
      continue;
    }
    console.log();
    action.run();
  }

  await rl.close();
  console.log();
  console.log(styles.muted("Console session closed."));
}

function snapshotReport(recap: Recap): void {
  console.log(styles.heading("α-AGI MARK Snapshot"));
  renderSummary(recap);
  renderOwnerDeck(recap);
  renderParticipants(recap);
  renderVerification(recap);
}

async function main() {
  const options = parseArgs();
  const recap = await loadRecap(options.recapPath);

  if (options.snapshot) {
    snapshotReport(recap);
    return;
  }

  await interactiveLoop(recap);
}

main().catch((error) => {
  console.error(styles.danger(`❌ ${error.message ?? error}`));
  process.exitCode = 1;
});
