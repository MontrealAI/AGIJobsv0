import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import {
  loadOwnerControlConfig,
  inferNetworkKey,
} from '../config';
import type {
  OwnerControlConfigResult,
  OwnerControlModuleConfig,
  OwnerControlModuleType,
} from '../config';

const ADDRESS_BOOK_PATH = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'deployment-addresses.json'
);

const DEFAULT_TITLE = 'AGIJobs Owner Control Map';

const SUPPORTED_FORMATS = new Set(['markdown', 'mermaid'] as const);

type OutputFormat = 'markdown' | 'mermaid';

type CliOptions = {
  format: OutputFormat;
  outputPath?: string;
  configNetwork?: string;
  title?: string;
  includePending: boolean;
  addressOverrides: Record<string, string>;
};

type ModuleInsight = {
  key: string;
  label: string;
  address: string | null;
  type: OwnerControlModuleType;
  expectedController?: string;
  expectedSource?: string;
  onChainController?: string | null;
  pendingController?: string | null;
  status: 'ok' | 'missing-address' | 'mismatch' | 'skipped';
  notes: string[];
};

type AddressBook = Record<string, string>;

type MermaidBuildResult = {
  mermaid: string;
  warnings: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    format: 'markdown',
    includePending: true,
    addressOverrides: {},
  };

  const envFormat = process.env.OWNER_MERMAID_FORMAT?.trim().toLowerCase();
  if (envFormat && SUPPORTED_FORMATS.has(envFormat as OutputFormat)) {
    options.format = envFormat as OutputFormat;
  }

  if (process.env.OWNER_MERMAID_OUTPUT?.trim()) {
    options.outputPath = process.env.OWNER_MERMAID_OUTPUT.trim();
  }

  if (process.env.OWNER_MERMAID_TITLE?.trim()) {
    options.title = process.env.OWNER_MERMAID_TITLE.trim();
  }

  if (process.env.OWNER_MERMAID_INCLUDE_PENDING) {
    const flag = process.env.OWNER_MERMAID_INCLUDE_PENDING.trim().toLowerCase();
    options.includePending = !['0', 'false', 'no', 'off'].includes(flag);
  }

  if (process.env.OWNER_MERMAID_CONFIG_NETWORK?.trim()) {
    options.configNetwork = process.env.OWNER_MERMAID_CONFIG_NETWORK.trim();
  }

  if (process.env.OWNER_MERMAID_ADDRESS_OVERRIDES?.trim()) {
    Object.assign(
      options.addressOverrides,
      parseOverrides(process.env.OWNER_MERMAID_ADDRESS_OVERRIDES.trim())
    );
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--format': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--format requires a value (markdown|mermaid)');
        }
        const normalised = value.trim().toLowerCase();
        if (!SUPPORTED_FORMATS.has(normalised as OutputFormat)) {
          throw new Error(`Unsupported format: ${value}`);
        }
        options.format = normalised as OutputFormat;
        i += 1;
        break;
      }
      case '--output':
      case '--out': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a file path`);
        }
        options.outputPath = value;
        i += 1;
        break;
      }
      case '--config-network':
      case '--network-config': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires a value`);
        }
        options.configNetwork = value;
        i += 1;
        break;
      }
      case '--title': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--title requires a value');
        }
        options.title = value;
        i += 1;
        break;
      }
      case '--no-pending':
      case '--omit-pending': {
        options.includePending = false;
        break;
      }
      case '--include-pending': {
        options.includePending = true;
        break;
      }
      case '--address':
      case '--address-override':
      case '--address-overrides': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error(`${arg} requires entries in the form module=address`);
        }
        Object.assign(options.addressOverrides, parseOverrides(value));
        i += 1;
        break;
      }
      default:
        break;
    }
  }

  return options;
}

function normaliseModuleLookupKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function envAddressKey(moduleKey: string): string {
  const upper = moduleKey.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `AGJ_${upper}_ADDRESS`;
}

function parseOverrides(value: string): Record<string, string> {
  const overrides: Record<string, string> = {};
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const [key, address] = entry.split('=');
    if (!key || !address) {
      throw new Error(`Invalid address override entry: ${entry}`);
    }
    overrides[normaliseModuleLookupKey(key)] = address.trim();
  }
  return overrides;
}

function lookupAddress(addressBook: AddressBook, key: string): string | undefined {
  if (addressBook[key]) {
    return addressBook[key];
  }
  const target = normaliseModuleLookupKey(key);
  for (const [bookKey, value] of Object.entries(addressBook)) {
    if (normaliseModuleLookupKey(bookKey) === target) {
      return value;
    }
  }
  return undefined;
}

async function readAddressBook(): Promise<AddressBook> {
  try {
    const raw = await fs.readFile(ADDRESS_BOOK_PATH, 'utf8');
    const parsed = JSON.parse(raw) as AddressBook;
    return parsed;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function normaliseModuleType(value?: string): OwnerControlModuleType {
  if (!value) return 'governable';
  const lower = value.toLowerCase();
  if (lower === 'governable' || lower === 'ownable' || lower === 'ownable2step') {
    return lower;
  }
  throw new Error(`Unsupported module type: ${value}`);
}

function safeAddress(value?: string | null): string | null {
  if (!value) return null;
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
    const address = ethers.getAddress(prefixed);
    return address === ethers.ZeroAddress ? null : address;
  } catch (_) {
    return null;
  }
}

function determineExpectedController(
  moduleKey: string,
  module: OwnerControlModuleConfig,
  config: OwnerControlConfigResult
): { address?: string; source?: string } {
  if (module.skip) {
    return {};
  }
  if (module.owner) {
    return { address: safeAddress(module.owner) ?? undefined, source: `${moduleKey}.owner` };
  }
  if (module.governance) {
    return { address: safeAddress(module.governance) ?? undefined, source: `${moduleKey}.governance` };
  }
  if (config.config.owner) {
    return { address: safeAddress(config.config.owner) ?? undefined, source: 'config.owner' };
  }
  if (config.config.governance) {
    return {
      address: safeAddress(config.config.governance) ?? undefined,
      source: 'config.governance',
    };
  }
  return {};
}

function labelFromKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withSpaces) return key;
  return withSpaces
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shortAddress(address: string | null | undefined): string {
  if (!address) return '–';
  const normalised = safeAddress(address);
  if (!normalised) return '–';
  return `${normalised.slice(0, 6)}…${normalised.slice(-4)}`;
}

function addressesEqual(a?: string | null, b?: string | null): boolean {
  const first = safeAddress(a);
  const second = safeAddress(b);
  if (!first || !second) {
    return false;
  }
  return first.toLowerCase() === second.toLowerCase();
}

async function fetchOnChainController(
  address: string,
  type: OwnerControlModuleType,
  includePending: boolean
): Promise<{ current?: string | null; pending?: string | null; errors: string[] }> {
  const abi = [
    'function owner() view returns (address)',
    'function governance() view returns (address)',
    'function pendingOwner() view returns (address)',
    'function pendingGovernance() view returns (address)',
  ];
  const contract = new ethers.Contract(address, abi, ethers.provider);
  const errors: string[] = [];

  async function tryCall(method: string): Promise<string | null | undefined> {
    try {
      const result = await contract[method]();
      if (typeof result === 'string') {
        return safeAddress(result);
      }
    } catch (error: any) {
      if (error?.code !== 'CALL_EXCEPTION') {
        errors.push(`${method} failed: ${String(error?.message ?? error)}`);
      }
    }
    return undefined;
  }

  let current: string | null | undefined;
  if (type === 'governable') {
    current = await tryCall('governance');
    if (current === undefined) {
      current = await tryCall('owner');
    }
  } else {
    current = await tryCall('owner');
    if (current === undefined && type === 'ownable2step') {
      current = await tryCall('governance');
    }
  }

  let pending: string | null | undefined;
  if (includePending) {
    if (type === 'governable') {
      pending = await tryCall('pendingGovernance');
    } else {
      pending = await tryCall('pendingOwner');
    }
  }

  return {
    current: current ?? null,
    pending: pending ?? null,
    errors,
  };
}

async function collectModuleInsights(
  configResult: OwnerControlConfigResult,
  addressBook: AddressBook,
  includePending: boolean,
  overrides: Record<string, string>
): Promise<ModuleInsight[]> {
  const entries: ModuleInsight[] = [];
  const modules: Record<string, OwnerControlModuleConfig> = configResult.config.modules ?? {};
  for (const [key, moduleConfig] of Object.entries(modules)) {
    const moduleType = normaliseModuleType(moduleConfig.type as string | undefined);
    const canonicalKey = normaliseModuleLookupKey(key);
    const overrideAddress = overrides[canonicalKey];
    const envOverrideRaw = process.env[envAddressKey(key)];
    const envOverride = envOverrideRaw ? envOverrideRaw.trim() : undefined;
    const addressCandidate =
      overrideAddress ??
      (envOverride && envOverride.length > 0 ? envOverride : undefined) ??
      moduleConfig.address ??
      lookupAddress(addressBook, key);
    const moduleAddress = safeAddress(addressCandidate);
    const notes: string[] = [];

    if (moduleConfig.notes && Array.isArray(moduleConfig.notes)) {
      notes.push(...moduleConfig.notes.map((value) => String(value)));
    }

    if (moduleConfig.skip) {
      entries.push({
        key,
        label: moduleConfig.label ?? labelFromKey(key),
        address: moduleAddress,
        type: moduleType,
        status: 'skipped',
        notes,
      });
      continue;
    }

    const expected = determineExpectedController(key, moduleConfig, configResult);
    if (expected.source) {
      if (expected.address) {
        notes.push(`Expected controller source: ${expected.source}`);
      } else {
        notes.push(`Expected controller source ${expected.source} is configured but missing`);
      }
    }

    if (!moduleAddress) {
      entries.push({
        key,
        label: moduleConfig.label ?? labelFromKey(key),
        address: moduleAddress,
        type: moduleType,
        expectedController: expected.address,
        expectedSource: expected.source,
        status: 'missing-address',
        notes,
      });
      continue;
    }

    const { current, pending, errors } = await fetchOnChainController(
      moduleAddress,
      moduleType,
      includePending
    );
    if (errors.length > 0) {
      notes.push(...errors);
    }

    let status: ModuleInsight['status'] = 'ok';
    if (expected.address && current) {
      if (!addressesEqual(expected.address, current)) {
        status = 'mismatch';
        notes.push(
          `On-chain controller ${current ?? 'unknown'} differs from expected ${
            expected.address ?? 'unknown'
          }`
        );
      }
    } else if (expected.address && !current) {
      status = 'mismatch';
      notes.push(`On-chain controller is unset but expected ${expected.address}`);
    }

    entries.push({
      key,
      label: moduleConfig.label ?? labelFromKey(key),
      address: moduleAddress,
      type: moduleType,
      expectedController: expected.address,
      expectedSource: expected.source,
      onChainController: current ?? null,
      pendingController: pending ?? null,
      status,
      notes,
    });
  }
  return entries;
}

function renderMermaid(
  title: string,
  modules: ModuleInsight[],
  includePending: boolean
): MermaidBuildResult {
  const lines: string[] = [];
  const warnings: string[] = [];
  lines.push(`%% ${title}`);
  lines.push('flowchart LR');
  lines.push('  classDef module fill:#eef2ff,stroke:#312e81,stroke-width:1px;');
  lines.push('  classDef owner fill:#ecfdf5,stroke:#065f46,stroke-width:1px;');
  lines.push('  classDef pending fill:#fff7ed,stroke:#b45309,stroke-width:1px;');
  lines.push('  classDef mismatch fill:#fee2e2,stroke:#b91c1c,stroke-width:1px;');
  lines.push('  classDef unknown fill:#f3f4f6,stroke:#6b7280,stroke-width:1px;');

  const moduleNodeIds = new Map<string, string>();
  const ownerNodeIds = new Map<string, string>();
  const pendingNodeIds = new Map<string, string>();
  let moduleIndex = 0;
  let ownerIndex = 0;
  let pendingIndex = 0;

  function escapeLabel(value: string): string {
    return value.replace(/"/g, '\\"');
  }

  function ensureOwnerNode(address: string | null | undefined, label?: string): string {
    const key = address ?? 'unknown';
    if (ownerNodeIds.has(key)) {
      return ownerNodeIds.get(key)!;
    }
    const nodeId = `owner_${ownerIndex += 1}`;
    const nodeLabel = label ?? (address ? `${shortAddress(address)}` : 'Unassigned');
    lines.push(`  ${nodeId}["${escapeLabel(nodeLabel)}"]`);
    if (address) {
      lines.push(`  class ${nodeId} owner;`);
    } else {
      lines.push(`  class ${nodeId} unknown;`);
      warnings.push('Some modules are missing controller addresses.');
    }
    ownerNodeIds.set(key, nodeId);
    return nodeId;
  }

  function ensurePendingNode(address: string | null | undefined): string {
    const key = address ?? 'pending';
    if (pendingNodeIds.has(key)) {
      return pendingNodeIds.get(key)!;
    }
    const nodeId = `pending_${pendingIndex += 1}`;
    const label = address ? `Pending ${shortAddress(address)}` : 'Pending Unassigned';
    lines.push(`  ${nodeId}["${escapeLabel(label)}"]`);
    lines.push(`  class ${nodeId} pending;`);
    pendingNodeIds.set(key, nodeId);
    return nodeId;
  }

  for (const module of modules) {
    const moduleId = `module_${moduleIndex += 1}`;
    moduleNodeIds.set(module.key, moduleId);
    const moduleAddressLabel = module.address ? `\n${shortAddress(module.address)}` : '';
    lines.push(`  ${moduleId}["${escapeLabel(module.label + moduleAddressLabel)}"]`);
    lines.push(`  class ${moduleId} module;`);
    if (module.status === 'mismatch') {
      lines.push(`  class ${moduleId} mismatch;`);
    }
    if (module.status === 'missing-address') {
      lines.push(`  class ${moduleId} unknown;`);
    }

    const expectedNode = ensureOwnerNode(module.expectedController ?? null);
    if (module.expectedController) {
      lines.push(`  ${moduleId} -->|expected| ${expectedNode}`);
    } else {
      lines.push(`  ${moduleId} -.-> ${expectedNode}`);
    }

    if (
      module.onChainController &&
      module.expectedController &&
      !addressesEqual(module.onChainController, module.expectedController)
    ) {
      const actualNode = ensureOwnerNode(module.onChainController, `On-chain ${shortAddress(module.onChainController)}`);
      lines.push(`  ${moduleId} -.actual.-> ${actualNode}`);
      lines.push(`  class ${actualNode} mismatch;`);
      warnings.push(
        `${module.label} controller ${module.onChainController} differs from expected ${module.expectedController}`
      );
    }

    if (
      module.onChainController &&
      (!module.expectedController ||
        addressesEqual(module.onChainController, module.expectedController))
    ) {
      const actualNode = ensureOwnerNode(
        module.onChainController,
        `On-chain ${shortAddress(module.onChainController)}`
      );
      lines.push(`  ${moduleId} -.onchain.-> ${actualNode}`);
    }

    if (includePending && module.pendingController) {
      const pendingNode = ensurePendingNode(module.pendingController);
      lines.push(`  ${moduleId} -.pending.-> ${pendingNode}`);
    }
  }

  return { mermaid: lines.join('\n'), warnings };
}

function renderMarkdown(
  title: string,
  modules: ModuleInsight[],
  mermaid: string,
  warnings: string[],
  includePending: boolean
): string {
  const parts: string[] = [];
  parts.push(`# ${title}`);
  parts.push('');
  parts.push(
    `Generated ${new Date().toISOString()} on network **${network.name ?? 'unknown'}** with Hardhat.`
  );
  parts.push('');
  parts.push('```mermaid');
  parts.push(mermaid);
  parts.push('```');
  parts.push('');
  if (warnings.length > 0) {
    parts.push('> **Warnings**');
    for (const warning of warnings) {
      parts.push(`> - ${warning}`);
    }
    parts.push('');
  }

  parts.push('## Module Ownership Matrix');
  parts.push('');
  parts.push(
    '| Module | Address | Type | Expected Controller | On-chain Controller | Pending | Status | Notes |'
  );
  parts.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const module of modules) {
    const pending = includePending
      ? shortAddress(module.pendingController) || '–'
      : '–';
    const notes = module.notes.length > 0 ? module.notes.join('; ').replace(/\n/g, ' ') : '';
    const status = module.status
      .replace('-', ' ')
      .replace(/\b([a-z])/g, (match) => match.toUpperCase());
    parts.push(
      `| ${module.label} | ${shortAddress(module.address)} | ${module.type} | ${shortAddress(
        module.expectedController
      )} | ${shortAddress(module.onChainController)} | ${pending} | ${status} | ${notes || '–'} |`
    );
  }

  return parts.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const addressBook = await readAddressBook();
  const detectedNetwork = inferNetworkKey(network) ?? undefined;
  const configResult = loadOwnerControlConfig({
    network: options.configNetwork ?? detectedNetwork,
  });

  const insights = await collectModuleInsights(
    configResult,
    addressBook,
    options.includePending,
    options.addressOverrides
  );

  const title = options.title ?? DEFAULT_TITLE;
  const { mermaid, warnings } = renderMermaid(title, insights, options.includePending);

  const output =
    options.format === 'mermaid'
      ? mermaid
      : renderMarkdown(title, insights, mermaid, warnings, options.includePending);

  if (options.outputPath) {
    const resolved = path.resolve(options.outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, output, 'utf8');
    console.log(`Owner control diagram written to ${resolved}`);
  } else {
    console.log(output);
  }

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
