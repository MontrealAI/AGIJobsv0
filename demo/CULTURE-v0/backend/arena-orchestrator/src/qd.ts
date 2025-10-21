export interface DiversityMetrics {
  readonly uniqueSolvers: number;
  readonly totalParticipants: number;
  readonly explorationScore: number;
}

export function computeDiversityMetrics(winners: string[], participants: string[]): DiversityMetrics {
  const unique = new Set(winners.map((w) => w.toLowerCase()))
    .size;
  const total = participants.length;
  const explorationScore = total === 0 ? 0 : Math.round((unique / total) * 100) / 100;
  return {
    uniqueSolvers: unique,
    totalParticipants: total,
    explorationScore
  };
}
