'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { verifyDeliverableSignature } from '../lib/crypto';
import type { JobTimelineEvent } from '../types';

interface Props {
  events: JobTimelineEvent[];
}

export const DeliverableVerificationPanel = ({ events }: Props) => {
  const [jobId, setJobId] = useState('');
  const [agentAddress, setAgentAddress] = useState('');
  const [cid, setCid] = useState('');
  const [resultHash, setResultHash] = useState('');
  const [signature, setSignature] = useState('');
  const [verification, setVerification] = useState<string>();
  const [error, setError] = useState<string>();
  const [verifying, setVerifying] = useState(false);

  const recentSubmissions = useMemo(() => {
    return events
      .filter((evt) => evt.name === 'ResultSubmitted')
      .map((evt) => {
        const args = evt.meta?.args as any;
        return {
          jobId: evt.jobId.toString(),
          worker: evt.actor,
          timestamp: evt.timestamp,
          resultHash:
            (args?.resultHash as string | undefined) ??
            (Array.isArray(args) ? (args[2] as string | undefined) : undefined)
        };
      })
      .slice(-5)
      .reverse();
  }, [events]);

  const populateFromEvent = (submission: (typeof recentSubmissions)[number]) => {
    setJobId(submission.jobId);
    if (submission.worker) {
      setAgentAddress(submission.worker);
    }
    if (typeof submission.resultHash === 'string') {
      setResultHash(submission.resultHash);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifying(true);
    setVerification(undefined);
    setError(undefined);
    try {
      const result = await verifyDeliverableSignature(signature, resultHash, agentAddress);
      if (!result.matchesHash) {
        setError('Result hash must be a 32-byte hex string prefixed with 0x.');
      } else if (!result.matchesAgent) {
        setError(`Signature valid but recovered ${result.recoveredAddress}, not the assigned agent.`);
      } else {
        setVerification('Deliverable integrity verified — signature matches the assigned agent and provided result hash.');
      }
    } catch (err) {
      setError((err as Error).message ?? 'Signature verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Signed Deliverable Verification</h2>
          <p>Validate IPFS deliverables by comparing hashes and verifying ECDSA signatures against the assigned agent.</p>
        </div>
        <div className="tag green">Audit</div>
      </div>
      <form className="grid" onSubmit={handleSubmit}>
        <div className="grid two-column">
          <div>
            <label className="stat-label" htmlFor="verify-job">
              Job ID
            </label>
            <input id="verify-job" value={jobId} onChange={(event: ChangeEvent<HTMLInputElement>) => setJobId(event.target.value)} required />
          </div>
          <div>
            <label className="stat-label" htmlFor="verify-agent">
              Agent Address
            </label>
            <input id="verify-agent" value={agentAddress} onChange={(event: ChangeEvent<HTMLInputElement>) => setAgentAddress(event.target.value)} required />
          </div>
        </div>
        <div>
          <label className="stat-label" htmlFor="verify-cid">
            Deliverable CID / URL
          </label>
          <input id="verify-cid" value={cid} placeholder="ipfs://…" onChange={(event: ChangeEvent<HTMLInputElement>) => setCid(event.target.value)} />
        </div>
        <div>
          <label className="stat-label" htmlFor="verify-hash">
            Result Hash
          </label>
          <input
            id="verify-hash"
            value={resultHash}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setResultHash(event.target.value)}
            placeholder="0x…"
            required
          />
        </div>
        <div>
          <label className="stat-label" htmlFor="verify-signature">
            Agent Signature
          </label>
          <textarea
            id="verify-signature"
            rows={3}
            value={signature}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setSignature(event.target.value)}
            placeholder="0x signature"
            required
          />
        </div>
        <div className="inline-actions">
          <button className="primary" type="submit" disabled={verifying}>
            {verifying ? 'Verifying…' : 'Verify deliverable'}
          </button>
          {cid && (
            <a className="tag purple" href={cid} target="_blank" rel="noreferrer">
              Open deliverable
            </a>
          )}
        </div>
        {verification && <div className="alert success">{verification}</div>}
        {error && <div className="alert error">{error}</div>}
      </form>
      {recentSubmissions.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3>Recent submissions</h3>
          <div className="table">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Agent</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentSubmissions.map((submission) => (
                  <tr key={`${submission.jobId}-${submission.timestamp}`}>
                    <td>#{submission.jobId}</td>
                    <td>{submission.worker ? `${submission.worker.slice(0, 6)}…${submission.worker.slice(-4)}` : '—'}</td>
                    <td>{submission.timestamp ? new Date(submission.timestamp * 1000).toLocaleString() : '—'}</td>
                    <td>
                      <button className="secondary" type="button" onClick={() => populateFromEvent(submission)}>
                        Load details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
