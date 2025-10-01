'use client';

import { useMemo, useState } from 'react';
import type { SlaDocument } from '../types';
import { resolveResourceUri } from '../lib/uri';

const parseSla = (payload: unknown): SlaDocument => {
  const record = payload as Record<string, unknown>;
  return {
    uri: String(record.uri ?? ''),
    version: Number(record.version ?? 1),
    issuedAt: Number(record.issuedAt ?? Math.floor(Date.now() / 1000)),
    obligations: Array.isArray(record.obligations) ? (record.obligations as string[]) : [],
    penalties: Array.isArray(record.penalties) ? (record.penalties as string[]) : [],
    successCriteria: Array.isArray(record.successCriteria) ? (record.successCriteria as string[]) : []
  };
};

export const SlaViewer = () => {
  const [uri, setUri] = useState('');
  const [document, setDocument] = useState<SlaDocument>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const resolvedInput = useMemo(() => resolveResourceUri(uri) ?? uri, [uri]);

  const loadSla = async () => {
    setLoading(true);
    setError(undefined);
    try {
      if (!resolvedInput) {
        throw new Error('Provide a valid SLA URI to fetch metadata.');
      }
      const response = await fetch(resolvedInput);
      if (!response.ok) {
        throw new Error(`Failed to fetch SLA: ${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      setDocument(parseSla(json));
    } catch (err) {
      setError((err as Error).message);
      setDocument(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>SLA Evidence Viewer</h2>
          <p>Load and inspect Service Level Agreements referenced by on-chain job metadata for compliance sign-off.</p>
        </div>
        <div className="tag purple">SLA</div>
      </div>
      <div className="grid" style={{ marginBottom: '1rem' }}>
        <input
          placeholder="https://gateway.ipfs.io/ipfs/.../sla.json"
          value={uri}
          onChange={(event) => setUri(event.target.value)}
        />
        <button className="secondary" type="button" onClick={loadSla} disabled={!uri || loading}>
          {loading ? 'Loading…' : 'Fetch SLA'}
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {document && (
        <div className="grid">
          <div className="data-grid">
            <div>
              <div className="stat-label">Version</div>
              <div className="stat-value">v{document.version}</div>
            </div>
            <div>
              <div className="stat-label">Issued</div>
              <div className="stat-value">{new Date(document.issuedAt * 1000).toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Source</div>
              <div className="stat-value" style={{ fontSize: '0.85rem' }}>
                <a href={resolveResourceUri(document.uri || uri) ?? uri} target="_blank" rel="noreferrer">
                  {document.uri || uri}
                </a>
              </div>
            </div>
          </div>
          <div>
            <h3>Obligations</h3>
            <ul>
              {document.obligations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Success Criteria</h3>
            <ul>
              {document.successCriteria.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Penalties</h3>
            <ul>
              {document.penalties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {!document && !error && (
        <p className="small">
          Paste any SLA JSON URI recorded in the job metadata to display obligations and link outcomes to Certificate NFTs for
          your compliance team.
        </p>
      )}
    </section>
  );
};
