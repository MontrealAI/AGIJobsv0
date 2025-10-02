import { promises as fs } from 'fs';
import path from 'path';
import {
  loadOwnerControlConfig,
  loadStakeManagerConfig,
  loadFeePoolConfig,
  loadTokenConfig,
  loadThermodynamicsConfig,
  loadRewardEngineConfig,
  loadHamiltonianMonitorConfig,
  loadEnergyOracleConfig,
} from '../config';
import {
  formatUnits,
  getAddress,
  ZeroAddress,
  parseUnits,
} from 'ethers';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
}

type OutputFormat = 'human' | 'markdown' | 'json';

interface ModuleSummary {
  name: string;
  type: string;
  owner?: string | null;
  governance?: string | null;
  pauser?: string | null;
  notes?: string[];
}

interface TokenSummary {
  address?: string;
  symbol?: string;
  name?: string;
  decimals: number;
  burnAddress?: string;
  governance?: Record<string, unknown> | undefined;
  modules?: Record<string, unknown> | undefined;
  configPath: string;
}

interface GovernanceSummary {
  defaultGovernance?: string;
  defaultOwner?: string;
  modules: ModuleSummary[];
  configPath: string;
}

interface StakeManagerSummary {
  minStake?: string;
  minStakeBase?: string;
  maxStakePerAddress?: string;
  employerSlashPct?: unknown;
  treasurySlashPct?: unknown;
  feePct?: unknown;
  burnPct?: unknown;
  validatorRewardPct?: unknown;
  validatorSlashRewardPct?: unknown;
  treasury?: string | undefined;
  pauser?: string | undefined;
  configPath: string;
}

interface FeePoolSummary {
  burnPct?: unknown;
  rewardRole?: unknown;
  treasury?: string | undefined;
  governance?: string | undefined;
  pauser?: string | undefined;
  taxPolicy?: string | undefined;
  configPath: string;
}

interface RewardEngineSummary {
  roleShares?: Record<string, unknown>;
  kappa?: unknown;
  temperature?: unknown;
  maxProofs?: unknown;
  treasury?: string | undefined;
  configPath: string;
}

interface ThermostatSummary {
  systemTemperature?: unknown;
  bounds?: { min?: unknown; max?: unknown };
  pid?: Record<string, unknown>;
  integralBounds?: { min?: unknown; max?: unknown };
  configPath: string;
}

interface HamiltonianSummary {
  windowSize?: unknown;
  observations?: number;
  configPath: string;
}

interface EnergyOracleSummary {
  signerCount: number;
  retainUnknown?: boolean;
  configPath: string;
}

interface QuickstartSummary {
  generatedAt: string;
  network?: string;
  token: TokenSummary;
  governance: GovernanceSummary;
  stakeManager: StakeManagerSummary;
  feePool: FeePoolSummary;
  rewardEngine: RewardEngineSummary;
  thermostat: ThermostatSummary;
  hamiltonian: HamiltonianSummary;
  energyOracle: EnergyOracleSummary;
  operations: {
    inspect: string;
    plan: string;
    execute: string;
    verify: string;
    snapshot: string;
    docs: string[];
  };
  issues: string[];
  diagram: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: 'human',
    includeMermaid: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--network': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--network requires a value');
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--out':
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a file path`);
        }
        options.outPath = value;
        i += 1;
        break;
      }
      case '--format': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--format requires a value');
        }
        const normalised = value.trim().toLowerCase();
        if (normalised !== 'human' && normalised !== 'markdown' && normalised !== 'json') {
          throw new Error('Supported formats: human, markdown, json');
        }
        options.format = normalised as OutputFormat;
        i += 1;
        break;
      }
      case '--no-mermaid':
        options.includeMermaid = false;
        break;
      case '--mermaid':
        options.includeMermaid = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }

  return options;
}

function formatAddress(value?: string | null): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  try {
    const normalised = getAddress(value);
    if (normalised === ZeroAddress) {
      return `${normalised} (zero)`;
    }
    return normalised;
  } catch (error) {
    return String(value);
  }
}

function safeBigInt(value: unknown): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return BigInt(Math.trunc(value));
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  try {
    if (text.startsWith('0x') || text.startsWith('0X')) {
      return BigInt(text);
    }
    return BigInt(text);
  } catch (error) {
    return undefined;
  }
}

function describeTokenBase(value: unknown, decimals: number, symbol: string): string {
  const asBigInt = safeBigInt(value);
  if (asBigInt === undefined) {
    return '—';
  }
  try {
    return `${formatUnits(asBigInt, decimals)} ${symbol} (${asBigInt.toString()} base)`;
  } catch (error) {
    return `${asBigInt.toString()} base`;
  }
}

function describeTokenFromTokens(
  value: unknown,
  decimals: number,
  symbol: string
): { display: string; base?: string } {
  if (value === undefined || value === null) {
    return { display: '—' };
  }
  const text = String(value).trim();
  if (!text) {
    return { display: '—' };
  }
  try {
    const parsed = parseUnits(text, decimals).toString();
    return {
      display: `${text} ${symbol} (${parsed} base)`,
      base: parsed,
    };
  } catch (error) {
    return { display: `${text} ${symbol}` };
  }
}

function describePercent(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}%`;
  }
  const text = String(value).trim();
  if (!text) {
    return '—';
  }
  return text.endsWith('%') ? text : `${text}%`;
}

function buildMermaid(): string {
  return `flowchart TD
    Config[Config JSON]\n--> QS[owner:quickstart]\nQS --> Surface[owner:surface]\nQS --> Wizard[owner:wizard]\nQS --> Plan[owner:plan]
    Surface --> Update[owner:update-all]\nPlan --> Rotate[owner:rotate]\nUpdate --> Verify[owner:verify-control]\nRotate --> Verify
    Verify --> Snapshot[reports & auditors]\n`;
}

function toRelative(filePath?: string, fallback?: string): string {
  if (filePath) {
    const rel = path.relative(process.cwd(), filePath);
    return rel || filePath;
  }
  return fallback ?? 'n/a';
}

function safeLoad<T>(
  label: string,
  loader: () => T,
  issues: string[]
): T | undefined {
  try {
    return loader();
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    issues.push(`${label}: ${message}`);
    return undefined;
  }
}

async function readFallbackConfig(
  base: string,
  network?: string
): Promise<{ path: string; data: any } | undefined> {
  const configDir = path.join(__dirname, '..', '..', 'config');
  const candidates: string[] = [];
  if (network) {
    candidates.push(path.join(configDir, `${base}.${network}.json`));
  }
  candidates.push(path.join(configDir, `${base}.json`));

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, 'utf8');
      return { path: candidate, data: JSON.parse(content) };
    } catch (error) {
      // Continue trying other candidates
    }
  }

  return undefined;
}

function renderHuman(summary: QuickstartSummary, includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('AGIJobs Owner Quickstart Report');
  lines.push('================================');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Network: ${summary.network ?? 'auto-detected'}`);
  lines.push('');
  lines.push('Governance Overview');
  lines.push('-------------------');
  lines.push(`Default governance: ${formatAddress(summary.governance.defaultGovernance)}`);
  lines.push(`Default owner:      ${formatAddress(summary.governance.defaultOwner)}`);
  lines.push(`Source file:        ${summary.governance.configPath}`);
  lines.push('Modules:');
  summary.governance.modules.forEach((module) => {
    const notes = module.notes && module.notes.length > 0 ? ` | ${module.notes.join('; ')}` : '';
    lines.push(
      `  - ${module.name} [${module.type}]` +
        ` governance=${formatAddress(module.governance ?? summary.governance.defaultGovernance)}` +
        ` owner=${formatAddress(module.owner ?? summary.governance.defaultOwner)}` +
        (module.pauser ? ` pauser=${formatAddress(module.pauser)}` : '') +
        notes
    );
  });
  lines.push('');
  lines.push('Token Baseline');
  lines.push('--------------');
  lines.push(`Symbol / Name : ${summary.token.symbol ?? '—'} / ${summary.token.name ?? '—'}`);
  lines.push(`Decimals      : ${summary.token.decimals}`);
  lines.push(`Address       : ${formatAddress(summary.token.address)}`);
  lines.push(`Burn address  : ${formatAddress(summary.token.burnAddress)}`);
  lines.push(`Config path   : ${summary.token.configPath}`);
  if (summary.token.governance) {
    lines.push(`Governance map: ${JSON.stringify(summary.token.governance)}`);
  }
  if (summary.token.modules) {
    lines.push(`Module wiring : ${JSON.stringify(summary.token.modules)}`);
  }
  lines.push('');
  lines.push('Stake Manager Highlights');
  lines.push('-------------------------');
  lines.push(`Config path   : ${summary.stakeManager.configPath}`);
  lines.push(`Minimum stake : ${summary.stakeManager.minStake ?? '—'}`);
  if (summary.stakeManager.minStakeBase) {
    lines.push(`  base units  : ${summary.stakeManager.minStakeBase}`);
  }
  lines.push(`Max / address : ${summary.stakeManager.maxStakePerAddress ?? '—'}`);
  lines.push(`Employer slash: ${describePercent(summary.stakeManager.employerSlashPct)}`);
  lines.push(`Treasury slash: ${describePercent(summary.stakeManager.treasurySlashPct)}`);
  lines.push(`Fee pct       : ${describePercent(summary.stakeManager.feePct)}`);
  lines.push(`Burn pct      : ${describePercent(summary.stakeManager.burnPct)}`);
  lines.push(`Validator rwd : ${describePercent(summary.stakeManager.validatorRewardPct)}`);
  lines.push(`Validator slash reward: ${describePercent(summary.stakeManager.validatorSlashRewardPct)}`);
  lines.push(`Treasury      : ${formatAddress(summary.stakeManager.treasury)}`);
  lines.push(`Pauser        : ${formatAddress(summary.stakeManager.pauser)}`);
  lines.push('');
  lines.push('Fee Pool Snapshot');
  lines.push('-----------------');
  lines.push(`Config path   : ${summary.feePool.configPath}`);
  lines.push(`Burn pct      : ${describePercent(summary.feePool.burnPct)}`);
  lines.push(`Reward role   : ${summary.feePool.rewardRole ?? '—'}`);
  lines.push(`Treasury      : ${formatAddress(summary.feePool.treasury)}`);
  lines.push(`Governance    : ${formatAddress(summary.feePool.governance)}`);
  lines.push(`Pauser        : ${formatAddress(summary.feePool.pauser)}`);
  lines.push(`Tax policy    : ${formatAddress(summary.feePool.taxPolicy)}`);
  lines.push('');
  lines.push('Reward Engine & Thermodynamics');
  lines.push('------------------------------');
  lines.push(`Reward engine path: ${summary.rewardEngine.configPath}`);
  if (summary.rewardEngine.roleShares) {
    lines.push(`Role shares       : ${JSON.stringify(summary.rewardEngine.roleShares)}`);
  }
  lines.push(
    `kappa             : ${summary.rewardEngine.kappa ? describeTokenBase(summary.rewardEngine.kappa, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}`
  );
  lines.push(
    `temperature       : ${summary.rewardEngine.temperature ? describeTokenBase(summary.rewardEngine.temperature, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}`
  );
  lines.push(`max proofs        : ${summary.rewardEngine.maxProofs ?? '—'}`);
  lines.push(`Treasury          : ${formatAddress(summary.rewardEngine.treasury)}`);
  lines.push('');
  lines.push(`Thermostat path   : ${summary.thermostat.configPath}`);
  lines.push(
    `System temperature: ${summary.thermostat.systemTemperature ? describeTokenBase(summary.thermostat.systemTemperature, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}`
  );
  if (summary.thermostat.bounds) {
    lines.push(
      `Bounds            : min ${summary.thermostat.bounds.min ? describeTokenBase(summary.thermostat.bounds.min, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}, max ${summary.thermostat.bounds.max ? describeTokenBase(summary.thermostat.bounds.max, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}`
    );
  }
  if (summary.thermostat.pid) {
    lines.push(`PID               : ${JSON.stringify(summary.thermostat.pid)}`);
  }
  if (summary.thermostat.integralBounds) {
    lines.push(
      `Integral bounds   : min ${summary.thermostat.integralBounds.min ? describeTokenBase(summary.thermostat.integralBounds.min, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}, max ${summary.thermostat.integralBounds.max ? describeTokenBase(summary.thermostat.integralBounds.max, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}`
    );
  }
  lines.push('');
  lines.push('Hamiltonian Monitor');
  lines.push('-------------------');
  lines.push(`Config path : ${summary.hamiltonian.configPath}`);
  lines.push(`Window size : ${summary.hamiltonian.windowSize ?? '—'}`);
  lines.push(`Observations: ${summary.hamiltonian.observations ?? 0}`);
  lines.push('');
  lines.push('Energy Oracle');
  lines.push('-------------');
  lines.push(`Config path : ${summary.energyOracle.configPath}`);
  lines.push(`Signers     : ${summary.energyOracle.signerCount}`);
  lines.push(`Retain extra: ${summary.energyOracle.retainUnknown === undefined ? '—' : summary.energyOracle.retainUnknown ? 'true' : 'false'}`);
  lines.push('');
  lines.push('Operational Checklist');
  lines.push('----------------------');
  lines.push(`1. Inspect : ${summary.operations.inspect}`);
  lines.push(`2. Plan    : ${summary.operations.plan}`);
  lines.push(`3. Execute : ${summary.operations.execute}`);
  lines.push(`4. Verify  : ${summary.operations.verify}`);
  lines.push(`5. Snapshot: ${summary.operations.snapshot}`);
  lines.push('Documentation:');
  summary.operations.docs.forEach((doc) => lines.push(`  - ${doc}`));

  if (summary.issues.length > 0) {
    lines.push('');
    lines.push('Loader Warnings');
    lines.push('----------------');
    summary.issues.forEach((issue) => lines.push(`- ${issue}`));
  }

  if (includeMermaid) {
    lines.push('');
    lines.push('Mermaid Control Flow');
    lines.push('--------------------');
    lines.push('```mermaid');
    lines.push(summary.diagram.trimEnd());
    lines.push('```');
  }

  return lines.join('\n');
}

function renderMarkdown(summary: QuickstartSummary, includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('# AGIJobs Owner Quickstart Report');
  lines.push('');
  lines.push(`- Generated: ${summary.generatedAt}`);
  lines.push(`- Network: ${summary.network ?? 'auto-detected'}`);
  lines.push('');
  lines.push('## Governance Overview');
  lines.push('');
  lines.push('| Setting | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Default governance | ${formatAddress(summary.governance.defaultGovernance)} |`);
  lines.push(`| Default owner | ${formatAddress(summary.governance.defaultOwner)} |`);
  lines.push(`| Config path | \`${summary.governance.configPath}\` |`);
  lines.push('');
  lines.push('| Module | Type | Governance | Owner | Pauser | Notes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  summary.governance.modules.forEach((module) => {
    const notes = module.notes && module.notes.length > 0 ? module.notes.join('; ') : '—';
    lines.push(
      `| ${module.name} | ${module.type} | ${formatAddress(module.governance ?? summary.governance.defaultGovernance)} | ${formatAddress(module.owner ?? summary.governance.defaultOwner)} | ${formatAddress(module.pauser)} | ${notes} |`
    );
  });
  lines.push('');
  lines.push('## Token Baseline');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Symbol | ${summary.token.symbol ?? '—'} |`);
  lines.push(`| Name | ${summary.token.name ?? '—'} |`);
  lines.push(`| Decimals | ${summary.token.decimals} |`);
  lines.push(`| Address | ${formatAddress(summary.token.address)} |`);
  lines.push(`| Burn address | ${formatAddress(summary.token.burnAddress)} |`);
  lines.push(`| Config path | \`${summary.token.configPath}\` |`);
  if (summary.token.governance) {
    lines.push(`| Governance map | \`${JSON.stringify(summary.token.governance)}\` |`);
  }
  if (summary.token.modules) {
    lines.push(`| Module wiring | \`${JSON.stringify(summary.token.modules)}\` |`);
  }
  lines.push('');
  lines.push('## Stake Manager');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Config path | \`${summary.stakeManager.configPath}\` |`);
  lines.push(`| Minimum stake | ${summary.stakeManager.minStake ?? '—'} |`);
  if (summary.stakeManager.minStakeBase) {
    lines.push(`| Minimum stake (base) | \`${summary.stakeManager.minStakeBase}\` |`);
  }
  lines.push(`| Max stake per address | ${summary.stakeManager.maxStakePerAddress ?? '—'} |`);
  lines.push(`| Employer slash % | ${describePercent(summary.stakeManager.employerSlashPct)} |`);
  lines.push(`| Treasury slash % | ${describePercent(summary.stakeManager.treasurySlashPct)} |`);
  lines.push(`| Fee % | ${describePercent(summary.stakeManager.feePct)} |`);
  lines.push(`| Burn % | ${describePercent(summary.stakeManager.burnPct)} |`);
  lines.push(`| Validator reward % | ${describePercent(summary.stakeManager.validatorRewardPct)} |`);
  lines.push(`| Validator slash reward % | ${describePercent(summary.stakeManager.validatorSlashRewardPct)} |`);
  lines.push(`| Treasury | ${formatAddress(summary.stakeManager.treasury)} |`);
  lines.push(`| Pauser | ${formatAddress(summary.stakeManager.pauser)} |`);
  lines.push('');
  lines.push('## Fee Pool');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Config path | \`${summary.feePool.configPath}\` |`);
  lines.push(`| Burn % | ${describePercent(summary.feePool.burnPct)} |`);
  lines.push(`| Reward role | ${summary.feePool.rewardRole ?? '—'} |`);
  lines.push(`| Treasury | ${formatAddress(summary.feePool.treasury)} |`);
  lines.push(`| Governance | ${formatAddress(summary.feePool.governance)} |`);
  lines.push(`| Pauser | ${formatAddress(summary.feePool.pauser)} |`);
  lines.push(`| Tax policy | ${formatAddress(summary.feePool.taxPolicy)} |`);
  lines.push('');
  lines.push('## Reward Engine & Thermostat');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Reward engine config | \`${summary.rewardEngine.configPath}\` |`);
  if (summary.rewardEngine.roleShares) {
    lines.push(`| Role shares | \`${JSON.stringify(summary.rewardEngine.roleShares)}\` |`);
  }
  lines.push(
    `| kappa | ${summary.rewardEngine.kappa ? describeTokenBase(summary.rewardEngine.kappa, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'} |`
  );
  lines.push(
    `| temperature | ${summary.rewardEngine.temperature ? describeTokenBase(summary.rewardEngine.temperature, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'} |`
  );
  lines.push(`| max proofs | ${summary.rewardEngine.maxProofs ?? '—'} |`);
  lines.push(`| Treasury | ${formatAddress(summary.rewardEngine.treasury)} |`);
  lines.push(`| Thermostat config | \`${summary.thermostat.configPath}\` |`);
  lines.push(
    `| System temperature | ${summary.thermostat.systemTemperature ? describeTokenBase(summary.thermostat.systemTemperature, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'} |`
  );
  if (summary.thermostat.bounds) {
    lines.push(
      `| Bounds | min ${summary.thermostat.bounds.min ? describeTokenBase(summary.thermostat.bounds.min, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}, max ${summary.thermostat.bounds.max ? describeTokenBase(summary.thermostat.bounds.max, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'} |`
    );
  }
  if (summary.thermostat.pid) {
    lines.push(`| PID | \`${JSON.stringify(summary.thermostat.pid)}\` |`);
  }
  if (summary.thermostat.integralBounds) {
    lines.push(
      `| Integral bounds | min ${summary.thermostat.integralBounds.min ? describeTokenBase(summary.thermostat.integralBounds.min, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'}, max ${summary.thermostat.integralBounds.max ? describeTokenBase(summary.thermostat.integralBounds.max, summary.token.decimals, summary.token.symbol ?? 'AGIALPHA') : '—'} |`
    );
  }
  lines.push('');
  lines.push('## Hamiltonian Monitor');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Config path | \`${summary.hamiltonian.configPath}\` |`);
  lines.push(`| Window size | ${summary.hamiltonian.windowSize ?? '—'} |`);
  lines.push(`| Observation count | ${summary.hamiltonian.observations ?? 0} |`);
  lines.push('');
  lines.push('## Energy Oracle');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Config path | \`${summary.energyOracle.configPath}\` |`);
  lines.push(`| Signer count | ${summary.energyOracle.signerCount} |`);
  lines.push(`| Retain unknown | ${summary.energyOracle.retainUnknown === undefined ? '—' : summary.energyOracle.retainUnknown ? 'true' : 'false'} |`);
  lines.push('');
  lines.push('## Operational Checklist');
  lines.push('');
  lines.push('| Step | Command |');
  lines.push('| --- | --- |');
  lines.push(`| Inspect | \`${summary.operations.inspect}\` |`);
  lines.push(`| Plan | \`${summary.operations.plan}\` |`);
  lines.push(`| Execute | \`${summary.operations.execute}\` |`);
  lines.push(`| Verify | \`${summary.operations.verify}\` |`);
  lines.push(`| Snapshot | \`${summary.operations.snapshot}\` |`);
  lines.push('');
  lines.push('### Documentation Links');
  summary.operations.docs.forEach((doc) => {
    lines.push(`- ${doc}`);
  });

  if (summary.issues.length > 0) {
    lines.push('');
    lines.push('## Loader warnings');
    summary.issues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
  }

  if (includeMermaid) {
    lines.push('');
    lines.push('```mermaid');
    lines.push(summary.diagram.trimEnd());
    lines.push('```');
  }

  return lines.join('\n');
}

function printHelp(): void {
  const lines = [
    'Usage: ts-node ownerControlQuickstart.ts [--network <network>] [--format human|markdown|json] [--out <path>] [--no-mermaid]',
    '',
    'Generates a consolidated owner control report from config/*.json.',
    '',
    'Options:',
    '  --network <name>   Use a specific Hardhat network key (defaults to auto-detect)',
    '  --format <type>    Output format: human, markdown, json (default: human)',
    '  --out <path>       Write the report to a file instead of stdout',
    '  --no-mermaid       Omit the Mermaid control-flow diagram',
    '  --mermaid          Force-include the Mermaid diagram (default behaviour)',
    '  --help             Show this message',
  ];
  console.log(lines.join('\n'));
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const network = options.network;

  const issues: string[] = [];

  const tokenResult = loadTokenConfig({ network });
  const ownerControlResult = loadOwnerControlConfig({ network });
  const stakeManagerResult = safeLoad('stake-manager', () => loadStakeManagerConfig({ network }), issues);
  const feePoolResult = safeLoad('fee-pool', () => loadFeePoolConfig({ network }), issues);
  const rewardEngineResult = safeLoad('reward-engine', () => loadRewardEngineConfig({ network }), issues);
  const thermodynamicsResult = safeLoad('thermodynamics', () => loadThermodynamicsConfig({ network }), issues);
  const hamiltonianResult = safeLoad('hamiltonian-monitor', () => loadHamiltonianMonitorConfig({ network }), issues);
  const energyOracleResult = safeLoad('energy-oracle', () => loadEnergyOracleConfig({ network }), issues);

  const resolvedNetwork = network ?? tokenResult.network ?? ownerControlResult.network;

  let rewardEngineConfig = rewardEngineResult?.config as any;
  let rewardEnginePath = rewardEngineResult?.path;
  if (!rewardEngineConfig) {
    const fallback = await readFallbackConfig('reward-engine', resolvedNetwork);
    if (fallback) {
      rewardEngineConfig = fallback.data;
      rewardEnginePath = fallback.path;
    }
  }

  let thermodynamicsConfig = thermodynamicsResult?.config as any;
  let thermodynamicsPath = thermodynamicsResult?.path;
  if (!thermodynamicsConfig) {
    const fallback = await readFallbackConfig('thermodynamics', resolvedNetwork);
    if (fallback) {
      thermodynamicsConfig = fallback.data;
      thermodynamicsPath = fallback.path;
    }
  }

  const decimals =
    typeof tokenResult.config.decimals === 'number' && Number.isInteger(tokenResult.config.decimals)
      ? tokenResult.config.decimals
      : 18;
  const symbol = tokenResult.config.symbol ?? 'AGIALPHA';

  const stakeMin = describeTokenFromTokens(
    stakeManagerResult?.config.minStakeTokens,
    decimals,
    symbol
  );
  const stakeMax = describeTokenFromTokens(
    stakeManagerResult?.config.maxStakePerAddressTokens,
    decimals,
    symbol
  );

  const moduleSummaries: ModuleSummary[] = Object.entries(ownerControlResult.config.modules ?? {}).map(
    ([name, raw]) => {
      const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const module: ModuleSummary = {
        name,
        type: String(value.type ?? 'unspecified'),
      };
      if (value.owner !== undefined) {
        module.owner = String(value.owner);
      }
      if (value.governance !== undefined) {
        module.governance = String(value.governance);
      }
      if (value.pauser !== undefined) {
        module.pauser = String(value.pauser);
      }
      const notes: string[] = [];
      if (value.description) {
        notes.push(String(value.description));
      }
      if (value.requireTimelock) {
        notes.push('requires timelock');
      }
      if (notes.length > 0) {
        module.notes = notes;
      }
      return module;
    }
  );

  const summary: QuickstartSummary = {
    generatedAt: new Date().toISOString(),
    network: resolvedNetwork,
    token: {
      address: tokenResult.config.address,
      symbol: tokenResult.config.symbol,
      name: tokenResult.config.name,
      decimals,
      burnAddress: tokenResult.config.burnAddress,
      governance: tokenResult.config.governance,
      modules: tokenResult.config.modules,
      configPath: toRelative(tokenResult.path, 'config/agialpha.json'),
    },
    governance: {
      defaultGovernance: ownerControlResult.config.governance,
      defaultOwner: ownerControlResult.config.owner,
      modules: moduleSummaries,
      configPath: toRelative(ownerControlResult.path, 'config/owner-control.json'),
    },
    stakeManager: {
      minStake: stakeMin.display,
      minStakeBase: stakeMin.base,
      maxStakePerAddress: stakeMax.display,
      employerSlashPct: stakeManagerResult?.config.employerSlashPct,
      treasurySlashPct: stakeManagerResult?.config.treasurySlashPct,
      feePct: stakeManagerResult?.config.feePct,
      burnPct: stakeManagerResult?.config.burnPct,
      validatorRewardPct: stakeManagerResult?.config.validatorRewardPct,
      validatorSlashRewardPct: stakeManagerResult?.config.validatorSlashRewardPct,
      treasury: stakeManagerResult?.config.treasury,
      pauser: stakeManagerResult?.config.pauser,
      configPath: toRelative(stakeManagerResult?.path, 'config/stake-manager.json'),
    },
    feePool: {
      burnPct: feePoolResult?.config.burnPct,
      rewardRole: feePoolResult?.config.rewardRole,
      treasury: feePoolResult?.config.treasury,
      governance: feePoolResult?.config.governance,
      pauser: feePoolResult?.config.pauser,
      taxPolicy: feePoolResult?.config.taxPolicy,
      configPath: toRelative(feePoolResult?.path, 'config/fee-pool.json'),
    },
    rewardEngine: {
      roleShares: rewardEngineConfig?.roleShares,
      kappa: rewardEngineConfig?.kappa,
      temperature: rewardEngineConfig?.temperature,
      maxProofs: rewardEngineConfig?.maxProofs,
      treasury: rewardEngineConfig?.treasury,
      configPath: toRelative(rewardEnginePath, 'config/reward-engine.json'),
    },
    thermostat: {
      systemTemperature: thermodynamicsConfig?.thermostat?.systemTemperature,
      bounds: thermodynamicsConfig?.thermostat?.bounds,
      pid: thermodynamicsConfig?.thermostat?.pid,
      integralBounds: thermodynamicsConfig?.thermostat?.integralBounds,
      configPath: toRelative(thermodynamicsPath, 'config/thermodynamics.json'),
    },
    hamiltonian: {
      windowSize: hamiltonianResult?.config.windowSize,
      observations: hamiltonianResult && Array.isArray(hamiltonianResult.config.observations)
        ? hamiltonianResult.config.observations.length
        : 0,
      configPath: toRelative(hamiltonianResult?.path, 'config/hamiltonian-monitor.json'),
    },
    energyOracle: {
      signerCount: energyOracleResult && Array.isArray(energyOracleResult.config.signers)
        ? energyOracleResult.config.signers.length
        : 0,
      retainUnknown: energyOracleResult?.config.retainUnknown,
      configPath: toRelative(energyOracleResult?.path, 'config/energy-oracle.json'),
    },
    operations: {
      inspect: `npm run owner:surface -- --network ${network ?? '<network>'}`,
      plan: `npm run owner:wizard -- --network ${network ?? '<network>'}`,
      execute: `npm run owner:update-all -- --network ${network ?? '<network>'} --execute`,
      verify: `npm run owner:verify-control -- --network ${network ?? '<network>'}`,
      snapshot: `npm run owner:quickstart -- --network ${network ?? '<network>'} --format markdown --out reports/${network ?? '<network>'}-owner-quickstart.md`,
      docs: [
        'docs/owner-control-handbook.md',
        'docs/owner-control-surface.md',
        'docs/owner-control-non-technical-guide.md',
      ],
    },
    issues,
    diagram: buildMermaid(),
  };

  let output: string;
  if (options.format === 'json') {
    output = JSON.stringify(summary, null, 2);
  } else if (options.format === 'markdown') {
    output = renderMarkdown(summary, options.includeMermaid);
  } else {
    output = renderHuman(summary, options.includeMermaid);
  }

  if (options.outPath) {
    await ensureDir(options.outPath);
    await fs.writeFile(options.outPath, output, 'utf8');
    console.log(`Owner quickstart report written to ${options.outPath}`);
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(
    '[owner:quickstart] Failed to generate report:',
    error instanceof Error ? error.message : error
  );
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});

