import { promises as fs } from 'fs';
import path from 'path';
import hardhat from 'hardhat';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { HardhatEthersHelpers } from '@nomicfoundation/hardhat-ethers/types';

const hre = hardhat as HardhatRuntimeEnvironment & {
  ethers: typeof import('ethers') & HardhatEthersHelpers;
};

const { ethers } = hre;

const WAD = 10n ** 18n;

type OutputFormat = 'human' | 'markdown' | 'json' | 'csv';

type SortOrder = 'asc' | 'desc';

interface CliOptions {
  engine?: string;
  fromBlock?: number;
  toBlock?: number;
  lambda: bigint;
  format: OutputFormat;
  decimals: number;
  unitLabel: string;
  outPath?: string;
  limit?: number;
  order: SortOrder;
  includeTimestamps: boolean;
  help?: boolean;
}

interface EpochEntry {
  epoch: bigint;
  budget: bigint;
  dH: bigint;
  dS: bigint;
  systemTemperature: bigint;
  leftover: bigint;
  h: bigint;
  freeEnergy: bigint;
  blockNumber: number;
  txHash: string;
  timestamp?: number;
}

interface ReportMetadata {
  engine: string;
  lambda: string;
  decimals: number;
  unitLabel: string;
  fromBlock: number;
  toBlock: number;
  totalEvents: number;
  generatedAt: string;
  order: SortOrder;
}

interface ReportStats {
  firstEpoch?: bigint;
  latestEpoch?: bigint;
  totalBudget: bigint;
  averageBudget?: bigint;
  totalH: bigint;
  averageH?: bigint;
  minH?: bigint;
  maxH?: bigint;
  minFree?: bigint;
  maxFree?: bigint;
}

interface ReportPayload {
  metadata: ReportMetadata;
  stats: ReportStats;
  entries: EpochEntry[];
}

function usage(): string {
  return `Hamiltonian tracker – analyse RewardEngineMB epochs\n\nUsage:\n  npx ts-node --compiler-options '{"module":"commonjs"}' scripts/hamiltonian-tracker.ts \\\n    --engine <address> [--from <block>] [--to <block>] [--lambda <scale>] \\\n    [--format human|markdown|json|csv] [--out <file>] [--limit <n>] \\\n    [--order asc|desc] [--decimals <n>] [--unit-label <name>] [--timestamps]\n\nExamples:\n  npm run hamiltonian:report -- --engine 0xabc... --format markdown --out reports/mainnet/hamiltonian.md\n  npx ts-node --compiler-options '{"module":"commonjs"}' scripts/hamiltonian-tracker.ts \\\n    --engine 0xabc... --from 19000000 --lambda 3 --format json --timestamps\n`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    lambda: 1n,
    format: 'human',
    decimals: 18,
    unitLabel: '$AGIALPHA',
    order: 'asc',
    includeTimestamps: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) {
      throw new Error(`Unexpected argument "${raw}"`);
    }

    const key = raw.slice(2);
    switch (key) {
      case 'help':
      case 'h':
        options.help = true;
        break;
      case 'engine': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--engine requires an address');
        }
        options.engine = value;
        i += 1;
        break;
      }
      case 'from': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--from requires a block number');
        }
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error('--from must be a positive integer');
        }
        options.fromBlock = parsed;
        i += 1;
        break;
      }
      case 'to': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--to requires a block number');
        }
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error('--to must be a positive integer');
        }
        options.toBlock = parsed;
        i += 1;
        break;
      }
      case 'lambda': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--lambda requires an integer scale');
        }
        try {
          options.lambda = BigInt(value);
        } catch (err) {
          throw new Error(`--lambda must be an integer: ${(err as Error).message}`);
        }
        i += 1;
        break;
      }
      case 'format': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--format requires a value');
        }
        const normalised = value.toLowerCase();
        if (normalised === 'human' || normalised === 'text') {
          options.format = 'human';
        } else if (normalised === 'markdown' || normalised === 'md') {
          options.format = 'markdown';
        } else if (normalised === 'json') {
          options.format = 'json';
        } else if (normalised === 'csv') {
          options.format = 'csv';
        } else {
          throw new Error(`Unsupported format "${value}"`);
        }
        i += 1;
        break;
      }
      case 'out':
      case 'output': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--out requires a file path');
        }
        options.outPath = value;
        i += 1;
        break;
      }
      case 'limit': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--limit requires a positive integer');
        }
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error('--limit must be a positive integer');
        }
        options.limit = parsed;
        i += 1;
        break;
      }
      case 'order': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--order requires "asc" or "desc"');
        }
        const normalised = value.toLowerCase();
        if (normalised === 'asc' || normalised === 'ascending') {
          options.order = 'asc';
        } else if (normalised === 'desc' || normalised === 'descending') {
          options.order = 'desc';
        } else {
          throw new Error('--order must be "asc" or "desc"');
        }
        i += 1;
        break;
      }
      case 'decimals': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--decimals requires a number between 0 and 36');
        }
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36) {
          throw new Error('--decimals must be an integer between 0 and 36');
        }
        options.decimals = parsed;
        i += 1;
        break;
      }
      case 'unit-label':
      case 'unit': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--unit-label requires a string');
        }
        options.unitLabel = value;
        i += 1;
        break;
      }
      case 'timestamps':
      case 'with-timestamps':
        options.includeTimestamps = true;
        break;
      default:
        throw new Error(`Unknown flag --${key}`);
    }
  }

  return options;
}

function toChecksumAddress(address: string): string {
  return ethers.getAddress(address);
}

function formatUnits(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

function computeStats(entries: EpochEntry[]): ReportStats {
  if (entries.length === 0) {
    return {
      totalBudget: 0n,
      totalH: 0n,
    };
  }

  let totalBudget = 0n;
  let totalH = 0n;
  let minH = entries[0].h;
  let maxH = entries[0].h;
  let minFree = entries[0].freeEnergy;
  let maxFree = entries[0].freeEnergy;
  let firstEpoch = entries[0].epoch;
  let latestEpoch = entries[0].epoch;

  for (const entry of entries) {
    totalBudget += entry.budget;
    totalH += entry.h;
    if (entry.h < minH) minH = entry.h;
    if (entry.h > maxH) maxH = entry.h;
    if (entry.freeEnergy < minFree) minFree = entry.freeEnergy;
    if (entry.freeEnergy > maxFree) maxFree = entry.freeEnergy;
    if (entry.epoch < firstEpoch) firstEpoch = entry.epoch;
    if (entry.epoch > latestEpoch) latestEpoch = entry.epoch;
  }

  const divisor = BigInt(entries.length);

  return {
    firstEpoch,
    latestEpoch,
    totalBudget,
    averageBudget: totalBudget / divisor,
    totalH,
    averageH: totalH / divisor,
    minH,
    maxH,
    minFree,
    maxFree,
  };
}

function bigIntToString(value?: bigint): string | undefined {
  return value === undefined ? undefined : value.toString();
}

function renderHuman(report: ReportPayload, decimals: number): string {
  const { metadata, stats, entries } = report;
  const lines: string[] = [];
  lines.push('Hamiltonian Monitor Report');
  lines.push('===========================');
  lines.push(`Engine: ${metadata.engine}`);
  lines.push(`Block range: ${metadata.fromBlock} → ${metadata.toBlock}`);
  lines.push(`Events analysed: ${metadata.totalEvents}`);
  lines.push(`λ (lambda): ${metadata.lambda}`);
  lines.push(`Unit label: ${metadata.unitLabel}`);
  if (stats.firstEpoch !== undefined && stats.latestEpoch !== undefined) {
    lines.push(`Epoch span: ${stats.firstEpoch.toString()} → ${stats.latestEpoch.toString()}`);
  }
  lines.push('');

  lines.push('Aggregate metrics:');
  lines.push(`  • Total budget: ${formatUnits(stats.totalBudget, decimals)} ${metadata.unitLabel}`);
  if (stats.averageBudget !== undefined) {
    lines.push(`  • Average budget: ${formatUnits(stats.averageBudget, decimals)} ${metadata.unitLabel}`);
  }
  if (stats.averageH !== undefined) {
    lines.push(`  • Average H: ${stats.averageH.toString()}`);
  }
  if (stats.minH !== undefined && stats.maxH !== undefined) {
    lines.push(`  • H range: ${stats.minH.toString()} → ${stats.maxH.toString()}`);
  }
  if (stats.minFree !== undefined && stats.maxFree !== undefined) {
    lines.push(`  • Free energy range: ${stats.minFree.toString()} → ${stats.maxFree.toString()}`);
  }
  lines.push('');

  if (entries.length === 0) {
    lines.push('No EpochSettled events found for the provided range.');
    return lines.join('\n');
  }

  const headers = [
    'Epoch',
    `Budget (${metadata.unitLabel})`,
    'ΔH',
    'ΔS',
    'T',
    'H',
    'Free',
    'Block',
  ];
  const rows = entries.map((entry) => [
    entry.epoch.toString(),
    formatUnits(entry.budget, decimals),
    entry.dH.toString(),
    entry.dS.toString(),
    entry.systemTemperature.toString(),
    entry.h.toString(),
    entry.freeEnergy.toString(),
    entry.blockNumber.toString(),
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );

  const formatRow = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index])).join('  ');

  lines.push(formatRow(headers));
  lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  rows.forEach((row) => lines.push(formatRow(row)));

  if (report.entries.some((entry) => entry.timestamp !== undefined)) {
    lines.push('');
    lines.push('Timestamps (unix seconds):');
    report.entries.forEach((entry) => {
      if (entry.timestamp !== undefined) {
        lines.push(`  • Epoch ${entry.epoch.toString()}: ${entry.timestamp}`);
      }
    });
  }

  return lines.join('\n');
}

function renderMarkdown(report: ReportPayload, decimals: number): string {
  const { metadata, stats, entries } = report;
  const summaryLines = [
    '# Hamiltonian Monitor Report',
    '',
    `- **Engine:** \`${metadata.engine}\``,
    `- **λ (lambda):** \`${metadata.lambda}\``,
    `- **Block range:** \`${metadata.fromBlock} → ${metadata.toBlock}\``,
    `- **Events analysed:** \`${metadata.totalEvents}\``,
    `- **Unit label:** \`${metadata.unitLabel}\``,
  ];

  if (stats.firstEpoch !== undefined && stats.latestEpoch !== undefined) {
    summaryLines.push(
      `- **Epoch span:** \`${stats.firstEpoch.toString()} → ${stats.latestEpoch.toString()}\``,
    );
  }

  summaryLines.push('');
  summaryLines.push('## Aggregate metrics');
  summaryLines.push('');
  summaryLines.push(
    `- Total budget: **${formatUnits(stats.totalBudget, decimals)} ${metadata.unitLabel}**`,
  );
  if (stats.averageBudget !== undefined) {
    summaryLines.push(
      `- Average budget: ${formatUnits(stats.averageBudget, decimals)} ${metadata.unitLabel}`,
    );
  }
  if (stats.averageH !== undefined) {
    summaryLines.push(`- Average H: \`${stats.averageH.toString()}\``);
  }
  if (stats.minH !== undefined && stats.maxH !== undefined) {
    summaryLines.push(
      `- H range: \`${stats.minH.toString()} → ${stats.maxH.toString()}\``,
    );
  }
  if (stats.minFree !== undefined && stats.maxFree !== undefined) {
    summaryLines.push(
      `- Free energy range: \`${stats.minFree.toString()} → ${stats.maxFree.toString()}\``,
    );
  }

  summaryLines.push('');
  summaryLines.push('```mermaid');
  summaryLines.push('flowchart LR');
  summaryLines.push('    Budget[Reward budget] -->|λ| Hamiltonian[H = ΔH − λ · budget]');
  summaryLines.push('    Temperature[System temperature] --> FreeEnergy[G = ΔH − T · ΔS]');
  summaryLines.push('    Entropy[Entropy ΔS] --> FreeEnergy');
  summaryLines.push('```');
  summaryLines.push('');

  if (entries.length === 0) {
    summaryLines.push('No `EpochSettled` events were found.');
    return summaryLines.join('\n');
  }

  summaryLines.push('## Epoch breakdown');
  summaryLines.push('');
  summaryLines.push(
    '| Epoch | Budget (' +
      metadata.unitLabel +
      ') | ΔH | ΔS | T | H | Free energy | Block | Timestamp | Tx hash |',
  );
  summaryLines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');

  entries.forEach((entry) => {
    const timestamp = entry.timestamp
      ? new Date(entry.timestamp * 1000).toISOString()
      : '—';
    summaryLines.push(
      `| ${entry.epoch.toString()} | ${formatUnits(entry.budget, decimals)} | ${entry.dH.toString()} | ${entry.dS.toString()} | ${entry.systemTemperature.toString()} | ${entry.h.toString()} | ${entry.freeEnergy.toString()} | ${entry.blockNumber.toString()} | ${timestamp} | \`${entry.txHash}\` |`,
    );
  });

  return summaryLines.join('\n');
}

function renderJson(report: ReportPayload, decimals: number): string {
  const serialised = {
    metadata: report.metadata,
    stats: {
      ...report.stats,
      firstEpoch: bigIntToString(report.stats.firstEpoch),
      latestEpoch: bigIntToString(report.stats.latestEpoch),
      totalBudget: formatUnits(report.stats.totalBudget, decimals),
      averageBudget: report.stats.averageBudget
        ? formatUnits(report.stats.averageBudget, decimals)
        : undefined,
      totalH: bigIntToString(report.stats.totalH),
      averageH: bigIntToString(report.stats.averageH),
      minH: bigIntToString(report.stats.minH),
      maxH: bigIntToString(report.stats.maxH),
      minFree: bigIntToString(report.stats.minFree),
      maxFree: bigIntToString(report.stats.maxFree),
    },
    entries: report.entries.map((entry) => ({
      epoch: entry.epoch.toString(),
      budget: {
        raw: entry.budget.toString(),
        formatted: formatUnits(entry.budget, decimals),
      },
      dH: entry.dH.toString(),
      dS: entry.dS.toString(),
      systemTemperature: entry.systemTemperature.toString(),
      h: entry.h.toString(),
      freeEnergy: entry.freeEnergy.toString(),
      leftover: entry.leftover.toString(),
      blockNumber: entry.blockNumber,
      timestamp: entry.timestamp,
      txHash: entry.txHash,
    })),
  };

  return `${JSON.stringify(serialised, null, 2)}\n`;
}

function renderCsv(report: ReportPayload, decimals: number): string {
  const header = [
    'epoch',
    'budget_raw',
    `budget_${report.metadata.unitLabel}`,
    'delta_h',
    'delta_s',
    'temperature',
    'hamiltonian',
    'free_energy',
    'leftover',
    'block',
    'timestamp',
    'tx_hash',
  ];

  const rows = report.entries.map((entry) => [
    entry.epoch.toString(),
    entry.budget.toString(),
    formatUnits(entry.budget, decimals),
    entry.dH.toString(),
    entry.dS.toString(),
    entry.systemTemperature.toString(),
    entry.h.toString(),
    entry.freeEnergy.toString(),
    entry.leftover.toString(),
    entry.blockNumber.toString(),
    entry.timestamp ? new Date(entry.timestamp * 1000).toISOString() : '',
    entry.txHash,
  ]);

  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n') + '\n';
}

async function maybeWriteFile(output: string, outPath?: string): Promise<void> {
  if (!outPath) {
    return;
  }
  const resolved = path.resolve(outPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, output);
  console.error(`Report written to ${resolved}`);
}

async function enrichTimestamps(entries: EpochEntry[]): Promise<void> {
  const uniqueBlocks = Array.from(new Set(entries.map((entry) => entry.blockNumber)));
  const provider = ethers.provider;
  const blockTimestamps = new Map<number, number>();

  await Promise.all(
    uniqueBlocks.map(async (blockNumber) => {
      const block = await provider.getBlock(blockNumber);
      if (block) {
        blockTimestamps.set(blockNumber, block.timestamp);
      }
    }),
  );

  entries.forEach((entry) => {
    const timestamp = blockTimestamps.get(entry.blockNumber);
    if (timestamp !== undefined) {
      entry.timestamp = timestamp;
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.engine) {
    throw new Error('Missing required --engine <address>');
  }

  const engineAddress = toChecksumAddress(options.engine);

  const latestBlock = await ethers.provider.getBlockNumber();
  const fromBlock = options.fromBlock ?? 0;
  const toBlock = options.toBlock ?? latestBlock;
  if (fromBlock > toBlock) {
    throw new Error('--from cannot be greater than --to');
  }

  const abi = [
    'event EpochSettled(uint256 indexed epoch,uint256 budget,int256 dH,int256 dS,int256 systemTemperature,uint256 leftover)',
  ];
  const contract = new ethers.Contract(
    engineAddress,
    abi,
    ethers.provider,
  );

  const events = await contract.queryFilter(
    contract.filters.EpochSettled(),
    fromBlock,
    toBlock,
  );

  let entries: EpochEntry[] = events.map((ev) => {
    if (!('args' in ev) || !ev.args) {
      throw new Error('Encountered log without decoded EpochSettled args');
    }
    const { epoch, budget, dH, dS, systemTemperature, leftover } = ev.args as Record<string, unknown>;
    const epochBig = BigInt((epoch as bigint | number | string).toString());
    const budgetBig = BigInt((budget as bigint | number | string).toString());
    const dHBig = BigInt((dH as bigint | number | string).toString());
    const dSBig = BigInt((dS as bigint | number | string).toString());
    const temperatureBig = BigInt((systemTemperature as bigint | number | string).toString());
    const leftoverBig = BigInt((leftover as bigint | number | string).toString());

    const h = dHBig - options.lambda * budgetBig;
    const freeEnergy = dHBig - (temperatureBig * dSBig) / WAD;

    return {
      epoch: epochBig,
      budget: budgetBig,
      dH: dHBig,
      dS: dSBig,
      systemTemperature: temperatureBig,
      leftover: leftoverBig,
      h,
      freeEnergy,
      blockNumber: ev.blockNumber,
      txHash: ev.transactionHash,
    };
  });

  if (options.limit !== undefined && entries.length > options.limit) {
    entries = entries.slice(entries.length - options.limit);
  }

  if (options.order === 'desc') {
    entries = entries.slice().reverse();
  }

  if (options.includeTimestamps && entries.length > 0) {
    await enrichTimestamps(entries);
  }

  const stats = computeStats(entries);

  const report: ReportPayload = {
    metadata: {
      engine: engineAddress,
      lambda: options.lambda.toString(),
      decimals: options.decimals,
      unitLabel: options.unitLabel,
      fromBlock,
      toBlock,
      totalEvents: entries.length,
      generatedAt: new Date().toISOString(),
      order: options.order,
    },
    stats,
    entries,
  };

  let output: string;
  switch (options.format) {
    case 'human':
      output = renderHuman(report, options.decimals);
      break;
    case 'markdown':
      output = renderMarkdown(report, options.decimals);
      break;
    case 'json':
      output = renderJson(report, options.decimals);
      break;
    case 'csv':
      output = renderCsv(report, options.decimals);
      break;
    default:
      throw new Error(`Unsupported format ${options.format}`);
  }

  if (!options.outPath) {
    process.stdout.write(output);
  }
  await maybeWriteFile(output, options.outPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
