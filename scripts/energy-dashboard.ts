import fs from 'fs';
import path from 'path';

interface EnergyMetricRecord {
  jobId: string;
  agent: string;
  startedAt: string;
  finishedAt: string;
  wallTimeMs: number;
  cpuTimeMs: number;
  cpuUserUs: number;
  cpuSystemUs: number;
  cpuCount: number;
  inputSizeBytes: number;
  outputSizeBytes: number;
  estimatedOperations: number;
  algorithmicComplexity: string;
  loadAverageStart: [number, number, number];
  loadAverageEnd: [number, number, number];
  invocationSuccess: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  spanId: string;
  jobSuccess: boolean;
  energyEstimate: number;
  gpuTimeMs: number;
  memoryRssBytes: number;
  rewardValue?: number;
  efficiencyScore?: number;
  loadAverageDelta: [number, number, number];
  entropyEstimate?: number;
  anomalies?: string[];
  anomalyScore?: number;
}

interface AgentRow {
  agent: string;
  jobs: number;
  avgEnergy: number;
  avgEfficiency: number;
  avgCpuMs: number;
  avgGpuMs: number;
  successRate: number;
  lastUpdated: string | null;
}

interface CliOptions {
  tail: number;
  agent?: string;
}

const METRICS_PATH = path.resolve(__dirname, '../data/energy-metrics.jsonl');

function parseArgs(argv: string[]): CliOptions {
  let tail = 10;
  let agent: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tail' || arg === '-t') {
      const value = argv[i + 1];
      if (value) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          tail = parsed;
        }
        i += 1;
      }
    } else if (arg === '--agent' || arg === '-a') {
      const value = argv[i + 1];
      if (value) {
        agent = value.toLowerCase();
        i += 1;
      }
    }
  }
  return { tail, agent };
}

async function readMetricsFile(): Promise<EnergyMetricRecord[]> {
  try {
    const raw = await fs.promises.readFile(METRICS_PATH, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const records: EnergyMetricRecord[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as EnergyMetricRecord;
        if (parsed?.jobId && parsed?.agent) {
          records.push(parsed);
        }
      } catch (err) {
        console.warn('Skipping malformed metric line', err);
      }
    }
    return records;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function summariseAgents(records: EnergyMetricRecord[]): AgentRow[] {
  const aggregates = new Map<
    string,
    AgentRow & {
      totalEnergy: number;
      totalEfficiency: number;
      totalCpuMs: number;
      totalGpuMs: number;
      successCount: number;
    }
  >();
  for (const record of records) {
    const key = record.agent.toLowerCase();
    if (!aggregates.has(key)) {
      aggregates.set(key, {
        agent: key,
        jobs: 0,
        avgEnergy: 0,
        avgEfficiency: 0,
        avgCpuMs: 0,
        avgGpuMs: 0,
        successRate: 0,
        lastUpdated: null,
        totalEnergy: 0,
        totalEfficiency: 0,
        totalCpuMs: 0,
        totalGpuMs: 0,
        successCount: 0,
      });
    }
    const aggregate = aggregates.get(key)!;
    aggregate.jobs += 1;
    if (Number.isFinite(record.energyEstimate)) {
      aggregate.totalEnergy += record.energyEstimate;
    }
    if (Number.isFinite(record.efficiencyScore ?? 0)) {
      aggregate.totalEfficiency += record.efficiencyScore ?? 0;
    }
    if (Number.isFinite(record.cpuTimeMs)) {
      aggregate.totalCpuMs += record.cpuTimeMs;
    }
    if (Number.isFinite(record.gpuTimeMs)) {
      aggregate.totalGpuMs += record.gpuTimeMs;
    }
    if (record.jobSuccess) {
      aggregate.successCount += 1;
    }
    const timestamp = record.finishedAt || record.startedAt;
    if (
      timestamp &&
      (!aggregate.lastUpdated || timestamp > aggregate.lastUpdated)
    ) {
      aggregate.lastUpdated = timestamp;
    }
  }

  return Array.from(aggregates.values()).map((aggregate) => {
    const jobs = aggregate.jobs || 1;
    return {
      agent: aggregate.agent,
      jobs: aggregate.jobs,
      avgEnergy: aggregate.totalEnergy / jobs,
      avgEfficiency: aggregate.totalEfficiency / jobs,
      avgCpuMs: aggregate.totalCpuMs / jobs,
      avgGpuMs: aggregate.totalGpuMs / jobs,
      successRate: aggregate.successCount / jobs,
      lastUpdated: aggregate.lastUpdated,
    };
  });
}

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.0%';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatEnergy(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

function printAgentTable(rows: AgentRow[]): void {
  if (rows.length === 0) {
    console.log('No agent efficiency statistics recorded yet.');
    return;
  }
  const table = rows
    .sort((a, b) => a.avgEnergy - b.avgEnergy)
    .map((row) => ({
      Agent: row.agent,
      Jobs: row.jobs,
      'Avg Energy': formatEnergy(row.avgEnergy),
      'Avg Efficiency': row.avgEfficiency.toFixed(3),
      'CPU ms': row.avgCpuMs.toFixed(1),
      'GPU ms': row.avgGpuMs.toFixed(1),
      'Success Rate': formatPercentage(row.successRate),
      Updated: row.lastUpdated ?? '-',
    }));
  console.table(table);
}

function printRecent(records: EnergyMetricRecord[], options: CliOptions): void {
  if (records.length === 0) {
    console.log('No job execution metrics recorded yet.');
    return;
  }
  const filtered = options.agent
    ? records.filter((record) => record.agent.toLowerCase() === options.agent)
    : records;
  if (filtered.length === 0) {
    console.log(`No runs recorded for agent ${options.agent}`);
    return;
  }
  const tail = options.tail > 0 ? filtered.slice(-options.tail) : filtered;
  console.log(
    `Most recent ${tail.length} runs${
      options.agent ? ` for ${options.agent}` : ''
    }:`
  );
  for (const record of tail) {
    const efficiency = Number.isFinite(record.efficiencyScore ?? 0)
      ? (record.efficiencyScore ?? 0).toFixed(3)
      : '0.000';
    console.log(
      `- [${record.finishedAt}] job=${record.jobId} agent=${
        record.agent
      } energy=${formatEnergy(
        record.energyEstimate
      )} efficiency=${efficiency} complexity=${
        record.algorithmicComplexity
      } cpuMs=${record.cpuTimeMs.toFixed(1)} gpuMs=${record.gpuTimeMs.toFixed(
        1
      )}`
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const records = await readMetricsFile();
  if (records.length === 0) {
    console.log('No thermodynamic metrics have been captured yet.');
    console.log(`Expected log file at ${METRICS_PATH}`);
    return;
  }
  console.log('Thermodynamic efficiency snapshot by agent:');
  printAgentTable(summariseAgents(records));
  console.log('');
  printRecent(records, options);
}

main().catch((err) => {
  console.error('Failed to render energy dashboard', err);
  process.exitCode = 1;
});
