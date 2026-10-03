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
    try {
      return await artifacts.readArtifact(descriptor.fallback);
    } catch {
      const relative = path.resolve(__dirname, '..', 'artifacts', `${descriptor.fallback}.json`);
      const fallback = await fs.readFile(relative, 'utf-8');
      return JSON.parse(fallback);
    }
  }
}
