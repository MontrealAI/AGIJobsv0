import fs from 'fs';
import path from 'path';
import { listAgentProfiles, type AgentProfile } from './agentRegistry';
import { registerIdentityFile } from './identity';
import { secureLogAction } from './security';
import {
  listSpawnCandidates,
  createBlueprintForCandidate,
  type SpawnCandidate,
  type AgentBlueprint,
  spawnDefaults,
} from '../shared/spawnManager';
import { saveWalletKey, walletManager } from './utils';
import {
  registerEnsSubdomain,
  verifyEnsRegistration,
  type EnsRegistrationResult,
} from './ensRegistrar';

export interface SpawnCandidateReport extends SpawnCandidate {
  existingAgents: number;
  capacity: number;
  available: boolean;
}

export interface SpawnBlueprintOptions {
  category?: string;
  minPriority?: number;
  dryRun?: boolean;
  persist?: boolean;
  markConsumed?: boolean;
  includeSaturated?: boolean;
  blueprintDir?: string;
}

const IDENTITY_DIR = path.resolve(__dirname, '../config/agents');
const SANDBOX_DIR = path.resolve(__dirname, '../storage/sandbox');
const DEFAULT_OBSERVATION_THRESHOLD = Number(
  process.env.AGENT_FACTORY_OBSERVATION_THRESHOLD || '4'
);
const DEFAULT_SANDBOX_ENERGY_LIMIT = Number(
  process.env.AGENT_FACTORY_SANDBOX_MAX_ENERGY || '250000'
);

interface SampleJobDefinition {
  id: string;
  description: string;
  category: string;
  reward: number;
  energyBudget: number;
  requiredSkills: string[];
}

interface SandboxScenarioResult {
  job: SampleJobDefinition;
  passed: boolean;
  reasons: string[];
  metrics: {
    skillCoverage: number;
    averageEnergy: number;
    energyBudget: number;
    averageReward: number;
  };
}

interface SandboxReport {
  blueprintId: string;
  blueprintCategory: string;
  runAt: string;
  passed: boolean;
  template?: {
    address: string;
    label?: string;
    successRate: number;
  } | null;
  results: SandboxScenarioResult[];
  reportPath?: string;
}

export interface CloneAgentOptions extends SpawnBlueprintOptions {
  threshold?: number;
  identityDir?: string;
  sandboxDir?: string;
  allowSandboxFailure?: boolean;
  dryRun?: boolean;
  notes?: string[];
}

export interface CloneAgentOutcome {
  blueprint: AgentBlueprint;
  template?: AgentProfile | null;
  sandbox: SandboxReport;
  identityPath?: string;
  walletAddress?: string;
  enabled: boolean;
}

function toKey(value: string): string {
  return value.trim().toLowerCase();
}

export async function getSpawnPipelineReport(): Promise<
  SpawnCandidateReport[]
> {
  const profiles = await listAgentProfiles();
  const categoryCounts = new Map<string, number>();
  const existingLabels = new Set<string>();

  for (const profile of profiles) {
    if (profile.label) {
      existingLabels.add(profile.label.toLowerCase());
    }
    for (const category of profile.categories) {
      const key = toKey(category);
      categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    }
  }

  const candidates = await listSpawnCandidates({
    existingCategoryCounts: categoryCounts,
    categoryCap: spawnDefaults.categoryCap,
    existingLabels,
  });

  return candidates.map((candidate) => {
    const existing = categoryCounts.get(candidate.categoryKey) ?? 0;
    const available = existing < spawnDefaults.categoryCap;
    return {
      ...candidate,
      existingAgents: existing,
      capacity: spawnDefaults.categoryCap,
      available,
    };
  });
}

export async function createSpawnBlueprint(
  options: SpawnBlueprintOptions = {}
): Promise<AgentBlueprint | null> {
  const profiles = await listAgentProfiles();
  const categoryCounts = new Map<string, number>();
  const existingLabels = new Set<string>();

  for (const profile of profiles) {
    if (profile.label) {
      existingLabels.add(profile.label.toLowerCase());
    }
    for (const category of profile.categories) {
      const key = toKey(category);
      categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    }
  }

  const minPriority = options.minPriority ?? spawnDefaults.minPriority;
  const includeSaturated = options.includeSaturated ?? false;

  const candidates = await listSpawnCandidates({
    existingCategoryCounts: categoryCounts,
    categoryCap: spawnDefaults.categoryCap,
    existingLabels,
  });

  let target: SpawnCandidate | undefined;
  if (options.category) {
    const key = toKey(options.category);
    target = candidates.find(
      (candidate) =>
        candidate.categoryKey === key && candidate.priority >= minPriority
    );
  }

  if (!target) {
    target = candidates.find(
      (candidate) =>
        candidate.priority >= minPriority &&
        (includeSaturated || !candidate.saturated)
    );
  }

  if (!target) {
    return null;
  }

  const blueprint = await createBlueprintForCandidate(target, {
    persist: options.dryRun ? false : options.persist,
    markConsumed: options.dryRun ? false : options.markConsumed,
    blueprintDir: options.blueprintDir,
  });

  await secureLogAction({
    component: 'agent-factory',
    action: 'spawn-blueprint',
    success: true,
    metadata: {
      category: target.category,
      priority: target.priority,
      ensLabel: blueprint.ensLabel,
      address: blueprint.wallet.address,
      dryRun: Boolean(options.dryRun),
      persisted: Boolean(blueprint.persistedTo),
    },
  }).catch((err) => {
    console.warn('Failed to record spawn blueprint audit log', err);
  });

  return blueprint;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function selectTemplateProfile(
  categoryKey: string
): Promise<AgentProfile | null> {
  const profiles = await listAgentProfiles();
  let best: AgentProfile | null = null;
  for (const profile of profiles) {
    for (const category of profile.categories) {
      if (toKey(category) !== categoryKey) continue;
      if (!best || profile.successRate > best.successRate) {
        best = profile;
      }
    }
  }
  return best;
}

function buildSampleJobs(
  blueprint: AgentBlueprint,
  template: AgentProfile | null
): SampleJobDefinition[] {
  const averageReward = Number.parseFloat(
    blueprint.metrics.averageReward || '0'
  );
  const rewardBaseline = Number.isFinite(averageReward)
    ? Math.max(averageReward, 1)
    : 1;
  const averageEnergy = Number.isFinite(blueprint.metrics.averageEnergy)
    ? Number(blueprint.metrics.averageEnergy)
    : 0;
  const skillSet = template?.skills ?? [];
  const category = blueprint.category;
  const energyBudget =
    averageEnergy > 0 ? averageEnergy * 1.5 : DEFAULT_SANDBOX_ENERGY_LIMIT;
  const stressBudget =
    averageEnergy > 0 ? averageEnergy * 2 : DEFAULT_SANDBOX_ENERGY_LIMIT * 1.25;
  return [
    {
      id: `${blueprint.categoryKey}-baseline`,
      description: `Baseline capability check for ${category}`,
      category,
      reward: rewardBaseline,
      energyBudget: Math.min(DEFAULT_SANDBOX_ENERGY_LIMIT, energyBudget),
      requiredSkills: skillSet.slice(0, 3),
    },
    {
      id: `${blueprint.categoryKey}-stress`,
      description: `Stress scenario for ${category}`,
      category,
      reward: rewardBaseline * 1.2 + 1,
      energyBudget: Math.min(DEFAULT_SANDBOX_ENERGY_LIMIT * 1.5, stressBudget),
      requiredSkills: skillSet.slice(0, 2),
    },
  ];
}

function evaluateSampleJob(
  job: SampleJobDefinition,
  blueprint: AgentBlueprint,
  template: AgentProfile | null
): SandboxScenarioResult {
  const reasons: string[] = [];
  const availableSkills = new Set<string>();
  if (template) {
    for (const skill of template.skills) {
      availableSkills.add(skill.toLowerCase());
    }
    for (const category of template.categories) {
      availableSkills.add(category.toLowerCase());
    }
  }

  let matchedSkills = 0;
  for (const skill of job.requiredSkills) {
    if (availableSkills.has(skill.toLowerCase())) {
      matchedSkills += 1;
    }
  }
  let skillCoverage = job.requiredSkills.length
    ? matchedSkills / job.requiredSkills.length
    : template
    ? 1
    : 0;

  if (job.requiredSkills.length > 0) {
    if (!template) {
      reasons.push('No template agent available for skill benchmarking');
    } else if (matchedSkills < job.requiredSkills.length) {
      reasons.push(
        `Template missing ${job.requiredSkills.length - matchedSkills} of ${
          job.requiredSkills.length
        } required skills`
      );
    }
  }

  if (template) {
    const templateCategories = new Set(
      template.categories.map((category) => category.toLowerCase())
    );
    if (!templateCategories.has(job.category.toLowerCase())) {
      reasons.push(`Template agent has no history in ${job.category}`);
    }
  } else {
    reasons.push('Template agent unavailable for category transfer');
  }

  const averageEnergy = Number.isFinite(blueprint.metrics.averageEnergy)
    ? Number(blueprint.metrics.averageEnergy)
    : 0;
  if (job.energyBudget > 0 && averageEnergy > job.energyBudget) {
    reasons.push(
      `Projected energy ${averageEnergy.toFixed(
        2
      )} exceeds sandbox budget ${job.energyBudget.toFixed(2)}`
    );
  }

  const averageReward =
    Number.parseFloat(blueprint.metrics.averageReward || '0') || 0;
  if (job.reward > 0 && averageReward < job.reward * 0.5) {
    reasons.push('Historical reward too low for sample economic constraints');
  }

  return {
    job,
    passed: reasons.length === 0,
    reasons,
    metrics: {
      skillCoverage: Number(skillCoverage.toFixed(3)),
      averageEnergy,
      energyBudget: job.energyBudget,
      averageReward,
    },
  };
}

function runSandboxTrials(
  blueprint: AgentBlueprint,
  template: AgentProfile | null
): SandboxReport {
  const jobs = buildSampleJobs(blueprint, template);
  const results = jobs.map((job) =>
    evaluateSampleJob(job, blueprint, template)
  );
  const runAt = new Date().toISOString();
  const passed = results.every((result) => result.passed);
  return {
    blueprintId: blueprint.id,
    blueprintCategory: blueprint.category,
    runAt,
    passed,
    template: template
      ? {
          address: template.address,
          label: template.label,
          successRate: template.successRate,
        }
      : null,
    results,
  };
}

function sandboxReportFilename(report: SandboxReport): string {
  const timestamp = report.runAt.replace(/[:]/g, '-');
  const categorySlug = report.blueprintCategory
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const idFragment = report.blueprintId.slice(0, 8);
  return `${timestamp}-${categorySlug || 'agent'}-${idFragment}.json`;
}

async function persistSandboxReport(
  report: SandboxReport,
  dir = SANDBOX_DIR
): Promise<string> {
  ensureDir(dir);
  const filePath = path.join(dir, sandboxReportFilename(report));
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(report, null, 2),
    'utf8'
  );
  return filePath;
}

function pruneUndefined(
  input: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    output[key] = value;
  }
  return output;
}

async function persistIdentityRecord(
  blueprint: AgentBlueprint,
  template: AgentProfile | null,
  sandbox: SandboxReport,
  sandboxPath: string,
  options: {
    identityDir?: string;
    notes?: string[];
    ensRegistration?: EnsRegistrationResult;
  }
): Promise<string> {
  const directory = options.identityDir ?? IDENTITY_DIR;
  ensureDir(directory);
  const filePath = path.join(directory, `${blueprint.ensLabel}.json`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Identity file already exists for ${blueprint.ensLabel}`);
  }
  const notes = [
    ...(Array.isArray(blueprint.metadata?.notes)
      ? blueprint.metadata.notes.filter((note) => typeof note === 'string')
      : []),
    ...(options.notes ?? []),
  ];
  const ensRegistration = options.ensRegistration;
  const ensMetadata = ensRegistration
    ? pruneUndefined({
        parent: ensRegistration.parentName,
        parentNode: ensRegistration.parentNode,
        node: ensRegistration.node,
        resolver: ensRegistration.resolver,
        registryTx: ensRegistration.registryTxHash,
        forwardTx: ensRegistration.forwardTxHash,
        reverseTx: ensRegistration.reverseTxHash,
        registrarOwner: ensRegistration.registrarOwner,
      })
    : undefined;
  const metadata = pruneUndefined({
    categories: [blueprint.category],
    skills: template?.skills,
    template: template
      ? {
          address: template.address,
          label: template.label,
          successRate: template.successRate,
        }
      : undefined,
    spawn: blueprint.spawn,
    metrics: blueprint.metrics,
    blueprint: {
      id: blueprint.id,
      persistedTo: blueprint.persistedTo,
      description: blueprint.metadata?.description,
      tags: blueprint.metadata?.tags,
    },
    sandbox: {
      passed: sandbox.passed,
      runAt: sandbox.runAt,
      report: path.relative(process.cwd(), sandboxPath),
    },
    ens: ensMetadata,
    notes: notes.length ? notes : undefined,
  });
  const record = {
    ens: blueprint.ensName,
    label: blueprint.ensLabel,
    address: blueprint.wallet.address,
    privateKey: blueprint.wallet.privateKey,
    role: ensRegistration?.role ?? 'agent',
    parent: ensRegistration?.parentName,
    resolver: ensRegistration?.resolver,
    chainId: ensRegistration?.chainId,
    network: ensRegistration?.network,
    createdAt: ensRegistration ? new Date().toISOString() : undefined,
    metadata,
  };
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(record, null, 2),
    'utf8'
  );
  return filePath;
}

async function cloneCandidate(
  candidate: SpawnCandidateReport,
  options: CloneAgentOptions = {}
): Promise<CloneAgentOutcome | null> {
  const threshold = options.threshold ?? DEFAULT_OBSERVATION_THRESHOLD;
  if (candidate.observed < threshold) {
    return null;
  }
  if (!candidate.available && !options.includeSaturated) {
    return null;
  }

  const blueprint = await createBlueprintForCandidate(candidate, {
    persist: options.dryRun ? false : options.persist ?? true,
    markConsumed: options.dryRun ? false : options.markConsumed ?? true,
    blueprintDir: options.blueprintDir,
  });

  let keystorePersisted = true;
  if (!options.dryRun) {
    try {
      await saveWalletKey(blueprint.wallet.privateKey, {
        address: blueprint.wallet.address,
        label: blueprint.ensLabel,
        metadata: {
          blueprintId: blueprint.id,
          category: blueprint.category,
          ensName: blueprint.ensName,
        },
      });
    } catch (err) {
      keystorePersisted = false;
      console.error('Failed to persist wallet key to keystore', err);
      await secureLogAction({
        component: 'agent-factory',
        action: 'keystore-persist',
        success: false,
        metadata: {
          blueprintId: blueprint.id,
          wallet: blueprint.wallet.address,
        },
        extra: {
          error: err instanceof Error ? err.message : String(err),
        },
      }).catch((auditErr) => {
        console.warn('Failed to record keystore persistence failure', auditErr);
      });
    }
  }

  const template = await selectTemplateProfile(candidate.categoryKey);
  const sandbox = runSandboxTrials(blueprint, template);
  const sandboxPath = await persistSandboxReport(
    sandbox,
    options.sandboxDir ?? SANDBOX_DIR
  );
  sandbox.reportPath = sandboxPath;

  await secureLogAction({
    component: 'agent-factory',
    action: 'sandbox-evaluation',
    success: sandbox.passed,
    metadata: {
      category: blueprint.category,
      blueprintId: blueprint.id,
      template: template?.address,
      passed: sandbox.passed,
      report: sandboxPath,
    },
  }).catch((err) => {
    console.warn('Failed to record sandbox evaluation audit log', err);
  });

  const baseOutcome: CloneAgentOutcome = {
    blueprint,
    template: template ?? null,
    sandbox,
    enabled: false,
  };
  baseOutcome.walletAddress = blueprint.wallet.address;

  if (!sandbox.passed && !options.allowSandboxFailure) {
    return baseOutcome;
  }

  if (!keystorePersisted) {
    return baseOutcome;
  }

  if (options.dryRun) {
    return baseOutcome;
  }

  let ensRegistration: EnsRegistrationResult | undefined;
  try {
    ensRegistration = await registerEnsSubdomain({
      label: blueprint.ensLabel,
      ensName: blueprint.ensName,
      targetAddress: blueprint.wallet.address,
      targetPrivateKey: blueprint.wallet.privateKey,
    });

    if (
      ensRegistration.label !== blueprint.ensLabel ||
      ensRegistration.ensName.toLowerCase() !== blueprint.ensName.toLowerCase()
    ) {
      blueprint.ensLabel = ensRegistration.label;
      blueprint.ensName = ensRegistration.ensName;
      if (blueprint.persistedTo) {
        try {
          await fs.promises.writeFile(
            blueprint.persistedTo,
            JSON.stringify(blueprint, null, 2),
            'utf8'
          );
        } catch (err) {
          console.warn(
            'Failed to update persisted blueprint after ENS normalisation',
            err
          );
        }
      }
    }

    await secureLogAction({
      component: 'agent-factory',
      action: 'ens-register',
      success: true,
      metadata: {
        blueprintId: blueprint.id,
        label: ensRegistration.label,
        ensName: ensRegistration.ensName,
        wallet: ensRegistration.walletAddress,
        parent: ensRegistration.parentName,
        parentNode: ensRegistration.parentNode,
        resolver: ensRegistration.resolver,
        registryTx: ensRegistration.registryTxHash,
        forwardTx: ensRegistration.forwardTxHash,
        reverseTx: ensRegistration.reverseTxHash,
      },
    }).catch((err) => {
      console.warn('Failed to record ENS registration audit log', err);
    });

    const verification = await verifyEnsRegistration({
      address: ensRegistration.walletAddress,
      ensName: ensRegistration.ensName,
      component: 'agent-factory',
      label: ensRegistration.label,
      metadata: {
        blueprintId: blueprint.id,
        parent: ensRegistration.parentName,
      },
    });
    if (!verification.matches) {
      console.warn(
        `ENS reverse lookup mismatch for ${ensRegistration.ensName}: resolved ${verification.resolved}`
      );
      return baseOutcome;
    }
  } catch (err) {
    await secureLogAction({
      component: 'agent-factory',
      action: 'ens-register',
      success: false,
      metadata: {
        blueprintId: blueprint.id,
        label: blueprint.ensLabel,
        ensName: blueprint.ensName,
        wallet: blueprint.wallet.address,
      },
      extra: {
        error: err instanceof Error ? err.message : String(err),
      },
    }).catch((auditErr) => {
      console.warn('Failed to record ENS registration failure', auditErr);
    });
    console.warn('Failed to register ENS subdomain for new agent', err);
    return baseOutcome;
  }

  let identityPath: string | undefined;
  try {
    identityPath = await persistIdentityRecord(
      blueprint,
      template,
      sandbox,
      sandboxPath,
      {
        identityDir: options.identityDir,
        notes: options.notes,
        ensRegistration,
      }
    );
    baseOutcome.identityPath = identityPath;
  } catch (err) {
    console.warn('Failed to persist identity file for new agent', err);
    return baseOutcome;
  }

  if (!options.dryRun) {
    let walletAddress: string | undefined;
    try {
      if (!walletManager) {
        throw new Error('Wallet manager is not initialised');
      }
      walletAddress = walletManager.register(blueprint.wallet.privateKey)
        .address;
      baseOutcome.walletAddress = walletAddress;
    } catch (err) {
      console.warn('Failed to register wallet for cloned agent', err);
      baseOutcome.walletAddress = blueprint.wallet.address;
    }
  }

  try {
    const identity = identityPath
      ? await registerIdentityFile(identityPath)
      : null;
    baseOutcome.enabled = Boolean(identity);
    if (!baseOutcome.walletAddress && identity?.address) {
      baseOutcome.walletAddress = identity.address;
    }
  } catch (err) {
    console.warn('Failed to register identity with agent registry', err);
  }

  await secureLogAction({
    component: 'agent-factory',
    action: 'clone-template-agent',
    success: baseOutcome.enabled,
    metadata: {
      category: blueprint.category,
      blueprintId: blueprint.id,
      wallet: baseOutcome.walletAddress,
      identityPath,
      sandboxReport: sandboxPath,
    },
  }).catch((err) => {
    console.warn('Failed to record clone audit log', err);
  });

  return baseOutcome;
}

export async function cloneTemplateAgent(
  category: string,
  options: CloneAgentOptions = {}
): Promise<CloneAgentOutcome | null> {
  const report = await getSpawnPipelineReport();
  const key = toKey(category);
  const candidate = report.find((entry) => entry.categoryKey === key);
  if (!candidate) {
    return null;
  }
  return cloneCandidate(candidate, { ...options, category });
}

export async function cloneEligibleAgents(
  options: CloneAgentOptions = {}
): Promise<CloneAgentOutcome[]> {
  const report = await getSpawnPipelineReport();
  const results: CloneAgentOutcome[] = [];
  for (const candidate of report) {
    const outcome = await cloneCandidate(candidate, options);
    if (outcome) {
      results.push(outcome);
    }
  }
  return results;
}

export type { SpawnCandidate, AgentBlueprint } from '../shared/spawnManager';
