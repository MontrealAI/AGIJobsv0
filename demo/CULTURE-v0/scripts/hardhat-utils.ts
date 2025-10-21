import { artifacts } from 'hardhat';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ArtifactDescriptor {
  qualified: string;
  fallback: string;
}

export async function loadContractArtifact(descriptor: ArtifactDescriptor) {
  try {
    return await artifacts.readArtifact(descriptor.qualified);
  } catch {
    const relative = path.join('demo', 'CULTURE-v0', 'artifacts', `${descriptor.fallback}.json`);
    const fallback = await fs.readFile(relative, 'utf-8');
    return JSON.parse(fallback);
  }
}
