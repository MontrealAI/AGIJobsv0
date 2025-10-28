import { randomInt } from 'node:crypto';

import { createLogger } from '../utils/telemetry.js';

const logger = createLogger('planning-engine');

export interface PlanningContext {
  jobMetadata: string;
  rewardEstimate: number;
  expectedDurationMinutes: number;
  riskScore: number;
}

export interface PlanCandidate {
  id: string;
  expectedValue: number;
  actions: string[];
  riskMitigation: string[];
}

export class PlanningEngine {
  constructor(private readonly explorationConstant = 1.2) {}

  generateCandidates(context: PlanningContext): PlanCandidate[] {
    logger.debug({ context }, 'Generating plan candidates');
    const base = context.rewardEstimate - context.expectedDurationMinutes * 0.1;
    return [0, 1, 2, 3].map((index) => ({
      id: `plan-${Date.now()}-${index}`,
      expectedValue: base + randomInt(5) * this.explorationConstant - context.riskScore,
      actions: [
        'ingest-job-metadata',
        `spawn-agent-${index}`,
        'simulate-outcomes',
        'commit-plan',
        'execute-and-verify'
      ],
      riskMitigation: ['validator-precommit', 'redundant-agent-review', 'stake-hedging']
    }));
  }

  selectBestPlan(candidates: PlanCandidate[]): PlanCandidate {
    if (candidates.length === 0) {
      throw new Error('No candidates generated');
    }
    const best = candidates.reduce((acc, candidate) =>
      candidate.expectedValue > acc.expectedValue ? candidate : acc,
    candidates[0]);
    logger.info({ bestPlan: best.id, expectedValue: best.expectedValue }, 'Selected best plan');
    return best;
  }
}
