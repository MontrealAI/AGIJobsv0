import { promises as fs } from 'fs';
import path from 'path';
import { formatUnits, parseUnits } from 'ethers';
import { inferNetworkKey } from '../config';

interface CliOptions {
  network?: string;
  format: 'markdown' | 'human' | 'json';
  out?: string;
  diagrams: boolean;
  help?: boolean;
}

interface ModuleRow {
  key: string;
  label: string;
  configPath: string;
  updateCommand: string;
  verifyCommand: string;
  owner?: string;
  governance?: string;
}

interface BlueprintDocument {
  generatedAt: string;
  network?: string;
  modules: ModuleRow[];
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    burnAddress?: string;
  };
  hgmControl: Record<string, string>;
  jobRegistry: Record<string, string>;
  stakeManager: Record<string, string>;
  feePool: Record<string, string>;
  incentives: Record<string, string>;
  thermodynamics: Record<string, string>;
  energyOracle: Record<string, string>;
}

function printUsage(): void {
  const lines = [
    'Usage: npm run owner:blueprint -- [options]',
    '',
    'Options:',
    '  -h, --help            Show this help and exit',
    '  -n, --network NAME    Select configuration network (mainnet | sepolia)',
    '      --format KIND     Output format (markdown | human | json)',
    '      --out PATH        Write output to PATH instead of stdout',
    '      --no-diagrams     Skip Mermaid diagrams',
    '',
    'Examples:',
    '  npm run owner:blueprint -- --network mainnet --out reports/mainnet-blueprint.md',
    '  npm run owner:blueprint -- --network sepolia --format human',
  ];
  console.log(lines.join('\n'));
}

function parseArgs(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const options: CliOptions = { format: 'markdown', diagrams: true };

  const envNetworkSources = [
    env.OWNER_BLUEPRINT_NETWORK,
    env.OWNER_PLAN_NETWORK,
    env.OWNER_WIZARD_NETWORK,
    env.AGIALPHA_NETWORK,
    env.AGJ_NETWORK,
    env.HARDHAT_NETWORK,
    env.TRUFFLE_NETWORK,
  ];

  for (const candidate of envNetworkSources) {
    if (!candidate) continue;
    const resolved = inferNetworkKey(candidate);
    if (resolved) {
      options.network = resolved;
      break;
    }
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--network':
      case '-n': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        const resolved = inferNetworkKey(value);
        if (!resolved) {
          throw new Error(`Unknown network ${value}`);
        }
        options.network = resolved;
        i += 1;
        break;
      }
      case '--format': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--format requires a value');
        }
        const lower = value.toLowerCase();
        if (lower === 'markdown' || lower === 'md') {
          options.format = 'markdown';
        } else if (lower === 'human' || lower === 'text') {
          options.format = 'human';
        } else if (lower === 'json') {
          options.format = 'json';
        } else {
          throw new Error(`Unsupported format ${value}`);
        }
        i += 1;
        break;
      }
      case '--out':
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.out = value;
        i += 1;
        break;
      }
      case '--no-diagrams':
        options.diagrams = false;
        break;
      default:
        throw new Error(`Unknown argument ${arg}`);
    }
  }

  return options;
}

const CONFIG_DIR = path.resolve(__dirname, '..', '..', 'config');

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_) {
    return false;
  }
}

async function loadConfig(
  baseName: string,
  network?: string
): Promise<{ config: any; path: string }> {
  const basePath = path.join(CONFIG_DIR, `${baseName}.json`);
  const networkPath = network
    ? path.join(CONFIG_DIR, `${baseName}.${network}.json`)
    : undefined;
  const configPath =
    networkPath && (await fileExists(networkPath)) ? networkPath : basePath;
  const raw = await fs.readFile(configPath, 'utf8');
  return { config: JSON.parse(raw), path: configPath };
}

function formatAddress(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '0x0000000000000000000000000000000000000000') {
    return 'not set';
  }
  return trimmed;
}

function tokenAmount(
  tokens: string | number | undefined,
  decimals: number,
  symbol: string
): string {
  if (tokens === undefined || tokens === null) {
    return 'not configured';
  }
  const asString = typeof tokens === 'number' ? tokens.toString() : tokens;
  try {
    const base = parseUnits(asString, decimals);
    return `${formatUnits(base, decimals)} ${symbol} (${base.toString()} base units)`;
  } catch (error) {
    return `${asString} ${symbol}`;
  }
}

function percent(value?: string | number | null): string {
  if (value === undefined || value === null) return 'not configured';
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return String(value);
  return `${asNumber}%`;
}

async function ensureOutDirectory(targetPath: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
}

function toModuleRow(
  key: string,
  label: string,
  configPath: string,
  network: string | undefined,
  ownerControl: Record<string, any>
): ModuleRow {
  const modules = ownerControl.modules ?? {};
  const moduleConfig = modules[key] ?? {};
  const moduleOwner = moduleConfig.owner;
  const moduleGovernance = moduleConfig.governance;
  const globalOwner = ownerControl.owner;
  const globalGovernance = ownerControl.governance;
  const networkSegment = network ? `--network ${network}` : '--network <network>';
  const moduleFlag = `--only=${key}`;
  const moduleVerify = `--modules=${key}`;
  const updateCommand = `npm run owner:update-all -- ${networkSegment} ${moduleFlag}`;
  const verifyCommand = `npm run owner:verify-control -- ${networkSegment} ${moduleVerify}`;
  const relativePath = path.relative(process.cwd(), configPath) || configPath;

  const ownerLabel = moduleOwner
    ? formatAddress(moduleOwner)
    : globalOwner
    ? `inherit (${formatAddress(globalOwner)})`
    : 'inherit (not set)';
  const governanceLabel = moduleGovernance
    ? formatAddress(moduleGovernance)
    : globalGovernance
    ? `inherit (${formatAddress(globalGovernance)})`
    : 'inherit (not set)';

  return {
    key,
    label,
    configPath: relativePath,
    updateCommand,
    verifyCommand,
    owner: ownerLabel,
    governance: governanceLabel,
  };
}

async function buildBlueprint(
  options: CliOptions
): Promise<BlueprintDocument> {
  const token = await loadConfig('agialpha', options.network);
  const jobRegistry = await loadConfig('job-registry', options.network);
  const stakeManager = await loadConfig('stake-manager', options.network);
  const feePool = await loadConfig('fee-pool', options.network);
  const incentives = await loadConfig('platform-incentives', options.network);
  const registry = await loadConfig('platform-registry', options.network);
  const ownerControl = await loadConfig('owner-control', options.network);
  const thermo = await loadConfig('thermodynamics', options.network);
  const rewardEngine = await loadConfig('reward-engine', options.network);
  const energyOracle = await loadConfig('energy-oracle', options.network);
  const hgmControl = await loadConfig('hgm-control-module', options.network);

  const network = options.network;
  const ownerControlConfig = ownerControl.config ?? {};
  const hgmControlConfig = hgmControl.config ?? {};

  const moduleRows: ModuleRow[] = [
    toModuleRow(
      'hgmControlModule',
      'HGM Control Module',
      hgmControl.path,
      network,
      ownerControlConfig
    ),
    toModuleRow('jobRegistry', 'Job Registry', jobRegistry.path, network, ownerControlConfig),
    toModuleRow('stakeManager', 'Stake Manager', stakeManager.path, network, ownerControlConfig),
    toModuleRow('feePool', 'Fee Pool', feePool.path, network, ownerControlConfig),
    toModuleRow('platformRegistry', 'Platform Registry', registry.path, network, ownerControlConfig),
    toModuleRow('platformIncentives', 'Platform Incentives', incentives.path, network, ownerControlConfig),
    toModuleRow('rewardEngine', 'Reward Engine', rewardEngine.path, network, ownerControlConfig),
    toModuleRow('thermostat', 'Thermostat', thermo.path, network, ownerControlConfig),
  ];

  const decimals = token.config.decimals ?? 18;
  const symbol = token.config.symbol ?? 'AGIA';
  const rewardEngineConfig = rewardEngine.config?.rewardEngine ?? rewardEngine.config ?? {};
  const thermostatConfig =
    rewardEngine.config?.thermostat ?? thermo.config?.thermostat ?? {};

  const document: BlueprintDocument = {
    generatedAt: new Date().toISOString(),
    network,
    modules: moduleRows,
    token: {
      address: formatAddress(token.config.address) ?? 'not set',
      symbol,
      name: token.config.name ?? 'AGIALPHA',
      decimals,
      burnAddress: formatAddress(token.config.burnAddress),
    },
    hgmControl: {
      'Module address': formatAddress(hgmControlConfig.address) ?? 'not deployed',
      'Job registry target': formatAddress(hgmControlConfig.targets?.jobRegistry) ?? 'not set',
      'Stake manager target': formatAddress(hgmControlConfig.targets?.stakeManager) ?? 'not set',
      'System pause target': formatAddress(hgmControlConfig.targets?.systemPause) ?? 'not set',
      'Platform registry target':
        formatAddress(hgmControlConfig.targets?.platformRegistry) ?? 'not set',
      'Reputation engine target':
        formatAddress(hgmControlConfig.targets?.reputationEngine) ?? 'not set',
    },
    jobRegistry: {
      'Stake requirement': tokenAmount(jobRegistry.config.jobStakeTokens, decimals, symbol),
      'Minimum agent stake': tokenAmount(jobRegistry.config.minAgentStakeTokens, decimals, symbol),
      'Maximum job reward': tokenAmount(jobRegistry.config.maxJobRewardTokens, decimals, symbol),
      'Protocol fee %': percent(jobRegistry.config.feePct),
      'Validator reward %': percent(jobRegistry.config.validatorRewardPct),
      'Treasury destination': formatAddress(jobRegistry.config.treasury) ?? 'not set',
      'Tax policy module': formatAddress(jobRegistry.config.taxPolicy) ?? 'not set',
      'Validation module': formatAddress(jobRegistry.config.validationModule) ?? 'not set',
    },
    stakeManager: {
      'Minimum stake': tokenAmount(stakeManager.config.minStakeTokens, decimals, symbol),
      'Validator reward %': percent(stakeManager.config.validatorRewardPct),
      'Employer slash %': percent(stakeManager.config.employerSlashPct),
      Treasury: formatAddress(stakeManager.config.treasury) ?? 'not set',
      'Burn %': percent(stakeManager.config.burnPct),
    },
    feePool: {
      'Burn %': percent(feePool.config.burnPct),
      Treasury: formatAddress(feePool.config.treasury) ?? 'not set',
      'Tax policy': formatAddress(feePool.config.taxPolicy) ?? 'not set',
    },
    incentives: {
      'Max discount %': percent(incentives.config.maxDiscountPct),
      'Stake manager wiring': formatAddress(incentives.config.stakeManager) ?? 'not set',
      'Platform registry wiring': formatAddress(incentives.config.platformRegistry) ?? 'not set',
    },
    thermodynamics: {
      'Reward engine temperature': String(rewardEngineConfig.temperature ?? 'not configured'),
      'Thermostat system temperature': String(
        thermostatConfig.systemTemperature ?? 'not configured'
      ),
      'Role share (agent)': percent(rewardEngineConfig.roleShares?.agent),
      'Role share (validator)': percent(rewardEngineConfig.roleShares?.validator),
    },
    energyOracle: {
      'Signer count': String(energyOracle.config.signers?.length ?? 0),
      'First signer': energyOracle.config.signers?.[0]
        ? formatAddress(energyOracle.config.signers[0]) ?? 'not set'
        : 'none configured',
    },
  };

  return document;
}

function renderMarkdown(doc: BlueprintDocument, includeDiagrams: boolean): string {
  const lines: string[] = [];
  lines.push('# Owner Control Blueprint (auto-generated)');
  lines.push('');
  lines.push(`- **Generated (UTC):** ${doc.generatedAt}`);
  lines.push(`- **Network context:** ${doc.network ?? 'not specified (edit with --network)'}`);
  lines.push('');
  lines.push(
    '> This blueprint captures the live configuration surface so the contract owner can adjust parameters, plan transactions, and verify the deployment without touching Solidity.'
  );
  lines.push('');
  if (includeDiagrams) {
    lines.push('```mermaid');
    lines.push('flowchart LR');
    lines.push('  Plan[Config edit\n`git commit`] --> DryRun[`npm run owner:update-all`]');
    lines.push('  DryRun -->|Approved| Execute[`npm run owner:update-all -- --execute`]');
    lines.push('  Execute --> Verify[`npm run owner:verify-control`]');
    lines.push('  Verify --> Archive[Archive artefacts]');
    lines.push('  DryRun -->|Needs revision| Plan');
    lines.push('```');
    lines.push('');
  }

  lines.push('## Module command matrix');
  lines.push('');
  lines.push('| Module | Config file | Owner | Governance | Update command | Verification |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of doc.modules) {
    lines.push(
      `| ${row.label} | \`${row.configPath}\` | ${row.owner ?? 'inherit'} | ${row.governance ?? 'inherit'} | \`${row.updateCommand}\` | \`${row.verifyCommand}\` |`
    );
  }
  lines.push('');

  lines.push('## Token constants');
  lines.push('');
  lines.push(`- Address: \`${doc.token.address}\``);
  lines.push(`- Symbol: \`${doc.token.symbol}\``);
  lines.push(`- Name: ${doc.token.name}`);
  lines.push(`- Decimals: ${doc.token.decimals}`);
  lines.push(`- Burn address: ${doc.token.burnAddress ?? 'not set'}`);
  lines.push('');

  const sectionEntries: Array<[string, Record<string, string>]> = [
    ['HGM Control Module', doc.hgmControl],
    ['Job Registry', doc.jobRegistry],
    ['Stake Manager', doc.stakeManager],
    ['Fee Pool', doc.feePool],
    ['Platform Incentives', doc.incentives],
    ['Thermodynamics', doc.thermodynamics],
    ['Energy Oracle', doc.energyOracle],
  ];

  for (const [label, values] of sectionEntries) {
    lines.push(`## ${label} snapshot`);
    lines.push('');
    lines.push('| Parameter | Value |');
    lines.push('| --- | --- |');
    for (const [key, value] of Object.entries(values)) {
      lines.push(`| ${key} | ${value} |`);
    }
    lines.push('');
  }

  lines.push('## Zero-downtime checklist');
  lines.push('');
  lines.push('1. `npm run owner:surface -- --network <network> --format markdown --out reports/<network>-surface.md`');
  lines.push('2. Edit JSON or launch the wizard: `npm run owner:wizard -- --network <network>`');
  lines.push('3. Dry run: `npm run owner:update-all -- --network <network>`');
  lines.push('4. Optional Safe bundle: `npm run owner:update-all -- --network <network> --safe owner-plan.json`');
  lines.push('5. Execute: append `--execute` once approvals are in place.');
  lines.push('6. Verify and archive: `npm run owner:verify-control -- --network <network> --strict`.');
  lines.push('');

  if (includeDiagrams) {
    lines.push('```mermaid');
    lines.push('sequenceDiagram');
    lines.push('  participant Owner');
    lines.push('  participant Wizard as owner:wizard');
    lines.push('  participant Planner as owner:update-all');
    lines.push('  participant Chain');
    lines.push('  participant Auditor as owner:verify-control');
    lines.push('  Owner->>Wizard: Capture configuration edits');
    lines.push('  Wizard-->>Owner: JSON diff & backups');
    lines.push('  Owner->>Planner: Dry run plan');
    lines.push('  Planner-->>Owner: Module transaction set');
    lines.push('  Owner->>Planner: Execute with approvals');
    lines.push('  Planner->>Chain: Submit transactions');
    lines.push('  Chain-->>Owner: Tx receipts');
    lines.push('  Owner->>Auditor: Post-change verification');
    lines.push('  Auditor-->>Owner: OK / warnings');
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function renderHuman(doc: BlueprintDocument): string {
  const lines: string[] = [];
  lines.push(`Owner blueprint generated ${doc.generatedAt}${doc.network ? ` for ${doc.network}` : ''}`);
  lines.push('');
  lines.push('Modules:');
  for (const row of doc.modules) {
    lines.push(
      `- ${row.label}: config ${row.configPath}; update with "${row.updateCommand}"; verify with "${row.verifyCommand}"; owner ${row.owner ?? 'inherit'}, governance ${row.governance ?? 'inherit'}`
    );
  }
  lines.push('');
  lines.push('Token:');
  lines.push(
    `- ${doc.token.symbol} (${doc.token.name}) at ${doc.token.address} with ${doc.token.decimals} decimals; burn ${doc.token.burnAddress ?? 'not set'}`
  );
  lines.push('');
  const sectionEntries: Array<[string, Record<string, string>]> = [
    ['HGM Control Module', doc.hgmControl],
    ['Job Registry', doc.jobRegistry],
    ['Stake Manager', doc.stakeManager],
    ['Fee Pool', doc.feePool],
    ['Platform Incentives', doc.incentives],
    ['Thermodynamics', doc.thermodynamics],
    ['Energy Oracle', doc.energyOracle],
  ];
  for (const [label, values] of sectionEntries) {
    lines.push(`${label}:`);
    for (const [key, value] of Object.entries(values)) {
      lines.push(`  • ${key}: ${value}`);
    }
    lines.push('');
  }
  lines.push('Checklist: surface → wizard → update-all → verify-control.');
  return lines.join('\n');
}

async function writeOutput(content: string, options: CliOptions) {
  if (options.out) {
    await ensureOutDirectory(options.out);
    await fs.writeFile(options.out, content, 'utf8');
    console.log(`Blueprint written to ${options.out}`);
  } else {
    console.log(content);
  }
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2), process.env);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printUsage();
    return;
  }

  let blueprint: BlueprintDocument;
  try {
    blueprint = await buildBlueprint(options);
  } catch (error) {
    console.error('Failed to load configuration:', (error as Error).message);
    process.exitCode = 1;
    return;
  }

  if (options.format === 'json') {
    await writeOutput(JSON.stringify(blueprint, null, 2), options);
    return;
  }

  if (options.format === 'human') {
    await writeOutput(renderHuman(blueprint), options);
    return;
  }

  await writeOutput(renderMarkdown(blueprint, options.diagrams), options);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
