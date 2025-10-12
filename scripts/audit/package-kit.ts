#!/usr/bin/env ts-node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

type PackageEntry = {
  path: string;
  description: string;
  required: boolean;
};

type Options = {
  output?: string;
  includeCoverage: boolean;
  includeGasSnapshots: boolean;
  extraPaths: string[];
  force: boolean;
  help: boolean;
};

type Manifest = {
  generatedAt: string;
  outputArchive: string;
  rootDir: string;
  command: string;
  included: { path: string; description?: string }[];
  optionalIncluded: { path: string; description?: string }[];
  optionalMissing: { path: string; description?: string }[];
  extras: string[];
  warnings: string[];
};

const DEFAULT_ENTRIES: PackageEntry[] = [
  {
    path: 'reports/audit',
    description: 'Automated audit dossier outputs',
    required: true,
  },
  {
    path: 'docs/AUDIT_DOSSIER.md',
    description: 'Audit dossier instructions',
    required: true,
  },
  {
    path: 'docs/audit/final-verification-playbook.md',
    description: 'External audit & final verification playbook',
    required: true,
  },
  {
    path: 'docs/audit/formal-verification-brief.md',
    description: 'Formal verification briefing',
    required: false,
  },
  {
    path: 'docs/invariants.md',
    description: 'Protocol invariants catalogue',
    required: false,
  },
  {
    path: 'docs/owner-control-master-checklist.md',
    description: 'Owner control master checklist',
    required: false,
  },
  {
    path: 'docs/owner-control-parameter-playbook.md',
    description: 'Parameter update guide',
    required: false,
  },
  {
    path: 'docs/owner-control-zero-downtime-guide.md',
    description: 'Pause/unpause & zero downtime guide',
    required: false,
  },
  {
    path: 'reports/release-manifest.json',
    description: 'Latest release manifest snapshot',
    required: false,
  },
  {
    path: 'reports/sbom/cyclonedx.json',
    description: 'Dependency SBOM',
    required: false,
  },
];

function printUsage(): void {
  console.log(
    `Usage: npm run audit:package [-- [options]]\n\n` +
      'Options:\n' +
      '  --output <file>           Custom archive path (default: reports/audit/agi-jobs-v2-audit-kit-<timestamp>.tar.gz)\n' +
      '  --include-coverage        Include coverage/ directory if present\n' +
      '  --include-gas             Include gas-snapshots/ directory if present\n' +
      '  --extra <path>            Additional relative path to include (repeatable)\n' +
      '  --force                   Overwrite existing archive if present\n' +
      '  -h, --help                Show this message\n'
  );
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    includeCoverage: false,
    includeGasSnapshots: false,
    extraPaths: [],
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--output': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--output requires a value');
        }
        options.output = value;
        i += 1;
        break;
      }
      case '--include-coverage':
        options.includeCoverage = true;
        break;
      case '--include-gas':
        options.includeGasSnapshots = true;
        break;
      case '--extra': {
        const value = argv[i + 1];
        if (!value) {
          throw new Error('--extra requires a value');
        }
        options.extraPaths.push(value);
        i += 1;
        break;
      }
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function resolveGitRoot(): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout) {
    throw new Error(
      'Unable to resolve repository root. Ensure this script runs inside the Git repository.'
    );
  }
  return result.stdout.trim();
}

function ensureTarAvailable(): void {
  const result = spawnSync('tar', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      'tar command not available. Install tar or run this script from an environment with GNU tar.'
    );
  }
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target) || '.';
}

function buildArchive(options: Options): void {
  if (options.help) {
    printUsage();
    return;
  }

  ensureTarAvailable();

  const rootDir = resolveGitRoot();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOutput = path.join(
    rootDir,
    'reports',
    'audit',
    `agi-jobs-v2-audit-kit-${timestamp}.tar.gz`
  );
  const outputPath = path.isAbsolute(options.output ?? '')
    ? (options.output as string)
    : path.resolve(rootDir, options.output ?? defaultOutput);

  if (!options.force && fs.existsSync(outputPath)) {
    throw new Error(
      `Output archive already exists at ${outputPath}. Use --force to overwrite or choose --output.`
    );
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const required: { entry: PackageEntry; absolute: string }[] = [];
  const optional: { entry: PackageEntry; absolute: string }[] = [];
  const missingRequired: PackageEntry[] = [];
  const missingOptional: PackageEntry[] = [];

  for (const entry of DEFAULT_ENTRIES) {
    const absolute = path.join(rootDir, entry.path);
    if (fs.existsSync(absolute)) {
      if (entry.required) {
        required.push({ entry, absolute });
      } else {
        optional.push({ entry, absolute });
      }
    } else if (entry.required) {
      missingRequired.push(entry);
    } else {
      missingOptional.push(entry);
    }
  }

  if (missingRequired.length > 0) {
    const missingList = missingRequired
      .map(
        (entry) =>
          ` - ${entry.path}${
            entry.description ? ` (${entry.description})` : ''
          }`
      )
      .join('\n');
    throw new Error(
      `Cannot build audit kit because required artefacts are missing:\n${missingList}\n` +
        'Run `npm run audit:dossier` and ensure documentation is present before packaging.'
    );
  }

  const includePaths = new Set<string>();
  const included: { path: string; description?: string }[] = [];

  for (const item of required) {
    const relative = relativePath(rootDir, item.absolute);
    includePaths.add(relative);
    included.push({ path: relative, description: item.entry.description });
  }

  const optionalIncluded: { path: string; description?: string }[] = [];
  const optionalMissing: { path: string; description?: string }[] = [];

  for (const item of optional) {
    const relative = relativePath(rootDir, item.absolute);
    includePaths.add(relative);
    optionalIncluded.push({
      path: relative,
      description: item.entry.description,
    });
  }

  for (const entry of missingOptional) {
    optionalMissing.push({ path: entry.path, description: entry.description });
  }

  if (options.includeCoverage) {
    const coveragePath = path.join(rootDir, 'coverage');
    if (fs.existsSync(coveragePath)) {
      includePaths.add(relativePath(rootDir, coveragePath));
    } else {
      optionalMissing.push({
        path: 'coverage',
        description: 'Coverage report (not found)',
      });
    }
  }

  if (options.includeGasSnapshots) {
    const gasPath = path.join(rootDir, 'gas-snapshots');
    if (fs.existsSync(gasPath)) {
      includePaths.add(relativePath(rootDir, gasPath));
    } else {
      optionalMissing.push({
        path: 'gas-snapshots',
        description: 'Gas snapshot directory (not found)',
      });
    }
  }

  const extras: string[] = [];
  for (const extra of options.extraPaths) {
    const absolute = path.resolve(rootDir, extra);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Extra path not found: ${extra}`);
    }
    const relative = relativePath(rootDir, absolute);
    includePaths.add(relative);
    extras.push(relative);
  }

  if (includePaths.size === 0) {
    throw new Error('No artefacts selected for packaging.');
  }

  const tarArgs = ['-czf', outputPath, ...Array.from(includePaths).sort()];
  const command = `tar ${tarArgs
    .map((arg) => (arg.includes(' ') ? `'${arg}'` : arg))
    .join(' ')}`;
  console.log(`Creating audit kit archive at ${outputPath}`);
  console.log(`Command: ${command}`);

  const tarResult = spawnSync('tar', tarArgs, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (tarResult.status !== 0) {
    throw new Error(`tar exited with status ${tarResult.status ?? 'unknown'}`);
  }

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    outputArchive: relativePath(rootDir, outputPath),
    rootDir,
    command,
    included,
    optionalIncluded,
    optionalMissing,
    extras,
    warnings: optionalMissing.length
      ? optionalMissing.map(
          (entry) =>
            `Missing optional artefact: ${entry.path}${
              entry.description ? ` (${entry.description})` : ''
            }`
        )
      : [],
  };

  const manifestPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, '.tar.gz')}-manifest.json`
  );
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  console.log(`Audit kit manifest written to ${manifestPath}`);
  if (manifest.warnings.length > 0) {
    console.warn('Warnings:');
    for (const warning of manifest.warnings) {
      console.warn(` - ${warning}`);
    }
  }
}

function main(): void {
  try {
    const { argv } = process;
    const options = parseArgs(argv.slice(2));
    buildArchive(options);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Unknown error occurred', error);
    }
    process.exit(1);
  }
}

main();
