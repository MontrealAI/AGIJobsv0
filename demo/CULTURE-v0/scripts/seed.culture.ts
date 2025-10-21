import path from 'node:path';
import fs from 'node:fs';

const indexerUrl = process.env.CULTURE_INDEXER_URL ?? 'http://localhost:4100/admin/event';

interface SeedArtifact {
  id: number;
  author: string;
  kind: string;
  cid: string;
  parentId?: number;
  cites?: number[];
}

async function main() {
  const seedPath = path.join(__dirname, '..', 'data', 'seed-artifacts.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('No seed artifacts file found, skipping.');
    return;
  }
  const artifacts = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as SeedArtifact[];
  for (const artifact of artifacts) {
    await fetch(indexerUrl, {
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
        await fetch(indexerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'artifactCited', payload: { id: artifact.id, citedId: cited } })
        });
      }
    }
  }
  await fetch(indexerUrl.replace('/event', '/recompute'), { method: 'POST' });
  console.log(`Seeded ${artifacts.length} artifacts into culture graph.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
