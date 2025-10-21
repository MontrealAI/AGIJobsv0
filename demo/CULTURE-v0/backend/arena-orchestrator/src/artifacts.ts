import fs from 'node:fs/promises';
import path from 'node:path';

type ArtifactMetadata = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly sourceUri?: string;
  readonly extra?: Record<string, unknown>;
};

const ARTIFACT_DIR = path.resolve(process.cwd(), 'storage/culture/artifacts');

async function readMetadataFromDisk(artifactId: number): Promise<ArtifactMetadata | undefined> {
  const file = path.join(ARTIFACT_DIR, `${artifactId}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as ArtifactMetadata;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('Failed to read artifact metadata', { artifactId, error });
    }
    return undefined;
  }
}

export async function loadArtifactMetadata(artifactId: number): Promise<ArtifactMetadata> {
  const diskMetadata = await readMetadataFromDisk(artifactId);
  if (diskMetadata) {
    return diskMetadata;
  }

  return {
    id: artifactId,
    title: `Artifact ${artifactId}`,
    summary: 'No metadata available; using fallback description.',
    tags: ['fallback']
  };
}
