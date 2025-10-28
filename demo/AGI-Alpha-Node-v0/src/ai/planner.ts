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
}

export class AlphaPlanner {
  private readonly config: NormalisedAlphaNodeConfig['ai']['planner'];
  private readonly curriculum;
  private readonly experiences: Experience[] = [];
  private difficultyCursor: number;

  constructor(config: NormalisedAlphaNodeConfig) {
    this.config = config.ai.planner;
    this.curriculum = config.ai.planner.curriculum;
    this.difficultyCursor = this.curriculum.initialDifficulty;
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

    const exploitationWeights = opportunities.map((job) => this.scoreOpportunity(job));
    const exploitationScore = Math.max(...exploitationWeights);
    const explorationScore = this.config.explorationWeight * Math.log(1 + this.experiences.length + 1);

    const alphaScore = exploitationScore + explorationScore;
    const selectedIndex = exploitationWeights.indexOf(exploitationScore);
    const selected = opportunities[selectedIndex];

    return {
      selectedJobId: selected?.jobId ?? null,
      alphaScore,
      expectedValue: exploitationScore,
      explorationScore,
      exploitationScore,
      curriculumDifficulty: this.difficultyCursor,
      consideredJobs: opportunities.length
    };
  }

  recordOutcome(jobId: string, success: boolean, reward: number, difficulty: number): void {
    const experience: Experience = {
      id: jobId,
      reward,
      difficulty,
      success
    };
    this.experiences.push(experience);
    if (this.experiences.length > 1024) {
      this.experiences.shift();
    }

    if (success) {
      this.difficultyCursor = Math.min(1, this.difficultyCursor + this.curriculum.escalationRate);
    } else {
      this.difficultyCursor = Math.max(this.curriculum.initialDifficulty, this.difficultyCursor * 0.75);
    }
  }

  private scoreOpportunity(job: JobOpportunity): number {
    const base = job.reward * (1 - job.risk);
    const curriculumModifier = 1 - Math.abs(job.difficulty - this.difficultyCursor);
    const specializationBonus = this.computeSpecialistSynergy(job.tags);
    return base * (0.6 + 0.3 * curriculumModifier + 0.1 * specializationBonus);
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
}
