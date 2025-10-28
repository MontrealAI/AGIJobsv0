import { JobOpportunity } from '../ai/planner';

export function defaultOpportunities(): JobOpportunity[] {
  return [
    {
      jobId: 'sovereign-governance-upgrade',
      reward: 20000,
      difficulty: 0.65,
      risk: 0.2,
      tags: ['capital-markets', 'staking-optimization', 'governance']
    },
    {
      jobId: 'precision-biotech-sprint',
      reward: 24000,
      difficulty: 0.75,
      risk: 0.35,
      tags: ['biotech', 'drug-discovery']
    },
    {
      jobId: 'manufacturing-orbital',
      reward: 18000,
      difficulty: 0.55,
      risk: 0.18,
      tags: ['manufacturing', 'energy-optimization', 'predictive-maintenance']
    }
  ];
}
