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
  localReceiptsDir?: string;
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

async function ensureFileExists(
  filePath: string,
  label: string
): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(
        `Expected ${label} to be a file: ${relativeToRoot(filePath)}`
      );
    }
  } catch (error) {
    throw new Error(
      `Missing required ${label}: ${relativeToRoot(filePath)} (${
        (error as Error).message
      })`
    );
  }
}

async function computeSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function collectDirectoryDescriptor(
  key: string,
  directoryPath: string
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
  input: ArtifactInput
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
  options: AsiTakeoffKitOptions
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
      `Unable to parse project plan JSON at ${relativeToRoot(planPath)}: ${
        (error as Error).message
      }`
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
      description:
        'Scenario context or local mission configuration; not proof of delivered work.',
    },
    ...(options.localReceiptsDir
      ? [
          {
            key: 'missionReceipt',
            path: path.join(
              ensureAbsolute(options.localReceiptsDir),
              'mission.json'
            ),
            description: 'Local mission driver receipt.',
          },
          {
            key: 'deployment',
            path: path.join(
              ensureAbsolute(options.localReceiptsDir),
              'deploy.json'
            ),
            description: 'Disposable local deployment addresses.',
          },
          {
            key: 'governanceReceipt',
            path: path.join(
              ensureAbsolute(options.localReceiptsDir),
              'governance.json'
            ),
            description: 'Local governance drill receipt.',
          },
          {
            key: 'stakeReceipt',
            path: path.join(
              ensureAbsolute(options.localReceiptsDir),
              'stake.json'
            ),
            description: 'Local staking receipt.',
          },
        ]
      : [
          {
            key: 'dryRun',
            path: dryRunPath,
            description:
              'Owner dry-run harness output capturing job lifecycle replay.',
          },
          {
            key: 'thermodynamics',
            path: thermodynamicsPath,
            description:
              'Thermodynamic telemetry snapshot for incentive levers.',
          },
          {
            key: 'missionControl',
            path: missionControlPath,
            description:
              'Owner mission-control dossier including governance diagram.',
          },
        ]),
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
    ? await collectDirectoryDescriptor(
        'missionBundle',
        ensureAbsolute(options.bundleDir)
      )
    : undefined;
  const logDescriptor = options.logDir
    ? await collectDirectoryDescriptor('logs', ensureAbsolute(options.logDir))
    : undefined;

  const outputBasename = options.outputBasename ?? 'governance-kit';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(outputBasename))
    throw new Error(
      'Output name must be a plain filename without path separators'
    );
  const manifestPath = path.join(reportRoot, `${outputBasename}.json`);
  const markdownPath = path.join(reportRoot, `${outputBasename}.md`);
  for (const output of [manifestPath, markdownPath]) {
    const canonicalOutput = await fs
      .realpath(output)
      .catch(() => path.resolve(output));
    for (const artifact of artifacts) {
      const canonicalInput = await fs.realpath(
        path.resolve(ROOT, artifact.path)
      );
      if (canonicalInput === canonicalOutput)
        throw new Error('Kit output would overwrite a source artifact');
    }
  }

  const governance = plan.governance ?? {};
  const thermostat = governance.thermostat ?? {};
  const network = options.networkHint ?? 'hardhat';
  if (!/^[A-Za-z0-9_-]+$/.test(network))
    throw new Error('Invalid network name');
  const thermostatScript = 'scripts/v2/updateThermodynamics.ts';
  const thermostatCommand = `HARDHAT_NETWORK=${network} npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' ${thermostatScript}`;
  const dryRun = options.localReceiptsDir
    ? null
    : JSON.parse(await fs.readFile(dryRunPath, 'utf8'));
  const mode = options.localReceiptsDir
    ? 'local-receipts'
    : dryRun?.network === 'hardhat-offline' || dryRun?.status === 'simulated'
    ? 'offline-fixture'
    : 'reported-rehearsal';

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
  const referenceDocs =
    options.referenceDocs && options.referenceDocs.length > 0
      ? options.referenceDocs
      : defaultReferences;

  const checklist = [
    {
      title: 'Verify owner control wiring',
      command: `npm run owner:verify-control -- --network ${network}`,
      purpose:
        'Inspect the separately prepared deployment; configured addresses and permissions must be verified on its actual network.',
    },
    {
      title: 'Exercise pause and resume drill',
      command: `HARDHAT_NETWORK=${network} npm run pause:test`,
      purpose:
        'Runs the repository pause test; it does not pause or resume a production deployment.',
    },
    {
      title: 'Thermostat parameter dry-run',
      command: thermostatCommand,
      purpose:
        'Previews parameter actions against a prepared deployment. It requires the correct RPC, addresses and signer context.',
    },
    {
      title: 'Thermostat parameter execute',
      command: `${thermostatCommand} --execute`,
      purpose:
        'Broadcasts transactions. Use only after separately recorded authorization and review of the exact network, deployment and signer.',
    },
    {
      title: 'Audit CI branch protection',
      command: 'npm run ci:verify-branch-protection',
      purpose:
        'Inspects branch protection with the required GitHub access; a report is not a guarantee of future enforcement.',
    },
  ];

  const manifest = {
    version: 'v1',
    evidence: {
      mode,
      liveProvider: false,
      productionApproved: false,
      settlementApproved: false,
      note: 'Hashes establish the recorded bytes only. The generator does not verify receipts on-chain, prove control authority, or certify completed work. Directory entries are an index, not recursively hashed artifacts.',
    },
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
      (descriptor): descriptor is DirectoryDescriptor => Boolean(descriptor)
    ),
    checklist,
    references: referenceDocs,
  };

  const mdLines: string[] = [];
  mdLines.push('# ASI Take-Off Governance Kit');
  mdLines.push('');
  mdLines.push(`**Evidence mode: ${mode}.** ${manifest.evidence.note}`);
  mdLines.push('');
  if (mode === 'offline-fixture') {
    mdLines.push(
      '**Offline fixtures: no governance checks or blockchain transactions were performed by this mode.**'
    );
    mdLines.push('');
  }
  mdLines.push(`- Generated: ${manifest.generatedAt}`);
  if (manifest.initiative) {
    mdLines.push(`- Initiative: ${manifest.initiative}`);
  }
  if (manifest.objective) {
    mdLines.push(`- Objective: ${manifest.objective}`);
  }
  if (manifest.ownerControls.owner) {
    mdLines.push(
      `- Scenario owner label (unverified): \`${manifest.ownerControls.owner}\``
    );
  }
  if (manifest.ownerControls.pauseAuthority) {
    mdLines.push(
      `- Pause authority: \`${manifest.ownerControls.pauseAuthority}\``
    );
  }
  if (manifest.ownerControls.treasury) {
    mdLines.push(`- Treasury: \`${manifest.ownerControls.treasury}\``);
  }
  if (manifest.ownerControls.thermostat?.initialTemperature) {
    mdLines.push(
      `- Thermostat baseline temperature: ${manifest.ownerControls.thermostat.initialTemperature}`
    );
  }
  mdLines.push('');
  mdLines.push('## Operational Checklist');
  mdLines.push('');
  for (const item of checklist) {
    mdLines.push(
      `- **${item.title}.** ${item.purpose} Command: \`${item.command}\`.`
    );
  }
  mdLines.push('');
  mdLines.push('## Artifact Integrity');
  mdLines.push('');
  mdLines.push('| Key | Path | SHA-256 | Size (bytes) |');
  mdLines.push('| --- | --- | --- | ---: |');
  for (const artifact of artifacts) {
    mdLines.push(
      `| ${artifact.key} | ${artifact.path} | \`${artifact.sha256}\` | ${artifact.size} |`
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
