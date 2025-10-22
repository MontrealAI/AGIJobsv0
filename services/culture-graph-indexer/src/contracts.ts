export const cultureRegistryAbi = [
  'event ArtifactMinted(uint256 indexed artifactId, address indexed author, string kind, string cid, uint256 parentId)',
  'event ArtifactCited(uint256 indexed artifactId, uint256 indexed citedArtifactId)'
];

export const selfPlayArenaAbi = [
  'event RoundFinalized(uint256 indexed roundId, uint32 previousDifficulty, int32 difficultyDelta, uint32 newDifficulty, uint64 finalizedAt)'
];
