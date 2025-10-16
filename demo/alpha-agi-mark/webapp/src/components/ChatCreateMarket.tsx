import React, { useState } from 'react';
import { pinJSON } from '../lib/ipfs';
import { createJobFromTemplate } from '../lib/agijobs';

export default function ChatCreateMarket(): JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    try {
      setBusy(true);
      setStatus('Preparing spec…');
      const template = await createJobFromTemplate(prompt);
      const apiUrl = import.meta.env.VITE_IPFS_API ?? 'http://127.0.0.1:5001/api/v0';
      const token = import.meta.env.VITE_IPFS_TOKEN as string | undefined;
      const cid = await pinJSON(apiUrl, token, template);
      setStatus(`Spec pinned → ${cid}. Submit on-chain via CLI or orchestrator.`);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Describe the foresight market you want to launch…"
      />
      <button onClick={handleSubmit} disabled={!prompt.trim() || busy}>
        {busy ? 'Working…' : 'Create Market Spec'}
      </button>
      {status && <p className="status">{status}</p>}
    </div>
  );
}
