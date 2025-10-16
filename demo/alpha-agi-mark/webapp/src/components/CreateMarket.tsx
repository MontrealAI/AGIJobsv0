import React, { useState } from 'react';
import { pinJSON } from '../lib/ipfs';
import { postJob, ensureAgentStake } from '../lib/agijobs';

export default function CreateMarket() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  const handleCreate = async () => {
    try {
      setWorking(true);
      setStatus('Ensuring stake is ready...');
      const stakeAmount = import.meta.env.VITE_AGENT_STAKE ?? '1';
      await ensureAgentStake(stakeAmount);

      setStatus('Pinning market specification to IPFS...');
      const spec = {
        ...defaultSpec,
        question: prompt,
        acceptanceCriteriaURI: defaultSpec.acceptanceCriteriaURI,
      };
      const apiUrl = import.meta.env.VITE_IPFS_API ?? 'http://127.0.0.1:5001';
      const token = import.meta.env.VITE_IPFS_TOKEN;
      const specURI = await pinJSON(apiUrl, token, spec);

      setStatus(`Posting job with spec ${specURI}...`);
      const res = await postJob(specURI);
      setStatus(`Market created. jobId=${res.jobId ?? '?'} tx=${res.txHash}`);
      setPrompt('');
    } catch (err) {
      console.error(err);
      setStatus((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <textarea
        placeholder="Describe the foresight question you want to open..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
      />
      <button onClick={handleCreate} disabled={!prompt || working}>
        {working ? 'Working...' : 'Create Market'}
      </button>
      <p className="status">{status}</p>
    </div>
  );
}

const defaultSpec = {
  name: 'AGI Risk Demo',
  version: 'v2',
  question: 'Forecast placeholder',
  deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  domains: ['foresight'],
  languages: ['en'],
  acceptanceCriteriaURI: 'ipfs://bafybeigdyrdemoacceptance',
  oracleBriefURI: 'ipfs://bafybeigdyrdemo-oracle',
  validation: { k: 3, n: 5, commitWindowSec: 3600, revealWindowSec: 3600 },
  challengeWindowSec: 7200,
  escrow: { token: 'AGIALPHA', amountPerItem: '1' },
  stake: { worker: '1', validator: '2' },
  resultSchema: 'ipfs://bafybeigdyrdemo-schema',
  notes: 'Validator-verified foresight mission powered by AGI Jobs v0 (v2).',
};
