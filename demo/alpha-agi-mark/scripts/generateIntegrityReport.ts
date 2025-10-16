import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { formatEther } from "ethers";
import { z } from "zod";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const RECAP_PATH = path.join(REPORT_DIR, "alpha-mark-recap.json");
const REPORT_PATH = path.join(REPORT_DIR, "alpha-mark-integrity.md");

const tradeSchema = z.object({
  kind: z.enum(["BUY", "SELL"]),
  actor: z.string(),
  label: z.string(),
  tokensWhole: z.string(),
  valueWei: z.string(),
});

const participantSchema = z.object({
  address: z.string(),
  tokens: z.string(),
  tokensWei: z.string(),
  contributionWei: z.string(),
  contributionEth: z.string().optional(),
});

const recapSchema = z.object({
  generatedAt: z.string().optional(),
  bondingCurve: z.object({
    supplyWholeTokens: z.string(),
    reserveWei: z.string(),
    nextPriceWei: z.string(),
    basePriceWei: z.string(),
    slopeWei: z.string(),
    reserveEth: z.string().optional(),
    nextPriceEth: z.string().optional(),
  }),
  ownerControls: z.object({
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
  }),
  validators: z
    .object({
      approvalCount: z.string(),
      approvalThreshold: z.string(),
      members: z.array(z.string()),
    })
    .optional(),
  participants: z.array(participantSchema),
  trades: z.array(tradeSchema),
  launch: z.object({
    finalized: z.boolean(),
    aborted: z.boolean(),
    treasury: z.string(),
    sovereignVault: z.object({
      manifestUri: z.string(),
      totalReceivedWei: z.string(),
      totalReceivedEth: z.string().optional(),
      lastAcknowledgedAmountWei: z.string(),
      lastAcknowledgedAmountEth: z.string().optional(),
      lastAcknowledgedMetadataHex: z.string().optional(),
      decodedMetadata: z.string().optional(),
      vaultBalanceWei: z.string().optional(),
      vaultBalanceEth: z.string().optional(),
    }),
  }),
  verification: z
    .object({
      supplyConsensus: z.object({
        ledgerWholeTokens: z.string(),
        contractWholeTokens: z.string(),
        simulationWholeTokens: z.string(),
        participantAggregateWholeTokens: z.string(),
        consistent: z.boolean(),
      }),
      pricing: z.object({
        contractNextPriceWei: z.string(),
        simulatedNextPriceWei: z.string(),
        consistent: z.boolean(),
      }),
      capitalFlows: z.object({
        ledgerGrossWei: z.string(),
        ledgerRedemptionsWei: z.string(),
        ledgerNetWei: z.string(),
        simulatedReserveWei: z.string(),
        contractReserveWei: z.string(),
        vaultReceivedWei: z.string(),
        combinedReserveWei: z.string(),
        consistent: z.boolean(),
      }),
      contributions: z.object({
        participantAggregateWei: z.string(),
        ledgerGrossWei: z.string(),
        consistent: z.boolean(),
      }),
      confidenceIndex: z
        .object({
          percentage: z.string(),
          consistentChecks: z.number(),
          totalChecks: z.number(),
        })
        .optional(),
    })
    .optional(),
  execution: z
    .object({
      generatedAt: z.string().optional(),
      network: z.string().optional(),
      chainId: z.string().optional(),
      dryRun: z.boolean().optional(),
      operator: z.string().optional(),
      investors: z.array(z.string()).optional(),
      validators: z.array(z.string()).optional(),
      toolchain: z.string().optional(),
      job: z.string().optional(),
    })
    .optional(),
});

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

  const supplyAligned = ledgerSupply === supply;
  checks.push({
    label: "Ledger supply equals recorded supply",
    ok: supplyAligned,
    expected: supply.toString(),
    observed: ledgerSupply.toString(),
  });

  const balancesAligned = participantTokenSum === supply * 10n ** 18n;
  checks.push({
    label: "Participant balances equal supply",
    ok: balancesAligned,
    expected: (supply * 10n ** 18n).toString(),
    observed: participantTokenSum.toString(),
  });

  const pricingAligned = expectedNextPrice === nextPrice;
  checks.push({
    label: "Next price matches base + slope * supply",
    ok: pricingAligned,
    expected: asEth(expectedNextPrice),
    observed: asEth(nextPrice),
  });

  const capitalAligned = reserve + vaultReceived === ledgerNet;
  checks.push({
    label: "Vault receipts + reserve equal net capital",
    ok: capitalAligned,
    expected: asEth(ledgerNet),
    observed: asEth(reserve + vaultReceived),
  });

  const contributionsAligned = participantContributionSum === ledgerGross;
  checks.push({
    label: "Participant contributions equal gross capital",
    ok: contributionsAligned,
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
    verificationSignals: {
      supplyAligned,
      pricingAligned,
      capitalAligned,
      contributionsAligned,
    },
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

  const { checks, ledgerGross, ledgerNet, ledgerSupply, verificationSignals } = buildChecks(recap);
  let passCount = checks.filter((check) => check.ok).length;
  let confidence = (passCount / checks.length) * 100;

  const recordedConfidence = recap.verification?.confidenceIndex;
  if (recordedConfidence) {
    const signalValues = verificationSignals
      ? [
          verificationSignals.supplyAligned,
          verificationSignals.pricingAligned,
          verificationSignals.capitalAligned,
          verificationSignals.contributionsAligned,
        ]
      : [];
    const expectedTotal = signalValues.length;
    const expectedPasses = signalValues.filter(Boolean).length;
    const expectedPercentage = expectedTotal ? ((expectedPasses / expectedTotal) * 100).toFixed(2) : "0.00";
    const recordedPercentage = Number(recordedConfidence.percentage);
    const percentageAligned = Number.isFinite(recordedPercentage)
      ? Math.abs(recordedPercentage - Number(expectedPercentage)) < 0.01
      : false;
    const countsAligned =
      recordedConfidence.consistentChecks === expectedPasses && recordedConfidence.totalChecks === expectedTotal;
    checks.push({
      label: "Recorded confidence index matches recomputed value",
      ok: percentageAligned && countsAligned,
      expected: `${expectedPercentage}% (${expectedPasses}/${expectedTotal})`,
      observed: `${recordedConfidence.percentage}% (${recordedConfidence.consistentChecks}/${recordedConfidence.totalChecks})`,
    });
    passCount = checks.filter((check) => check.ok).length;
    confidence = (passCount / checks.length) * 100;
  }

  const generatedAt = recap.execution?.generatedAt
    ? new Date(recap.execution.generatedAt).toISOString()
    : recap.generatedAt
    ? new Date(recap.generatedAt).toISOString()
    : new Date().toISOString();

  const executionSection = recap.execution
    ? `## Execution Telemetry\n\n` +
      `| Signal | Value |\n|---|---|\n` +
      `| Network | ${recap.execution.network ?? "Unknown"} (chain ${recap.execution.chainId ?? "-"}) |\n` +
      `| Mode | ${recap.execution.dryRun ? "Dry-run sentinel" : "Live broadcast"} |\n` +
      `| Operator | ${recap.execution.operator ? shortAddress(recap.execution.operator) : "Unavailable"} |\n` +
      `| Toolchain | ${recap.execution.toolchain ?? "AGI Jobs v0 (v2)"} |\n` +
      `| Command | ${recap.execution.job ?? "npm run demo:alpha-agi-mark"} |\n` +
      `| Investors | ${recap.execution.investors?.length ? recap.execution.investors.map(shortAddress).join(", ") : "Unavailable"} |\n` +
      `| Validators | ${recap.execution.validators?.length ? recap.execution.validators.map(shortAddress).join(", ") : "Unavailable"} |\n\n`
    : "";

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
    `## Confidence Summary\n\n` +
    `- Confidence index: ${confidence.toFixed(2)}% (${passCount}/${checks.length} checks passed)\n` +
    `- ${validatorSummary}\n` +
    `- Ledger supply processed: ${ledgerSupply.toString()} whole tokens\n` +
    `- Gross capital processed: ${asEth(ledgerGross)}\n` +
    `- Net capital secured in sovereign reserve: ${asEth(ledgerNet)}\n\n` +
    `${renderChecksTable(checks)}\n\n` +
    executionSection +
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
