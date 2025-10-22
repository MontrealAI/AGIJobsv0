import type { QDScore } from './types.js';

export interface QDParameters {
  noveltyWeight?: number;
  qualityWeight?: number;
}

export function calculateQDScore(metrics: { novelty: number; quality: number }, params: QDParameters = {}): QDScore {
  const noveltyWeight = params.noveltyWeight ?? 0.4;
  const qualityWeight = params.qualityWeight ?? 0.6;
  const fitness = Number((metrics.quality * qualityWeight).toFixed(4));
  const diversity = Number((metrics.novelty * noveltyWeight).toFixed(4));
  return { fitness, diversity };
}

export function aggregateQD(scores: QDScore[]): QDScore {
  if (scores.length === 0) {
    return { fitness: 0, diversity: 0 };
  }
  const fitness = scores.reduce((acc, score) => acc + score.fitness, 0) / scores.length;
  const diversity = scores.reduce((acc, score) => acc + score.diversity, 0) / scores.length;
  return {
    fitness: Number(fitness.toFixed(4)),
    diversity: Number(diversity.toFixed(4))
  };
}
