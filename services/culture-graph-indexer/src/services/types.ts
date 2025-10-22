export interface ArtifactMintedEvent {
  readonly artifactId: string;
  readonly author: string;
  readonly kind: string;
  readonly cid: string;
  readonly parentId: string | null;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
  readonly timestamp: Date;
}

export interface ArtifactCitedEvent {
  readonly fromArtifactId: string;
  readonly toArtifactId: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
}

export interface RoundFinalizedEvent {
  readonly roundId: string;
  readonly previousDifficulty: number;
  readonly difficultyDelta: number;
  readonly newDifficulty: number;
  readonly finalizedAt: Date;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly logIndex: number;
}
