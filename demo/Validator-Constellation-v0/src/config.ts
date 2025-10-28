import { AgentConfig, Domain, SentinelRule, ValidatorConfig } from './types';

export const validatorConfig: ValidatorConfig = {
  ensRootDomains: ['club.agi.eth', 'alpha.club.agi.eth'],
  minStake: 100n * 10n ** 18n,
  slashPenaltyBps: 2500,
  revealWindowSeconds: 30,
  committeeSize: 5,
  quorum: 3,
};

export const agentConfig: AgentConfig = {
  ensRootDomains: ['agent.agi.eth', 'alpha.agent.agi.eth'],
};

export const nodeEnsRoots = ['node.agi.eth', 'alpha.node.agi.eth'];

export const domainBudgets: Record<Domain, bigint> = {
  'research.alpha': 120n * 10n ** 18n,
  'operations.main': 60n * 10n ** 18n,
  'marketplace.main': 80n * 10n ** 18n,
};

export const sentinelRules: SentinelRule[] = [
  {
    id: 'budget-overrun',
    description: 'Detect spending over the domain budget envelope.',
    evaluate: (job, agent) => {
      if (job.rewardWei > domainBudgets[agent.domain]) {
        return {
          id: `budget-${job.jobId}`,
          domain: agent.domain,
          severity: 'critical',
          message: `Agent ${agent.ens} attempted to settle ${job.rewardWei.toString()} wei which exceeds budget`,
          triggeredBy: agent.ens,
          timestamp: Date.now(),
        };
      }
      return null;
    },
  },
  {
    id: 'unsafe-call',
    description: 'Detect patterns that indicate unsafe function usage.',
    evaluate: (job, agent) => {
      if (job.proofHash.includes('deadbeef')) {
        return {
          id: `unsafe-${job.jobId}`,
          domain: agent.domain,
          severity: 'critical',
          message: `Sentinel blocked unsafe opcode signature in job ${job.jobId}.`,
          triggeredBy: agent.ens,
          timestamp: Date.now(),
        };
      }
      return null;
    },
  },
];

export const revealGraceBlocks = 2;
