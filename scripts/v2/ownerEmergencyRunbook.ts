import { promises as fs } from 'fs';
import path from 'path';
import {
  loadOwnerControlConfig,
  loadFeePoolConfig,
  loadStakeManagerConfig,
  loadJobRegistryConfig,
  loadTaxPolicyConfig,
  loadPlatformRegistryConfig,
  loadPlatformIncentivesConfig,
  loadThermodynamicsConfig,
  loadEnergyOracleConfig,
  loadRandaoCoordinatorConfig,
  loadIdentityRegistryConfig,
  loadTokenConfig,
} from '../config';
import { getAddress } from 'ethers';

type OutputFormat = 'human' | 'markdown' | 'json';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
}

interface ModuleDetail {
  name: string;
  type?: string;
  address?: string | null;
  owner?: string | null;
  governance?: string | null;
  skip?: boolean;
  notes?: string[];
  source?: string;
}

interface ConfigInsight<T> {
  name: string;
  path?: string;
  summary?: T;
  error?: string;
}

interface EmergencyStep {
  title: string;
  objective: string;
  commands: string[];
  validation: string[];
  notes?: string[];
}

interface EmergencyRunbook {
  generatedAt: string;
  network?: string;
  ownerControl: {
    path?: string;
    defaultGovernance?: string;
    defaultOwner?: string;
    modules: ModuleDetail[];
  };
  configInsights: ConfigInsight<Record<string, unknown>>[];
  playbook: EmergencyStep[];
  followUp: EmergencyStep[];
  diagrams: {
    flow: string;
    sequence: string;
  };
  warnings: string[];
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
        if (value !== 'human' && value !== 'markdown' && value !== 'json') {
          throw new Error(`Unsupported format ${value}`);
        }
        options.format = value;
        i += 1;
        break;
      }
      case '--no-mermaid':
        options.includeMermaid = false;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option ${arg}`);
        }
    }
  }

  return options;
}

function normaliseAddress(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return getAddress(value);
  } catch (error) {
    return undefined;
  }
}

async function buildRunbook(options: CliOptions): Promise<EmergencyRunbook> {
  const warnings: string[] = [];
  const ownerControlResult = loadOwnerControlConfig({ network: options.network });
  const ownerModules: ModuleDetail[] = [];
  const modules = ownerControlResult.config.modules ?? {};
  const defaultGovernance = ownerControlResult.config.governance;
  const defaultOwner = ownerControlResult.config.owner;

  const criticalModuleNames = [
    'systemPause',
    'stakeManager',
    'jobRegistry',
    'rewardEngine',
    'thermostat',
    'feePool',
    'platformRegistry',
    'platformIncentives',
    'identityRegistry',
    'taxPolicy',
    'energyOracle',
    'randaoCoordinator',
  ];

  for (const name of criticalModuleNames) {
    const entry = modules[name];
    ownerModules.push({
      name,
      type: entry?.type,
      address: entry?.address,
      owner: entry?.owner ?? defaultOwner ?? null,
      governance: entry?.governance ?? defaultGovernance ?? null,
      skip: entry?.skip,
      notes: entry?.notes,
      source: ownerControlResult.path,
    });
  }

  function safeLoad<T>(
    name: string,
    loader: () => { config: T; path: string },
  ): ConfigInsight<Record<string, unknown>> {
    try {
      const { config, path: configPath } = loader();
      const summary = Object.fromEntries(
        Object.entries(config as Record<string, unknown>)
          .filter(([_, value]) =>
            value !== undefined &&
            value !== null &&
            (typeof value !== 'object' ||
              Object.keys(value as Record<string, unknown>).length > 0),
          )
          .slice(0, 20),
      );
      return {
        name,
        path: configPath,
        summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${name}: ${message}`);
      return {
        name,
        error: message,
      };
    }
  }

  const insightLoaders: Array<[
    string,
    () => { config: Record<string, unknown>; path: string },
  ]> = [
    ['Token', () => loadTokenConfig({ network: options.network })],
    ['StakeManager', () => loadStakeManagerConfig({ network: options.network })],
    ['JobRegistry', () => loadJobRegistryConfig({ network: options.network })],
    ['FeePool', () => loadFeePoolConfig({ network: options.network })],
    ['PlatformRegistry', () => loadPlatformRegistryConfig({ network: options.network })],
    ['PlatformIncentives', () => loadPlatformIncentivesConfig({ network: options.network })],
    ['Thermodynamics', () => loadThermodynamicsConfig({ network: options.network })],
    ['EnergyOracle', () => loadEnergyOracleConfig({ network: options.network })],
    ['IdentityRegistry', () => loadIdentityRegistryConfig({ network: options.network })],
    ['TaxPolicy', () => loadTaxPolicyConfig({ network: options.network })],
    ['RandaoCoordinator', () => loadRandaoCoordinatorConfig({ network: options.network })],
  ];

  const configInsights = insightLoaders.map(([name, loader]) => safeLoad(name, loader));

  const networkLabel = options.network ?? '<network>';

  const playbook: EmergencyStep[] = [
    {
      title: 'Stabilise & record the current state',
      objective:
        'Capture immutable evidence of the live control surface before making any change.',
      commands: [
        `npm run owner:surface -- --network ${networkLabel} --format markdown --out reports/${networkLabel}-surface.md`,
        `npm run owner:verify-control -- --network ${networkLabel} --strict`,
        `npm run owner:pulse -- --network ${networkLabel} --format markdown --out reports/${networkLabel}-pulse.md`,
      ],
      validation: [
        'Surface report saved to reports/ with owner, governance and pauser assignments.',
        'Verification command exits 0. Review any ❌ output before proceeding.',
      ],
      notes: [
        'Share the generated Markdown artefacts with stakeholders immediately.',
        'If verification fails, triage ownership mismatches before executing emergency steps.',
      ],
    },
    {
      title: 'Engage platform-wide pause (if required)',
      objective:
        'Route every pausable module through SystemPause so a single switch halts execution.',
      commands: [
        `npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network ${networkLabel}`,
        `npx hardhat run --no-compile scripts/v2/updateSystemPause.ts --network ${networkLabel} --execute`,
      ],
      validation: [
        'Dry run (without --execute) shows the intended wiring and highlights ownership gaps.',
        'Execute run emits a transaction hash for SystemPause.setModules or confirms no changes.',
      ],
      notes: [
        'Ensure every module listed in config/platform-registry.json delegates pauser rights to SystemPause.',
        'If any module is marked skip=true in owner-control.json, document the manual pause procedure.',
      ],
    },
    {
      title: 'Rotate ownership/governance to emergency controller',
      objective:
        'Transfer Ownable/Governable modules to the designated emergency Safe or timelock.',
      commands: [
        `npm run owner:rotate -- --network ${networkLabel}`,
        `npm run owner:rotate -- --network ${networkLabel} --safe reports/${networkLabel}-emergency-safe.json --safe-name "AGIJobs Emergency Rotation"`,
        `npm run owner:rotate -- --network ${networkLabel} --execute`,
      ],
      validation: [
        'Dry run lists every module and whether ownership already matches the emergency controller.',
        'Safe bundle stored in reports/ for off-chain signature collection.',
        'Execute step emits hashes; immediately archive console output with timestamps.',
      ],
      notes: [
        'For Ownable2Step modules (e.g. TaxPolicy, IdentityRegistry) call acceptOwnership() from the new owner once transferOwnership completes.',
      ],
    },
    {
      title: 'Reapply critical parameter overrides',
      objective:
        'Ensure treasury routes, reward weights and signer sets align with the emergency operating mode.',
      commands: [
        `npm run owner:update-all -- --network ${networkLabel} --only=feePool,stakeManager,jobRegistry,platformRegistry,platformIncentives`,
        `npm run owner:update-all -- --network ${networkLabel} --only=feePool,stakeManager,jobRegistry,platformRegistry,platformIncentives --execute`,
      ],
      validation: [
        'Dry run indicates whether emergency treasury/allowlist values are staged.',
        'Execute step confirms each module transaction succeeded or was skipped as already aligned.',
      ],
      notes: [
        'Pair with manual review of config/fee-pool.json and config/stake-manager.json to redirect funds to secure wallets.',
      ],
    },
  ];

  const followUp: EmergencyStep[] = [
    {
      title: 'Run post-change audit trail',
      objective:
        'Prove the platform is paused or operating under emergency parameters and store immutable evidence.',
      commands: [
        `npm run owner:audit -- --network ${networkLabel} --format markdown --out reports/${networkLabel}-emergency-audit.md`,
        `npm run owner:dashboard -- --network ${networkLabel} --format markdown --out reports/${networkLabel}-dashboard.md`,
        `npm run owner:mission-control -- --network ${networkLabel} --format markdown --out reports/${networkLabel}-mission-control.md`,
      ],
      validation: [
        'Audit report lists any outstanding ownership transfers or paused modules.',
        'Dashboard confirms runtime metrics (reward weights, signer sets) match emergency expectations.',
      ],
      notes: [
        'Attach Markdown artefacts to the incident ticket and share with compliance / legal teams.',
      ],
    },
    {
      title: 'Plan recovery to normal operations',
      objective:
        'Document the steps required to exit emergency mode and rehearse before unpausing.',
      commands: [
        `npm run owner:command-center -- --network ${networkLabel} --format markdown --out reports/${networkLabel}-recovery-brief.md`,
        `npm run owner:change-ticket -- --network ${networkLabel} --format markdown --out reports/${networkLabel}-recovery-ticket.md`,
        `npm run owner:verify-control -- --network ${networkLabel} --strict`,
      ],
      validation: [
        'Recovery brief summarises outstanding tasks, owners and dependencies.',
        'Change ticket lists approvals required before unpausing.',
        'Verification confirms ownership remains aligned throughout recovery planning.',
      ],
      notes: [
        'Schedule a multi-party review before flipping SystemPause back to live mode.',
      ],
    },
  ];

  const diagrams = {
    flow: `flowchart TD\n    Alert[Incident detected] --> Surface[owner:surface]\n    Surface --> Pause{SystemPause configured?}\n    Pause -- no --> UpdatePause[npx hardhat run updateSystemPause]\n    Pause -- yes --> Rotate[npm run owner:rotate]\n    UpdatePause --> Rotate\n    Rotate --> Harden[npm run owner:update-all --only critical]\n    Harden --> Audit[npm run owner:audit]\n    Audit --> Archive[Store Markdown in reports/]\n    Archive --> Recovery[npm run owner:command-center]\n    Recovery --> Resume[Controlled unpause]\n`,
    sequence: `sequenceDiagram\n    participant Owner as Contract Owner\n    participant Wizard as CLI Helpers\n    participant Safe as Multisig/TL\n    participant Archive as Evidence Store\n    Owner->>Wizard: owner:surface / owner:pulse\n    Wizard-->>Owner: Markdown + verification status\n    Owner->>Wizard: updateSystemPause (--execute)\n    Wizard-->>Owner: Transaction hash\n    Owner->>Wizard: owner:rotate --safe\n    Wizard-->>Safe: Safe bundle JSON\n    Safe-->>Owner: Signatures collected\n    Owner->>Wizard: owner:update-all --execute\n    Wizard-->>Archive: Console log + receipts\n    Owner->>Wizard: owner:audit / owner:dashboard\n    Wizard-->>Archive: Post-change artefacts\n    Owner->>Wizard: owner:command-center\n    Wizard-->>Owner: Recovery checklist\n`,
  };

  return {
    generatedAt: new Date().toISOString(),
    network: ownerControlResult.network,
    ownerControl: {
      path: ownerControlResult.path,
      defaultGovernance,
      defaultOwner,
      modules: ownerModules.map((module) => ({
        ...module,
        address: normaliseAddress(module.address) ?? module.address ?? undefined,
        owner: normaliseAddress(module.owner) ?? module.owner ?? undefined,
        governance:
          normaliseAddress(module.governance) ?? module.governance ?? undefined,
      })),
    },
    configInsights,
    playbook,
    followUp,
    diagrams,
    warnings,
  };
}

function renderHuman(runbook: EmergencyRunbook, includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('AGIJobs Emergency Runbook');
  lines.push('==========================');
  lines.push(`Generated: ${runbook.generatedAt}`);
  if (runbook.network) {
    lines.push(`Network: ${runbook.network}`);
  }
  lines.push('');
  lines.push('Owner control baseline:');
  lines.push(`  config: ${runbook.ownerControl.path ?? 'config/owner-control.json'}`);
  lines.push(
    `  default governance: ${runbook.ownerControl.defaultGovernance ?? 'unset'}`,
  );
  lines.push(`  default owner: ${runbook.ownerControl.defaultOwner ?? 'unset'}`);
  lines.push('');
  lines.push('Critical modules:');
  runbook.ownerControl.modules.forEach((module) => {
    const parts = [
      `  - ${module.name}`,
      module.type ? `type=${module.type}` : undefined,
      module.address ? `address=${module.address}` : undefined,
      module.owner ? `owner=${module.owner}` : undefined,
      module.governance ? `governance=${module.governance}` : undefined,
      module.skip ? 'skip=true' : undefined,
    ].filter(Boolean);
    lines.push(parts.join(' | '));
    if (module.notes && module.notes.length > 0) {
      module.notes.forEach((note) => lines.push(`      note: ${note}`));
    }
  });
  lines.push('');
  lines.push('Configuration files:');
  runbook.configInsights.forEach((insight) => {
    if (insight.error) {
      lines.push(`  - ${insight.name}: ${insight.error}`);
    } else {
      lines.push(`  - ${insight.name}: ${insight.path}`);
    }
  });
  lines.push('');
  lines.push('Emergency playbook:');
  runbook.playbook.forEach((step, index) => {
    lines.push(`Step ${index + 1}: ${step.title}`);
    lines.push(`  Objective: ${step.objective}`);
    lines.push('  Commands:');
    step.commands.forEach((cmd) => lines.push(`    • ${cmd}`));
    lines.push('  Validation:');
    step.validation.forEach((item) => lines.push(`    • ${item}`));
    if (step.notes && step.notes.length > 0) {
      lines.push('  Notes:');
      step.notes.forEach((note) => lines.push(`    • ${note}`));
    }
    lines.push('');
  });
  lines.push('Follow-up actions:');
  runbook.followUp.forEach((step, index) => {
    lines.push(`  F${index + 1}: ${step.title}`);
    lines.push(`    Objective: ${step.objective}`);
    lines.push('    Commands:');
    step.commands.forEach((cmd) => lines.push(`      • ${cmd}`));
    lines.push('    Validation:');
    step.validation.forEach((item) => lines.push(`      • ${item}`));
    if (step.notes && step.notes.length > 0) {
      lines.push('    Notes:');
      step.notes.forEach((note) => lines.push(`      • ${note}`));
    }
    lines.push('');
  });
  if (includeMermaid) {
    lines.push('Mermaid flowchart:');
    lines.push(runbook.diagrams.flow);
    lines.push('');
    lines.push('Mermaid sequence:');
    lines.push(runbook.diagrams.sequence);
    lines.push('');
  }
  if (runbook.warnings.length > 0) {
    lines.push('Warnings:');
    runbook.warnings.forEach((warning) => lines.push(`  • ${warning}`));
  }
  return lines.join('\n');
}

function renderMarkdown(runbook: EmergencyRunbook, includeMermaid: boolean): string {
  const lines: string[] = [];
  lines.push('# AGIJobs Emergency Runbook');
  lines.push('');
  lines.push(`- Generated: \`${runbook.generatedAt}\``);
  if (runbook.network) {
    lines.push(`- Network: \`${runbook.network}\``);
  }
  lines.push(
    '- Owner control file: `' +
      (runbook.ownerControl.path ?? 'config/owner-control.json') +
      '`',
  );
  lines.push(
    `- Default governance: \`${runbook.ownerControl.defaultGovernance ?? 'unset'}\``,
  );
  lines.push(`- Default owner: \`${runbook.ownerControl.defaultOwner ?? 'unset'}\``);
  lines.push('');
  lines.push('## Critical modules');
  lines.push('');
  lines.push('| Module | Type | Address | Owner | Governance | Skip | Notes |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  runbook.ownerControl.modules.forEach((module) => {
    const notes =
      module.notes && module.notes.length > 0
        ? module.notes.map((note) => note.replace(/\|/g, '\\|')).join('<br/>')
        : '';
    lines.push(
      `| ${module.name} | ${module.type ?? ''} | ${module.address ?? ''} | ${
        module.owner ?? ''
      } | ${module.governance ?? ''} | ${module.skip ? 'yes' : ''} | ${notes} |`,
    );
  });
  lines.push('');
  lines.push('## Configuration references');
  lines.push('');
  lines.push('| Config | Path | Status |');
  lines.push('| --- | --- | --- |');
  runbook.configInsights.forEach((insight) => {
    lines.push(
      `| ${insight.name} | ${insight.path ?? ''} | ${insight.error ?? 'loaded'} |`,
    );
  });
  lines.push('');
  lines.push('## Emergency playbook');
  lines.push('');
  runbook.playbook.forEach((step, index) => {
    lines.push(`### Step ${index + 1}: ${step.title}`);
    lines.push('');
    lines.push(`**Objective:** ${step.objective}`);
    lines.push('');
    lines.push('**Commands**');
    lines.push('');
    step.commands.forEach((cmd) => lines.push(`- \`${cmd}\``));
    lines.push('');
    lines.push('**Validation**');
    lines.push('');
    step.validation.forEach((item) => lines.push(`- ${item}`));
    if (step.notes && step.notes.length > 0) {
      lines.push('');
      lines.push('**Notes**');
      lines.push('');
      step.notes.forEach((note) => lines.push(`- ${note}`));
    }
    lines.push('');
  });

  lines.push('## Follow-up actions');
  lines.push('');
  runbook.followUp.forEach((step, index) => {
    lines.push(`### Follow-up ${index + 1}: ${step.title}`);
    lines.push('');
    lines.push(`**Objective:** ${step.objective}`);
    lines.push('');
    lines.push('**Commands**');
    lines.push('');
    step.commands.forEach((cmd) => lines.push(`- \`${cmd}\``));
    lines.push('');
    lines.push('**Validation**');
    lines.push('');
    step.validation.forEach((item) => lines.push(`- ${item}`));
    if (step.notes && step.notes.length > 0) {
      lines.push('');
      lines.push('**Notes**');
      lines.push('');
      step.notes.forEach((note) => lines.push(`- ${note}`));
    }
    lines.push('');
  });

  if (includeMermaid) {
    lines.push('## Flowchart');
    lines.push('');
    lines.push('```mermaid');
    lines.push(runbook.diagrams.flow);
    lines.push('```');
    lines.push('');
    lines.push('## Sequence diagram');
    lines.push('');
    lines.push('```mermaid');
    lines.push(runbook.diagrams.sequence);
    lines.push('```');
    lines.push('');
  }

  if (runbook.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    runbook.warnings.forEach((warning) => lines.push(`- ${warning}`));
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(
        `Usage: npm run owner:emergency -- [options]\n\n` +
          `Options:\n` +
          `  --network <name>    Target network (matches config overrides)\n` +
          `  --format <type>     Output format: human | markdown | json (default: human)\n` +
          `  --out <file>        Write output to file instead of stdout\n` +
          `  --no-mermaid        Omit Mermaid diagrams from textual output\n` +
          `  -h, --help          Show this help message\n`,
      );
      return;
    }

    const runbook = await buildRunbook(options);
    let output: string;
    switch (options.format) {
      case 'json':
        output = JSON.stringify(runbook, null, 2);
        break;
      case 'markdown':
        output = renderMarkdown(runbook, options.includeMermaid);
        break;
      case 'human':
      default:
        output = renderHuman(runbook, options.includeMermaid);
        break;
    }

    if (options.outPath) {
      const resolved = path.resolve(options.outPath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, output, 'utf8');
      console.log(`Emergency runbook written to ${resolved}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();

