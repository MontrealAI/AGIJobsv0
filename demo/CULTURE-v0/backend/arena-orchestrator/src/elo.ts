/**
 * Elo rating helper tailored for the CULTURE self-play arena.
 * Includes guards to prevent overflow and ensures deterministic rounding.
 */
export type MatchScore = 0 | 0.5 | 1;

export interface EloUpdateInput {
  ratingA: number;
  ratingB: number;
  scoreA: MatchScore;
  kFactor?: number;
}

const DEFAULT_K = 24;

export function eloUpdate({ ratingA, ratingB, scoreA, kFactor = DEFAULT_K }: EloUpdateInput): [number, number] {
  const k = Math.max(1, Math.min(64, kFactor));
  const qA = Math.pow(10, ratingA / 400);
  const qB = Math.pow(10, ratingB / 400);
  const denominator = qA + qB;
  if (!Number.isFinite(denominator) || denominator === 0) {
    throw new Error("Invalid denominator in Elo calculation");
  }
  const expectedA = qA / denominator;
  const expectedB = 1 - expectedA;
  const newA = ratingA + k * (scoreA - expectedA);
  const scoreB = 1 - scoreA as MatchScore;
  const newB = ratingB + k * (scoreB - expectedB);
  return [Math.round(newA), Math.round(newB)];
}

export function expectedScore(ratingA: number, ratingB: number): number {
  const qA = Math.pow(10, ratingA / 400);
  const qB = Math.pow(10, ratingB / 400);
  const denominator = qA + qB;
  if (!Number.isFinite(denominator) || denominator === 0) {
    throw new Error("Invalid denominator in expected score");
  }
  return qA / denominator;
}
