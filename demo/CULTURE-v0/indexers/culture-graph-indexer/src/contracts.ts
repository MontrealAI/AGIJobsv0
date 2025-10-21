export const cultureRegistryAbi = [
  'event ArtifactMinted(uint256 indexed artifactId, address indexed author, string kind, string cid, uint256 parentId)',
  'event ArtifactCited(uint256 indexed artifactId, uint256 indexed citedArtifactId)'
];

export const selfPlayArenaAbi = [
  'event ArenaMatchRecorded(bytes32 indexed matchId, uint256 indexed artifactId, bytes32 indexed opponentId, uint8 result)'
];

export type ArenaMatchResult = 'WIN' | 'LOSS' | 'DRAW';

export function decodeArenaResult(value: number): ArenaMatchResult {
  switch (value) {
    case 0:
      return 'DRAW';
    case 1:
      return 'WIN';
    case 2:
      return 'LOSS';
    default:
      return 'DRAW';
  }
}
