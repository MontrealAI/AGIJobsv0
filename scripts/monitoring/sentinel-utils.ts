import { promises as fs } from 'fs';
import path from 'path';

export type AddressBook = Record<string, string | undefined>;

export interface PlaceholderResolution {
  placeholder: string;
  address: string;
  source: string;
}

interface ManifestContractEntry {
  addresses?: Record<string, string>;
}

interface ReleaseManifest {
  contracts?: Record<string, ManifestContractEntry | undefined>;
}

export interface AddressIndexOptions {
  network: string;
  manifestPath?: string;
  mapFiles?: string[];
  inlineMap?: Record<string, string>;
}

export const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/g;
export const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function toSnakePlaceholder(key: string): string {
  if (!key) return key;
  const normalised = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
  return normalised;
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'rendered') {
        continue;
      }
      const childDir = path.join(directory, entry.name);
      const childFiles = await listJsonFiles(childDir);
      files.push(...childFiles);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      if (entry.name.startsWith('address-map')) {
        continue;
      }
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function collectAddressesFromBook(book: AddressBook | null, source: string): Map<string, PlaceholderResolution> {
  const mapping = new Map<string, PlaceholderResolution>();
  if (!book) return mapping;

  for (const [rawKey, value] of Object.entries(book)) {
    if (rawKey.startsWith('_') || typeof value !== 'string') {
      continue;
    }
    if (!ADDRESS_PATTERN.test(value)) {
      continue;
    }
    const placeholder = toSnakePlaceholder(rawKey);
    mapping.set(placeholder, { placeholder, address: value, source });
  }
  return mapping;
}

function mergeAddressMaps(target: Map<string, PlaceholderResolution>, source: Map<string, PlaceholderResolution>) {
  for (const [placeholder, record] of source.entries()) {
    target.set(placeholder, record);
  }
}

function extractAddressesFromManifest(
  manifest: ReleaseManifest | null,
  network: string
): Map<string, PlaceholderResolution> {
  const mapping = new Map<string, PlaceholderResolution>();
  if (!manifest?.contracts) {
    return mapping;
  }

  for (const [name, entry] of Object.entries(manifest.contracts)) {
    if (!entry?.addresses) continue;
    const placeholder = toSnakePlaceholder(name);
    const value = entry.addresses?.[network];
    if (typeof value === 'string' && ADDRESS_PATTERN.test(value)) {
      mapping.set(placeholder, {
        placeholder,
        address: value,
        source: `release manifest (${network})`,
      });
    }
  }

  return mapping;
}

function extractInlineOverrides(overrides: Record<string, string> | undefined): Map<string, PlaceholderResolution> {
  const mapping = new Map<string, PlaceholderResolution>();
  if (!overrides) {
    return mapping;
  }
  for (const [rawKey, value] of Object.entries(overrides)) {
    if (!ADDRESS_PATTERN.test(value)) continue;
    const placeholder = rawKey === rawKey.toUpperCase() ? rawKey : toSnakePlaceholder(rawKey);
    mapping.set(placeholder, {
      placeholder,
      address: value,
      source: 'inline override',
    });
  }
  return mapping;
}

export async function buildAddressIndex(options: AddressIndexOptions): Promise<Map<string, PlaceholderResolution>> {
  const { network, manifestPath, mapFiles = [], inlineMap } = options;
  const index = new Map<string, PlaceholderResolution>();
  const sources: Array<{ book: AddressBook | null; source: string }> = [];

  const deploymentConfigPath = path.resolve(process.cwd(), 'deployment-config', `${network}.json`);
  const networkConfig = await readJsonFile<AddressBook>(deploymentConfigPath);
  sources.push({ book: networkConfig, source: `${network} deployment config` });

  const latestDeploymentPath = path.resolve(process.cwd(), 'deployment-config', `latest-deployment.${network}.json`);
  const latestDeployment = await readJsonFile<AddressBook>(latestDeploymentPath);
  sources.push({ book: latestDeployment, source: 'latest deployment snapshot' });

  const deploymentAddresses = await readJsonFile<AddressBook>(
    path.resolve(process.cwd(), 'docs', 'deployment-addresses.json')
  );
  sources.push({ book: deploymentAddresses, source: 'docs/deployment-addresses.json' });

  const deploymentSummary = await readJsonFile<AddressBook>(
    path.resolve(process.cwd(), 'docs', 'deployment-summary.json')
  );
  sources.push({ book: deploymentSummary, source: 'docs/deployment-summary.json' });

  for (const { book, source } of sources) {
    mergeAddressMaps(index, collectAddressesFromBook(book, source));
  }

  const manifestCandidates = manifestPath ? [manifestPath] : ['reports/release/manifest.json'];
  for (const candidate of manifestCandidates) {
    const manifest = await readJsonFile<ReleaseManifest>(path.resolve(process.cwd(), candidate));
    if (manifest) {
      mergeAddressMaps(index, extractAddressesFromManifest(manifest, network));
    }
  }

  for (const mapFile of mapFiles) {
    const record = await readJsonFile<AddressBook>(path.resolve(process.cwd(), mapFile));
    mergeAddressMaps(index, collectAddressesFromBook(record, mapFile));
  }

  mergeAddressMaps(index, extractInlineOverrides(inlineMap));

  return index;
}

export function substitutePlaceholders(
  content: string,
  index: Map<string, PlaceholderResolution>
): {
  rendered: string;
  resolutions: PlaceholderResolution[];
  missing: string[];
} {
  const resolutions: PlaceholderResolution[] = [];
  const missing: string[] = [];

  const rendered = content.replace(PLACEHOLDER_PATTERN, (_, token: string) => {
    const placeholder = token.trim();
    const resolution = index.get(placeholder) || index.get(toSnakePlaceholder(placeholder));
    if (!resolution) {
      missing.push(placeholder);
      return `{{${placeholder}}}`;
    }
    resolutions.push(resolution);
    return resolution.address;
  });

  return { rendered, resolutions, missing: Array.from(new Set(missing)) };
}

export function ensureSentinelSchema(value: unknown): asserts value is {
  $schema?: string;
  name?: string;
  type?: string;
  network?: string;
  addresses?: unknown;
  abi?: unknown;
  conditions?: unknown;
  confirmations?: unknown;
  paused?: unknown;
  notifyOnAddressActivity?: unknown;
  notes?: unknown;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Sentinel definition must be a JSON object.');
  }
}
