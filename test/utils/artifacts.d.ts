import type { Artifact } from 'hardhat/types';

export declare function readArtifact(
  fullyQualifiedName: string
): Promise<Artifact>;
