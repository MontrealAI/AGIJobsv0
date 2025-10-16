import React, { useEffect, useState } from 'react';
import { listJobs } from '../lib/agijobs';

type Row = {
  id: number;
  specUri: string;
  status: string;
};

export default function MarketsTable(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void (async () => {
      const items = await listJobs();
      setRows(items);
    })();
  }, []);

  if (rows.length === 0) {
    return <p>No open markets yet. Run the CLI mission to seed one.</p>;
  }

  return (
    <table className="markets">
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Spec URI</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.id}</td>
            <td>
              <a
                href={row.specUri.startsWith('ipfs://') ? row.specUri.replace('ipfs://', 'https://ipfs.io/ipfs/') : row.specUri}
                target="_blank"
                rel="noreferrer"
              >
                {row.specUri}
              </a>
            </td>
            <td>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
