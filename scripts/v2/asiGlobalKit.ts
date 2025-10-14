#!/usr/bin/env ts-node

import path from 'path';

import { ArtifactInput, ReferenceDoc, generateAsiTakeoffKit } from './lib/asiTakeoffKit';

const ROOT = path.resolve(__dirname, '..', '..');

interface CliOptions {
  reportRoot: string;
  planPath: string;
  dryRunPath: string;
  thermodynamicsPath: string;
  missionControlPath: string;
  summaryJsonPath: string;
  summaryMarkdownPath: string;
  bundleDir?: string;
  logDir?: string;
  outputBasename?: string;
  networkHint?: string;
  references: ReferenceDoc[];
  additionalArtifacts: ArtifactInput[];
}

function resolvePathValue(target: string): string {
  return path.isAbsolute(target) ? target : path.join(ROOT, target);
}

function resolveWithDefault(value: string | undefined, fallback: string): string {
  const candidate = value && value.trim().length > 0 ? value.trim() : fallback;
  return resolvePathValue(candidate);
}

function resolveOptional(value: string | undefined): string | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return resolvePathValue(value.trim());
}

function parseJsonList<T>(envKey: string): T[] {
  const raw = process.env[envKey];
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('value is not an array');
    }
    return parsed as T[];
  } catch (error) {
    throw new Error(`Failed to parse ${envKey}: ${(error as Error).message}`);
  }
}

function normaliseReferences(entries: ReferenceDoc[]): ReferenceDoc[] {
  return entries.map((entry, index) => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.description !== 'string') {
      throw new Error(`Invalid reference entry at index ${index} in environment configuration.`);
    }
    return { path: entry.path, description: entry.description };
  });
}

function normaliseArtifacts(entries: ArtifactInput[]): ArtifactInput[] {
  return entries.map((entry, index) => {
    if (
      !entry ||
      typeof entry.key !== 'string' ||
      typeof entry.path !== 'string' ||
      typeof entry.description !== 'string'
    ) {
      throw new Error(`Invalid artifact entry at index ${index} in environment configuration.`);
    }
    return {
      key: entry.key,
      path: entry.path,
      description: entry.description,
      optional: entry.optional,
    };
  });
}

function resolveFromRoot(target: string | undefined): string | undefined {
  if (!target) {
    return undefined;
  }
  return resolvePathValue(target);
}

function parseReference(entry: string): ReferenceDoc {
  const [rawPath, ...rest] = entry.split('::');
  if (!rawPath) {
    throw new Error('Reference entries must be in the form path::description');
  }
  const description = rest.join('::').trim();
  if (!description) {
    throw new Error('Reference description cannot be empty');
  }
  return { path: rawPath.trim(), description };
}

function parseArtifact(entry: string): ArtifactInput {
  const [key, rawPath, ...rest] = entry.split('::');
  if (!key || !rawPath) {
    throw new Error('Artifact entries must be key::path::description');
  }
  const description = rest.join('::').trim();
  if (!description) {
    throw new Error('Artifact description cannot be empty');
  }
  return { key: key.trim(), path: rawPath.trim(), description };
}

function parseArgs(argv: string[]): CliOptions {
  const referenceAppend = normaliseReferences(
    parseJsonList<ReferenceDoc>('ASI_GLOBAL_REFERENCE_DOCS_APPEND'),
  );
  const artifactAppend = normaliseArtifacts(
    parseJsonList<ArtifactInput>('ASI_GLOBAL_ADDITIONAL_ARTIFACTS_APPEND'),
  );

  const options: CliOptions = {
    reportRoot: resolveWithDefault(process.env.ASI_GLOBAL_REPORT_ROOT, 'reports/asi-global'),
    planPath: resolveWithDefault(process.env.ASI_GLOBAL_PLAN_PATH, 'demo/asi-global/project-plan.json'),
    dryRunPath: resolveWithDefault(process.env.ASI_GLOBAL_DRY_RUN_PATH, 'reports/asi-global/dry-run.json'),
    thermodynamicsPath: resolveWithDefault(
      process.env.ASI_GLOBAL_THERMODYNAMICS_PATH,
      'reports/asi-global/thermodynamics.json',
    ),
    missionControlPath: resolveWithDefault(
      process.env.ASI_GLOBAL_MISSION_CONTROL_PATH,
      'reports/asi-global/mission-control.md',
    ),
    summaryJsonPath: resolveWithDefault(
      process.env.ASI_GLOBAL_SUMMARY_JSON_PATH,
      'reports/asi-global/summary.json',
    ),
    summaryMarkdownPath: resolveWithDefault(
      process.env.ASI_GLOBAL_SUMMARY_MD_PATH,
      'reports/asi-global/summary.md',
    ),
    bundleDir: resolveOptional(process.env.ASI_GLOBAL_BUNDLE_DIR),
    logDir: resolveOptional(process.env.ASI_GLOBAL_LOG_DIR),
    outputBasename: process.env.ASI_GLOBAL_OUTPUT_BASENAME || 'asi-global-governance-kit',
    references: [
      {
        path: 'docs/asi-global-orchestrator-demo.md',
        description: 'Global ASI orchestration scenario guide.',
      },
      {
        path: 'demo/asi-global/RUNBOOK.md',
        description: 'Runbook for operating the global drill locally.',
      },
      {
        path: 'docs/thermodynamic-incentives.md',
        description: 'Thermodynamic incentive operations handbook.',
      },
      ...referenceAppend,
    ],
    additionalArtifacts: artifactAppend,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--report-root':
        if (!next) throw new Error('Missing value for --report-root');
        options.reportRoot = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--plan':
        if (!next) throw new Error('Missing value for --plan');
        options.planPath = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--dry-run':
        if (!next) throw new Error('Missing value for --dry-run');
        options.dryRunPath = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--thermodynamics':
        if (!next) throw new Error('Missing value for --thermodynamics');
        options.thermodynamicsPath = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--mission-control':
        if (!next) throw new Error('Missing value for --mission-control');
        options.missionControlPath = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--summary-json':
        if (!next) throw new Error('Missing value for --summary-json');
        options.summaryJsonPath = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--summary-md':
        if (!next) throw new Error('Missing value for --summary-md');
        options.summaryMarkdownPath = resolveFromRoot(next)!;
        i += 1;
        break;
      case '--bundle':
        if (!next) throw new Error('Missing value for --bundle');
        options.bundleDir = resolveFromRoot(next);
        i += 1;
        break;
      case '--logs':
        if (!next) throw new Error('Missing value for --logs');
        options.logDir = resolveFromRoot(next);
        i += 1;
        break;
      case '--output-name':
        if (!next) throw new Error('Missing value for --output-name');
        options.outputBasename = next;
        i += 1;
        break;
      case '--network':
        if (!next) throw new Error('Missing value for --network');
        options.networkHint = next;
        i += 1;
        break;
      case '--reference':
        if (!next) throw new Error('Missing value for --reference');
        options.references.push(parseReference(next));
        i += 1;
        break;
      case '--artifact':
        if (!next) throw new Error('Missing value for --artifact');
        options.additionalArtifacts.push(parseArtifact(next));
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await generateAsiTakeoffKit({
    planPath: options.planPath,
    reportRoot: options.reportRoot,
    dryRunPath: options.dryRunPath,
    thermodynamicsPath: options.thermodynamicsPath,
    missionControlPath: options.missionControlPath,
    summaryJsonPath: options.summaryJsonPath,
    summaryMarkdownPath: options.summaryMarkdownPath,
    bundleDir: options.bundleDir,
    logDir: options.logDir,
    outputBasename: options.outputBasename,
    networkHint: options.networkHint,
    referenceDocs: options.references,
    additionalArtifacts: options.additionalArtifacts,
  });

  process.stdout.write(
    `Governance kit generated:\n- ${result.manifestPath}\n- ${result.markdownPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`ASI global governance kit failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});

