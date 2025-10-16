import React, { useState } from 'react';
import { planValidation } from '../lib/agijobs';

export default function ValidatePanel(): JSX.Element {
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('');

  async function runVote(approve: boolean) {
    try {
      setStatus('Planning commit…');
      const summary = await planValidation(Number(jobId), approve);
      setStatus(`Commit hash ${summary.commitHash}. Finalize via CLI validator mission.`);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div className="validate">
      <input
        value={jobId}
        onChange={(event) => setJobId(event.target.value)}
        placeholder="Job ID"
      />
      <button onClick={() => runVote(true)} disabled={!jobId.trim()}>
        Approve
      </button>
      <button onClick={() => runVote(false)} disabled={!jobId.trim()}>
        Reject
      </button>
      {status && <p className="status">{status}</p>}
    </div>
  );
}
