export interface EloResult {
  readonly ratingA: number;
  readonly ratingB: number;
}

export function eloUpdate(ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1, k = 24): EloResult {
  const qA = Math.pow(10, ratingA / 400);
  const qB = Math.pow(10, ratingB / 400);
  const expectedA = qA / (qA + qB);
  const newRA = ratingA + k * (scoreA - expectedA);
  const newRB = ratingB + k * ((1 - scoreA) - (1 - expectedA));
  return {
    ratingA: Math.round(newRA),
    ratingB: Math.round(newRB)
  };
}
