import { useState } from 'react';
import { useApi } from '../context/ApiContext';
import { StoredReceiptRecord } from '../types';

const EAS_BASE_URL = 'https://easscan.org/attestation/';

export function ReceiptsViewer() {
  const { request, config } = useApi();
  const [planHash, setPlanHash] = useState('');
  const [jobId, setJobId] = useState('');
  const [receipts, setReceipts] = useState<StoredReceiptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    setLoading(true);
    setError(null);
    setReceipts([]);
    try {
      const params = new URLSearchParams();
      if (planHash.trim()) {
        params.set('planHash', planHash.trim());
      }
      if (jobId.trim()) {
        params.set('jobId', jobId.trim());
      }
      params.set('limit', '15');
      const query = params.toString();
      const data = await request<{ receipts: StoredReceiptRecord[] }>(
        `governance/receipts${query ? `?${query}` : ''}`
      );
      setReceipts(data?.receipts ?? []);
      if ((data?.receipts ?? []).length === 0) {
        setError('No receipts found for the provided filters.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Receipts Viewer</h2>
      <form onSubmit={handleSearch} className="token-input">
        <div>
          <label htmlFor="plan-hash">Plan Hash</label>
          <input
            id="plan-hash"
            placeholder="0x…"
            value={planHash}
            onChange={(event) => setPlanHash(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="job-id">Job ID</label>
          <input
            id="job-id"
            placeholder="12345"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          />
        </div>
        <div className="actions-row">
          <button type="submit" disabled={loading || !config}>
            {loading ? 'Searching…' : 'Search Receipts'}
          </button>
        </div>
      </form>
      {error && (
        <p className="helper-text" role="alert">
          {error}
        </p>
      )}

      {receipts.length > 0 && (
        <section>
          <h3>Results</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Plan Hash</th>
                  <th>Job</th>
                  <th>Tx Hashes</th>
                  <th>Attestation</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt, index) => {
                  const isExpanded = expanded === index;
                  return (
                    <tr key={`${receipt.planHash}-${receipt.kind}-${index}`}>
                      <td>{receipt.kind}</td>
                      <td>{receipt.planHash.slice(0, 10)}…</td>
                      <td>{receipt.jobId ?? '—'}</td>
                      <td>{receipt.txHashes?.slice(0, 2).join(', ') ?? '—'}</td>
                      <td>
                        {receipt.attestationUid ? (
                          <a
                            href={`${EAS_BASE_URL}${receipt.attestationUid}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {receipt.attestationUid.slice(0, 10)}…
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setExpanded(isExpanded ? null : index)}
                        >
                          {isExpanded ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {expanded !== null && receipts[expanded] && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Receipt Payload</h4>
              <pre className="json-inline">
                {JSON.stringify(receipts[expanded], null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default ReceiptsViewer;
