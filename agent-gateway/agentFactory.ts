import { listAgentProfiles } from './agentRegistry';
import { secureLogAction } from './security';
import {
  listSpawnCandidates,
  createBlueprintForCandidate,
  type SpawnCandidate,
  type AgentBlueprint,
  spawnDefaults,
} from '../shared/spawnManager';

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

export type { SpawnCandidate, AgentBlueprint } from '../shared/spawnManager';
