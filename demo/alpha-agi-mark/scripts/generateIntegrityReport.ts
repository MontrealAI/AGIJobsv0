import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { formatEther } from "ethers";
import { z } from "zod";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const RECAP_PATH = path.join(REPORT_DIR, "alpha-mark-recap.json");
const REPORT_PATH = path.join(REPORT_DIR, "alpha-mark-integrity.md");

const tradeSchema = z
  .object({
    kind: z.enum(["BUY", "SELL"]),
    actor: z.string(),
    label: z.string(),
    tokensWhole: z.string(),
    valueWei: z.string(),
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
    workspaceDirty: z.boolean(),
    mode: z.enum(["dry-run", "broadcast"]),
  })
    .passthrough(),
  actors: z.object({
    owner: z.string(),
    investors: z.array(z.string()).min(3),
    validators: z.array(z.string()).min(3),
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
  validators: z
    .object({
      approvalCount: z.string(),
      approvalThreshold: z.string(),
      members: z.array(z.string()),
    })
    .passthrough()
    .optional(),
  participants: z.array(participantSchema),
  trades: z.array(tradeSchema),
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
      lastAcknowledgedMetadataHex: z.string().optional(),
      decodedMetadata: z.string().optional(),
      vaultBalanceWei: z.string().optional(),
      vaultBalanceEth: z.string().optional(),
    })
      .passthrough(),
  })
    .passthrough(),
  verification: z
    .object({
      supplyConsensus: z
        .object({
        ledgerWholeTokens: z.string(),
        contractWholeTokens: z.string(),
        simulationWholeTokens: z.string(),
        participantAggregateWholeTokens: z.string(),
        consistent: z.boolean(),
      })
        .passthrough(),
      pricing: z
        .object({
        contractNextPriceWei: z.string(),
        simulatedNextPriceWei: z.string(),
        consistent: z.boolean(),
      })
        .passthrough(),
      capitalFlows: z
        .object({
        ledgerGrossWei: z.string(),
        ledgerRedemptionsWei: z.string(),
        ledgerNetWei: z.string(),
        simulatedReserveWei: z.string(),
        contractReserveWei: z.string(),
        vaultReceivedWei: z.string(),
        combinedReserveWei: z.string(),
        consistent: z.boolean(),
      })
        .passthrough(),
      contributions: z
        .object({
        participantAggregateWei: z.string(),
        ledgerGrossWei: z.string(),
        consistent: z.boolean(),
      })
        .passthrough(),
    })
    .optional(),
  checksums: z
    .object({
      algorithm: z.literal("sha256"),
      canonicalEncoding: z.literal("json-key-sorted"),
      recapSha256: z.string(),
    })
    .optional(),
}).passthrough();

type Recap = z.infer<typeof recapSchema>;

type CheckResult = {
  label: string;
  ok: boolean;
  expected?: string;
  observed?: string;
};

function parseBigInt(label: string, value: string): bigint {
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Failed to parse ${label} (${value}) as bigint`);
  }
}

function asEth(value: bigint): string {
  return `${value.toString()} wei (${formatEther(value)} ETH)`;
}

function badge(flag: boolean): string {
  return flag ? "✅" : "❌";
}

function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function buildChecks(recap: Recap) {
  const checks: CheckResult[] = [];

  const supply = parseBigInt("recorded supply", recap.bondingCurve.supplyWholeTokens);
  const reserve = parseBigInt("reserve balance", recap.bondingCurve.reserveWei);
  const nextPrice = parseBigInt("next price", recap.bondingCurve.nextPriceWei);
  const basePrice = parseBigInt("base price", recap.bondingCurve.basePriceWei);
  const slope = parseBigInt("slope", recap.bondingCurve.slopeWei);
  const fundingCap = parseBigInt("funding cap", recap.ownerControls.fundingCapWei);
  const vaultReceived = parseBigInt(
    "sovereign vault receipts",
    recap.launch.sovereignVault.totalReceivedWei,
  );

  let ledgerSupply = 0n;
  let ledgerGross = 0n;
  let ledgerRedemptions = 0n;
  for (const trade of recap.trades) {
    const tokens = parseBigInt(`trade tokens (${trade.label})`, trade.tokensWhole);
    const value = parseBigInt(`trade value (${trade.label})`, trade.valueWei);
    if (trade.kind === "BUY") {
      ledgerSupply += tokens;
      ledgerGross += value;
    } else {
      ledgerSupply -= tokens;
      ledgerRedemptions += value;
    }
  }
  if (ledgerSupply < 0n) {
    throw new Error("Trade ledger yields negative supply");
  }
  const ledgerNet = ledgerGross - ledgerRedemptions;
  const expectedNextPrice = basePrice + slope * supply;

  const participantTokenSum = recap.participants.reduce((acc, participant) => {
    return acc + parseBigInt(`participant token balance (${participant.address})`, participant.tokensWei);
  }, 0n);

  const participantContributionSum = recap.participants.reduce((acc, participant) => {
    return acc + parseBigInt(`participant contribution (${participant.address})`, participant.contributionWei);
  }, 0n);

  checks.push({
    label: "Ledger supply equals recorded supply",
    ok: ledgerSupply === supply,
    expected: supply.toString(),
    observed: ledgerSupply.toString(),
  });

  checks.push({
    label: "Participant balances equal supply",
    ok: participantTokenSum === supply * 10n ** 18n,
    expected: (supply * 10n ** 18n).toString(),
    observed: participantTokenSum.toString(),
  });

  checks.push({
    label: "Next price matches base + slope * supply",
    ok: expectedNextPrice === nextPrice,
    expected: asEth(expectedNextPrice),
    observed: asEth(nextPrice),
  });

  checks.push({
    label: "Vault receipts + reserve equal net capital",
    ok: reserve + vaultReceived === ledgerNet,
    expected: asEth(ledgerNet),
    observed: asEth(reserve + vaultReceived),
  });

  checks.push({
    label: "Participant contributions equal gross capital",
    ok: participantContributionSum === ledgerGross,
    expected: asEth(ledgerGross),
    observed: asEth(participantContributionSum),
  });

  checks.push({
    label: "Funding cap respected",
    ok: fundingCap === 0n || ledgerGross <= fundingCap,
    expected: fundingCap === 0n ? "Unlimited" : asEth(fundingCap),
    observed: asEth(ledgerGross),
  });

  if (recap.verification) {
    checks.push({
      label: "Embedded verification: supply",
      ok: recap.verification.supplyConsensus.consistent,
    });
    checks.push({
      label: "Embedded verification: pricing",
      ok: recap.verification.pricing.consistent,
    });
    checks.push({
      label: "Embedded verification: capital flows",
      ok: recap.verification.capitalFlows.consistent,
    });
    checks.push({
      label: "Embedded verification: contributions",
      ok: recap.verification.contributions.consistent,
    });
  }

  return {
    checks,
    ledgerGross,
    ledgerNet,
    ledgerSupply,
    ledgerRedemptions,
  };
}

function renderChecksTable(checks: CheckResult[]): string {
  const header = "| Check | Status | Expected | Observed |";
  const separator = "|---|:---:|---|---|";
  const rows = checks.map((check) => {
    const status = check.ok ? "✅" : "❌";
    const expected = check.expected ?? "-";
    const observed = check.observed ?? "-";
    return `| ${check.label} | ${status} | ${expected} | ${observed} |`;
  });
  return [header, separator, ...rows].join("\n");
}

function renderOwnerControls(controls: Recap["ownerControls"]): string {
  const items = [
    { label: "Market paused", flag: controls.paused },
    { label: "Whitelist enforced", flag: controls.whitelistEnabled },
    { label: "Emergency exit armed", flag: controls.emergencyExitEnabled },
    { label: "Launch finalized", flag: controls.finalized },
    { label: "Launch aborted", flag: controls.aborted },
    { label: "Validation override enabled", flag: controls.validationOverrideEnabled },
  ];
  return items
    .map((item) => `- ${badge(item.flag)} ${item.label}`)
    .join("\n");
}

function renderContributionPie(participants: Recap["participants"]): string {
  const lines = participants.map((participant) => {
    const contributionValue = parseBigInt(
      `participant contribution (${participant.address})`,
      participant.contributionWei,
    );
    const contribution = parseFloat(participant.contributionEth ?? formatEther(contributionValue));
    return `    \"${shortAddress(participant.address)}\" : ${contribution.toFixed(4)}`;
  });
  return ["```mermaid", "pie title Contribution resonance (ETH)", ...lines, "```"].join("\n");
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const raw = await readFile(RECAP_PATH, "utf8");
  const recap = recapSchema.parse(JSON.parse(raw));

  const { checks, ledgerGross, ledgerNet, ledgerSupply } = buildChecks(recap);
  const passCount = checks.filter((check) => check.ok).length;
  const confidence = (passCount / checks.length) * 100;

  const generatedAt = new Date(recap.generatedAt).toISOString();

  const checksumLine = recap.checksums
    ? `- Checksum (${recap.checksums.algorithm}/${recap.checksums.canonicalEncoding}): ${recap.checksums.recapSha256}\n`
    : "";

  const orchestratorLines = [
    `- Mode: ${recap.orchestrator.mode}`,
    `- Git commit: ${recap.orchestrator.commit ?? "(unavailable)"}`,
    `- Git branch: ${recap.orchestrator.branch ?? "(unavailable)"}`,
    `- Workspace dirty: ${recap.orchestrator.workspaceDirty ? "yes" : "no"}`,
  ].join("\n");

  const actorLines = [
    `- Owner: ${recap.actors.owner}`,
    `- Investors: ${recap.actors.investors.join(", ")}`,
    `- Validators: ${recap.actors.validators.join(", ")}`,
  ].join("\n");

  const contributionPie = renderContributionPie(recap.participants);
  const ownerControls = renderOwnerControls(recap.ownerControls);
  const validatorSummary = recap.validators
    ? `Validator quorum: ${recap.validators.approvalCount}/${recap.validators.approvalThreshold}`
    : "Validator quorum: (not available in recap)";
  const metadataDisplay =
    recap.launch.sovereignVault.decodedMetadata ??
    recap.launch.sovereignVault.lastAcknowledgedMetadataHex ??
    "Unavailable";
  const vaultBalanceDisplay = recap.launch.sovereignVault.vaultBalanceWei
    ? asEth(parseBigInt("vault balance", recap.launch.sovereignVault.vaultBalanceWei))
    : "Unavailable";
  const lastAcknowledgedAmountDisplay = asEth(
    parseBigInt("last acknowledged amount", recap.launch.sovereignVault.lastAcknowledgedAmountWei),
  );

  const markdown = `# α-AGI MARK Integrity Report\n\n` +
    `Generated: ${generatedAt}\n\n` +
    `## Recap Envelope\n\n` +
    `- Network: ${recap.network.label} (chain ${recap.network.chainId}, block ${recap.network.blockNumber})\n` +
    `- Dry-run mode: ${recap.network.dryRun ? "enabled" : "disabled"}\n` +
    `${checksumLine}` +
    `\n### Orchestrator Telemetry\n\n` +
    `${orchestratorLines}\n\n` +
    `### Actor Registry\n\n` +
    `${actorLines}\n\n` +
    `## Confidence Summary\n\n` +
    `- Confidence index: ${confidence.toFixed(2)}% (${passCount}/${checks.length} checks passed)\n` +
    `- ${validatorSummary}\n` +
    `- Ledger supply processed: ${ledgerSupply.toString()} whole tokens\n` +
    `- Gross capital processed: ${asEth(ledgerGross)}\n` +
    `- Net capital secured in sovereign reserve: ${asEth(ledgerNet)}\n\n` +
    `${renderChecksTable(checks)}\n\n` +
    `## Participant Contribution Constellation\n\n` +
    `${contributionPie}\n\n` +
    `## Launch Telemetry\n\n` +
    `| Metric | Value |\n|---|---|\n` +
    `| Supply | ${recap.bondingCurve.supplyWholeTokens} SeedShares |\n` +
    `| Next price | ${asEth(parseBigInt("next price", recap.bondingCurve.nextPriceWei))} |\n` +
    `| Base price | ${asEth(parseBigInt("base price", recap.bondingCurve.basePriceWei))} |\n` +
    `| Slope | ${asEth(parseBigInt("slope", recap.bondingCurve.slopeWei))} |\n` +
    `| Reserve balance | ${asEth(parseBigInt("reserve", recap.bondingCurve.reserveWei))} |\n` +
    `| Sovereign vault receipts | ${asEth(parseBigInt("vault", recap.launch.sovereignVault.totalReceivedWei))} |\n` +
    `| Last acknowledged amount | ${lastAcknowledgedAmountDisplay} |\n` +
    `| Vault balance | ${vaultBalanceDisplay} |\n` +
    `| Treasury address | ${recap.launch.treasury} |\n` +
    `| Sovereign vault | ${recap.launch.sovereignVault.manifestUri} |\n` +
    `| Sovereign metadata | ${metadataDisplay} |\n\n` +
    `## Owner Command Deck Snapshot\n\n` +
    `${ownerControls}\n\n` +
    `### Control Parameters\n\n` +
    `| Parameter | Value |\n|---|---|\n` +
    `| Funding cap | ${recap.ownerControls.fundingCapEth ?? asEth(parseBigInt("funding cap", recap.ownerControls.fundingCapWei))} |\n` +
    `| Max supply | ${recap.ownerControls.maxSupplyWholeTokens} SeedShares |\n` +
    `| Sale deadline | ${recap.ownerControls.saleDeadlineTimestamp} |\n` +
    `| Treasury | ${recap.ownerControls.treasury} |\n` +
    `| Risk oracle | ${recap.ownerControls.riskOracle} |\n` +
    `| Base asset | ${recap.ownerControls.baseAsset} |\n` +
    `| Uses native asset | ${recap.ownerControls.usesNativeAsset ? 'Yes (native ETH)' : 'No (ERC-20 base asset)'} |\n` +
    `| Base price (wei) | ${recap.ownerControls.basePriceWei} |\n` +
    `| Slope (wei) | ${recap.ownerControls.slopeWei} |\n`;

  await writeFile(REPORT_PATH, markdown, "utf8");
  console.log(`📝 α-AGI MARK integrity report generated at ${REPORT_PATH}`);
  console.log(`Confidence index ${confidence.toFixed(2)}% (${passCount}/${checks.length}).`);
}

main().catch((error) => {
  console.error("Failed to generate integrity report:", error);
  process.exitCode = 1;
});
