import { promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  loadOwnerControlConfig,
  loadFeePoolConfig,
  loadJobRegistryConfig,
  loadStakeManagerConfig,
  loadThermodynamicsConfig,
  loadEnergyOracleConfig,
  loadHamiltonianMonitorConfig,
  loadTaxPolicyConfig,
  loadTokenConfig,
} from '../config';

type OutputFormat = 'human' | 'markdown';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
}

interface ControlSummary {
  name: string;
  value: string;
  description: string;
}

interface ModuleSummary {
  key: string;
  label: string;
  configPath: string;
  docs?: string[];
  previewCommand?: string;
  executeCommand?: string;
  verifyCommand?: string;
  controls: ControlSummary[];
  notes?: string[];
}

interface ReportContext {
  networkLabel: string;
  networkPlaceholder: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  ownerDefault?: string;
  governanceDefault?: string;
  ownerConfigPath: string;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface LoaderResult {
  config: any;
  path: string;
  network?: string;
}

function buildFallbackCandidates(key: string, network?: string): string[] {
  const candidates = new Set<string>();
  const baseName = key.replace(/\.json$/i, '');
  if (network) {
    const normalised = String(network).toLowerCase();
    candidates.add(path.join('config', `${baseName}.${normalised}.json`));
    candidates.add(path.join('config', `${baseName}.${network}.json`));
  }
  candidates.add(path.join('config', `${baseName}.json`));
  return Array.from(candidates);
}

async function loadConfigWithFallback(
  label: string,
  loader: () => LoaderResult,
  key: string,
  network?: string
): Promise<LoaderResult> {
  try {
    return loader();
  } catch (error) {
    const verbose = process.env.DEBUG_OWNER_COMMAND_CENTER === '1';
    if (verbose) {
      console.warn(`Falling back to raw JSON for ${label}:`, error);
    }
    const candidates = buildFallbackCandidates(key, network);
    for (const candidate of candidates) {
      const resolved = path.isAbsolute(candidate)
        ? candidate
        : path.join(process.cwd(), candidate);
      try {
        const raw = await fs.readFile(resolved, 'utf8');
        const config = JSON.parse(raw);
        return { config, path: resolved, network };
      } catch (readError) {
        if (verbose) {
          console.warn(`Failed to read fallback ${resolved}:`, readError);
        }
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${label}: ${reason}`);
  }
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
          throw new Error(`${arg} requires a path`);
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
        if (normalised !== 'human' && normalised !== 'markdown') {
          throw new Error('Supported formats: human, markdown');
        }
        options.format = normalised as OutputFormat;
        i += 1;
        break;
      }
      case '--no-mermaid':
        options.includeMermaid = false;
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
  if (!value) {
    return 'Unset';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Unset';
  }
  try {
    const address = ethers.getAddress(trimmed);
    if (address === ZERO_ADDRESS) {
      return 'Unset (0x0000…0000)';
    }
    return address;
  } catch (_error) {
    return trimmed;
  }
}

function shortenAddress(value?: string): string {
  if (!value) {
    return 'unset';
  }
  const formatted = formatAddress(value);
  if (!formatted.startsWith('0x') || formatted.length !== 42) {
    return formatted;
  }
  return `${formatted.slice(0, 6)}…${formatted.slice(-4)}`;
}

function asPercent(value: unknown): string {
  if (value === undefined || value === null) {
    return 'n/a';
  }
  if (typeof value === 'number') {
    return `${value}%`;
  }
  const text = String(value);
  return text.endsWith('%') ? text : `${text}%`;
}

function relativePath(configPath: string): string {
  const cwd = process.cwd();
  return path.relative(cwd, configPath) || '.';
}

function buildOwnerModule(context: ReportContext, ownerConfig: any): ModuleSummary {
  const modules = ownerConfig?.modules ?? {};
  const moduleCount = Object.keys(modules).length;
  const delegated = Object.entries(modules).filter(([, entry]) => {
    const typed = entry as { skip?: boolean } | undefined;
    return Boolean(typed?.skip);
  }).length;

  return {
    key: 'ownerControl',
    label: 'Owner & Governance Routing',
    configPath: context.ownerConfigPath,
    docs: ['docs/owner-control-command-center.md', 'docs/owner-control-surface.md'],
    previewCommand: `npm run owner:surface -- --network ${context.networkPlaceholder}`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:verify-control -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Owner default',
        value: context.ownerDefault ? formatAddress(context.ownerDefault) : 'Unset',
        description: 'Address receiving ownership for Ownable modules when not overridden.',
      },
      {
        name: 'Governance default',
        value: context.governanceDefault ? formatAddress(context.governanceDefault) : 'Unset',
        description: 'Timelock or multisig authorised to govern Governable modules.',
      },
      {
        name: 'Configured modules',
        value: `${moduleCount} tracked (${delegated} skipped)`,
        description: 'Modules listed under config.modules with governance/ownership strategy.',
      },
    ],
    notes: [
      'Run the preview command before every change to capture the current control surface.',
      'Use --safe to generate a Gnosis Safe bundle for multi-sig execution.',
    ],
  };
}

function buildFeePoolModule(context: ReportContext, feePool: any): ModuleSummary {
  const allowlist = Object.keys(feePool?.treasuryAllowlist ?? {}).length;
  const rewarders = Object.keys(feePool?.rewarders ?? {}).length;
  return {
    key: 'feePool',
    label: 'Fee Pool',
    configPath: feePool?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-command-center.md#1-update-treasury-destination', 'docs/owner-control-handbook.md'],
    previewCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=feePool`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=feePool --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Burn percentage',
        value: asPercent(feePool?.burnPct ?? 0),
        description: 'Portion of protocol fees burned on each settlement.',
      },
      {
        name: 'Treasury address',
        value: formatAddress(feePool?.treasury),
        description: 'Destination for non-burned fees (set to zero to burn all residuals).',
      },
      {
        name: 'Treasury allowlist',
        value: `${allowlist} address${allowlist === 1 ? '' : 'es'}`,
        description: 'Approved treasury targets for FeePool.setTreasury.',
      },
      {
        name: 'Rewarder agents',
        value: `${rewarders} configured`,
        description: 'Active rewarder contracts permitted to pull rewards.',
      },
    ],
  };
}

function buildJobRegistryModule(context: ReportContext, jobRegistry: any): ModuleSummary {
  return {
    key: 'jobRegistry',
    label: 'Job Registry',
    configPath: jobRegistry?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-playbook.md', 'docs/owner-control-zero-downtime-guide.md'],
    previewCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=jobRegistry`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=jobRegistry --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Job stake requirement',
        value: `${jobRegistry?.jobStakeTokens ?? '0'} ${context.tokenSymbol}`,
        description: 'Tokens escrowed per job posting.',
      },
      {
        name: 'Minimum agent stake',
        value: `${jobRegistry?.minAgentStakeTokens ?? '0'} ${context.tokenSymbol}`,
        description: 'Threshold stake before agents may accept work.',
      },
      {
        name: 'Protocol fee',
        value: asPercent(jobRegistry?.feePct ?? 0),
        description: 'Percentage of job rewards collected as fees.',
      },
      {
        name: 'Treasury address',
        value: formatAddress(jobRegistry?.treasury),
        description: 'Optional treasury recipient for fees collected by the registry.',
      },
    ],
  };
}

function buildStakeManagerModule(context: ReportContext, stakeManager: any): ModuleSummary {
  const autoStake = stakeManager?.autoStake ?? {};
  return {
    key: 'stakeManager',
    label: 'Stake Manager',
    configPath: stakeManager?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-handbook.md', 'docs/owner-control-command-center.md#scenario-playbooks'],
    previewCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=stakeManager`,
    executeCommand: `npm run owner:update-all -- --network ${context.networkPlaceholder} --only=stakeManager --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Minimum stake',
        value: `${stakeManager?.minStakeTokens ?? '0'} ${context.tokenSymbol}`,
        description: 'Minimum collateral for participating agents.',
      },
      {
        name: 'Unbonding period',
        value: `${stakeManager?.unbondingPeriodSeconds ?? 0} seconds`,
        description: 'Cooling-off period before stake withdrawals unlock.',
      },
      {
        name: 'Burn percentage',
        value: asPercent(stakeManager?.burnPct ?? 0),
        description: 'Slash share that is permanently burned.',
      },
      {
        name: 'Auto-stake',
        value: autoStake.enabled ? 'Enabled' : 'Disabled',
        description: 'Automatic stake tuning based on Hamiltonian/temperature data.',
      },
    ],
  };
}

function buildThermodynamicsModule(context: ReportContext, thermodynamics: any): ModuleSummary {
  const shares = thermodynamics?.rewardEngine?.roleShares ?? {};
  const pid = thermodynamics?.thermostat?.pid ?? {};
  const bounds = thermodynamics?.thermostat?.bounds ?? {};
  return {
    key: 'thermodynamics',
    label: 'Thermodynamics & Reward Engine',
    configPath:
      thermodynamics?.__path ?? thermodynamics?.rewardEngine?.__path ?? context.ownerConfigPath,
    docs: ['docs/thermodynamic-incentives.md', 'docs/thermodynamics-operations.md'],
    previewCommand: `npx hardhat run scripts/v2/updateThermodynamics.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateThermodynamics.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:health -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Role shares',
        value: `A ${shares.agent ?? 0}% / V ${shares.validator ?? 0}% / O ${shares.operator ?? 0}% / E ${shares.employer ?? 0}%`,
        description: 'Reward distribution between agents, validators, operators, and employers.',
      },
      {
        name: 'System temperature',
        value: thermodynamics?.thermostat?.systemTemperature ?? '0',
        description: 'Base temperature controlling reward spread (scaled by 1e18).',
      },
      {
        name: 'PID gains',
        value: `kp ${pid.kp ?? '0'} / ki ${pid.ki ?? '0'} / kd ${pid.kd ?? '0'}`,
        description: 'Thermostat PID controller coefficients.',
      },
      {
        name: 'Temperature bounds',
        value: `${bounds.min ?? '0'} → ${bounds.max ?? '0'}`,
        description: 'Minimum and maximum allowable thermostat temperature.',
      },
    ],
  };
}

function buildEnergyOracleModule(context: ReportContext, energyOracle: any): ModuleSummary {
  const signerCount = (energyOracle?.signers ?? []).length;
  return {
    key: 'energyOracle',
    label: 'Energy Oracle',
    configPath: energyOracle?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-command-center.md#3-refresh-energy-oracle-signers'],
    previewCommand: `npx hardhat run scripts/v2/updateEnergyOracle.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateEnergyOracle.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Authorised signers',
        value: `${signerCount} configured`,
        description: 'Measurement nodes allowed to sign energy attestations.',
      },
      {
        name: 'Retain unknown signers',
        value: energyOracle?.retainUnknown === false ? 'Disabled' : 'Enabled',
        description: 'Whether to keep signers present on-chain but absent from configuration.',
      },
    ],
  };
}

function buildHamiltonianModule(context: ReportContext, monitor: any): ModuleSummary {
  const records = monitor?.records ?? [];
  return {
    key: 'hamiltonianMonitor',
    label: 'Hamiltonian Monitor',
    configPath: monitor?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-command-center.md#scenario-playbooks'],
    previewCommand: `npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateHamiltonianMonitor.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Window size',
        value: monitor?.window ?? '0',
        description: 'Number of epochs retained for Hamiltonian averaging.',
      },
      {
        name: 'Recorded observations',
        value: `${records.length} stored`,
        description: 'Existing Hamiltonian snapshots in the configuration file.',
      },
      {
        name: 'Reset history',
        value: monitor?.resetHistory ? 'Enabled' : 'Disabled',
        description: 'If true, helper will wipe on-chain monitor history on next update.',
      },
    ],
  };
}

function buildTaxPolicyModule(context: ReportContext, taxPolicy: any): ModuleSummary {
  const acknowledgers = Object.keys(taxPolicy?.acknowledgers ?? {}).length;
  const revocations = taxPolicy?.revokeAcknowledgements ?? [];
  return {
    key: 'taxPolicy',
    label: 'Tax Policy',
    configPath: taxPolicy?.__path ?? context.ownerConfigPath,
    docs: ['docs/owner-control-handbook.md', 'docs/owner-control-quick-reference.md'],
    previewCommand: `npx hardhat run scripts/v2/updateTaxPolicy.ts --network ${context.networkPlaceholder}`,
    executeCommand: `npx hardhat run scripts/v2/updateTaxPolicy.ts --network ${context.networkPlaceholder} --execute`,
    verifyCommand: `npm run owner:dashboard -- --network ${context.networkPlaceholder}`,
    controls: [
      {
        name: 'Policy URI',
        value: taxPolicy?.policyURI ?? 'unset',
        description: 'Content-addressed URI describing the live tax policy.',
      },
      {
        name: 'Acknowledgement text',
        value: taxPolicy?.acknowledgement ?? 'unset',
        description: 'Statement users must accept before participating.',
      },
      {
        name: 'Allowlist entries',
        value: `${acknowledgers} address${acknowledgers === 1 ? '' : 'es'}`,
        description: 'Accounts already acknowledged via config.',
      },
      {
        name: 'Revocations queued',
        value: `${revocations.length} pending`,
        description: 'Acknowledgements to revoke on next execution.',
      },
    ],
  };
}

function buildModules(context: ReportContext, configs: {
  ownerConfig: any;
  feePool: any;
  jobRegistry: any;
  stakeManager: any;
  thermodynamics: any;
  energyOracle: any;
  hamiltonianMonitor: any;
  taxPolicy: any;
}): ModuleSummary[] {
  const modules: ModuleSummary[] = [];
  modules.push(buildOwnerModule(context, configs.ownerConfig));
  modules.push(buildFeePoolModule(context, configs.feePool));
  modules.push(buildJobRegistryModule(context, configs.jobRegistry));
  modules.push(buildStakeManagerModule(context, configs.stakeManager));
  modules.push(buildThermodynamicsModule(context, configs.thermodynamics));
  modules.push(buildEnergyOracleModule(context, configs.energyOracle));
  modules.push(buildHamiltonianModule(context, configs.hamiltonianMonitor));
  modules.push(buildTaxPolicyModule(context, configs.taxPolicy));
  return modules;
}

function renderHuman(context: ReportContext, modules: ModuleSummary[], includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('AGIJobs Owner Command Center');
  lines.push('='.repeat(32));
  lines.push(`Network: ${context.networkLabel}`);
  lines.push(`Token: ${context.tokenSymbol} (${shortenAddress(context.tokenAddress)}), ${context.tokenDecimals} decimals`);
  lines.push('');
  lines.push('Governance defaults');
  lines.push('-'.repeat(20));
  lines.push(`• Owner default: ${context.ownerDefault ? formatAddress(context.ownerDefault) : 'Unset'}`);
  lines.push(`• Governance default: ${context.governanceDefault ? formatAddress(context.governanceDefault) : 'Unset'}`);
  lines.push('');

  modules.forEach((module) => {
    lines.push(`Module: ${module.label}`);
    lines.push('-'.repeat(8 + module.label.length));
    lines.push(`Config file: ${relativePath(module.configPath)}`);
    if (module.docs?.length) {
      lines.push(`Docs: ${module.docs.join(', ')}`);
    }
    if (module.previewCommand) {
      lines.push(`Preview: ${module.previewCommand}`);
    }
    if (module.executeCommand) {
      lines.push(`Execute: ${module.executeCommand}`);
    }
    if (module.verifyCommand) {
      lines.push(`Verify: ${module.verifyCommand}`);
    }
    module.controls.forEach((control) => {
      lines.push(`  - ${control.name}: ${control.value}`);
      lines.push(`      ${control.description}`);
    });
    if (module.notes?.length) {
      module.notes.forEach((note) => lines.push(`      Note: ${note}`));
    }
    lines.push('');
  });

  if (includeMermaid) {
    lines.push('Mermaid overview');
    lines.push('-'.repeat(16));
    lines.push(renderMermaid(context, modules));
  }

  return lines.join('\n');
}

function renderMarkdown(context: ReportContext, modules: ModuleSummary[], includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('# AGIJobs Owner Command Center');
  lines.push('');
  lines.push(`- **Network:** ${context.networkLabel}`);
  lines.push(`- **Token:** ${context.tokenSymbol} (${formatAddress(context.tokenAddress)})`);
  lines.push(`- **Decimals:** ${context.tokenDecimals}`);
  lines.push(`- **Owner default:** ${context.ownerDefault ? formatAddress(context.ownerDefault) : 'Unset'}`);
  lines.push(`- **Governance default:** ${context.governanceDefault ? formatAddress(context.governanceDefault) : 'Unset'}`);
  lines.push('');

  modules.forEach((module) => {
    lines.push(`## ${module.label}`);
    lines.push('');
    lines.push(`- **Config:** \`${relativePath(module.configPath)}\``);
    if (module.docs?.length) {
      lines.push(`- **Docs:** ${module.docs.map((doc) => `[\`${doc}\`](${doc})`).join(', ')}`);
    }
    if (module.previewCommand) {
      lines.push(`- **Preview:** \`${module.previewCommand}\``);
    }
    if (module.executeCommand) {
      lines.push(`- **Execute:** \`${module.executeCommand}\``);
    }
    if (module.verifyCommand) {
      lines.push(`- **Verify:** \`${module.verifyCommand}\``);
    }
    lines.push('');
    lines.push('| Control | Value | Purpose |');
    lines.push('| --- | --- | --- |');
    module.controls.forEach((control) => {
      lines.push(`| ${control.name} | ${control.value} | ${control.description} |`);
    });
    if (module.notes?.length) {
      lines.push('');
      module.notes.forEach((note) => lines.push(`> ${note}`));
    }
    lines.push('');
  });

  if (includeMermaid) {
    lines.push('## Visual Overview');
    lines.push('');
    lines.push(renderMermaid(context, modules));
    lines.push('');
  }

  return lines.join('\n');
}

function renderMermaid(context: ReportContext, modules: ModuleSummary[]): string {
  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart LR');
  lines.push('    subgraph Governance');
  lines.push(`        OWNER[Owner Default\\n${shortenAddress(context.ownerDefault)}]`);
  lines.push(`        GOV[Governance Default\\n${shortenAddress(context.governanceDefault)}]`);
  lines.push('    end');
  modules
    .filter((module) => module.key !== 'ownerControl')
    .forEach((module) => {
      const highlight = module.controls
        .slice(0, 2)
        .map((control) => `${control.name}: ${control.value}`)
        .join('\\n');
      lines.push(`    OWNER --> ${module.key.toUpperCase()}[${module.label}\\n${highlight}]`);
      lines.push(`    GOV --> ${module.key.toUpperCase()}[${module.label}\\n${highlight}]`);
    });
  lines.push('```');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: ts-node scripts/v2/ownerCommandCenter.ts [--network <name>] [--format human|markdown] [--output <file>] [--no-mermaid]');
    return;
  }

  const loadOptions = options.network ? { network: options.network } : {};

  const ownerConfig = await loadConfigWithFallback(
    'owner control config',
    () => loadOwnerControlConfig(loadOptions),
    'owner-control',
    options.network
  );
  const feePool = await loadConfigWithFallback(
    'fee pool config',
    () => loadFeePoolConfig(loadOptions),
    'fee-pool',
    options.network
  );
  const jobRegistry = await loadConfigWithFallback(
    'job registry config',
    () => loadJobRegistryConfig(loadOptions),
    'job-registry',
    options.network
  );
  const stakeManager = await loadConfigWithFallback(
    'stake manager config',
    () => loadStakeManagerConfig(loadOptions),
    'stake-manager',
    options.network
  );
  const thermodynamics = await loadConfigWithFallback(
    'thermodynamics config',
    () => loadThermodynamicsConfig(loadOptions),
    'thermodynamics',
    options.network
  );
  const energyOracle = await loadConfigWithFallback(
    'energy oracle config',
    () => loadEnergyOracleConfig(loadOptions),
    'energy-oracle',
    options.network
  );
  const hamiltonianMonitor = await loadConfigWithFallback(
    'hamiltonian monitor config',
    () => loadHamiltonianMonitorConfig(loadOptions),
    'hamiltonian-monitor',
    options.network
  );
  const taxPolicy = await loadConfigWithFallback(
    'tax policy config',
    () => loadTaxPolicyConfig(loadOptions),
    'tax-policy',
    options.network
  );
  const tokenConfig = await loadConfigWithFallback(
    'token config',
    () => loadTokenConfig(loadOptions),
    'agialpha',
    options.network
  );

  const networkLabel = ownerConfig.network ?? options.network ?? 'default';
  const networkPlaceholder = options.network ?? ownerConfig.network ?? '<network>';

  const context: ReportContext = {
    networkLabel,
    networkPlaceholder,
    tokenSymbol: tokenConfig?.config?.symbol ?? '$AGI',
    tokenAddress: tokenConfig?.config?.address ?? ZERO_ADDRESS,
    tokenDecimals: tokenConfig?.config?.decimals ?? 18,
    ownerDefault: ownerConfig?.config?.owner,
    governanceDefault: ownerConfig?.config?.governance,
    ownerConfigPath: ownerConfig?.path ?? path.join(process.cwd(), 'config', 'owner-control.json'),
  };

  const modules = buildModules(context, {
    ownerConfig: ownerConfig?.config,
    feePool: {
      ...feePool?.config,
      __path:
        feePool?.path ?? path.join(process.cwd(), 'config', 'fee-pool.json'),
    },
    jobRegistry: {
      ...jobRegistry?.config,
      __path:
        jobRegistry?.path ?? path.join(process.cwd(), 'config', 'job-registry.json'),
    },
    stakeManager: {
      ...stakeManager?.config,
      __path:
        stakeManager?.path ?? path.join(process.cwd(), 'config', 'stake-manager.json'),
    },
    thermodynamics: {
      ...thermodynamics?.config,
      __path:
        thermodynamics?.path ?? path.join(process.cwd(), 'config', 'thermodynamics.json'),
    },
    energyOracle: {
      ...energyOracle?.config,
      __path:
        energyOracle?.path ?? path.join(process.cwd(), 'config', 'energy-oracle.json'),
    },
    hamiltonianMonitor: {
      ...hamiltonianMonitor?.config,
      __path:
        hamiltonianMonitor?.path ??
        path.join(process.cwd(), 'config', 'hamiltonian-monitor.json'),
    },
    taxPolicy: {
      ...taxPolicy?.config,
      __path:
        taxPolicy?.path ?? path.join(process.cwd(), 'config', 'tax-policy.json'),
    },
  });

  let output: string;
  if (options.format === 'markdown') {
    output = renderMarkdown(context, modules, options.includeMermaid);
  } else {
    output = renderHuman(context, modules, options.includeMermaid);
  }

  if (options.outPath) {
    await fs.writeFile(options.outPath, output, 'utf8');
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error('ownerCommandCenter failed:', error);
  process.exitCode = 1;
});

