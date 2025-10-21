import { PersistenceAdapter } from './persistence.js';

export interface EloResult {
  readonly ratingA: number;
  readonly ratingB: number;
}

export interface EloPlayer {
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface EloConfig {
  readonly kFactor: number;
  readonly defaultRating: number;
  readonly floor?: number;
  readonly ceiling?: number;
}

export interface MatchResult {
  readonly winner: string | null;
  readonly loser: string | null;
  readonly participants: readonly string[];
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

export class EloEngine {
  private players = new Map<string, EloPlayer>();

  constructor(
    private readonly config: EloConfig,
    private readonly persistence: PersistenceAdapter<Record<string, EloPlayer>>
  ) {}

  async load(): Promise<void> {
    const stored = await this.persistence.load();
    this.players = new Map(Object.entries(stored));
  }

  async save(): Promise<void> {
    const serializable: Record<string, EloPlayer> = {};
    for (const [address, player] of this.players.entries()) {
      serializable[address] = player;
    }
    await this.persistence.save(serializable);
  }

  ensurePlayer(address: string): EloPlayer {
    let player = this.players.get(address);
    if (!player) {
      player = {
        rating: this.config.defaultRating,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0
      };
      this.players.set(address, player);
    }
    return player;
  }

  getRating(address: string): EloPlayer {
    return this.ensurePlayer(address);
  }

  recordMatch(playerA: string, playerB: string, scoreA: 0 | 0.5 | 1): void {
    const participantA = this.ensurePlayer(playerA);
    const participantB = this.ensurePlayer(playerB);
    const { ratingA, ratingB } = eloUpdate(participantA.rating, participantB.rating, scoreA, this.config.kFactor);
    participantA.rating = this.clampRating(ratingA);
    participantB.rating = this.clampRating(ratingB);
    participantA.games += 1;
    participantB.games += 1;
    if (scoreA === 1) {
      participantA.wins += 1;
      participantB.losses += 1;
    } else if (scoreA === 0) {
      participantA.losses += 1;
      participantB.wins += 1;
    } else {
      participantA.draws += 1;
      participantB.draws += 1;
    }
  }

  applyRoundOutcome(teacher: string, students: readonly string[], winners: Set<string>): void {
    for (const student of students) {
      const studentWon = winners.has(student);
      this.recordMatch(student, teacher, studentWon ? 1 : 0);
    }
  }

  snapshot(): Record<string, EloPlayer> {
    const result: Record<string, EloPlayer> = {};
    for (const [address, player] of this.players.entries()) {
      result[address] = { ...player };
    }
    return result;
  }

  reset(): void {
    this.players.clear();
  }

  private clampRating(value: number): number {
    if (this.config.floor !== undefined && value < this.config.floor) {
      return this.config.floor;
    }
    if (this.config.ceiling !== undefined && value > this.config.ceiling) {
      return this.config.ceiling;
    }
    return value;
  }
}
