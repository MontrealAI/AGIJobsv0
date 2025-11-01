#!/usr/bin/env ts-node

import { promises as fs } from 'fs';
import path from 'path';
import {
  loadOwnerControlConfig,
  type OwnerControlModuleConfig,
} from '../config';

interface CliOptions {
  network?: string;
  outDir?: string;
}

interface ModuleSpec {
  title: string;
  description: string;
  commands: string[];
}

interface ModuleSnapshot {
  key: string;
  title: string;
  type: string;
  ownerTarget?: string;
  governanceTarget?: string;
  address?: string;
  commands: string[];
  notes: string[];
}

const REQUIRED_MODULES: Record<string, ModuleSpec> = {
  systemPause: {
    title: 'System Pause',
    description: 'Pause/resume authority and pauser roster.',
    commands: ['npm run owner:system-pause', 'npm run pause:test'],
  },
  stakeManager: {
    title: 'Stake Manager',
    description: 'Validator quotas, minimum stakes, fee splits.',
    commands: ['npm run owner:update-all -- --only stakeManager'],
  },
  jobRegistry: {
    title: 'Job Registry',
    description: 'Job metadata, module wiring, governance routes.',
    commands: ['npm run owner:update-all -- --only jobRegistry'],
  },
  rewardEngine: {
    title: 'Reward Engine',
    description: 'Thermodynamics routing and payout shares.',
    commands: ['npm run owner:update-all -- --only rewardEngine'],
  },
  thermostat: {
    title: 'Thermostat',
    description: 'Economic dampening parameters and bounds.',
    commands: ['npm run owner:update-all -- --only thermostat'],
  },
  feePool: {
    title: 'Fee Pool',
    description: 'Treasury routing and fee withdrawals.',
    commands: ['npm run owner:update-all -- --only feePool'],
  },
  platformRegistry: {
    title: 'Platform Registry',
    description: 'Operator/tenant registry with upgrade paths.',
    commands: ['npm run owner:update-all -- --only platformRegistry'],
  },
  identityRegistry: {
    title: 'Identity Registry',
    description: 'ENS/attestation allowlists and identity roots.',
    commands: ['npm run owner:update-all -- --only identityRegistry'],
  },
};

const REQUIRED_GLOBAL_COMMANDS: Record<string, string> = {
  'owner:command-center': 'Interactive control centre orchestration',
  'owner:doctor': 'Static analysis of owner control manifests',
  'owner:parameters': 'Parameter matrix export for auditors',
  'owner:plan': 'Owner change ticket generator',
  'owner:system-pause': 'Pause/resume execution harness',
  'owner:update-all': 'Batch updater for privileged modules',
  'owner:verify-control': 'On-chain ownership verification',
  'owner:pulse': 'Pause + governance heartbeat report',
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network':
      case '--config-network': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.network = value;
        i += 1;
        break;
      }
      case '--out':
      case '--out-dir': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a directory`);
        }
        options.outDir = value;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag ${arg}`);
        }
    }
  }
  return options;
}

function normaliseAddress(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const text = value.trim();
  if (!text) {
    return undefined;
  }
  return text.toLowerCase().startsWith('0x') ? text : `0x${text}`;
}

function ensureCommandsExist(packageJson: any): void {
  const scripts = packageJson?.scripts ?? {};
  const missing: string[] = [];
  for (const [command, description] of Object.entries(REQUIRED_GLOBAL_COMMANDS)) {
    if (typeof scripts[command] !== 'string' || scripts[command].trim().length === 0) {
      missing.push(`${command} (${description})`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `package.json is missing required owner control commands: ${missing.join(', ')}`
    );
  }
}

async function readJsonIfExists(filePath: string): Promise<any> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function collectTargets(
  moduleKey: string,
  moduleConfig: OwnerControlModuleConfig,
  fallbackOwner?: string,
  fallbackGovernance?: string
): { owner?: string; governance?: string } {
  const owner = normaliseAddress(
    moduleConfig.owner ?? fallbackOwner ?? fallbackGovernance ?? undefined
  );
  const governance = normaliseAddress(
    moduleConfig.governance ?? fallbackGovernance ?? fallbackOwner ?? undefined
  );
  return { owner, governance };
}

function deriveModuleTitle(key: string): string {
  const withSpaces = key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!withSpaces) {
    return key;
  }
  return withSpaces
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(' ');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const networkKey =
    options.network || process.env.OWNER_ASSURANCE_NETWORK || 'ci';

  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  ensureCommandsExist(packageJson);

  const addressesPath = path.join(process.cwd(), 'docs', 'deployment-addresses.json');
  const deploymentAddresses = await readJsonIfExists(addressesPath);

  const { config, path: configPath } = loadOwnerControlConfig({ network: networkKey });
  const modules = (config.modules ?? {}) as Record<string, OwnerControlModuleConfig>;
  const snapshots: ModuleSnapshot[] = [];
  const fieldIssues: string[] = [];

  const fallbackOwner = normaliseAddress(config.owner as string | undefined);
  const fallbackGovernance = normaliseAddress(config.governance as string | undefined);

  const orderedModuleKeys: string[] = [];
  for (const key of Object.keys(REQUIRED_MODULES)) {
    if (modules[key]) {
      orderedModuleKeys.push(key);
    }
  }
  for (const key of Object.keys(modules)) {
    if (!orderedModuleKeys.includes(key)) {
      orderedModuleKeys.push(key);
    }
  }

  for (const key of orderedModuleKeys) {
    const moduleConfig = modules[key];
    if (!moduleConfig) {
      continue;
    }
    const spec = REQUIRED_MODULES[key];

    const type = moduleConfig.type ?? 'governable';
    if (typeof type !== 'string' || type.trim().length === 0) {
      fieldIssues.push(`${key}: missing controller type`);
    }

    const targets = collectTargets(key, moduleConfig, fallbackOwner, fallbackGovernance);
    if (type === 'governable' && !targets.governance) {
      fieldIssues.push(`${key}: governance target missing`);
    }
    if (type !== 'governable' && !targets.owner) {
      fieldIssues.push(`${key}: owner target missing`);
    }

    const candidateAddress =
      moduleConfig.address ?? deploymentAddresses[key] ?? null;
    const address = normaliseAddress(candidateAddress ?? undefined);
    if (!address) {
      fieldIssues.push(`${key}: contract address missing`);
    }

    snapshots.push({
      key,
      title: spec?.title ?? deriveModuleTitle(key),
      type,
      ownerTarget: targets.owner,
      governanceTarget: targets.governance,
      address: address ?? undefined,
      commands: spec?.commands ?? [],
      notes: Array.isArray(moduleConfig.notes)
        ? moduleConfig.notes.map((note) => String(note))
        : [],
    });
  }

  const missingRequiredModules = Object.entries(REQUIRED_MODULES)
    .filter(([key]) => !modules[key])
    .map(([key, spec]) => `${key} — ${spec.description}`);

  if (missingRequiredModules.length > 0) {
    throw new Error(
      `Owner control configuration is missing required modules: ${missingRequiredModules.join(
        ', '
      )}`
    );
  }

  if (fieldIssues.length > 0) {
    throw new Error(
      `Owner control configuration has incomplete data: ${fieldIssues.join('; ')}`
    );
  }

  const outDir = options.outDir
    ? path.resolve(process.cwd(), options.outDir)
    : path.join(process.cwd(), 'reports', 'owner-control');
  await fs.mkdir(outDir, { recursive: true });

  const mdLines: string[] = [
    '# Owner Control Authority Matrix',
    '',
    `- Network profile: \`${networkKey}\``,
    `- Config source: \`${path.relative(process.cwd(), configPath)}\``,
    `- Deployment addresses: \`${path.relative(process.cwd(), addressesPath)}\``,
    '',
    '| Module | Type | Owner Target | Governance Target | Address | CLI Commands | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const snapshot of snapshots) {
    const owner = snapshot.ownerTarget ?? '—';
    const governance = snapshot.governanceTarget ?? '—';
    const address = snapshot.address ?? '—';
    const commands = snapshot.commands.length > 0
      ? snapshot.commands.map((cmd) => `\`${cmd}\``).join('<br/>')
      : '—';
    const notes = snapshot.notes.length > 0 ? snapshot.notes.join('<br/>') : '—';
    mdLines.push(
      `| ${snapshot.title} | ${snapshot.type} | ${owner} | ${governance} | ${address} | ${commands} | ${notes} |`
    );
  }

  const markdownPath = path.join(outDir, 'authority-matrix.md');
  await fs.writeFile(markdownPath, `${mdLines.join('\n')}\n`, 'utf8');

  const jsonPath = path.join(outDir, 'authority-matrix.json');
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        network: networkKey,
        configPath: path.relative(process.cwd(), configPath),
        addressesPath: path.relative(process.cwd(), addressesPath),
        modules: snapshots,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log(`✅ Owner authority matrix generated at ${markdownPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
