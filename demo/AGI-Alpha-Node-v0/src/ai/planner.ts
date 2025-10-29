import crypto from 'node:crypto';
import { NormalisedAlphaNodeConfig } from '../config';

export interface JobOpportunity {
  readonly jobId: string;
  readonly reward: number; // expressed in $AGIALPHA units
  readonly difficulty: number; // 0 - 1 scale
  readonly risk: number; // 0 - 1 scale
  readonly tags: readonly string[];
}

export interface PlanningSummary {
  readonly selectedJobId: string | null;
  readonly alphaScore: number;
  readonly expectedValue: number;
  readonly explorationScore: number;
  readonly exploitationScore: number;
  readonly curriculumDifficulty: number;
  readonly consideredJobs: number;
}

interface Experience {
  readonly id: string;
  readonly reward: number;
  readonly difficulty: number;
  readonly success: boolean;
  readonly tags: readonly string[];
}

export class AlphaPlanner {
  private readonly config: NormalisedAlphaNodeConfig['ai']['planner'];
  private readonly curriculum;
  private readonly experiences: Experience[] = [];
  private difficultyCursor: number;
  private readonly selectionSalt: string;

  constructor(config: NormalisedAlphaNodeConfig) {
    this.config = config.ai.planner;
    this.curriculum = config.ai.planner.curriculum;
    this.difficultyCursor = this.curriculum.initialDifficulty;
    this.selectionSalt = crypto
      .createHash('sha256')
      .update(`${config.operator.address}:${config.operator.ensLabel}`)
      .digest('hex');
  }

  plan(opportunities: JobOpportunity[]): PlanningSummary {
    if (opportunities.length === 0) {
      return {
        selectedJobId: null,
        alphaScore: 0,
        expectedValue: 0,
        explorationScore: 0,
        exploitationScore: 0,
        curriculumDifficulty: this.difficultyCursor,
        consideredJobs: 0
      };
    }

    const stats = opportunities.map(() => ({ visits: 0, value: 0 }));
    const seededOrder = opportunities
      .map((job, index) => ({
        index,
        weight: this.pseudoRandom(`${job.jobId}:${this.selectionSalt}`),
      }))
      .sort((a, b) => a.weight - b.weight);

    for (const entry of seededOrder) {
      const value = this.simulateOpportunity(opportunities[entry.index]);
      stats[entry.index].visits += 1;
      stats[entry.index].value += value;
    }

    const simulationBudget = Math.max(
      opportunities.length * this.config.planningHorizon,
      opportunities.length * 6
    );

    for (let iteration = seededOrder.length; iteration < simulationBudget; iteration += 1) {
      const index = this.selectOpportunity(stats, opportunities, iteration);
      const value = this.simulateOpportunity(opportunities[index]);
      stats[index].visits += 1;
      stats[index].value += value;
    }

    let bestIndex = 0;
    let bestScore = -Infinity;
    let totalVisits = 0;
    for (let i = 0; i < stats.length; i += 1) {
      const { visits, value } = stats[i];
      totalVisits += visits;
      if (visits === 0) {
        continue;
      }
      const average = value / visits;
      if (average > bestScore) {
        bestScore = average;
        bestIndex = i;
      }
    }

    const exploitationScore = Number.isFinite(bestScore) ? bestScore : 0;
    const explorationScore = this.config.explorationWeight * Math.sqrt(Math.log(totalVisits + 1));
    const alphaScore = Math.max(0, exploitationScore + explorationScore);

    return {
      selectedJobId: opportunities[bestIndex]?.jobId ?? null,
      alphaScore,
      expectedValue: exploitationScore,
      explorationScore,
      exploitationScore,
      curriculumDifficulty: this.difficultyCursor,
      consideredJobs: opportunities.length
    };
  }

  recordOutcome(
    jobId: string,
    success: boolean,
    reward: number,
    difficulty: number,
    tags: readonly string[] = []
  ): void {
    const experience: Experience = {
      id: jobId,
      reward,
      difficulty: clamp(difficulty, 0, 1),
      success,
      tags: [...tags]
    };
    this.experiences.push(experience);
    if (this.experiences.length > 2048) {
      this.experiences.shift();
    }

    const delta = this.curriculum.escalationRate;
    if (success) {
      const blendedTarget =
        this.difficultyCursor * 0.7 + experience.difficulty * 0.3 + delta;
      this.difficultyCursor = clamp(blendedTarget, 0, 1);
    } else {
      const softened =
        this.difficultyCursor * 0.6 + this.curriculum.initialDifficulty * 0.4 - delta;
      this.difficultyCursor = clamp(softened, 0, 1);
    }
  }

  private selectOpportunity(
    stats: readonly { visits: number; value: number }[],
    opportunities: readonly JobOpportunity[],
    iteration: number
  ): number {
    let bestIndex = 0;
    let bestScore = -Infinity;
    const totalVisits = iteration + 1;
    for (let i = 0; i < stats.length; i += 1) {
      const stat = stats[i];
      const job = opportunities[i];
      if (stat.visits === 0) {
        const priority =
          job.reward * (1 - job.risk) * 0.5 +
          0.5 * this.pseudoRandom(`${job.jobId}:${iteration}:${this.selectionSalt}`);
        if (priority > bestScore) {
          bestScore = priority;
          bestIndex = i;
        }
        continue;
      }
      const mean = stat.value / stat.visits;
      const explorationTerm = Math.sqrt(Math.log(totalVisits + 1) / stat.visits);
      const curriculumBonus = 1 - Math.abs(job.difficulty - this.difficultyCursor);
      const score =
        mean +
        this.config.explorationWeight * explorationTerm +
        0.05 * curriculumBonus +
        0.02 * this.computeSpecialistSynergy(job.tags);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private simulateOpportunity(job: JobOpportunity): number {
    const successProbability = this.estimateSuccessProbability(job);
    const synergy = this.computeSpecialistSynergy(job.tags);
    const curriculumAlignment = 1 - Math.abs(job.difficulty - this.difficultyCursor);
    const baseReward = job.reward * (0.6 + 0.25 * curriculumAlignment + 0.15 * synergy);
    const riskPenalty = job.reward * Math.pow(job.risk, 1.3) * 0.5;
    const stochastic = 0.8 + 0.4 * this.pseudoRandom(`${job.jobId}:stochastic:${this.experiences.length}`);
    const expected = baseReward * successProbability * stochastic - riskPenalty;
    return expected;
  }

  private estimateSuccessProbability(job: JobOpportunity): number {
    const relevant = this.experiences.filter((experience) =>
      this.isExperienceRelevant(experience, job)
    );
    if (relevant.length === 0) {
      const baseline =
        0.35 +
        0.4 * (1 - job.risk) +
        0.15 * (1 - Math.abs(job.difficulty - this.difficultyCursor)) +
        0.1 * this.computeSpecialistSynergy(job.tags);
      return clamp(baseline, 0.1, 0.92);
    }
    const wins = relevant.filter((experience) => experience.success).length;
    const performance = wins / relevant.length;
    const averageDifficulty =
      relevant.reduce((acc, experience) => acc + experience.difficulty, 0) /
      relevant.length;
    const curriculumBoost = 1 - Math.abs(averageDifficulty - job.difficulty);
    const probability =
      0.12 +
      0.68 * performance +
      0.15 * curriculumBoost +
      0.1 * this.computeSpecialistSynergy(job.tags);
    return clamp(probability, 0.15, 0.98);
  }

  private isExperienceRelevant(experience: Experience, job: JobOpportunity): boolean {
    const tagOverlap = experience.tags.some((tag) => job.tags.includes(tag));
    const difficultyDelta = Math.abs(experience.difficulty - job.difficulty);
    return tagOverlap || difficultyDelta <= 0.2;
  }

  private computeSpecialistSynergy(tags: readonly string[]): number {
    if (tags.length === 0) {
      return 0.5;
    }
    const hash = crypto.createHash('sha256');
    hash.update([...tags].sort().join(':'));
    const digest = hash.digest();
    return (digest[0] % 100) / 100;
  }

  private pseudoRandom(seed: string): number {
    const hash = crypto.createHash('sha256');
    hash.update(seed);
    const digest = hash.digest();
    const value = digest.readUInt32BE(0);
    return value / 0xffffffff;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
