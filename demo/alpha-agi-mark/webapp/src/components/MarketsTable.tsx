import React, { useEffect, useState } from 'react';
import { listOpenJobs } from '../lib/agijobs';

interface MarketRow {
  id: number;
  specURI: string;
  employer: string;
}

export default function MarketsTable() {
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const jobs = await listOpenJobs();
        setRows(jobs);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  if (error) {
    return <p className="status">{error}</p>;
  }

  if (rows.length === 0) {
    return <p className="status">No markets open yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Spec</th>
          <th>Employer</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.id}</td>
            <td>
              <a
                href={row.specURI.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                target="_blank"
                rel="noreferrer"
              >
                {row.specURI}
              </a>
            </td>
            <td>{row.employer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
