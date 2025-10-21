import { useState } from 'react';
import { createArtifact } from '../lib/api.js';

const kinds = ['book', 'prompt', 'dataset', 'curriculum'];

export function CreateBook() {
  const [topic, setTopic] = useState('Culture Synthesis for Autonomous Agents');
  const [kind, setKind] = useState('book');
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setStatus('Generating outline with AGI Jobs meta-agents…');
    const cid = `baguculture${Math.random().toString(16).slice(2, 10)}`;
    await createArtifact({ title: topic, kind, cid });
    setStatus(`Artifact minted on-chain with CID ${cid}`);
    setIsLoading(false);
  };

  return (
    <div className="card">
      <h2>Create Knowledge Artifact</h2>
      <p>Describe the cultural asset you want AGI Jobs to author. The assistant will produce, moderate, upload, and mint it.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Topic or mission
          <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={4} required />
        </label>
        <label>
          Artifact kind
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {kinds.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating…' : 'Mint Artifact'}
        </button>
      </form>
      {status && <p>{status}</p>}
    </div>
  );
}
