import { NormalisedAlphaNodeConfig } from '../config';

export interface SpecialistInsight {
  readonly specialistId: string;
  readonly confidence: number;
  readonly contribution: string;
  readonly recommendedAction: string;
}

export class SpecialistOrchestrator {
  private readonly specialists = new Map<string, NormalisedAlphaNodeConfig['ai']['specialists'][number]>();

  constructor(config: NormalisedAlphaNodeConfig) {
    for (const specialist of config.ai.specialists) {
      this.specialists.set(specialist.id, specialist);
    }
  }

  listSpecialists(): readonly NormalisedAlphaNodeConfig['ai']['specialists'][number][] {
    return Array.from(this.specialists.values());
  }

  dispatch(jobTags: readonly string[]): SpecialistInsight[] {
    return this.listSpecialists().map((specialist) => {
      const overlap = specialist.capabilities.filter((capability) => jobTags.includes(capability)).length;
      const confidence = Math.min(1, 0.35 + overlap * 0.2);
      const recommendedAction = overlap > 0 ? 'engage' : 'support';
      return {
        specialistId: specialist.id,
        confidence,
        contribution: `${specialist.description} ready – capability overlap ${overlap}.`,
        recommendedAction
      };
    });
  }
}
