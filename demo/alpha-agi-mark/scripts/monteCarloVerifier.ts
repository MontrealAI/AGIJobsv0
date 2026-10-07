import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { assertVerifiedRecap } from './verifyRecap';

import { formatEther } from 'ethers';
import { z } from 'zod';

const RECAP_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'alpha-mark-recap.json'
);
const JSON_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'alpha-mark-stochastic-proof.json'
);
const MARKDOWN_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'alpha-mark-stochastic-proof.md'
);

const tradeSchema = z
  .object({
    kind: z.enum(['BUY', 'SELL']),
    tokensWhole: z.string(),
    valueWei: z.string(),
    label: z.string().optional(),
  })
  .passthrough();

const bondingCurveSchema = z
  .object({
    basePriceWei: z.string(),
    slopeWei: z.string(),
    supplyWholeTokens: z.string(),
    reserveWei: z.string(),
    nextPriceWei: z.string(),
  })
  .passthrough();

const ownerControlsSchema = z
  .object({
    maxSupplyWholeTokens: z.string().optional(),
    fundingCapWei: z.string().optional(),
  })
  .passthrough();

const recapSchema = z
  .object({
    generatedAt: z.string(),
    bondingCurve: bondingCurveSchema,
    ownerControls: ownerControlsSchema,
    trades: z.array(tradeSchema).nonempty('Trade ledger is empty'),
    checksums: z
      .object({
        algorithm: z.string(),
        recapSha256: z.string(),
      })
      .optional(),
  })
  .passthrough();

type Recap = z.infer<typeof recapSchema>;
type Trade = z.infer<typeof tradeSchema>;

type LedgerFinding = {
  index: number;
  label: string;
  expectedWei: string;
  actualWei: string;
  differenceWei: string;
};

type InvariantState = {
  reserveNonNegative: boolean;
  supplyWithinBounds: boolean;
  monotonicBuys: boolean;
  monotonicSells: boolean;
  iterativeParity: boolean;
};

function parseBigInt(label: string, value: string | undefined): bigint {
  if (!value) {
    throw new Error(`${label} missing in recap dossier`);
  }
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`${label} is not a valid bigint: ${value}`);
  }
}

function purchaseCost(
  basePrice: bigint,
  slope: bigint,
  currentSupply: bigint,
  amount: bigint
): bigint {
  const baseComponent = basePrice * amount;
  const slopeComponent =
    slope * ((amount * (2n * currentSupply + amount - 1n)) / 2n);
  return baseComponent + slopeComponent;
}

function purchaseCostIterative(
  basePrice: bigint,
  slope: bigint,
  currentSupply: bigint,
  amount: bigint
): bigint {
  let total = 0n;
  for (let i = 0n; i < amount; i++) {
    total += basePrice + slope * (currentSupply + i);
  }
  return total;
}

function saleReturn(
  basePrice: bigint,
  slope: bigint,
  currentSupply: bigint,
  amount: bigint
): bigint {
  const baseComponent = basePrice * amount;
  if (amount === 0n || currentSupply === 0n) {
    return baseComponent;
  }
  const numerator = amount * (2n * (currentSupply - 1n) - (amount - 1n));
  const slopeComponent = slope * (numerator / 2n);
  return baseComponent + slopeComponent;
}

function saleReturnIterative(
  basePrice: bigint,
  slope: bigint,
  currentSupply: bigint,
  amount: bigint
): bigint {
  let total = 0n;
  for (let i = 0n; i < amount; i++) {
    const supplyLevel = currentSupply - 1n - i;
    total += basePrice + slope * supplyLevel;
  }
  return total;
}

function nextPrice(basePrice: bigint, slope: bigint, supply: bigint): bigint {
  return basePrice + slope * supply;
}

function formatWei(value: bigint): string {
  return `${value.toString()} wei (${formatEther(value)} ETH)`;
}

function recordFinding(
  findings: LedgerFinding[],
  index: number,
  label: string,
  expected: bigint,
  actual: bigint
): void {
  findings.push({
    index,
    label,
    expectedWei: expected.toString(),
    actualWei: actual.toString(),
    differenceWei: (actual - expected).toString(),
  });
}

function runLedgerReplay(
  trades: Trade[],
  basePrice: bigint,
  slope: bigint,
  maxSupply?: bigint
): { findings: LedgerFinding[]; finalSupply: bigint; finalReserve: bigint } {
  const findings: LedgerFinding[] = [];
  let supply = 0n;
  let reserve = 0n;

  trades.forEach((trade, index) => {
    const tokens = parseBigInt(
      `trade[${index}].tokensWhole`,
      trade.tokensWhole
    );
    const value = parseBigInt(`trade[${index}].valueWei`, trade.valueWei);

    if (tokens <= 0n || tokens > 100000n || value < 0n) {
      throw new Error(
        `Trade ${index} requires 1–100000 whole tokens and an unsigned value for bounded replay`
      );
    }
    if (trade.kind === 'BUY') {
      const expected = purchaseCost(basePrice, slope, supply, tokens);
      const iterative = purchaseCostIterative(basePrice, slope, supply, tokens);
      if (expected !== value) {
        recordFinding(
          findings,
          index,
          `Buy ${trade.label ?? ''}`.trim(),
          expected,
          value
        );
      }
      if (iterative !== expected) {
        recordFinding(
          findings,
          index,
          `Buy iterative mismatch ${trade.label ?? ''}`.trim(),
          iterative,
          expected
        );
      }
      if (maxSupply !== undefined && supply + tokens > maxSupply) {
        recordFinding(
          findings,
          index,
          `Buy exceeds max supply ${trade.label ?? ''}`.trim(),
          maxSupply,
          supply + tokens
        );
      }
      supply += tokens;
      reserve += value;
    } else {
      if (tokens > supply) {
        recordFinding(
          findings,
          index,
          `Sell exceeds supply ${trade.label ?? ''}`.trim(),
          supply,
          tokens
        );
      }
      const expected = saleReturn(basePrice, slope, supply, tokens);
      const iterative = saleReturnIterative(basePrice, slope, supply, tokens);
      if (expected !== value) {
        recordFinding(
          findings,
          index,
          `Sell ${trade.label ?? ''}`.trim(),
          expected,
          value
        );
      }
      if (iterative !== expected) {
        recordFinding(
          findings,
          index,
          `Sell iterative mismatch ${trade.label ?? ''}`.trim(),
          iterative,
          expected
        );
      }
      supply -= tokens;
      reserve -= value;
      if (reserve < 0n) {
        recordFinding(
          findings,
          index,
          `Reserve dropped negative after sell ${trade.label ?? ''}`.trim(),
          0n,
          reserve
        );
      }
    }
  });

  return { findings, finalSupply: supply, finalReserve: reserve };
}

function runMonteCarlo(
  iterations: number,
  basePrice: bigint,
  slope: bigint,
  maxSupply?: bigint,
  seed = 'alpha-agi-mark-v1'
): {
  iterations: number;
  invariants: InvariantState;
  buyCount: number;
  sellCount: number;
  totalOperations: number;
  minSupply: bigint;
  maxSupplyObserved: bigint;
  minReserve: bigint;
  maxReserve: bigint;
} {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0) || 1;
  const randomInt = (min: number, max: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return min + Math.floor(((state >>> 0) / 4294967296) * (max - min));
  };
  const invariants: InvariantState = {
    reserveNonNegative: true,
    supplyWithinBounds: true,
    monotonicBuys: true,
    monotonicSells: true,
    iterativeParity: true,
  };

  let buyCount = 0;
  let sellCount = 0;
  let totalOperations = 0;
  let minSupply = 0n;
  let maxSupplyObserved = 0n;
  let minReserve = 0n;
  let maxReserve = 0n;

  for (let i = 0; i < iterations; i++) {
    let supply = 0n;
    let reserve = 0n;
    let previousPrice = nextPrice(basePrice, slope, supply);
    const steps = randomInt(6, 13);

    for (let step = 0; step < steps; step++) {
      const shouldBuy = supply === 0n || randomInt(0, 2) === 0;
      if (shouldBuy) {
        let available = maxSupply !== undefined ? maxSupply - supply : 50n;
        if (available <= 0n) {
          invariants.supplyWithinBounds &&= supply === maxSupply;
          break;
        }
        if (available > 20n) {
          available = 20n;
        }
        const amount = BigInt(randomInt(1, Number(available) + 1));
        const deterministic = purchaseCost(basePrice, slope, supply, amount);
        const iterative = purchaseCostIterative(
          basePrice,
          slope,
          supply,
          amount
        );
        if (deterministic !== iterative) {
          invariants.iterativeParity = false;
        }
        supply += amount;
        reserve += deterministic;
        buyCount++;
        totalOperations++;
        const newPrice = nextPrice(basePrice, slope, supply);
        if (newPrice < previousPrice) {
          invariants.monotonicBuys = false;
        }
        previousPrice = newPrice;
      } else {
        const maxSell = supply < 20n ? supply : 20n;
        if (maxSell === 0n) {
          continue;
        }
        const amount = BigInt(randomInt(1, Number(maxSell) + 1));
        const deterministic = saleReturn(basePrice, slope, supply, amount);
        const iterative = saleReturnIterative(basePrice, slope, supply, amount);
        if (deterministic !== iterative) {
          invariants.iterativeParity = false;
        }
        supply -= amount;
        reserve -= deterministic;
        sellCount++;
        totalOperations++;
        if (reserve < 0n) {
          invariants.reserveNonNegative = false;
        }
        const newPrice = nextPrice(basePrice, slope, supply);
        if (newPrice > previousPrice) {
          invariants.monotonicSells = false;
        }
        previousPrice = newPrice;
      }

      if (maxSupply !== undefined && supply > maxSupply) {
        invariants.supplyWithinBounds = false;
      }

      if (supply < minSupply) {
        minSupply = supply;
      }
      if (supply > maxSupplyObserved) {
        maxSupplyObserved = supply;
      }
      if (reserve < minReserve) {
        minReserve = reserve;
      }
      if (reserve > maxReserve) {
        maxReserve = reserve;
      }
    }
  }

  return {
    iterations,
    invariants,
    buyCount,
    sellCount,
    totalOperations,
    minSupply,
    maxSupplyObserved,
    minReserve,
    maxReserve,
  };
}

function renderInvariantTable(
  entries: Array<{ label: string; ok: boolean; description: string }>
): string {
  const header = '| Check | Result | Description |\n| --- | --- | --- |';
  const rows = entries.map((entry) => {
    const status = entry.ok ? '✅' : '❌';
    return `| ${entry.label} | ${status} | ${entry.description} |`;
  });
  return [header, ...rows].join('\n');
}

export function buildStochasticProof(input: unknown) {
  const { recap: validated } = assertVerifiedRecap(input);
  const recap: Recap = recapSchema.parse(input);

  const basePrice = parseBigInt(
    'bondingCurve.basePriceWei',
    recap.bondingCurve.basePriceWei
  );
  const slope = parseBigInt(
    'bondingCurve.slopeWei',
    recap.bondingCurve.slopeWei
  );
  const ledgerSupply = parseBigInt(
    'bondingCurve.supplyWholeTokens',
    recap.bondingCurve.supplyWholeTokens
  );
  const ledgerReserve =
    parseBigInt('bondingCurve.reserveWei', recap.bondingCurve.reserveWei) +
    BigInt(validated.launch.sovereignVault.totalReceivedWei);
  const ledgerNextPrice = parseBigInt(
    'bondingCurve.nextPriceWei',
    recap.bondingCurve.nextPriceWei
  );
  const maxSupply =
    recap.ownerControls.maxSupplyWholeTokens &&
    recap.ownerControls.maxSupplyWholeTokens !== '0'
      ? parseBigInt(
          'ownerControls.maxSupplyWholeTokens',
          recap.ownerControls.maxSupplyWholeTokens
        )
      : undefined;

  const ledgerResult = runLedgerReplay(
    recap.trades,
    basePrice,
    slope,
    maxSupply
  );

  const ledgerConsistent =
    ledgerResult.findings.length === 0 &&
    ledgerResult.finalSupply === ledgerSupply &&
    ledgerResult.finalReserve === ledgerReserve &&
    nextPrice(basePrice, slope, ledgerResult.finalSupply) === ledgerNextPrice;

  const seed = validated.checksums.recapSha256;
  const monteCarlo = runMonteCarlo(250, basePrice, slope, maxSupply, seed);

  const stochasticProof = {
    generatedAt: recap.generatedAt,
    scope:
      'deterministic synthetic bonding-curve model; not live agent execution, independent review, or production qualification',
    verdict:
      ledgerConsistent && Object.values(monteCarlo.invariants).every(Boolean)
        ? 'PASS'
        : 'REVIEW',
    recapDigest: recap.checksums?.recapSha256,
    parameters: {
      basePriceWei: basePrice.toString(),
      slopeWei: slope.toString(),
      maxSupplyWholeTokens: maxSupply?.toString() ?? null,
    },
    ledgerReplay: {
      tradesTested: recap.trades.length,
      consistent: ledgerConsistent,
      finalSupplyWholeTokens: ledgerResult.finalSupply.toString(),
      finalReserveWei: ledgerResult.finalReserve.toString(),
      expectedSupplyWholeTokens: ledgerSupply.toString(),
      expectedReserveWei: ledgerReserve.toString(),
      findings: ledgerResult.findings,
    },
    monteCarlo: {
      iterations: 250,
      seed,
      generator: 'sha256-seeded-xorshift32-v1',
      totalOperations: monteCarlo.totalOperations,
      buyOperations: monteCarlo.buyCount,
      sellOperations: monteCarlo.sellCount,
      minSupplyWholeTokens: monteCarlo.minSupply.toString(),
      maxSupplyWholeTokens: monteCarlo.maxSupplyObserved.toString(),
      minReserveWei: monteCarlo.minReserve.toString(),
      maxReserveWei: monteCarlo.maxReserve.toString(),
      invariants: monteCarlo.invariants,
    },
    expectedNextPriceWei: ledgerNextPrice.toString(),
    observedNextPriceWei: nextPrice(
      basePrice,
      slope,
      ledgerResult.finalSupply
    ).toString(),
  };

  const invariantEntries = [
    {
      label: 'Ledger replay parity',
      ok: ledgerConsistent,
      description:
        'Trade ledger matches recorded supply, reserve plus vault receipts, and next price',
    },
    {
      label: 'Reserve non-negative',
      ok: monteCarlo.invariants.reserveNonNegative,
      description: 'Monte Carlo reserve balance never dipped below zero',
    },
    {
      label: 'Supply bounds respected',
      ok: monteCarlo.invariants.supplyWithinBounds,
      description:
        'Supply never exceeded configured maxSupply in stochastic runs',
    },
    {
      label: 'Buy-side monotonicity',
      ok: monteCarlo.invariants.monotonicBuys,
      description: 'Price increased or held for every synthetic buy sequence',
    },
    {
      label: 'Sell-side monotonicity',
      ok: monteCarlo.invariants.monotonicSells,
      description: 'Price decreased or held for every synthetic sell sequence',
    },
    {
      label: 'Iterative parity',
      ok: monteCarlo.invariants.iterativeParity,
      description: 'Closed-form and iterative bonding-curve calculations agree',
    },
  ];

  const pieChart = `pie showData\n  "Monte Carlo buys" : ${monteCarlo.buyCount}\n  "Monte Carlo sells" : ${monteCarlo.sellCount}`;

  const markdownReport =
    `# α-AGI MARK Stochastic Assurance Proof\n\n` +
    `Source recap generated at ${stochasticProof.generatedAt}. This dossier cross-checks the recap with a separate local ledger replay ` +
    `and 250 reproducible synthetic model runs. Verdict: **${stochasticProof.verdict}**. This is not independent human review or evidence of live agent execution.` +
    `\n\n` +
    `## Verification Outcomes\n\n${renderInvariantTable(
      invariantEntries
    )}\n\n` +
    `## Stochastic Coverage\n\n` +
    '```mermaid\n' +
    pieChart +
    '\n```\n\n' +
    `- Trades replayed: **${recap.trades.length}**\n` +
    `- Monte Carlo iterations: **${monteCarlo.iterations}**\n` +
    `- Operations simulated: **${monteCarlo.totalOperations}** (${monteCarlo.buyCount} buys / ${monteCarlo.sellCount} sells)\n` +
    `- Supply window explored: **${monteCarlo.minSupply.toString()} → ${monteCarlo.maxSupplyObserved.toString()}** whole tokens\n` +
    `- Reserve window explored: **${formatWei(
      monteCarlo.minReserve
    )} → ${formatWei(monteCarlo.maxReserve)}**\n\n` +
    `## Model Scope\n\n` +
    `- Seed: \`${seed}\`; generator: sha256-seeded-xorshift32-v1.\n` +
    `- Ledger replay final supply matches recap: **${ledgerResult.finalSupply.toString()}** vs. expected **${ledgerSupply.toString()}**.\n` +
    `- Ledger replay reserve matches recap reserve plus vault receipts: **${formatWei(
      ledgerResult.finalReserve
    )}** vs. expected **${formatWei(ledgerReserve)}**.\n` +
    `- Next price cross-check: **${formatWei(
      nextPrice(basePrice, slope, ledgerResult.finalSupply)
    )}** (recomputed) vs. recap **${formatWei(ledgerNextPrice)}**.\n` +
    (stochasticProof.recapDigest
      ? `- Recap checksum (sha256): \`${stochasticProof.recapDigest}\`.\n`
      : '') +
    `\nThis bounded arithmetic model probes selected invariants; it does not prove contract security, solvency under every condition, statistical confidence, or production readiness. ` +
    `It does not model gas, oracle failure, slippage, external token behavior, human reviewer independence, or real-world buyer value.`;

  return { stochasticProof, markdownReport };
}

async function main() {
  const { stochasticProof, markdownReport } = buildStochasticProof(
    JSON.parse(await readFile(RECAP_PATH, 'utf8'))
  );
  await mkdir(path.dirname(JSON_OUTPUT_PATH), { recursive: true });
  await writeFile(
    JSON_OUTPUT_PATH,
    JSON.stringify(stochasticProof, null, 2) + '\n'
  );
  await writeFile(MARKDOWN_OUTPUT_PATH, markdownReport);
  if (stochasticProof.verdict !== 'PASS')
    throw new Error(
      'Stochastic verification failed: ledger or model invariants require review'
    );

  console.log(
    '🧪 Stochastic proof written to',
    path.relative(path.join(__dirname, '..', '..', '..'), JSON_OUTPUT_PATH)
  );
  console.log(
    '🌀 Markdown dossier written to',
    path.relative(path.join(__dirname, '..', '..', '..'), MARKDOWN_OUTPUT_PATH)
  );
}

if (require.main === module)
  main().catch((error) => {
    console.error('❌ Stochastic verification failed:', error);
    process.exitCode = 1;
  });
