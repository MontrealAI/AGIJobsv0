#!/usr/bin/env ts-node
/*
 * Validates OpenZeppelin Defender / Forta sentinel templates without
 * mutating them. The validator ensures placeholders resolve to known
 * contract addresses, ABI signatures match configured conditions, and
 * severity / channel metadata complies with institutional guardrails.
 */

import { promises as fs } from 'fs';
import path from 'path';

import {
  ADDRESS_PATTERN,
  AddressIndexOptions,
  PlaceholderResolution,
  buildAddressIndex,
  ensureSentinelSchema,
  listJsonFiles,
  substitutePlaceholders,
} from './sentinel-utils';

interface Options extends AddressIndexOptions {
  inputDir: string;
  manifestPath?: string;
  mapFiles: string[];
  inlineMap: Record<string, string>;
  requireNotificationChannels: boolean;
}

interface ValidationIssue {
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

const ALLOWED_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

function parseArgs(argv: string[]): Options {
  const options: Options = {
    network: 'mainnet',
    inputDir: path.resolve(process.cwd(), 'monitoring', 'onchain'),
    manifestPath: undefined,
    mapFiles: [],
    inlineMap: {},
    requireNotificationChannels: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--network' && argv[i + 1]) {
      options.network = argv[i + 1];
      i += 1;
    } else if (current === '--input' && argv[i + 1]) {
      options.inputDir = path.resolve(process.cwd(), argv[i + 1]);
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
    } else if (current === '--allow-empty-channels') {
      options.requireNotificationChannels = false;
    }
  }

  return options;
}

function formatEventSignature(entry: { name?: string; inputs?: Array<{ type?: string }> }): string | null {
  if (!entry?.name) {
    return null;
  }
  const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
  const types = inputs.map((input) => (typeof input?.type === 'string' ? input.type : '')).join(',');
  return `${entry.name}(${types})`;
}

function validateConditions(file: string, sentinel: unknown, issues: ValidationIssue[]) {
  const candidate = sentinel as {
    abi?: unknown;
    conditions?: unknown;
  };
  const abiEntries = Array.isArray(candidate.abi) ? candidate.abi : [];
  const abiEvents = new Set(
    abiEntries
      .filter((entry) => entry && entry.type === 'event')
      .map((entry) => formatEventSignature(entry as { name?: string; inputs?: Array<{ type?: string }> }))
      .filter((sig): sig is string => Boolean(sig))
  );

  const conditions = Array.isArray(candidate.conditions) ? candidate.conditions : [];
  for (const [index, rawCondition] of conditions.entries()) {
    const condition = rawCondition ?? {};
    const eventName = typeof condition.event === 'string' ? condition.event : null;
    if (!eventName) {
      issues.push({
        file,
        severity: 'error',
        message: `Condition #${index + 1} missing event signature`,
      });
    } else if (!abiEvents.has(eventName)) {
      issues.push({
        file,
        severity: 'error',
        message: `Condition ${eventName} is not declared in the ABI block`,
      });
    }

    const severity = typeof condition.severity === 'string' ? condition.severity : '';
    if (!ALLOWED_SEVERITIES.has(severity)) {
      issues.push({
        file,
        severity: 'error',
        message: `Condition ${eventName ?? `#${index + 1}`} has unsupported severity "${severity}"`,
      });
    }

  }
}

function ensureChannels(
  file: string,
  sentinel: unknown,
  requireChannels: boolean,
  issues: ValidationIssue[]
) {
  if (!requireChannels) {
    return;
  }
  const candidate = sentinel as { conditions?: unknown };
  const conditions = Array.isArray(candidate.conditions) ? candidate.conditions : [];
  for (const [index, rawCondition] of conditions.entries()) {
    const channels = Array.isArray(rawCondition?.notificationChannels) ? rawCondition.notificationChannels : [];
    if (channels.length === 0) {
      issues.push({
        file,
        severity: 'error',
        message: `Condition #${index + 1} must define at least one notification channel`,
      });
    } else if (!channels.every((entry) => typeof entry === 'string' && entry.trim().length > 0)) {
      issues.push({
        file,
        severity: 'error',
        message: `Condition #${index + 1} has invalid notification channel entries`,
      });
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const addressIndex = await buildAddressIndex(options);

  if (addressIndex.size === 0) {
    console.warn('⚠️  No contract addresses discovered while validating sentinels.');
  }

  const files = await listJsonFiles(options.inputDir);
  if (files.length === 0) {
    console.log('No sentinel templates found.');
    return;
  }

  const issues: ValidationIssue[] = [];
  const summaries: Array<{ file: string; resolutions: PlaceholderResolution[]; missing: string[] }> = [];

  for (const templatePath of files) {
    const templateContents = await fs.readFile(templatePath, 'utf8');
    const { rendered, resolutions, missing } = substitutePlaceholders(templateContents, addressIndex);

    const relativeFile = path.relative(process.cwd(), templatePath);

    if (missing.length > 0) {
      issues.push({
        file: relativeFile,
        severity: 'error',
        message: `Missing address mappings for placeholders: ${missing.join(', ')}`,
      });
    }

    try {
      const parsed = JSON.parse(rendered);
      ensureSentinelSchema(parsed);
      if (typeof parsed.network === 'string' && parsed.network.toLowerCase() !== options.network.toLowerCase()) {
        issues.push({
          file: relativeFile,
          severity: 'warning',
          message: `Sentinel declares network "${parsed.network}" which differs from expected "${options.network}"`,
        });
      }
      if (!Array.isArray(parsed.addresses) || parsed.addresses.length === 0) {
        issues.push({
          file: relativeFile,
          severity: 'error',
          message: 'Sentinel must monitor at least one contract address',
        });
      } else if (!parsed.addresses.every((addr: unknown) => typeof addr === 'string' && ADDRESS_PATTERN.test(addr))) {
        issues.push({
          file: relativeFile,
          severity: 'error',
          message: 'Sentinel addresses must resolve to 20-byte hex strings',
        });
      }

      validateConditions(relativeFile, parsed, issues);
      ensureChannels(relativeFile, parsed, options.requireNotificationChannels, issues);
    } catch (error) {
      issues.push({
        file: relativeFile,
        severity: 'error',
        message: `Invalid JSON definition: ${(error as Error).message}`,
      });
    }

    summaries.push({ file: relativeFile, resolutions, missing });
  }

  const summaryLines = ['Sentinel validation summary:'];
  for (const entry of summaries) {
    const sources = Array.from(new Set(entry.resolutions.map((resolution) => resolution.source)));
    if (entry.missing.length > 0) {
      summaryLines.push(`- ${entry.file}: missing placeholders ${entry.missing.join(', ')}`);
    } else if (entry.resolutions.length > 0) {
      summaryLines.push(`- ${entry.file}: resolved via ${sources.join(', ')}`);
    } else {
      summaryLines.push(`- ${entry.file}: no placeholders detected`);
    }
  }
  console.log(summaryLines.join('\n'));

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  if (warnings.length > 0) {
    console.warn('\nWarnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning.file}: ${warning.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('\nErrors:');
    for (const error of errors) {
      console.error(`- ${error.file}: ${error.message}`);
    }
    process.exit(1);
  }

  console.log('\nAll sentinel templates validated successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
