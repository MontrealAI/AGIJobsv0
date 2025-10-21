import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { ethers } from 'ethers';
import { loadContractArtifact, type ArtifactDescriptor } from './hardhat-utils';

const CULTURE_ARTIFACT: ArtifactDescriptor = {
  qualified: 'demo/CULTURE-v0/contracts/CultureRegistry.sol:CultureRegistry',
  fallback: 'CultureRegistry'
};

const EnvSchema = z.object({
  RPC_URL: z.string().min(1),
  CULTURE_REGISTRY_ADDRESS: z.string().min(1),
  DEPLOYER_PRIVATE_KEY: z.string().optional(),
  SEEDER_PRIVATE_KEY: z.string().optional(),
  CULTURE_INDEXER_URL: z.string().optional()
});

const SeedArtifactSchema = z.object({
  id: z.number().int().positive(),
  author: z.string(),
  kind: z.string(),
  cid: z.string(),
  parentId: z.number().int().nonnegative().optional(),
  cites: z.array(z.number().int().positive()).optional()
});

type SeedArtifact = z.infer<typeof SeedArtifactSchema>;

async function loadSeedArtifacts(): Promise<SeedArtifact[]> {
  const seedPath = path.resolve('demo/CULTURE-v0/data/seed-artifacts.json');
  try {
    const payload = await fs.readFile(seedPath, 'utf-8');
    const parsed = JSON.parse(payload) as unknown[];
    return parsed.map((entry) => SeedArtifactSchema.parse(entry));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('⚠️  No seed artifacts file found, skipping on-chain seeding.');
      return [];
    }
    throw error;
  }
}

async function seedOnChain(signer: ethers.Wallet, registryAddress: string, artifacts: SeedArtifact[]) {
  if (artifacts.length === 0) {
    return;
  }
  const artifact = await loadContractArtifact(CULTURE_ARTIFACT);
  const culture = new ethers.Contract(registryAddress, artifact.abi, signer);
  for (const item of artifacts) {
    try {
      const tx = await culture.mintArtifact(
        item.kind,
        item.cid,
        item.parentId ?? 0,
        item.cites ?? []
      );
      await tx.wait();
      console.log(`✨ Minted artifact #${item.id} (${item.kind}) to ${item.cid}`);
    } catch (error) {
      console.warn(`⚠️  Failed to mint artifact #${item.id}: ${(error as Error).message}`);
    }
  }
}

async function seedIndexer(indexerUrl: string, artifacts: SeedArtifact[]) {
  const adminEndpoint = indexerUrl.endsWith('/event') ? indexerUrl : `${indexerUrl.replace(/\/$/, '')}/event`;
  for (const artifact of artifacts) {
    await fetch(adminEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'artifactMinted',
        payload: {
          id: artifact.id,
          author: artifact.author,
          kind: artifact.kind,
          cid: artifact.cid,
          parentId: artifact.parentId,
          timestamp: Date.now()
        }
      })
    });
    if (artifact.cites) {
      for (const cited of artifact.cites) {
        await fetch(adminEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'artifactCited', payload: { id: artifact.id, citedId: cited } })
        });
      }
    }
  }
  const recomputeEndpoint = adminEndpoint.replace(/\/event$/, '/recompute');
  await fetch(recomputeEndpoint, { method: 'POST' });
  console.log(`📊 Seeded ${artifacts.length} artifacts into culture indexer.`);
}

async function main() {
  const env = EnvSchema.parse(process.env);
  const artifacts = await loadSeedArtifacts();
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const privateKey = env.SEEDER_PRIVATE_KEY ?? env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SEEDER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY must be provided to seed contracts.');
  }
  const signer = new ethers.Wallet(privateKey, provider);
  await seedOnChain(signer, env.CULTURE_REGISTRY_ADDRESS, artifacts);

  if (env.CULTURE_INDEXER_URL) {
    await seedIndexer(env.CULTURE_INDEXER_URL, artifacts);
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exitCode = 1;
});
