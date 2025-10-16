import { readFile } from 'fs/promises';
import path from 'path';

import { z } from 'zod';
import { formatEther } from 'ethers';

const RECAP_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'alpha-mark-recap.json'
);
const WHOLE_TOKEN = 10n ** 18n;

type CheckResult = {
  label: string;
  ok: boolean;
  expected?: string;
  actual?: string;
};

const tradeSchema = z.object({
  kind: z.enum(['BUY', 'SELL']),
  actor: z.string(),
  label: z.string(),
  tokensWhole: z.string(),
  valueWei: z.string(),
  valueEth: z.string().optional(),
});

const participantSchema = z.object({
  address: z.string(),
  tokens: z.string(),
  tokensWei: z.string(),
  contributionWei: z.string(),
  contributionEth: z.string().optional(),
});

const recapSchema = z.object({
  bondingCurve: z.object({
    supplyWholeTokens: z.string(),
    reserveWei: z.string(),
    nextPriceWei: z.string(),
    basePriceWei: z.string(),
    slopeWei: z.string(),
  }),
  ownerControls: z.object({
    basePriceWei: z.string(),
    slopeWei: z.string(),
    fundingCapWei: z.string(),
    finalized: z.boolean(),
    aborted: z.boolean(),
    treasury: z.string(),
  }),
  launch: z.object({
    finalized: z.boolean(),
    aborted: z.boolean(),
    treasury: z.string(),
    sovereignVault: z.object({
      totalReceivedWei: z.string(),
      lastAcknowledgedAmountWei: z.string(),
    }),
  }),
  participants: z
    .array(participantSchema)
    .nonempty('Participant ledger is empty'),
  trades: z.array(tradeSchema).nonempty('Trade ledger is empty'),
  verification: z
    .object({
      supplyConsensus: z.object({ consistent: z.boolean() }),
      pricing: z.object({ consistent: z.boolean() }),
      capitalFlows: z.object({ consistent: z.boolean() }),
      contributions: z.object({ consistent: z.boolean() }),
    })
    .optional(),
});

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

function calculatePurchaseCost(
  basePrice: bigint,
  slope: bigint,
  supply: bigint,
  amount: bigint
): bigint {
  const baseComponent = basePrice * amount;
  const slopeComponent = slope * ((amount * (2n * supply + amount - 1n)) / 2n);
  return baseComponent + slopeComponent;
}

function calculateSaleReturn(
  basePrice: bigint,
  slope: bigint,
  supply: bigint,
  amount: bigint
): bigint {
  const baseComponent = basePrice * amount;
  if (amount === 0n || supply === 0n) {
    return baseComponent;
  }
  if (amount > supply) {
    throw new Error(`Sale amount ${amount} exceeds available supply ${supply}`);
  }
  const numerator = amount * (2n * (supply - 1n) - (amount - 1n));
  const slopeComponent = slope * (numerator / 2n);
  return baseComponent + slopeComponent;
}

function main() {
  return readFile(RECAP_PATH, 'utf8')
    .then((raw) => recapSchema.parse(JSON.parse(raw)))
    .then((recap) => {
      const checks: CheckResult[] = [];

      const supply = parseBigInt(
        recap.bondingCurve.supplyWholeTokens,
        'bonding curve supply'
      );
      const reserveWei = parseBigInt(
        recap.bondingCurve.reserveWei,
        'reserve balance'
      );
      const nextPrice = parseBigInt(
        recap.bondingCurve.nextPriceWei,
        'next price'
      );
      const basePrice = parseBigInt(
        recap.ownerControls.basePriceWei,
        'base price'
      );
      const slope = parseBigInt(recap.ownerControls.slopeWei, 'slope');
      const fundingCap = parseBigInt(
        recap.ownerControls.fundingCapWei,
        'funding cap'
      );
      const vaultReceived = parseBigInt(
        recap.launch.sovereignVault.totalReceivedWei,
        'sovereign vault receipts'
      );

      const appendCheck = (
        label: string,
        ok: boolean,
        expected?: string,
        actual?: string
      ) => {
        checks.push({ label, ok, expected, actual });
      };

      const tradeParticipantMap = new Map<
        string,
        {
          buyTokens: bigint;
          sellTokens: bigint;
          contribution: bigint;
          redemptions: bigint;
        }
      >();

      const recordTrade = (actor: string) => {
        const current = tradeParticipantMap.get(actor);
        if (!current) {
          const blank = {
            buyTokens: 0n,
            sellTokens: 0n,
            contribution: 0n,
            redemptions: 0n,
          };
          tradeParticipantMap.set(actor, blank);
          return blank;
        }
        return current;
      };

      let ledgerSupply = 0n;
      let ledgerGrossWei = 0n;
      let ledgerSellWei = 0n;
      let computedReserveWei = 0n;
      recap.trades.forEach((trade, index) => {
        const tokens = parseBigInt(
          trade.tokensWhole,
          `trade[${index}].tokensWhole`
        );
        const value = parseBigInt(trade.valueWei, `trade[${index}].valueWei`);
        if (tokens < 0n) {
          throw new Error(
            `Trade ${index} (${trade.kind}) has negative token quantity`
          );
        }

        if (trade.kind === 'BUY') {
          const expected = calculatePurchaseCost(
            basePrice,
            slope,
            ledgerSupply,
            tokens
          );
          appendCheck(
            `Trade #${index + 1} (${trade.label}) buy cost`,
            expected === value,
            formatWei(expected),
            formatWei(value)
          );

          const entry = recordTrade(trade.actor);
          entry.buyTokens += tokens;
          entry.contribution += value;

          ledgerSupply += tokens;
          ledgerGrossWei += value;
          computedReserveWei += expected;
        } else {
          const expected = calculateSaleReturn(
            basePrice,
            slope,
            ledgerSupply,
            tokens
          );
          appendCheck(
            `Trade #${index + 1} (${trade.label}) sell proceeds`,
            expected === value,
            formatWei(expected),
            formatWei(value)
          );

          const entry = recordTrade(trade.actor);
          entry.sellTokens += tokens;
          entry.redemptions += value;

          ledgerSupply -= tokens;
          ledgerSellWei += value;
          if (ledgerSupply < 0n) {
            throw new Error(
              `Trade ledger became negative after processing index ${index} (${trade.kind}).`
            );
          }
          if (computedReserveWei < expected) {
            throw new Error(
              'Computed reserve became negative during ledger replay'
            );
          }
          computedReserveWei -= expected;
        }
      });
      const ledgerNetWei = ledgerGrossWei - ledgerSellWei;

      const participantContributionSum = recap.participants.reduce(
        (acc, participant) => {
          return (
            acc +
            parseBigInt(
              participant.contributionWei,
              `participant ${participant.address} contribution`
            )
          );
        },
        0n
      );

      const participantTokenWeiSum = recap.participants.reduce(
        (acc, participant) => {
          return (
            acc +
            parseBigInt(
              participant.tokensWei,
              `participant ${participant.address} token balance`
            )
          );
        },
        0n
      );

      const participantAddressSet = new Set(
        recap.participants.map((participant) => participant.address)
      );
      for (const [address] of tradeParticipantMap) {
        if (!participantAddressSet.has(address)) {
          throw new Error(
            `Trade ledger references participant ${address} not present in recap table`
          );
        }
      }

      const expectedNextPrice = basePrice + slope * supply;

      appendCheck(
        'Trade ledger supply equals recorded supply',
        ledgerSupply === supply,
        supply.toString(),
        ledgerSupply.toString()
      );

      appendCheck(
        'Participant balances equal supply (wei)',
        participantTokenWeiSum === supply * WHOLE_TOKEN,
        (supply * WHOLE_TOKEN).toString(),
        participantTokenWeiSum.toString()
      );

      appendCheck(
        'Next price matches base + slope * supply',
        expectedNextPrice === nextPrice,
        formatWei(expectedNextPrice),
        formatWei(nextPrice)
      );

      appendCheck(
        'Vault receipts + reserve equal net capital',
        reserveWei + vaultReceived === ledgerNetWei,
        formatWei(ledgerNetWei),
        formatWei(reserveWei + vaultReceived)
      );

      appendCheck(
        'Participant contributions equal gross capital',
        participantContributionSum === ledgerGrossWei,
        formatWei(ledgerGrossWei),
        formatWei(participantContributionSum)
      );

      appendCheck(
        'Ledger replay reserve equals net capital',
        computedReserveWei === ledgerNetWei,
        formatWei(ledgerNetWei),
        formatWei(computedReserveWei)
      );

      recap.participants.forEach((participant) => {
        const ledgerEntry = tradeParticipantMap.get(participant.address) ?? {
          buyTokens: 0n,
          sellTokens: 0n,
          contribution: 0n,
          redemptions: 0n,
        };

        const expectedTokensWei =
          (ledgerEntry.buyTokens - ledgerEntry.sellTokens) * WHOLE_TOKEN;
        appendCheck(
          `Participant ${participant.address} token balance`,
          expectedTokensWei ===
            parseBigInt(
              participant.tokensWei,
              `${participant.address} tokensWei`
            ),
          expectedTokensWei.toString(),
          participant.tokensWei
        );

        appendCheck(
          `Participant ${participant.address} contribution`,
          ledgerEntry.contribution ===
            parseBigInt(
              participant.contributionWei,
              `${participant.address} contributionWei`
            ),
          formatWei(ledgerEntry.contribution),
          formatWei(
            parseBigInt(
              participant.contributionWei,
              `${participant.address} contributionWei`
            )
          )
        );
      });

      appendCheck(
        'Sovereign vault acknowledgement equals receipts',
        recap.launch.sovereignVault.lastAcknowledgedAmountWei ===
          recap.launch.sovereignVault.totalReceivedWei,
        recap.launch.sovereignVault.totalReceivedWei,
        recap.launch.sovereignVault.lastAcknowledgedAmountWei
      );

      appendCheck(
        'Launch finalized flags engaged',
        recap.launch.finalized &&
          recap.ownerControls.finalized &&
          !recap.launch.aborted,
        'finalized=true, aborted=false',
        `launch.finalized=${recap.launch.finalized}, owner.finalized=${recap.ownerControls.finalized}, aborted=${recap.launch.aborted}`
      );

      appendCheck(
        'Treasury destination consistent',
        recap.launch.treasury === recap.ownerControls.treasury,
        recap.ownerControls.treasury,
        recap.launch.treasury
      );

      if (!recap.launch.finalized) {
        throw new Error('Launch not finalized according to recap dossier');
      }

      appendCheck(
        'Funding cap respected',
        fundingCap === 0n || ledgerGrossWei <= fundingCap,
        fundingCap === 0n ? 'Unlimited' : formatWei(fundingCap),
        formatWei(ledgerGrossWei)
      );

      if (recap.verification) {
        appendCheck(
          'Embedded verification flag: supply',
          recap.verification.supplyConsensus.consistent
        );
        appendCheck(
          'Embedded verification flag: pricing',
          recap.verification.pricing.consistent
        );
        appendCheck(
          'Embedded verification flag: capital flows',
          recap.verification.capitalFlows.consistent
        );
        appendCheck(
          'Embedded verification flag: contributions',
          recap.verification.contributions.consistent
        );
      }

      const passCount = checks.filter((check) => check.ok).length;
      const confidence = (passCount / checks.length) * 100;

      console.log(
        '\nα-AGI MARK recap verification (independent triangulation)'
      );
      console.table(
        checks.map((check) => ({
          Check: check.label,
          Pass: check.ok ? '✅' : '❌',
          Expected: check.expected ?? '-',
          Actual: check.actual ?? '-',
        }))
      );

      console.log(
        `\nConfidence index: ${confidence.toFixed(2)}% (${passCount}/${
          checks.length
        } checks passed).`
      );

      if (checks.some((check) => !check.ok)) {
        throw new Error(
          'Recap verification failed – inspect the table above for discrepancies.'
        );
      }
    })
    .catch((error) => {
      console.error('Verification failed:', error.message ?? error);
      process.exitCode = 1;
    });
}

main();
