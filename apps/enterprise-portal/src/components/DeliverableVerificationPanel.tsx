'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { hashDeliverableBytes, verifyDeliverableSignature } from '../lib/crypto';
import { resolveResourceUri } from '../lib/uri';
import type { JobTimelineEvent } from '../types';

interface Props {
  events: JobTimelineEvent[];
}

const formatBytes = (value?: number): string | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const decimals = amount < 10 && unitIndex > 0 ? 1 : 0;
  return `${amount.toFixed(decimals)} ${units[unitIndex]}`;
};

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  return undefined;
};

export const DeliverableVerificationPanel = ({ events }: Props) => {
  const [jobId, setJobId] = useState('');
  const [agentAddress, setAgentAddress] = useState('');
  const [cid, setCid] = useState('');
  const [resultHash, setResultHash] = useState('');
  const [signature, setSignature] = useState('');
  const [verification, setVerification] = useState<string>();
  const [error, setError] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  const [normalizedHash, setNormalizedHash] = useState<string>();
  const [recoveredSigner, setRecoveredSigner] = useState<string>();
  const [computedHash, setComputedHash] = useState<string>();
  const [payloadBytes, setPayloadBytes] = useState<number>();
  const readablePayloadSize = formatBytes(payloadBytes);

  const recentSubmissions = useMemo(() => {
    return events
      .filter((evt) => evt.name === 'ResultSubmitted')
      .map((evt) => {
        const args = evt.meta?.args;
        const argsRecord =
          args && typeof args === 'object' && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : undefined;
        const argsArray = Array.isArray(args) ? args : undefined;
        return {
          jobId: evt.jobId.toString(),
          worker: evt.actor,
          timestamp: evt.timestamp,
          resultHash:
            toStringOrUndefined(argsRecord?.resultHash) ??
            (argsArray ? toStringOrUndefined(argsArray[2]) : undefined),
          resultUri:
            toStringOrUndefined(argsRecord?.resultURI) ??
            (argsArray ? toStringOrUndefined(argsArray[3]) : undefined)
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
    if (typeof submission.resultUri === 'string') {
      setCid(submission.resultUri);
    } else {
      setCid('');
    }
    setVerification(undefined);
    setError(undefined);
    setNormalizedHash(undefined);
    setRecoveredSigner(undefined);
    setComputedHash(undefined);
    setPayloadBytes(undefined);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifying(true);
    setVerification(undefined);
    setError(undefined);
    setNormalizedHash(undefined);
    setRecoveredSigner(undefined);
    setComputedHash(undefined);
    setPayloadBytes(undefined);
    try {
      let fetchedHash: string | undefined;
      let downloadedBytes: number | undefined;
      const resolvedCid = cid ? resolveResourceUri(cid) ?? cid : undefined;
      if (resolvedCid) {
        const response = await fetch(resolvedCid);
        if (!response.ok) {
          throw new Error(`Failed to download deliverable (${response.status} ${response.statusText}).`);
        }
        const buffer = await response.arrayBuffer();
        downloadedBytes = buffer.byteLength;
        fetchedHash = hashDeliverableBytes(buffer);
      }

      const result = await verifyDeliverableSignature(signature, resultHash, agentAddress);
      const normalized = result.normalizedHash;

      setNormalizedHash(normalized);
      setRecoveredSigner(result.recoveredAddress);
      setComputedHash(fetchedHash);
      setPayloadBytes(downloadedBytes);

      if (!result.matchesHash) {
        setError('Result hash must be a 32-byte hex string prefixed with 0x.');
        return;
      }

      if (!result.matchesAgent) {
        setError(`Signature valid but recovered ${result.recoveredAddress}, not the assigned agent.`);
        return;
      }

      if (fetchedHash && fetchedHash.toLowerCase() !== normalized.toLowerCase()) {
        setError(
          `Downloaded deliverable hash ${fetchedHash} does not match the on-chain result hash ${normalized}.`
        );
        return;
      }

      const summary: string[] = ['Signature verified against the assigned agent.'];
      if (fetchedHash) {
        summary.push('Downloaded deliverable hash matches the recorded on-chain result hash.');
      }
      setVerification(summary.join(' '));
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
            <a className="tag purple" href={resolveResourceUri(cid) ?? cid} target="_blank" rel="noreferrer">
              Open deliverable
            </a>
          )}
        </div>
        {verification && <div className="alert success">{verification}</div>}
        {error && <div className="alert error">{error}</div>}
      </form>
      {(normalizedHash || computedHash || recoveredSigner) && (
        <div className="code-block">
          {normalizedHash && <div>On-chain result hash: {normalizedHash}</div>}
          {computedHash && (
            <div>
              Downloaded deliverable hash: {computedHash}
              {readablePayloadSize && <div className="small">Payload size: {readablePayloadSize}</div>}
            </div>
          )}
          {recoveredSigner && <div>Recovered signer: {recoveredSigner}</div>}
        </div>
      )}
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
                  <th>Deliverable</th>
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
                      {submission.resultUri ? (
                        <a
                          href={resolveResourceUri(submission.resultUri) ?? submission.resultUri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open file
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
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
