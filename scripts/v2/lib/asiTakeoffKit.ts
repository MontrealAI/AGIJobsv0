import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');

export interface AsiTakeoffKitOptions {
  planPath: string;
  reportRoot: string;
  dryRunPath?: string;
  thermodynamicsPath?: string;
  missionControlPath?: string;
  summaryJsonPath?: string;
  summaryMarkdownPath?: string;
  bundleDir?: string;
  logDir?: string;
  outputBasename?: string;
  networkHint?: string;
  additionalArtifacts?: Array<ArtifactInput>;
  referenceDocs?: Array<ReferenceDoc>;
}

export interface ArtifactInput {
  key: string;
  path: string;
  description: string;
  optional?: boolean;
}

export interface DirectoryDescriptor {
  key: string;
  path: string;
  entries: string[];
}

export interface KitArtifactRecord {
  key: string;
  path: string;
  description: string;
  sha256: string;
  size: number;
}

export interface ReferenceDoc {
  path: string;
  description: string;
}

export interface AsiTakeoffKitResult {
  manifestPath: string;
  markdownPath: string;
  manifest: Record<string, unknown>;
  markdown: string;
}

function ensureAbsolute(targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }
  return path.join(ROOT, targetPath);
}

function relativeToRoot(targetPath: string): string {
  return path.relative(ROOT, targetPath);
}

async function ensureFileExists(filePath: string, label: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`Expected ${label} to be a file: ${relativeToRoot(filePath)}`);
    }
  } catch (error) {
    throw new Error(
      `Missing required ${label}: ${relativeToRoot(filePath)} (${(error as Error).message})`,
    );
  }
}

async function computeSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function collectDirectoryDescriptor(
  key: string,
  directoryPath: string,
): Promise<DirectoryDescriptor | undefined> {
  try {
    const stat = await fs.stat(directoryPath);
    if (!stat.isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const entries = await fs.readdir(directoryPath);
  entries.sort();
  return {
    key,
    path: relativeToRoot(directoryPath),
    entries,
  };
}

async function addArtifact(
  artifacts: KitArtifactRecord[],
  input: ArtifactInput,
): Promise<void> {
  const absolute = ensureAbsolute(input.path);
  try {
    await ensureFileExists(absolute, input.key);
  } catch (error) {
    if (input.optional) {
      return;
    }
    throw error;
  }

  const stat = await fs.stat(absolute);
  const sha256 = await computeSha256(absolute);
  artifacts.push({
    key: input.key,
    path: relativeToRoot(absolute),
    description: input.description,
    sha256,
    size: stat.size,
  });
}

export async function generateAsiTakeoffKit(
  options: AsiTakeoffKitOptions,
): Promise<AsiTakeoffKitResult> {
  const reportRoot = ensureAbsolute(options.reportRoot);
  const planPath = ensureAbsolute(options.planPath);
  await fs.mkdir(reportRoot, { recursive: true });

  await ensureFileExists(planPath, 'project plan');
  const planRaw = await fs.readFile(planPath, 'utf8');
  let plan: Record<string, any>;
  try {
    plan = JSON.parse(planRaw) as Record<string, any>;
  } catch (error) {
    throw new Error(
      `Unable to parse project plan JSON at ${relativeToRoot(planPath)}: ${(error as Error).message}`,
    );
  }

  const artifacts: KitArtifactRecord[] = [];

  const dryRunPath = options.dryRunPath
    ? ensureAbsolute(options.dryRunPath)
    : path.join(reportRoot, 'dry-run.json');
  const thermodynamicsPath = options.thermodynamicsPath
    ? ensureAbsolute(options.thermodynamicsPath)
    : path.join(reportRoot, 'thermodynamics.json');
  const missionControlPath = options.missionControlPath
    ? ensureAbsolute(options.missionControlPath)
    : path.join(reportRoot, 'mission-control.md');
  const summaryJsonPath = options.summaryJsonPath
    ? ensureAbsolute(options.summaryJsonPath)
    : path.join(reportRoot, 'summary.json');
  const summaryMarkdownPath = options.summaryMarkdownPath
    ? ensureAbsolute(options.summaryMarkdownPath)
    : path.join(reportRoot, 'summary.md');

  const requiredArtifacts: ArtifactInput[] = [
    {
      key: 'plan',
      path: planPath,
      description: 'Canonical national initiative plan used for orchestration.',
    },
    {
      key: 'dryRun',
      path: dryRunPath,
      description: 'Owner dry-run harness output capturing job lifecycle replay.',
    },
    {
      key: 'thermodynamics',
      path: thermodynamicsPath,
      description: 'Thermodynamic telemetry snapshot for incentive levers.',
    },
    {
      key: 'missionControl',
      path: missionControlPath,
      description: 'Owner mission-control dossier including governance diagram.',
    },
  ];

  if (summaryJsonPath) {
    requiredArtifacts.push({
      key: 'summaryJson',
      path: summaryJsonPath,
      description: 'Structured summary linking artefacts to mission goals.',
      optional: true,
    });
  }

  if (summaryMarkdownPath) {
    requiredArtifacts.push({
      key: 'summaryMarkdown',
      path: summaryMarkdownPath,
      description: 'Human-readable mission summary for reviewers.',
      optional: true,
    });
  }

  if (options.additionalArtifacts) {
    requiredArtifacts.push(...options.additionalArtifacts);
  }

  for (const artifact of requiredArtifacts) {
    await addArtifact(artifacts, artifact);
  }

  const bundleDescriptor = options.bundleDir
    ? await collectDirectoryDescriptor('missionBundle', ensureAbsolute(options.bundleDir))
    : undefined;
  const logDescriptor = options.logDir
    ? await collectDirectoryDescriptor('logs', ensureAbsolute(options.logDir))
    : undefined;

  const outputBasename = options.outputBasename ?? 'governance-kit';
  const manifestPath = path.join(reportRoot, `${outputBasename}.json`);
  const markdownPath = path.join(reportRoot, `${outputBasename}.md`);

  const governance = plan.governance ?? {};
  const thermostat = governance.thermostat ?? {};
  const network = options.networkHint ?? 'hardhat';
  const thermostatScript = thermostat.updateScript ?? 'scripts/v2/updateThermodynamics.ts';

  const defaultReferences: ReferenceDoc[] = [
    {
      path: 'docs/asi-national-governance-demo.md',
      description: 'National-scale governance rehearsal reference.',
    },
    {
      path: 'demo/asi-takeoff/RUNBOOK.md',
      description: 'Operator drill instructions for the national scenario.',
    },
    {
      path: 'docs/thermodynamic-incentives.md',
      description: 'Thermodynamic incentive design overview.',
    },
  ];
  const referenceDocs = options.referenceDocs && options.referenceDocs.length > 0
    ? options.referenceDocs
    : defaultReferences;

  const checklist = [
    {
      title: 'Verify owner control wiring',
      command: `npm run owner:verify-control -- --network ${network}`,
      purpose: 'Confirms SystemPause, treasury, and thermostat governance match hardened defaults.',
    },
    {
      title: 'Exercise pause and resume drill',
      command: 'npm run pause:test',
      purpose: 'Demonstrates the owner can halt and restore job execution paths instantly.',
    },
    {
      title: 'Thermostat parameter dry-run',
      command: `npx hardhat run ${thermostatScript} --network ${network}`,
      purpose: 'Simulates temperature adjustments before committing to the chain.',
    },
    {
      title: 'Thermostat parameter execute',
      command: `npx hardhat run ${thermostatScript} --network ${network} --execute`,
      purpose: 'Applies incentive tuning on-chain under multisig supervision.',
    },
    {
      title: 'Audit CI branch protection',
      command: 'npm run ci:verify-branch-protection',
      purpose: 'Proves pull requests and main remain blocked on the green CI suite.',
    },
  ];

  const manifest = {
    version: 'v1',
    generatedAt: new Date().toISOString(),
    reportRoot: relativeToRoot(reportRoot),
    ownerControls: {
      owner: governance.owner ?? null,
      pauseAuthority: governance.pauseAuthority ?? null,
      treasury: governance.treasury ?? null,
      thermostat,
    },
    initiative: plan.initiative ?? plan.title ?? null,
    objective: plan.objective ?? null,
    budget: plan.budget ?? null,
    jobs: Array.isArray(plan.jobs)
      ? plan.jobs.map((job: any) => ({
          id: job.id ?? job.name ?? 'job',
          title: job.title ?? job.name ?? null,
          reward: job.reward ?? null,
          deadlineDays: job.deadlineDays ?? null,
          dependencies: job.dependencies ?? [],
          thermodynamicProfile: job.thermodynamicProfile ?? null,
        }))
      : [],
    participants: plan.participants ?? {},
    artifacts,
    directories: [bundleDescriptor, logDescriptor].filter(
      (descriptor): descriptor is DirectoryDescriptor => Boolean(descriptor),
    ),
    checklist,
    references: referenceDocs,
  };

  const mdLines: string[] = [];
  mdLines.push('# ASI Take-Off Governance Kit');
  mdLines.push('');
  mdLines.push(`- Generated: ${manifest.generatedAt}`);
  if (manifest.initiative) {
    mdLines.push(`- Initiative: ${manifest.initiative}`);
  }
  if (manifest.objective) {
    mdLines.push(`- Objective: ${manifest.objective}`);
  }
  if (manifest.ownerControls.owner) {
    mdLines.push(`- Owner multisig: \`${manifest.ownerControls.owner}\``);
  }
  if (manifest.ownerControls.pauseAuthority) {
    mdLines.push(`- Pause authority: \`${manifest.ownerControls.pauseAuthority}\``);
  }
  if (manifest.ownerControls.treasury) {
    mdLines.push(`- Treasury: \`${manifest.ownerControls.treasury}\``);
  }
  if (manifest.ownerControls.thermostat?.initialTemperature) {
    mdLines.push(
      `- Thermostat baseline temperature: ${manifest.ownerControls.thermostat.initialTemperature}`,
    );
  }
  mdLines.push('');
  mdLines.push('## Operational Checklist');
  mdLines.push('');
  for (const item of checklist) {
    mdLines.push(`- **${item.title}.** ${item.purpose} Command: \`${item.command}\`.`);
  }
  mdLines.push('');
  mdLines.push('## Artifact Integrity');
  mdLines.push('');
  mdLines.push('| Key | Path | SHA-256 | Size (bytes) |');
  mdLines.push('| --- | --- | --- | ---: |');
  for (const artifact of artifacts) {
    mdLines.push(
      `| ${artifact.key} | ${artifact.path} | \`${artifact.sha256}\` | ${artifact.size} |`,
    );
  }
  mdLines.push('');
  if (manifest.directories.length > 0) {
    mdLines.push('## Directory Artefacts');
    mdLines.push('');
    for (const directory of manifest.directories) {
      mdLines.push(`- **${directory.key}** (\`${directory.path}\`)`);
      if (directory.entries.length === 0) {
        mdLines.push('  - (empty directory)');
      } else {
        for (const entry of directory.entries) {
          mdLines.push(`  - ${entry}`);
        }
      }
    }
    mdLines.push('');
  }
  if (referenceDocs.length > 0) {
    mdLines.push('## Owner Control References');
    mdLines.push('');
    for (const reference of referenceDocs) {
      mdLines.push(`- \`${reference.path}\` – ${reference.description}`);
    }
    mdLines.push('');
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(markdownPath, `${mdLines.join('\n')}\n`);

  return {
    manifestPath,
    markdownPath,
    manifest,
    markdown: mdLines.join('\n'),
  };
}

