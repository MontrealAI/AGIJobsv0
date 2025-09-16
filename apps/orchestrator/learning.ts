import { ethers } from 'ethers';
import agialphaConfig from '../../config/agialpha.json';
import {
  appendTrainingRecord,
  type TrainingRecord,
  type RewardRecord,
} from '../../shared/trainingRecords';
import { recordSpawnRequest } from '../../shared/spawnManager';
import { auditLog } from './audit';
import { getJobEnergyLog, type JobEnergyLog } from './metrics';
import type { AgentIdentity } from './identity';
import type {
  ChainJobSummary,
  ClassificationResult,
  JobSpec,
} from './jobClassifier';
import type { JobRunResult } from './execution';

interface LearningCoordinatorOptions {
  tokenDecimals?: number;
  enableTrainingRecords?: boolean;
  enableSpawnRequests?: boolean;
}

interface JobSkipContext {
  jobId: string;
  classification: ClassificationResult;
  spec: JobSpec | null;
  reason?: string;
}

interface JobOutcomeContext {
  jobId: string;
  identity: AgentIdentity;
  classification: ClassificationResult;
  spec: JobSpec | null;
  summary: ChainJobSummary;
  chainJob: Record<string, unknown> | null;
  runResult?: JobRunResult;
  resultRef?: string;
  success: boolean;
  errorMessage?: string;
}

type TokenSnapshot = RewardRecord['posted'];

const CONFIG_DECIMALS =
  typeof agialphaConfig.decimals === 'number' ? agialphaConfig.decimals : 18;

function parseEnvFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (!normalised.length) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalised)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalised)) return false;
  return fallback;
}

function parseTokenDecimals(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override)) {
    return override;
  }
  const fromEnv = process.env.TOKEN_DECIMALS;
  if (fromEnv !== undefined) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return CONFIG_DECIMALS;
}

function toBigIntOrNull(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    if (typeof value === 'bigint') return value;
    return ethers.getBigInt(value as any);
  } catch {
    return null;
  }
}

function formatTokenValue(value: unknown, decimals: number): TokenSnapshot {
  const parsed = toBigIntOrNull(value);
  if (parsed === null) {
    return { raw: '0', formatted: '0' };
  }
  try {
    return {
      raw: parsed.toString(),
      formatted: ethers.formatUnits(parsed, decimals),
    };
  } catch {
    return { raw: parsed.toString(), formatted: parsed.toString() };
  }
}

function parseAgentType(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  const parsed = toBigIntOrNull(value);
  if (parsed === null) return undefined;
  const asNumber = Number(parsed);
  return Number.isFinite(asNumber) ? asNumber : undefined;
}

function deadlineToIso(value: unknown): string | undefined {
  const parsed = toBigIntOrNull(value);
  if (parsed === null) return undefined;
  try {
    const asNumber = Number(parsed);
    if (!Number.isFinite(asNumber)) {
      return parsed.toString();
    }
    if (asNumber <= 0) return undefined;
    const date = new Date(asNumber * 1000);
    return Number.isNaN(date.getTime())
      ? parsed.toString()
      : date.toISOString();
  } catch {
    return parsed.toString();
  }
}

function cloneEnergySummary(
  log: JobEnergyLog | null
): Record<string, unknown> | undefined {
  if (!log?.summary) return undefined;
  const summary = log.summary;
  return {
    totalCpuTimeMs: summary.totalCpuTimeMs,
    totalGpuTimeMs: summary.totalGpuTimeMs,
    totalWallTimeMs: summary.totalWallTimeMs,
    energyScore: summary.energyScore,
    efficiencyScore: summary.efficiencyScore,
    averageEfficiency: summary.averageEfficiency,
    complexity: summary.complexity,
    successRate: summary.successRate,
    runs: summary.runs,
    lastUpdated: summary.lastUpdated,
  };
}

function cleanMetadata(
  input: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    output[key] = value;
  }
  return output;
}

export class LearningCoordinator {
  private readonly decimals: number;
  private readonly enableTrainingRecords: boolean;
  private readonly enableSpawnRequests: boolean;

  constructor(options?: Partial<LearningCoordinatorOptions>) {
    this.decimals = parseTokenDecimals(options?.tokenDecimals);
    this.enableTrainingRecords = parseEnvFlag(
      process.env.ORCHESTRATOR_ENABLE_TRAINING_LOGS,
      options?.enableTrainingRecords ?? true
    );
    this.enableSpawnRequests = parseEnvFlag(
      process.env.ORCHESTRATOR_ENABLE_SPAWN_REQUESTS,
      options?.enableSpawnRequests ?? true
    );
  }

  async recordJobSkipped(context: JobSkipContext): Promise<void> {
    if (!this.enableSpawnRequests) return;
    const category =
      context.classification.category || context.spec?.category || undefined;
    if (!category) return;
    const reason = context.reason?.toLowerCase() ?? '';
    if (reason.includes('profit')) return;
    try {
      await recordSpawnRequest(category, context.jobId);
      auditLog('learning.spawn_request_recorded', {
        jobId: context.jobId,
        details: { category, reason: context.reason },
      });
    } catch (err) {
      console.warn(
        'Failed to record spawn request for job',
        context.jobId,
        err
      );
    }
  }

  async recordJobOutcome(context: JobOutcomeContext): Promise<void> {
    try {
      const { jobId, identity, classification, spec, summary, chainJob } =
        context;
      const employer =
        (chainJob?.employer as string | undefined) ||
        summary.employer ||
        undefined;
      const reward = formatTokenValue(
        (chainJob && chainJob.reward) ?? summary.reward,
        this.decimals
      );
      const stake = formatTokenValue(
        (chainJob && chainJob.stake) ?? summary.stake,
        this.decimals
      );
      const agentType =
        parseAgentType(chainJob?.agentTypes) ?? spec?.agentType ?? undefined;
      const category = classification.category || spec?.category || undefined;
      const energyLog = getJobEnergyLog(identity.address, jobId);
      const energySummary = cloneEnergySummary(energyLog);

      const metadata = cleanMetadata({
        source: 'meta-orchestrator',
        orchestratorAgent: identity.id,
        ens: identity.ens,
        label: identity.label,
        capabilities: identity.capabilities,
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          tags: classification.tags,
          rationale: classification.rationale,
        },
        spec: spec
          ? {
              category: spec.category,
              agentType: spec.agentType,
              requiredSkills: spec.requiredSkills,
              thermodynamics: spec.thermodynamics,
            }
          : undefined,
        specMetadata: spec?.metadata,
        reward: reward.formatted,
        stake: stake.formatted,
        stakeRaw: stake.raw,
        resultRef: context.resultRef,
        manifestCid: context.runResult?.manifestCid,
        finalCid: context.runResult?.finalCid,
        pipeline: context.runResult?.manifest.pipeline,
        stageCount: context.runResult?.manifest.pipeline.length,
        worldModelTags: context.runResult?.snapshot.tags,
        worldModelKeywords: context.runResult?.snapshot.keywords.slice(0, 24),
        energySummary,
        energyStageCount: energyLog?.stages.length,
        errorMessage: context.errorMessage,
        jobUri: summary.uri,
        jobTags: summary.tags,
        employer,
        chainResultHash: (chainJob && chainJob.resultHash) || undefined,
        chainSpecHash: (chainJob && chainJob.specHash) || undefined,
        chainUriHash: (chainJob && chainJob.uriHash) || undefined,
        deadline: deadlineToIso(chainJob?.deadline),
        thermodynamics: spec?.thermodynamics,
      });

      const record: TrainingRecord = {
        kind: 'job',
        jobId,
        recordedAt: new Date().toISOString(),
        agent: identity.address,
        success: context.success,
        reward: { posted: reward, decimals: this.decimals },
        metadata,
      };

      if (category) {
        record.category = category;
      }
      if (employer) {
        record.employer = employer;
      }
      if (typeof agentType === 'number') {
        record.agentType = agentType;
      }

      if (this.enableTrainingRecords) {
        await appendTrainingRecord(record);
      }

      auditLog('learning.record_outcome', {
        jobId,
        actor: identity.address,
        details: {
          success: context.success,
          category,
          resultRef: context.resultRef,
          manifestCid: context.runResult?.manifestCid,
          energy: energySummary,
        },
      });
    } catch (err) {
      console.warn('Failed to record job outcome for learning system', err);
    }
  }
}
