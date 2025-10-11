#!/usr/bin/env ts-node
/*
 * Renders OpenZeppelin Defender / Forta sentinel templates by
 * substituting placeholder tokens with production contract addresses.
 *
 * The script searches the canonical deployment artefacts first
 * (`deployment-config/<network>.json`, `docs/deployment-addresses.json`,
 * `docs/deployment-summary.json`, and an optional release manifest)
 * before applying operator-provided overrides (either via --map flags
 * or address map files). This ensures the monitoring configuration
 * always matches the deployed contracts without hand editing JSON.
 */

import { promises as fs } from 'fs';
import path from 'path';

type AddressBook = Record<string, string | undefined>;

interface Options {
  network: string;
  inputDir: string;
  outputDir: string;
  manifestPath?: string;
  mapFiles: string[];
  inlineMap: Record<string, string>;
  allowMissing: boolean;
}

interface PlaceholderResolution {
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

const PLACEHOLDER_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function toSnakePlaceholder(key: string): string {
  if (!key) return key;
  const normalised = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
  return normalised;
}

async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
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

async function listJsonFiles(directory: string): Promise<string[]> {
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

function extractInlineOverrides(overrides: Record<string, string>): Map<string, PlaceholderResolution> {
  const mapping = new Map<string, PlaceholderResolution>();
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

async function buildAddressIndex(options: Options): Promise<Map<string, PlaceholderResolution>> {
  const index = new Map<string, PlaceholderResolution>();
  const sources: Array<{ book: AddressBook | null; source: string }> = [];

  const deploymentConfigPath = path.resolve(
    process.cwd(),
    'deployment-config',
    `${options.network}.json`
  );
  const networkConfig = await readJsonFile<AddressBook>(deploymentConfigPath);
  sources.push({ book: networkConfig, source: `${options.network} deployment config` });

  const latestDeploymentPath = path.resolve(
    process.cwd(),
    'deployment-config',
    `latest-deployment.${options.network}.json`
  );
  const latestDeployment = await readJsonFile<AddressBook>(latestDeploymentPath);
  sources.push({ book: latestDeployment, source: 'latest deployment snapshot' });

  const deploymentAddresses = await readJsonFile<AddressBook>(path.resolve(process.cwd(), 'docs', 'deployment-addresses.json'));
  sources.push({ book: deploymentAddresses, source: 'docs/deployment-addresses.json' });

  const deploymentSummary = await readJsonFile<AddressBook>(path.resolve(process.cwd(), 'docs', 'deployment-summary.json'));
  sources.push({ book: deploymentSummary, source: 'docs/deployment-summary.json' });

  for (const { book, source } of sources) {
    mergeAddressMaps(index, collectAddressesFromBook(book, source));
  }

  const manifestCandidates = options.manifestPath
    ? [options.manifestPath]
    : ['reports/release/manifest.json'];
  for (const manifestPath of manifestCandidates) {
    const manifest = await readJsonFile<ReleaseManifest>(path.resolve(process.cwd(), manifestPath));
    if (manifest) {
      mergeAddressMaps(index, extractAddressesFromManifest(manifest, options.network));
    }
  }

  for (const mapFile of options.mapFiles) {
    const record = await readJsonFile<AddressBook>(path.resolve(process.cwd(), mapFile));
    mergeAddressMaps(index, collectAddressesFromBook(record, mapFile));
  }

  mergeAddressMaps(index, extractInlineOverrides(options.inlineMap));

  return index;
}

function substitutePlaceholders(content: string, index: Map<string, PlaceholderResolution>): {
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

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    network: 'mainnet',
    inputDir: path.resolve(process.cwd(), 'monitoring', 'onchain'),
    outputDir: path.resolve(process.cwd(), 'monitoring', 'onchain', 'rendered', 'mainnet'),
    manifestPath: undefined,
    mapFiles: [],
    inlineMap: {},
    allowMissing: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--network' && argv[i + 1]) {
      options.network = argv[i + 1];
      options.outputDir = path.resolve(process.cwd(), 'monitoring', 'onchain', 'rendered', options.network);
      i += 1;
    } else if (current === '--input' && argv[i + 1]) {
      options.inputDir = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (current === '--output' && argv[i + 1]) {
      options.outputDir = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (current === '--manifest' && argv[i + 1]) {
      options.manifestPath = argv[i + 1];
      i += 1;
    } else if ((current === '--map-file' || current === '--address-map') && argv[i + 1]) {
      options.mapFiles.push(argv[i + 1]);
      i += 1;
    } else if (current === '--map' && argv[i + 1]) {
      const [key, value] = argv[i + 1].split('=');
      if (key && value) {
        options.inlineMap[key] = value;
      }
      i += 1;
    } else if (current === '--allow-missing') {
      options.allowMissing = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const addressIndex = await buildAddressIndex(options);

  if (addressIndex.size === 0) {
    console.warn('⚠️  No contract addresses discovered. Provide an address map or deployment artefact.');
  }

  const files = await listJsonFiles(options.inputDir);
  if (files.length === 0) {
    console.log('No sentinel templates found.');
    return;
  }

  await ensureDir(options.outputDir);

  const summary: Array<{ file: string; resolutions: PlaceholderResolution[]; missing: string[] }> = [];

  for (const templatePath of files) {
    const templateContents = await fs.readFile(templatePath, 'utf8');
    const { rendered, resolutions, missing } = substitutePlaceholders(templateContents, addressIndex);

    if (missing.length > 0 && !options.allowMissing) {
      throw new Error(
        `Missing address mappings for ${missing.join(', ')} in ${path.relative(process.cwd(), templatePath)}. ` +
          'Provide overrides via --map or --map-file.'
      );
    }

    // Validate JSON after substitutions to catch dangling placeholders.
    const parsed = JSON.parse(rendered);
    const relativeTemplatePath = path.relative(options.inputDir, templatePath);
    const destinationPath = path.join(options.outputDir, relativeTemplatePath);
    await ensureDir(path.dirname(destinationPath));
    await fs.writeFile(destinationPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

    summary.push({ file: destinationPath, resolutions, missing });
  }

  const lines = ['Rendered sentinel templates:'];
  for (const item of summary) {
    const relativePath = path.relative(process.cwd(), item.file);
    if (item.missing.length > 0) {
      lines.push(`- ${relativePath} (incomplete: ${item.missing.join(', ')})`);
    } else if (item.resolutions.length > 0) {
      const sources = Array.from(new Set(item.resolutions.map((r) => r.source))).join(', ');
      lines.push(`- ${relativePath} (addresses sourced from ${sources})`);
    } else {
      lines.push(`- ${relativePath} (no substitutions required)`);
    }
  }

  console.log(lines.join('\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

