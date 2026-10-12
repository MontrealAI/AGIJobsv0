import { promises as fs } from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';
import {
  loadOwnerControlConfig,
  inferNetworkKey,
  type OwnerControlConfig,
  type OwnerControlModuleConfig,
} from '../../config';
import { sameAddress } from './utils';

export type ModuleType = 'governable' | 'ownable' | 'ownable2step';

export type ModuleStatus =
  | 'ok'
  | 'mismatch'
  | 'missing-address'
  | 'missing-expected'
  | 'skipped'
  | 'error';

export interface ModuleCheck {
  key: string;
  label: string;
  type: ModuleType;
  address?: string;
  addressSource?: string;
  expectedOwner?: string;
  expectedSource?: string;
  currentOwner?: string;
  pendingOwner?: string | null;
  status: ModuleStatus;
  notes: string[];
  error?: string;
}

export interface OwnerControlSummary {
  ok: number;
  mismatch: number;
  missingAddress: number;
  missingExpected: number;
  skipped: number;
  error: number;
}

export interface OwnerControlVerificationOptions {
  configNetwork?: string;
  modules?: string[];
  skip?: string[];
  addressBookPath?: string;
  addressOverrides?: Record<string, string>;
}

export interface OwnerControlMetadata {
  chainId: bigint;
  networkName: string;
  hardhatNetwork: string;
  signer?: string | null;
  configPath: string;
  addressBookPath: string;
}

export interface OwnerControlVerificationResult {
  metadata: OwnerControlMetadata;
  results: ModuleCheck[];
  summary: OwnerControlSummary;
}

const DEFAULT_ADDRESS_BOOK = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'deployment-addresses.json'
);

function normaliseModuleType(value?: string): ModuleType {
  if (!value) {
    return 'governable';
  }
  const lower = value.toLowerCase();
  if (lower === 'governable' || lower === 'ownable' || lower === 'ownable2step') {
    return lower;
  }
  throw new Error(`Unsupported module type: ${value}`);
}

function normaliseAddress(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const address = ethers.getAddress(value);
    return address === ethers.ZeroAddress ? undefined : address;
  } catch (_) {
    return undefined;
  }
}

function envAddressKey(moduleKey: string): string {
  const upper = moduleKey.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `AGJ_${upper}_ADDRESS`;
}

function matchModuleKey(target: string, candidates: string[]): string | undefined {
  const lower = target.toLowerCase();
  return candidates.find((candidate) => candidate.toLowerCase() === lower);
}

async function readAddressBook(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const address = normaliseAddress(typeof value === 'string' ? value : undefined);
      if (address) {
        entries[key] = address;
      }
    }
    return entries;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function resolveExpectedOwner(
  moduleKey: string,
  module: OwnerControlModuleConfig,
  moduleType: ModuleType,
  config: OwnerControlConfig
): { owner?: string; source?: string } {
  const sources: { owner?: string; source?: string }[] = [];

  if (moduleType === 'governable' && module.governance) {
    const address = normaliseAddress(module.governance);
    if (address) {
      sources.push({ owner: address, source: `modules.${moduleKey}.governance` });
    }
  }

  if (moduleType !== 'governable' && module.owner) {
    const address = normaliseAddress(module.owner);
    if (address) {
      sources.push({ owner: address, source: `modules.${moduleKey}.owner` });
    }
  }

  if (moduleType === 'governable' && config.governance) {
    const address = normaliseAddress(config.governance);
    if (address) {
      sources.push({ owner: address, source: 'ownerControl.governance' });
    }
  }

  if (moduleType !== 'governable') {
    if (config.owner) {
      const address = normaliseAddress(config.owner);
      if (address) {
        sources.push({ owner: address, source: 'ownerControl.owner' });
      }
    }
    if (config.governance) {
      const address = normaliseAddress(config.governance);
      if (address) {
        sources.push({ owner: address, source: 'ownerControl.governance' });
      }
    }
  }

  return sources[0] ?? {};
}

function resolveModuleLabel(key: string, module: OwnerControlModuleConfig): string {
  if (module.label) {
    return module.label;
  }
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function resolveModuleAddress(
  key: string,
  module: OwnerControlModuleConfig,
  addressBook: Record<string, string>,
  overrides: Record<string, string>
): Promise<{ address?: string; source?: string; notes: string[] }> {
  const notes: string[] = [];
  const candidates: { value?: string; source: string }[] = [];

  const overrideKey = matchModuleKey(key, Object.keys(overrides));
  if (overrideKey) {
    candidates.push({ value: overrides[overrideKey], source: `override:${overrideKey}` });
  }

  if (module.address) {
    candidates.push({ value: module.address, source: `modules.${key}.address` });
  }

  const envKey = envAddressKey(key);
  if (process.env[envKey]) {
    candidates.push({ value: process.env[envKey], source: `env:${envKey}` });
  }

  const addressBookKey = matchModuleKey(key, Object.keys(addressBook));
  if (addressBookKey) {
    candidates.push({ value: addressBook[addressBookKey], source: `addressBook.${addressBookKey}` });
  }

  for (const candidate of candidates) {
    const address = normaliseAddress(candidate.value);
    if (address) {
      return { address, source: candidate.source, notes };
    }
    if (candidate.value) {
      notes.push(`Ignored invalid address from ${candidate.source}`);
    }
  }

  return { notes };
}

async function detectContractOwner(
  moduleType: ModuleType,
  address: string
): Promise<{ owner?: string; pending?: string | null }> {
  const provider = ethers.provider;
  const code = await provider.getCode(address);
  if (!code || code === '0x') {
    throw new Error('No contract code at address');
  }

  const governanceAbi = [
    'function governance() view returns (address)',
    'function owner() view returns (address)',
  ];
  const ownableAbi = ['function owner() view returns (address)'];
  const ownable2StepAbi = [
    'function owner() view returns (address)',
    'function pendingOwner() view returns (address)',
  ];

  switch (moduleType) {
    case 'governable': {
      const contract = new ethers.Contract(address, governanceAbi, provider);
      try {
        const governance = await contract.governance();
        if (typeof governance === 'string' && governance !== ethers.ZeroAddress) {
          return { owner: ethers.getAddress(governance), pending: null };
        }
      } catch (_) {
        // ignore, fallback to owner()
      }
      const owner = await contract.owner();
      return { owner: ethers.getAddress(owner), pending: null };
    }
    case 'ownable': {
      const contract = new ethers.Contract(address, ownableAbi, provider);
      const owner = await contract.owner();
      return { owner: ethers.getAddress(owner), pending: null };
    }
    case 'ownable2step': {
      const contract = new ethers.Contract(address, ownable2StepAbi, provider);
      const [owner, pending] = await Promise.all([
        contract.owner(),
        contract.pendingOwner().catch(() => ethers.ZeroAddress),
      ]);
      const pendingAddress = pending && pending !== ethers.ZeroAddress ? ethers.getAddress(pending) : null;
      return { owner: ethers.getAddress(owner), pending: pendingAddress };
    }
    default:
      throw new Error(`Unsupported module type ${moduleType}`);
  }
}

async function verifyModule(
  key: string,
  module: OwnerControlModuleConfig,
  moduleType: ModuleType,
  config: OwnerControlConfig,
  addressBook: Record<string, string>,
  overrides: Record<string, string>
): Promise<ModuleCheck> {
  const label = resolveModuleLabel(key, module);
  const notes: string[] = [];

  if (module.skip) {
    return {
      key,
      label,
      type: moduleType,
      status: 'skipped',
      notes: [...(module.notes ?? []), 'Verification skipped by configuration'],
    };
  }

  const expected = resolveExpectedOwner(key, module, moduleType, config);
  if (module.notes) {
    notes.push(...module.notes);
  }

  const addressResult = await resolveModuleAddress(key, module, addressBook, overrides);
  notes.push(...addressResult.notes);

  if (!addressResult.address) {
    const hintSources = [
      `Set modules.${key}.address`,
      `define ${envAddressKey(key)}`,
      'update docs/deployment-addresses.json',
    ];
    return {
      key,
      label,
      type: moduleType,
      expectedOwner: expected.owner,
      expectedSource: expected.source,
      status: 'missing-address',
      notes: [
        ...notes,
        `No address found for ${label}. Provide one via ${hintSources.join(' or ')}.`,
      ],
    };
  }

  try {
    const { owner, pending } = await detectContractOwner(moduleType, addressResult.address);
    const check: ModuleCheck = {
      key,
      label,
      type: moduleType,
      address: addressResult.address,
      addressSource: addressResult.source,
      expectedOwner: expected.owner,
      expectedSource: expected.source,
      currentOwner: owner,
      pendingOwner: pending ?? null,
      status: 'ok',
      notes,
    };

    if (!expected.owner) {
      check.status = 'missing-expected';
      check.notes = [
        ...notes,
        `Expected owner not configured for ${label}.`,
        moduleType === 'governable'
          ? 'Set ownerControl.governance or modules.<module>.governance.'
          : 'Set ownerControl.owner or modules.<module>.owner.',
      ];
      return check;
    }

    if (!owner) {
      check.status = 'error';
      check.notes = [...notes, 'Owner not detected on-chain.'];
      return check;
    }

    if (sameAddress(owner, expected.owner)) {
      if (pending && !sameAddress(pending, expected.owner)) {
        check.status = 'mismatch';
        check.notes = [
          ...notes,
          `Pending owner ${pending} differs from expected ${expected.owner}.`,
        ];
      }
      return check;
    }

    check.status = 'mismatch';
    check.notes = [
      ...notes,
      `On-chain owner ${owner} differs from expected ${expected.owner}.`,
      pending
        ? `Pending owner ${pending} detected. Call acceptOwnership from ${pending} if correct.`
        : 'Queue ownership transfer or update configuration.',
    ];
    check.pendingOwner = pending ?? null;
    return check;
  } catch (error: any) {
    return {
      key,
      label,
      type: moduleType,
      address: addressResult.address,
      addressSource: addressResult.source,
      expectedOwner: expected.owner,
      expectedSource: expected.source,
      status: 'error',
      notes,
      error: error?.message ?? String(error),
    };
  }
}

export function summariseResults(results: ModuleCheck[]): OwnerControlSummary {
  const summary: OwnerControlSummary = {
    ok: 0,
    mismatch: 0,
    missingAddress: 0,
    missingExpected: 0,
    skipped: 0,
    error: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case 'ok':
        summary.ok += 1;
        break;
      case 'mismatch':
        summary.mismatch += 1;
        break;
      case 'missing-address':
        summary.missingAddress += 1;
        break;
      case 'missing-expected':
        summary.missingExpected += 1;
        break;
      case 'skipped':
        summary.skipped += 1;
        break;
      case 'error':
      default:
        summary.error += 1;
        break;
    }
  }

  return summary;
}

export async function verifyOwnerControl(
  options: OwnerControlVerificationOptions = {}
): Promise<OwnerControlVerificationResult> {
  const addressBookPath = options.addressBookPath
    ? path.resolve(options.addressBookPath)
    : DEFAULT_ADDRESS_BOOK;
  const addressBook = await readAddressBook(addressBookPath);
  const addressOverrides = { ...(options.addressOverrides ?? {}) };

  const { config, path: configPath } = loadOwnerControlConfig({
    network: options.configNetwork,
  });

  const provider = ethers.provider;
  const [networkInfo, hardhatNetwork] = await Promise.all([
    provider.getNetwork(),
    Promise.resolve(inferNetworkKey(network) ?? network.name),
  ]);

  let signerAddress: string | null = null;
  try {
    const signers = await ethers.getSigners();
    signerAddress = signers.length > 0 ? await signers[0].getAddress() : null;
  } catch (_) {
    signerAddress = null;
  }

  const modulesConfig = config.modules ?? {};
  const moduleEntries = Object.keys(modulesConfig)
    .sort((a, b) => a.localeCompare(b))
    .filter((key) => {
      if (options.modules && options.modules.length > 0) {
        return options.modules.some((entry) => entry.toLowerCase() === key.toLowerCase());
      }
      if (options.skip && options.skip.length > 0) {
        return !options.skip.some((entry) => entry.toLowerCase() === key.toLowerCase());
      }
      return true;
    });

  const results: ModuleCheck[] = [];
  for (const key of moduleEntries) {
    const moduleConfig = modulesConfig[key] ?? {};
    let moduleType: ModuleType;
    try {
      moduleType = normaliseModuleType(
        typeof moduleConfig.type === 'string' ? moduleConfig.type : undefined
      );
    } catch (error: any) {
      results.push({
        key,
        label: resolveModuleLabel(key, moduleConfig),
        type: 'governable',
        status: 'error',
        notes: moduleConfig.notes ?? [],
        error: error?.message ?? String(error),
      });
      continue;
    }

    const check = await verifyModule(
      key,
      moduleConfig,
      moduleType,
      config,
      addressBook,
      addressOverrides
    );
    results.push(check);
  }

  const summary = summariseResults(results);

  return {
    metadata: {
      chainId: networkInfo.chainId,
      networkName: networkInfo.name,
      hardhatNetwork,
      signer: signerAddress,
      configPath,
      addressBookPath,
    },
    results,
    summary,
  };
}

export { DEFAULT_ADDRESS_BOOK };
