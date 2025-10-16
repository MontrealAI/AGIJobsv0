import React, { useState } from 'react';
import { validateJob } from '../lib/agijobs';

export default function ValidatePanel() {
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  const run = async (approve: boolean) => {
    try {
      setWorking(true);
      setStatus('Committing vote...');
      const result = await validateJob(Number(jobId), approve);
      setStatus(`Validation complete. tx=${result.txHash}`);
    } catch (err) {
      console.error(err);
      setStatus((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <input
        placeholder="Job ID"
        value={jobId}
        onChange={(e) => setJobId(e.target.value)}
      />
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={() => run(true)} disabled={!jobId || working}>
          Approve
        </button>
        <button onClick={() => run(false)} disabled={!jobId || working}>
          Reject
        </button>
      </div>
      <p className="status">{status}</p>
    </div>
  );
}
