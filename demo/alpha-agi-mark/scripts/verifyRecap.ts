import { readFile } from "fs/promises";
import path from "path";

import { z } from "zod";
import { formatEther } from "ethers";
import { createHash } from "crypto";

import { canonicalStringify } from "./utils/canonical";

const RECAP_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
const WHOLE_TOKEN = 10n ** 18n;

type CheckResult = {
  label: string;
  ok: boolean;
  expected?: string;
  actual?: string;
};

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

const participantSchema = z
  .object({
    address: z.string(),
    tokens: z.string(),
    tokensWei: z.string(),
    contributionWei: z.string(),
    contributionEth: z.string().optional(),
  })
  .passthrough();

const recapSchema = z.object({
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
    basePriceWei: z.string(),
    slopeWei: z.string(),
    fundingCapWei: z.string(),
    finalized: z.boolean(),
    aborted: z.boolean(),
    fundingCapEth: z.string().optional(),
    maxSupplyWholeTokens: z.string().optional(),
    saleDeadlineTimestamp: z.string().optional(),
    treasury: z.string().optional(),
    riskOracle: z.string().optional(),
    baseAsset: z.string().optional(),
    usesNativeAsset: z.boolean().optional(),
  })
    .passthrough(),
  launch: z
    .object({
      sovereignVault: z
        .object({
        totalReceivedWei: z.string(),
        totalReceivedEth: z.string().optional(),
        lastAcknowledgedAmountWei: z.string().optional(),
        lastAcknowledgedAmountEth: z.string().optional(),
        vaultBalanceWei: z.string().optional(),
      })
        .passthrough(),
    })
    .passthrough(),
  participants: z.array(participantSchema).nonempty("Participant ledger is empty"),
  trades: z.array(tradeSchema).nonempty("Trade ledger is empty"),
  verification: z
    .object({
      supplyConsensus: z.object({ consistent: z.boolean() }).passthrough(),
      pricing: z.object({ consistent: z.boolean() }).passthrough(),
      capitalFlows: z.object({ consistent: z.boolean() }).passthrough(),
      contributions: z.object({ consistent: z.boolean() }).passthrough(),
    })
    .passthrough()
    .optional(),
  checksums: z
    .object({
      algorithm: z.literal("sha256"),
      canonicalEncoding: z.literal("json-key-sorted"),
      recapSha256: z.string(),
    })
    .optional(),
}).passthrough();

function parseBigInt(value: string, label: string): bigint {
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Failed to parse ${label} as bigint (value: ${value})`);
  }
}

function formatWei(value: bigint): string {
  return `${value.toString()} wei (${formatEther(value)} ETH)`;
}

function main() {
  return readFile(RECAP_PATH, "utf8")
    .then((raw) => recapSchema.parse(JSON.parse(raw)))
    .then(async (recap) => {
      const checks: CheckResult[] = [];

      const supply = parseBigInt(recap.bondingCurve.supplyWholeTokens, "bonding curve supply");
      const reserveWei = parseBigInt(recap.bondingCurve.reserveWei, "reserve balance");
      const nextPrice = parseBigInt(recap.bondingCurve.nextPriceWei, "next price");
      const basePrice = parseBigInt(recap.ownerControls.basePriceWei, "base price");
      const slope = parseBigInt(recap.ownerControls.slopeWei, "slope");
      const fundingCap = parseBigInt(recap.ownerControls.fundingCapWei, "funding cap");
      const vaultReceived = parseBigInt(
        recap.launch.sovereignVault.totalReceivedWei,
        "sovereign vault receipts",
      );

      let ledgerSupply = 0n;
      let ledgerGrossWei = 0n;
      let ledgerSellWei = 0n;
      recap.trades.forEach((trade, index) => {
        const tokens = parseBigInt(trade.tokensWhole, `trade[${index}].tokensWhole`);
        const value = parseBigInt(trade.valueWei, `trade[${index}].valueWei`);
        if (trade.kind === "BUY") {
          ledgerSupply += tokens;
          ledgerGrossWei += value;
        } else {
          ledgerSupply -= tokens;
          ledgerSellWei += value;
        }
        if (ledgerSupply < 0n) {
          throw new Error(
            `Trade ledger became negative after processing index ${index} (${trade.kind}).`,
          );
        }
      });
      const ledgerNetWei = ledgerGrossWei - ledgerSellWei;

      const participantContributionSum = recap.participants.reduce((acc, participant) => {
        return acc + parseBigInt(participant.contributionWei, `participant ${participant.address} contribution`);
      }, 0n);

      const participantTokenWeiSum = recap.participants.reduce((acc, participant) => {
        return acc + parseBigInt(participant.tokensWei, `participant ${participant.address} token balance`);
      }, 0n);

      const expectedNextPrice = basePrice + slope * supply;

      const appendCheck = (label: string, ok: boolean, expected?: string, actual?: string) => {
        checks.push({ label, ok, expected, actual });
      };

      appendCheck(
        "Trade ledger supply equals recorded supply",
        ledgerSupply === supply,
        supply.toString(),
        ledgerSupply.toString(),
      );

      appendCheck(
        "Participant balances equal supply (wei)",
        participantTokenWeiSum === supply * WHOLE_TOKEN,
        (supply * WHOLE_TOKEN).toString(),
        participantTokenWeiSum.toString(),
      );

      appendCheck(
        "Next price matches base + slope * supply",
        expectedNextPrice === nextPrice,
        formatWei(expectedNextPrice),
        formatWei(nextPrice),
      );

      appendCheck(
        "Vault receipts + reserve equal net capital",
        reserveWei + vaultReceived === ledgerNetWei,
        formatWei(ledgerNetWei),
        formatWei(reserveWei + vaultReceived),
      );

      appendCheck(
        "Participant contributions equal gross capital",
        participantContributionSum === ledgerGrossWei,
        formatWei(ledgerGrossWei),
        formatWei(participantContributionSum),
      );

      appendCheck(
        "Funding cap respected",
        fundingCap === 0n || ledgerGrossWei <= fundingCap,
        fundingCap === 0n ? "Unlimited" : formatWei(fundingCap),
        formatWei(ledgerGrossWei),
      );

      if (recap.verification) {
        appendCheck(
          "Embedded verification flag: supply",
          recap.verification.supplyConsensus.consistent,
        );
        appendCheck(
          "Embedded verification flag: pricing",
          recap.verification.pricing.consistent,
        );
        appendCheck(
          "Embedded verification flag: capital flows",
          recap.verification.capitalFlows.consistent,
        );
        appendCheck(
          "Embedded verification flag: contributions",
          recap.verification.contributions.consistent,
        );
      }

      if (recap.checksums?.recapSha256) {
        const digestTarget = JSON.parse(JSON.stringify(recap)) as typeof recap;
        delete (digestTarget as { checksums?: unknown }).checksums;
        const canonical = canonicalStringify(digestTarget);
        const recomputed = createHash("sha256").update(canonical).digest("hex");
        appendCheck(
          "Recap checksum matches canonical digest",
          recomputed === recap.checksums.recapSha256,
          recap.checksums.recapSha256,
          recomputed,
        );
      }

      const passCount = checks.filter((check) => check.ok).length;
      const confidence = (passCount / checks.length) * 100;

      console.log("\nα-AGI MARK recap verification (independent triangulation)");
      console.table(
        checks.map((check) => ({
          Check: check.label,
          Pass: check.ok ? "✅" : "❌",
          Expected: check.expected ?? "-",
          Actual: check.actual ?? "-",
        })),
      );

      console.log(
        `\nConfidence index: ${confidence.toFixed(2)}% (${passCount}/${checks.length} checks passed).`,
      );

      if (checks.some((check) => !check.ok)) {
        throw new Error("Recap verification failed – inspect the table above for discrepancies.");
      }
    })
    .catch((error) => {
      console.error("Verification failed:", error.message ?? error);
      process.exitCode = 1;
    });
}

main();
