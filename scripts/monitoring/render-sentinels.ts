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

import {
  AddressIndexOptions,
  PlaceholderResolution,
  buildAddressIndex,
  listJsonFiles,
  substitutePlaceholders,
} from './sentinel-utils';

interface Options extends AddressIndexOptions {
  inputDir: string;
  outputDir: string;
  mapFiles: string[];
  inlineMap: Record<string, string>;
  allowMissing: boolean;
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

