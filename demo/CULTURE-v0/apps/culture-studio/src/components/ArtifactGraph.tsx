import { useEffect, useState } from 'react';
import { fetchArtifacts, citeArtifact } from '../lib/api.js';

interface ArtifactNode {
  readonly id: number;
  readonly title: string;
  readonly kind: string;
  readonly cites: number[];
  readonly parentId?: number;
  readonly influence: number;
}

export function ArtifactGraph() {
  const [artifacts, setArtifacts] = useState<ArtifactNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchArtifacts()
      .then(setArtifacts)
      .finally(() => setIsLoading(false));
  }, []);

  const handleCite = async (sourceId: number, targetId: number) => {
    await citeArtifact(sourceId, targetId);
    const refreshed = await fetchArtifacts();
    setArtifacts(refreshed);
  };

  if (isLoading) {
    return <div className="card">Loading culture graph…</div>;
  }

  return (
    <div className="card">
      <h2>Culture Graph</h2>
      <p>Influence propagation across minted artifacts. Use citations to connect works and accelerate culture accumulation.</p>
      <div className="grid">
        {artifacts.map((artifact) => (
          <div key={artifact.id} className="card">
            <h3>
              #{artifact.id} — {artifact.title}
            </h3>
            <p>Kind: {artifact.kind}</p>
            <p>Influence score: {artifact.influence.toFixed(3)}</p>
            {artifact.parentId && <p>Derived from #{artifact.parentId}</p>}
            <p>Cites: {artifact.cites.length === 0 ? 'None yet' : artifact.cites.map((id) => `#${id}`).join(', ')}</p>
            <CitationForm artifactId={artifact.id} onSubmit={handleCite} artifacts={artifacts} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface CitationFormProps {
  readonly artifactId: number;
  readonly artifacts: ArtifactNode[];
  readonly onSubmit: (sourceId: number, targetId: number) => Promise<void>;
}

function CitationForm({ artifactId, artifacts, onSubmit }: CitationFormProps) {
  const [target, setTarget] = useState<number | null>(null);

  const candidates = artifacts.filter((artifact) => artifact.id !== artifactId);

  if (candidates.length === 0) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) return;
    await onSubmit(artifactId, target);
    setTarget(null);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Add citation
        <select value={target ?? ''} onChange={(event) => setTarget(Number(event.target.value))}>
          <option value="" disabled>
            Select artifact
          </option>
          {candidates.map((artifact) => (
            <option key={artifact.id} value={artifact.id}>
              #{artifact.id} — {artifact.title}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!target}>
        Cite Artifact
      </button>
    </form>
  );
}
