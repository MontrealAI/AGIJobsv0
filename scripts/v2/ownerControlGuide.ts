import { promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  loadOwnerControlConfig,
  loadTokenConfig,
  type OwnerControlModuleConfig,
} from '../config';

type OutputFormat = 'markdown' | 'human';

interface CliOptions {
  network?: string;
  outPath?: string;
  format: OutputFormat;
  includeMermaid: boolean;
  help?: boolean;
}

interface GuideContext {
  selectedNetwork: string;
  tokenSymbol: string;
  tokenAddress: string;
  ownerDefault?: string;
  governanceDefault?: string;
  ownerConfigPath: string;
  tokenConfigPath: string;
  modules: Array<ModuleSummary>;
}

type ModuleKind = 'governable' | 'ownable' | 'ownable2step' | 'unknown';

interface ModuleSummary {
  key: string;
  label: string;
  type: ModuleKind;
  controller: string;
  governance?: string;
  owner?: string;
  notes?: string[];
}

const ADDRESS_PLACEHOLDER = '0x0000000000000000000000000000000000000000';
const ACRONYM_FIXES: Record<string, string> = {
  'N F T': 'NFT',
  'A G I': 'AGI',
  'E N S': 'ENS',
  'P I D': 'PID',
  'D A O': 'DAO',
};

interface HardhatContext {
  name?: string;
  chainId?: number;
}

async function resolveHardhatContext(): Promise<HardhatContext> {
  try {
    const hardhat = await import('hardhat');
    const { network } = hardhat;
    return {
      name: network?.name,
      chainId: network?.config?.chainId,
    };
  } catch (error) {
    if (process.env.DEBUG_OWNER_GUIDE) {
      console.warn('Failed to load hardhat context:', error);
    }
    return {};
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: 'markdown',
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
        if (normalised !== 'markdown' && normalised !== 'human') {
          throw new Error('Supported formats: markdown, human');
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

function normaliseAddress(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === ADDRESS_PLACEHOLDER) {
    return undefined;
  }
  try {
    return ethers.getAddress(trimmed);
  } catch (_) {
    return trimmed;
  }
}

function inferModuleLabel(key: string, module?: OwnerControlModuleConfig): string {
  if (module?.label) {
    return module.label;
  }
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
  return Object.entries(ACRONYM_FIXES).reduce(
    (label, [pattern, replacement]) =>
      label.replace(new RegExp(`\\b${pattern}\\b`, 'g'), replacement),
    spaced
  );
}

function inferModuleType(value?: string): ModuleKind {
  if (!value) {
    return 'unknown';
  }
  const normalised = value.trim().toLowerCase();
  if (normalised === 'governable') return 'governable';
  if (normalised === 'ownable') return 'ownable';
  if (normalised === 'ownable2step' || normalised === 'ownable-2-step') {
    return 'ownable2step';
  }
  return 'unknown';
}

function describeController(kind: ModuleKind, governance?: string, owner?: string): string {
  if (kind === 'governable' && governance) {
    return governance;
  }
  if ((kind === 'ownable' || kind === 'ownable2step') && owner) {
    return owner;
  }
  return governance ?? owner ?? 'Not configured';
}

function buildModuleSummaries(
  ownerDefaults: { owner?: string; governance?: string },
  modules?: Record<string, OwnerControlModuleConfig>
): ModuleSummary[] {
  if (!modules) {
    return [];
  }
  const summaries: ModuleSummary[] = [];
  for (const [key, module] of Object.entries(modules)) {
    if (module?.skip) {
      continue;
    }
    const type = inferModuleType(module?.type);
    const owner = normaliseAddress(module?.owner) ?? ownerDefaults.owner;
    const governance = normaliseAddress(module?.governance) ?? ownerDefaults.governance;
    const controller = describeController(type, governance, owner ?? undefined);
    summaries.push({
      key,
      label: inferModuleLabel(key, module),
      type,
      controller,
      governance,
      owner: owner ?? undefined,
      notes: module?.notes,
    });
  }
  summaries.sort((a, b) => a.label.localeCompare(b.label));
  return summaries;
}

function renderMermaid(context: GuideContext): string {
  const gov = context.governanceDefault ?? 'Governance TBD';
  const owner = context.ownerDefault ?? 'Owner TBD';
  const nodes = context.modules
    .map((module, index) => {
      const nodeId = `M${index}`;
      const caption = module.label.replace(/"/g, '\\"');
      const target = module.controller?.replace(/"/g, '\\"') ?? 'Unassigned';
      const className = module.type === 'governable'
        ? 'governable'
        : module.type === 'ownable2step'
        ? 'ownable2step'
        : module.type === 'ownable'
        ? 'ownable'
        : 'unknown';
      const source = module.type === 'governable' ? 'Governance' : 'Owner';
      return `    ${nodeId}[\n      ${caption}\\n${target || 'Unassigned'}\n    ]:::${className}\n    ${source} --> ${nodeId}`;
    })
    .join('\n');

  return [
    '```mermaid',
    'flowchart LR',
    '    classDef governable fill:#dff9fb,stroke:#0984e3,stroke-width:1px;',
    '    classDef ownable fill:#f9fbe7,stroke:#8bc34a,stroke-width:1px;',
    '    classDef ownable2step fill:#fff3e0,stroke:#fb8c00,stroke-width:1px;',
    '    classDef unknown fill:#eceff1,stroke:#607d8b,stroke-width:1px;',
    `    Governance[Governance\n${gov}]:::governable`,
    `    Owner[Owner\n${owner}]:::ownable`,
    nodes,
    '```',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderModulesTable(context: GuideContext): string {
  if (context.modules.length === 0) {
    return '> No modules configured in owner-control.json';
  }
  const header = '| Module | Type | Controller | Notes |';
  const divider = '| --- | --- | --- | --- |';
  const rows = context.modules.map((module) => {
    const notes = module.notes?.length ? module.notes.join('<br/>') : '';
    return `| ${module.label} | ${module.type} | ${module.controller} | ${notes} |`;
  });
  return [header, divider, ...rows].join('\n');
}

function renderGuide(context: GuideContext, options: CliOptions): string {
  const lines: string[] = [];

  lines.push(`# Owner Control Quickstart – ${context.selectedNetwork}`);
  lines.push('');
  lines.push(
    `This guide is generated directly from your repository configuration so non-technical operators can update ` +
      `AGIJobs parameters with confidence. All values reflect **${context.selectedNetwork}** defaults. ` +
      `Token under management: **${context.tokenSymbol}** at \`${context.tokenAddress}\`.`
  );
  lines.push('');
  lines.push('## Configuration Sources');
  lines.push('');
  lines.push(`- Owner control: \`${context.ownerConfigPath}\``);
  lines.push(`- Token metadata: \`${context.tokenConfigPath}\``);
  lines.push('');

  if (options.includeMermaid) {
    lines.push('### Governance Map');
    lines.push('');
    lines.push(renderMermaid(context));
    lines.push('');
  }

  lines.push('## High-Level Checklist');
  lines.push('');
  lines.push('1. **Edit config JSON** – update the relevant file under `config/`.');
  lines.push(
    `2. **Render dry run** – \`npm run owner:update-all -- --network ${context.selectedNetwork}\` prints the planned actions.`
  );
  lines.push(
    `3. **Generate Safe bundle (optional)** – append \`--safe owner-plan.json --safe-name "AGIJobs ${context.selectedNetwork}"\`.`
  );
  lines.push(
    `4. **Execute** – re-run with \`--execute\` from the signing environment once the plan is approved.`
  );
  lines.push(
    `5. **Verify on-chain state** – \`npm run owner:verify-control -- --network ${context.selectedNetwork}\` should return ✅.`
  );
  lines.push('');

  lines.push('## Module Controller Matrix');
  lines.push('');
  lines.push(renderModulesTable(context));
  lines.push('');

  lines.push(
    'The **HGM Control Module** owns PlatformRegistry and ReputationEngine on behalf of governance. '
      + 'Keep `config/hgm-control-module.json` in sync with any owner rotations so emergency pauses, '
      + 'treasury changes, and metadata updates flow through a single multisig or timelock.'
  );
  lines.push('');

  lines.push('## Command Reference');
  lines.push('');
  lines.push('| Purpose | Command |');
  lines.push('| --- | --- |');
  lines.push(
    `| Offline snapshot | \`npm run owner:surface -- --network ${context.selectedNetwork}\` |`
  );
  lines.push(
    `| One-click dry run + execute wizard | \`npm run owner:wizard -- --network ${context.selectedNetwork}\` |`
  );
  lines.push(
    `| Generate Safe bundle only | \`npm run owner:plan:safe -- --network ${context.selectedNetwork}\` |`
  );
  lines.push(
    `| Health dashboard | \`npm run owner:dashboard -- --network ${context.selectedNetwork}\` |`
  );
  lines.push(
    `| Full automation report | \`npm run owner:plan -- --network ${context.selectedNetwork} --json\` |`
  );
  lines.push('');

  if (options.includeMermaid) {
    lines.push('### Execution Timeline');
    lines.push('');
    lines.push('```mermaid');
    lines.push('sequenceDiagram');
    lines.push('  participant Operator');
    lines.push('  participant Repo');
    lines.push('  participant Helper as owner:update-all');
    lines.push('  participant Safe');
    lines.push('  participant Chain as Ethereum');
    lines.push('');
    lines.push('  Operator->>Repo: Edit config/*.json');
    lines.push('  Operator->>Helper: Dry run (no execute)');
    lines.push('  Helper-->>Operator: Planned calldata + diffs');
    lines.push('  Operator->>Safe: Optional --safe bundle upload');
    lines.push('  Safe-->>Operator: Multisig approvals');
    lines.push('  Operator->>Helper: --execute');
    lines.push('  Helper->>Chain: Submit parameter updates');
    lines.push('  Chain-->>Operator: Transaction receipts');
    lines.push('  Operator->>Helper: owner:verify-control');
    lines.push('  Helper-->>Operator: ✅ Governance matches config');
    lines.push('```');
    lines.push('');
  }

  lines.push('## Operator Notes');
  lines.push('');
  lines.push(
    `- **Signing context** – Use the configured owner/governance controllers when approving Safe bundles. ` +
      `Defaults: owner \`${context.ownerDefault ?? 'unset'}\`, governance \`${context.governanceDefault ?? 'unset'}\`.`
  );
  lines.push('- **Zero address warning** – Replace any `0x000…` placeholder before executing a production change.');
  lines.push('- **Change control** – Commit JSON modifications and attach the generated Safe bundle for audit trails.');
  lines.push(
    '- **HGM control plane** – Use `npm run owner:update-all` after editing `config/hgm-control-module.json` to roll out pauser '
      + 'delegations, reputation tuning, or coordinated pause actions.'
  );
  lines.push('- **Disaster recovery** – Re-run the last known-good plan to roll back misconfigurations.');
  lines.push('');

  if (options.format === 'human') {
    return lines.join('\n');
  }

  return lines.join('\n');
}

async function writeOutput(destination: string, contents: string) {
  const resolved = path.resolve(process.cwd(), destination);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, contents, 'utf8');
  console.log(`Guide written to ${resolved}`);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  if (cli.help) {
    console.log(`Usage: hardhat run scripts/v2/ownerControlGuide.ts [--network <name>] [--out <path>] [--format markdown|human] [--no-mermaid]`);
    return;
  }

  const hardhatContext = await resolveHardhatContext();
  const hardhatNetwork = hardhatContext.name && hardhatContext.name !== 'unknown' ? hardhatContext.name : undefined;
  const defaultNetwork = hardhatNetwork === 'hardhat' ? 'mainnet' : hardhatNetwork;
  const selectedNetwork = cli.network ?? defaultNetwork ?? process.env.AGJ_NETWORK ?? process.env.HARDHAT_NETWORK ?? 'mainnet';

  const { config: tokenConfig, path: tokenConfigPath } = loadTokenConfig({
    network: selectedNetwork,
    chainId: hardhatContext.chainId,
  });
  const { config: ownerConfig, path: ownerConfigPath } = loadOwnerControlConfig({
    network: selectedNetwork,
    chainId: hardhatContext.chainId,
  });

  const ownerDefault = normaliseAddress(ownerConfig.owner);
  const governanceDefault = normaliseAddress(ownerConfig.governance);

  const ownerConfigRelative = path.relative(process.cwd(), ownerConfigPath) || ownerConfigPath;
  const tokenConfigRelative = path.relative(process.cwd(), tokenConfigPath) || tokenConfigPath;

  const context: GuideContext = {
    selectedNetwork,
    tokenSymbol: tokenConfig.symbol,
    tokenAddress: ethers.getAddress(tokenConfig.address),
    ownerDefault,
    governanceDefault,
    ownerConfigPath: ownerConfigRelative,
    tokenConfigPath: tokenConfigRelative,
    modules: buildModuleSummaries(
      { owner: ownerDefault, governance: governanceDefault },
      ownerConfig.modules
    ),
  };

  const output = renderGuide(context, cli);

  if (cli.outPath) {
    await writeOutput(cli.outPath, output);
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
