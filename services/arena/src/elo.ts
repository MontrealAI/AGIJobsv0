export interface EloConfig {
  kFactor?: number;
}

export interface EloParticipant {
  rating: number;
  kFactor?: number;
}

export function expectedScore(player: EloParticipant, opponent: EloParticipant): number {
  return 1 / (1 + 10 ** ((opponent.rating - player.rating) / 400));
}

export function updateRating(
  player: EloParticipant,
  opponent: EloParticipant,
  score: number,
  config: EloConfig = {}
): number {
  const k = player.kFactor ?? config.kFactor ?? 32;
  const expectation = expectedScore(player, opponent);
  return Number((player.rating + k * (score - expectation)).toFixed(2));
}
