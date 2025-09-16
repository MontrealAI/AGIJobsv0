import { ethers, Wallet } from 'ethers';
import { Job, JobCreatedEvent } from './types';
import { walletManager, registry, TOKEN_DECIMALS } from './utils';
import { ensureIdentity, getEnsIdentity } from './identity';
import {
  analyseJob,
  listAgentProfiles,
  evaluateAgentMatches,
  AgentProfile,
  type MatchResult,
} from './agentRegistry';
import { ensureStake, ROLE_AGENT } from './stakeCoordinator';
import { executeJob } from './taskExecution';
import { getAgentEfficiencyStats } from './telemetry';
import {
  recordAgentFailure,
  recordAgentSuccess,
  quarantineManager,
  secureLogAction,
} from './security';

const walletByLabel = new Map<string, Wallet>();
const walletByAddress = new Map<string, Wallet>();
const mismatchWarningKeys = new Set<string>();
const unverifiedWarningKeys = new Set<string>();

function cacheWallet(wallet: Wallet, ...labels: (string | undefined)[]): void {
  walletByAddress.set(wallet.address.toLowerCase(), wallet);
  for (const label of labels) {
    if (!label) continue;
    walletByLabel.set(label.toLowerCase(), wallet);
  }
}

export function getWalletByLabel(label: string): Wallet | undefined {
  if (!label) return undefined;
  return walletByLabel.get(label.toLowerCase());
}

async function resolveWalletForProfile(
  profile: AgentProfile
): Promise<Wallet | undefined> {
  const addressKey = profile.address.toLowerCase();
  if (walletByAddress.has(addressKey)) {
    return walletByAddress.get(addressKey)!;
  }
  const labelKey = profile.label?.toLowerCase();
  if (labelKey && walletByLabel.has(labelKey)) {
    const cached = walletByLabel.get(labelKey)!;
    walletByAddress.set(addressKey, cached);
    return cached;
  }

  const sources = [profile.label, profile.ensName, profile.address];
  for (const source of sources) {
    if (!source) continue;
    const identity = await getEnsIdentity(source);
    if (!identity) continue;
    if (identity.address.toLowerCase() !== addressKey) {
      const key = `${
        identity.label
      }:${identity.address.toLowerCase()}:${addressKey}`;
      if (!mismatchWarningKeys.has(key)) {
        console.warn(
          'ENS identity address mismatch for label',
          identity.label,
          'expected',
          profile.address,
          'got',
          identity.address
        );
        mismatchWarningKeys.add(key);
      }
      continue;
    }
    if (!identity.wallet) {
      continue;
    }
    if (!identity.verified) {
      const key = identity.ensName.toLowerCase();
      if (!unverifiedWarningKeys.has(key)) {
        console.warn(
          'ENS identity is not verified on-chain; skipping wallet for',
          identity.ensName
        );
        unverifiedWarningKeys.add(key);
      }
      continue;
    }
    cacheWallet(identity.wallet, profile.label, identity.label);
    return identity.wallet;
  }

  const wallet = walletManager.get(profile.address);
  if (wallet) {
    cacheWallet(wallet, profile.label);
  }
  return wallet;
}

function normaliseSkillSet(values: string[] | undefined): Set<string> {
  const result = new Set<string>();
  if (!values) return result;
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().toLowerCase();
    if (trimmed) {
      result.add(trimmed);
    }
  }
  return result;
}

function normaliseJobSkills(skills: string[] | undefined): Set<string> {
  if (!skills) {
    return new Set<string>();
  }
  const required = new Set<string>();
  for (const skill of skills) {
    if (typeof skill !== 'string') continue;
    const trimmed = skill.trim().toLowerCase();
    if (trimmed) {
      required.add(trimmed);
    }
  }
  return required;
}

function buildSelectionPool(
  analysisSkills: string[] | undefined,
  profiles: AgentProfile[]
): AgentProfile[] {
  const requiredSkills = normaliseJobSkills(analysisSkills);
  if (requiredSkills.size === 0) {
    return profiles;
  }
  const filtered = profiles.filter((profile) => {
    const skillSet = normaliseSkillSet(profile.skills);
    if (skillSet.size === 0) {
      return false;
    }
    for (const skill of requiredSkills) {
      if (!skillSet.has(skill)) {
        return false;
      }
    }
    return true;
  });
  return filtered;
}

export async function selectAgentForJob(job: Job): Promise<MatchResult | null> {
  const analysis = await analyseJob(job);
  const profiles = await listAgentProfiles();
  if (profiles.length === 0) {
    console.warn('No agent profiles are available; skipping job', job.jobId);
    return null;
  }
  const skillMatched = buildSelectionPool(analysis.skills, profiles);
  if (
    analysis.skills &&
    analysis.skills.length > 0 &&
    skillMatched.length === 0
  ) {
    console.warn(
      'Job requires skills outside the available agent expertise',
      job.jobId,
      analysis.skills
    );
    return null;
  }
  const candidatePool = skillMatched.length > 0 ? skillMatched : profiles;
  const availableStake = candidatePool.reduce<bigint>((max, profile) => {
    const stake = profile.stakeBalance ?? 0n;
    return stake > max ? stake : max;
  }, 0n);
  if (analysis.stake > availableStake) {
    console.warn(
      'Skipping job because stake requirement exceeds available collateral',
      job.jobId,
      analysis.stake.toString(),
      availableStake.toString()
    );
    return null;
  }
  const matches = await evaluateAgentMatches(analysis, candidatePool);
  if (matches.length === 0) {
    console.warn('No viable agent match found for job', job.jobId);
    return null;
  }
  const efficiencyStats = await getAgentEfficiencyStats();
  if (efficiencyStats.size > 0) {
    const decorated = matches.map((match) => {
      const stats = efficiencyStats.get(match.profile.address.toLowerCase());
      const averageEnergy =
        stats && Number.isFinite(stats.averageEnergy)
          ? Math.max(0, stats.averageEnergy)
          : null;
      const averageEfficiency =
        stats && Number.isFinite(stats.averageEfficiency)
          ? Math.max(0, stats.averageEfficiency)
          : null;
      const successRate =
        stats && Number.isFinite(stats.successRate) ? stats.successRate : null;

      const energyPenalty =
        averageEnergy !== null ? Math.log1p(averageEnergy / 1000) * 0.2 : 0;
      const efficiencyBoost =
        averageEfficiency !== null ? Math.min(1, averageEfficiency) * 0.3 : 0;
      const reliabilityBoost =
        successRate !== null ? Math.max(0, successRate) * 0.05 : 0;

      const finalScore =
        match.score + efficiencyBoost + reliabilityBoost - energyPenalty;

      return {
        match,
        stats,
        finalScore,
        averageEnergy:
          averageEnergy !== null ? averageEnergy : Number.POSITIVE_INFINITY,
      };
    });

    decorated.sort((a, b) => {
      if (b.finalScore !== a.finalScore) {
        return b.finalScore - a.finalScore;
      }
      if (a.averageEnergy !== b.averageEnergy) {
        return a.averageEnergy - b.averageEnergy;
      }
      return b.match.score - a.match.score;
    });

    const selectedEntry = decorated[0];
    if (selectedEntry) {
      if (selectedEntry.stats) {
        const { averageEnergy, averageEfficiency, dominantComplexity } =
          selectedEntry.stats;
        selectedEntry.match.reasons.push(
          `energy-metrics:${averageEnergy.toFixed(
            2
          )}:${averageEfficiency.toFixed(3)}:${dominantComplexity}`
        );
      }
      return selectedEntry.match;
    }
  }
  return matches[0];
}

export async function handleJob(job: Job): Promise<void> {
  if (job.agent !== ethers.ZeroAddress) return; // already assigned
  const decision = await selectAgentForJob(job);
  if (!decision) {
    console.warn('No suitable agent found for job', job.jobId);
    return;
  }
  const { profile, analysis } = decision;
  const wallet = await resolveWalletForProfile(profile);
  if (!wallet) {
    console.warn('Wallet not found for selected agent', profile.address);
    return;
  }
  if (quarantineManager.isQuarantined(wallet.address)) {
    console.warn(
      'Agent is quarantined; skipping job',
      job.jobId,
      wallet.address
    );
    return;
  }
  let identity;
  try {
    identity = await ensureIdentity(
      wallet,
      profile.role === 'validator' ? 'validator' : 'agent'
    );
  } catch (err: any) {
    console.error('Identity verification failed', err);
    recordAgentFailure(wallet.address, 'identity-verification');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'identity-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { error: err?.message },
        success: false,
      },
      wallet
    );
    return;
  }

  const requiredStake = analysis.stake;
  try {
    await ensureStake(wallet, requiredStake, ROLE_AGENT);
  } catch (err: any) {
    console.error('Failed to ensure stake', err);
    recordAgentFailure(wallet.address, 'stake-insufficient');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'stake-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: {
          error: err?.message,
          requiredStake: requiredStake.toString(),
        },
        success: false,
      },
      wallet
    );
    return;
  }

  try {
    const tx = await (registry as any)
      .connect(wallet)
      .applyForJob(job.jobId, identity.label ?? '', '0x');
    await tx.wait();
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'apply',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { txHash: tx.hash },
        success: true,
      },
      wallet
    );
  } catch (err: any) {
    console.error('Failed to apply for job', err);
    recordAgentFailure(wallet.address, 'apply-failed');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'apply-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { error: err?.message },
        success: false,
      },
      wallet
    );
    return;
  }

  try {
    const chainJob = await registry.jobs(job.jobId);
    const assigned = (chainJob.agent as string | undefined)?.toLowerCase();
    if (assigned !== wallet.address.toLowerCase()) {
      console.warn('Job not assigned to this agent after apply', job.jobId);
      return;
    }
  } catch (err) {
    console.warn('Unable to confirm job assignment', err);
  }

  try {
    await executeJob({ job, wallet, profile, identity, analysis });
    recordAgentSuccess(wallet.address);
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'execute',
        agent: wallet.address,
        jobId: job.jobId,
        success: true,
      },
      wallet
    );
  } catch (err: any) {
    console.error('Task execution failed', err);
    recordAgentFailure(wallet.address, 'execution-error');
    await secureLogAction(
      {
        component: 'orchestrator',
        action: 'execute-failed',
        agent: wallet.address,
        jobId: job.jobId,
        metadata: { error: err?.message },
        success: false,
      },
      wallet
    );
  }
}

export async function handleJobCreatedEvent(
  event: JobCreatedEvent
): Promise<void> {
  if (event.agent !== ethers.ZeroAddress) {
    return;
  }
  const job: Job = {
    jobId: event.jobId.toString(),
    employer: event.employer,
    agent: event.agent,
    rewardRaw: event.reward.toString(),
    reward: ethers.formatUnits(event.reward, TOKEN_DECIMALS),
    stakeRaw: event.stake.toString(),
    stake: ethers.formatUnits(event.stake, TOKEN_DECIMALS),
    feeRaw: event.fee.toString(),
    fee: ethers.formatUnits(event.fee, TOKEN_DECIMALS),
    specHash: event.specHash,
    uri: event.uri,
  };
  await handleJob(job);
}
